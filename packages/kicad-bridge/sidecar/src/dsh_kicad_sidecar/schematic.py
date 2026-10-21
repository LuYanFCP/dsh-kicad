"""Read and edit ``.kicad_sch`` files through the lossless S-expression tree."""

from __future__ import annotations

import glob
import os
import re
import tempfile
import uuid as uuidlib
from dataclasses import dataclass
from typing import Any, Callable

from . import geometry
from .sexpr import Atom, Document, SList, L, S, dumps, parse
from .symbols import SymbolLibraries, clone

__all__ = ["Schematic", "SchematicError", "new_uuid"]


class SchematicError(ValueError):
    pass


def new_uuid() -> str:
    return str(uuidlib.uuid4())


# KiCad writes top-level items grouped in this order.
ITEM_ORDER = [
    "version", "generator", "generator_version", "uuid", "paper", "title_block", "lib_symbols", "bus_alias",
    "junction", "no_connect", "bus_entry", "wire", "bus", "image", "polyline", "arc", "circle", "rectangle",
    "bezier", "text", "text_box", "table", "label", "global_label", "hierarchical_label", "netclass_flag",
    "directive_label", "rule_area", "symbol", "sheet", "sheet_instances", "symbol_instances", "embedded_fonts",
]
LABEL_KINDS = ("label", "global_label", "hierarchical_label")
GLOBAL_LABEL_SHAPES = ("input", "output", "bidirectional", "tri_state", "passive")


def _f(value: str | None, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except ValueError:
        return default


def _effects(size: float = 1.27, justify: str | None = None, hide: bool = False) -> SList:
    node = L("effects", L("font", L("size", size, size)))
    if justify:
        node.append(L("justify", *justify.split()))
    if hide:
        node.append(L("hide", "yes"))
    return node


@dataclass
class SymbolRef:
    node: SList

    @property
    def lib_id(self) -> str:
        return self.node.child_value("lib_id") or ""

    @property
    def at(self) -> tuple[float, float, float]:
        at = self.node.find("at")
        return (_f(at.value(0)), _f(at.value(1)), _f(at.value(2))) if at else (0.0, 0.0, 0.0)

    @property
    def mirror(self) -> str | None:
        return self.node.child_value("mirror")

    @property
    def unit(self) -> int:
        return int(_f(self.node.child_value("unit"), 1))

    @property
    def body_style(self) -> int:
        return int(_f(self.node.child_value("body_style") or self.node.child_value("convert"), 1))

    def prop(self, name: str) -> str | None:
        p = self.node.property(name)
        return p.value(1) if p is not None else None

    @property
    def reference(self) -> str:
        # The instance block is authoritative for multi-instance sheets; the property mirrors it.
        inst = self.node.find("instances")
        if inst is not None:
            for project in inst.lists("project"):
                for path in project.lists("path"):
                    ref = path.child_value("reference")
                    if ref:
                        return ref
        return self.prop("Reference") or "?"

    @property
    def uuid(self) -> str | None:
        return self.node.child_value("uuid")

    def flag(self, name: str, default: str = "yes") -> bool:
        return (self.node.child_value(name) or default) == "yes"


class Schematic:
    """One ``.kicad_sch`` file."""

    def __init__(self, path: str, text: str | None = None, libraries: SymbolLibraries | None = None):
        self.path = os.path.abspath(path)
        if text is None:
            with open(self.path, encoding="utf-8") as fh:
                text = fh.read()
        self.doc: Document = parse(text)
        if self.root.head != "kicad_sch":
            raise SchematicError(f"{path} is not a KiCad schematic (root is '{self.root.head}')")
        self.libraries = libraries or SymbolLibraries(os.path.dirname(self.path))
        self.changes: list[str] = []

    # ---- basics --------------------------------------------------------------------
    @property
    def root(self) -> SList:
        return self.doc.root

    @property
    def version(self) -> int:
        return int(_f(self.root.child_value("version")))

    @property
    def uuid(self) -> str:
        value = self.root.child_value("uuid")
        if not value:
            raise SchematicError("schematic has no uuid")
        return value

    def text(self) -> str:
        return dumps(self.doc)

    def save(self, path: str | None = None) -> str:
        target = os.path.abspath(path or self.path)
        data = self.text()
        directory = os.path.dirname(target)
        fd, tmp = tempfile.mkstemp(prefix=".dsh-kicad-", suffix=".tmp", dir=directory)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
                fh.write(data)
            if os.path.exists(target):
                os.chmod(tmp, os.stat(target).st_mode & 0o777)
            os.replace(tmp, target)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
        return target

    # ---- project / hierarchy -------------------------------------------------------
    def project_file(self) -> str | None:
        stem = os.path.splitext(self.path)[0]
        if os.path.isfile(stem + ".kicad_pro"):
            return stem + ".kicad_pro"
        pros = sorted(glob.glob(os.path.join(os.path.dirname(self.path), "*.kicad_pro")))
        return pros[0] if pros else None

    def project_name(self) -> str:
        pro = self.project_file()
        return os.path.splitext(os.path.basename(pro or self.path))[0]

    def instance_path(self) -> str:
        """Sheet instance path (``/root-uuid[/sheet-uuid]``) for symbols placed in this file."""
        pro = self.project_file()
        root_sch = os.path.splitext(pro)[0] + ".kicad_sch" if pro else self.path
        if os.path.abspath(root_sch) == self.path or not os.path.isfile(root_sch):
            return "/" + self.uuid
        parent = Schematic(root_sch, libraries=self.libraries)
        for sheet in parent.root.lists("sheet"):
            file_prop = sheet.property("Sheetfile") or sheet.property("Sheet file")
            if file_prop is not None and os.path.abspath(os.path.join(os.path.dirname(root_sch), file_prop.value(1) or "")) == self.path:
                return f"/{parent.uuid}/{sheet.child_value('uuid')}"
        return "/" + self.uuid

    # ---- reading -------------------------------------------------------------------
    def symbols(self) -> list[SymbolRef]:
        return [SymbolRef(s) for s in self.root.lists("symbol")]

    def lib_symbols(self) -> SList:
        node = self.root.find("lib_symbols")
        if node is None:
            node = L("lib_symbols")
            self._insert_item(node)
        return node

    def lib_symbol(self, lib_id: str) -> SList | None:
        libs = self.root.find("lib_symbols")
        if libs is None:
            return None
        return next((s for s in libs.lists("symbol") if s.value(0) == lib_id), None)

    def find_symbol(self, reference: str) -> SymbolRef:
        matches = [s for s in self.symbols() if s.reference == reference]
        if not matches:
            raise SchematicError(f"no symbol with reference '{reference}' in {os.path.basename(self.path)}")
        return matches[0]

    def symbol_units(self, reference: str) -> list[SymbolRef]:
        return [s for s in self.symbols() if s.reference == reference]

    def pins(self, reference: str) -> list[dict]:
        out = []
        for sym in self.symbol_units(reference):
            lib = self.lib_symbol(sym.lib_id)
            if lib is None:
                continue
            for pin in geometry.placed_pins(lib, sym.at, sym.mirror, sym.unit, sym.body_style):
                out.append({**pin, "unit": sym.unit})
        if not out and not self.symbol_units(reference):
            raise SchematicError(f"no symbol with reference '{reference}'")
        return out

    def pin(self, reference: str, pin: str) -> dict:
        pins = self.pins(reference)
        for p in pins:
            if p["number"] == pin:
                return p
        for p in pins:
            if p["name"] and p["name"] == pin:
                return p
        numbers = ", ".join(f"{p['number']}({p['name']})" if p["name"] and p["name"] != "~" else p["number"] for p in pins)
        raise SchematicError(f"{reference} has no pin '{pin}'; pins: {numbers}")

    def component(self, sym: SymbolRef) -> dict[str, Any]:
        x, y, rot = sym.at
        props = {p.value(0): p.value(1) for p in sym.node.lists("property")}
        lib = self.lib_symbol(sym.lib_id)
        is_power = lib is not None and lib.find("power") is not None
        out: dict[str, Any] = {
            "reference": sym.reference, "value": props.get("Value", ""), "lib_id": sym.lib_id,
            "footprint": props.get("Footprint", ""), "unit": sym.unit, "at": [x, y, rot],
        }
        if sym.mirror:
            out["mirror"] = sym.mirror
        extra = {k: v for k, v in props.items() if k not in ("Reference", "Value", "Footprint") and v}
        if extra:
            out["properties"] = extra
        if is_power:
            out["power"] = True
        for flag, default in (("dnp", "no"), ("in_bom", "yes"), ("on_board", "yes")):
            value = sym.flag(flag, default)
            if value != (default == "yes"):
                out[flag] = value
        return out

    def summary(self, include_components: bool = True, include_wiring: bool = False) -> dict[str, Any]:
        root = self.root
        title = root.find("title_block")
        labels: list[dict] = []
        for kind in LABEL_KINDS:
            for lab in root.lists(kind):
                at = lab.find("at")
                labels.append({"kind": kind, "text": lab.value(0), "at": [_f(at.value(0)), _f(at.value(1))] if at else None,
                               "uuid": lab.child_value("uuid")})
        sheets = []
        for sheet in root.lists("sheet"):
            name = sheet.property("Sheetname") or sheet.property("Sheet name")
            file = sheet.property("Sheetfile") or sheet.property("Sheet file")
            sheets.append({"name": name.value(1) if name else "", "file": file.value(1) if file else "", "uuid": sheet.child_value("uuid")})
        comps = [self.component(s) for s in self.symbols()]
        power_nets = sorted({c["value"] for c in comps if c.get("power")})
        out: dict[str, Any] = {
            "path": self.path,
            "version": self.version,
            "generator": root.child_value("generator"),
            "generator_version": root.child_value("generator_version"),
            "uuid": root.child_value("uuid"),
            "paper": root.child_value("paper"),
            "title_block": {c.head: c.value(0) if c.head != "comment" else f"{c.value(0)}: {c.value(1)}" for c in title.lists()} if title else {},
            "counts": {
                "symbols": sum(1 for c in comps if not c.get("power")), "power_symbols": sum(1 for c in comps if c.get("power")),
                "wires": sum(1 for _ in root.lists("wire")), "junctions": sum(1 for _ in root.lists("junction")),
                "no_connects": sum(1 for _ in root.lists("no_connect")), "labels": len(labels),
                "sheets": len(sheets), "lib_symbols": sum(1 for _ in (root.find("lib_symbols") or L("x")).lists("symbol")),
            },
            "power_nets": power_nets,
            "labels": labels,
            "sheets": sheets,
        }
        if include_wiring:
            out["wiring"] = self.wiring()
        if include_components:
            out["components"] = sorted((c for c in comps if not c.get("power")), key=lambda c: _ref_key(c["reference"]))
        return out

    # ---- editing primitives --------------------------------------------------------
    def _insert_item(self, node: SList) -> SList:
        """Insert a top-level item after the last item of the same kind, in KiCad's order."""
        kind = node.head or ""
        rank = ITEM_ORDER.index(kind) if kind in ITEM_ORDER else len(ITEM_ORDER)
        items = self.root.items
        insert_at = len(items)
        last_same = None
        for i, item in enumerate(items):
            if not isinstance(item, SList):
                continue
            h = item.head or ""
            if h == kind:
                last_same = i
            r = ITEM_ORDER.index(h) if h in ITEM_ORDER else len(ITEM_ORDER)
            if r > rank and insert_at == len(items):
                insert_at = i
        if last_same is not None:
            insert_at = last_same + 1
        self.root.insert(insert_at, node)
        return node

    def _style(self) -> dict[str, bool]:
        """Which optional symbol tokens this file's KiCad version writes."""
        existing = next(self.root.lists("symbol"), None)
        if existing is not None:
            return {
                "body_style": existing.find("body_style") is not None,
                "convert": existing.find("convert") is not None,
                "in_pos_files": existing.find("in_pos_files") is not None,
            }
        modern = self.version >= 20250000
        return {"body_style": modern, "convert": False, "in_pos_files": self.version >= 20251024}

    def ensure_lib_symbol(self, lib_id: str) -> SList:
        existing = self.lib_symbol(lib_id)
        if existing is not None:
            return existing
        node = self.libraries.for_schematic(lib_id)
        libs = self.lib_symbols()
        # Keep lib_symbols sorted by name, like KiCad.
        names = [s.value(0) or "" for s in libs.lists("symbol")]
        index = 1 + sum(1 for n in names if n < lib_id)
        libs.insert(index, node)
        self.changes.append(f"cached library symbol {lib_id}")
        return node

    def next_reference(self, prefix: str) -> str:
        used = set()
        for other in self._project_schematic_texts():
            used.update(int(m) for m in re.findall(r'\(reference "' + re.escape(prefix) + r'(\d+)"', other))
        used.update(int(m.group(1)) for s in self.symbols() if (m := re.fullmatch(re.escape(prefix) + r"(\d+)", s.reference)))
        n = 1
        while n in used:
            n += 1
        return f"{prefix}{n}"

    def _project_schematic_texts(self) -> list[str]:
        texts = []
        for path in glob.glob(os.path.join(os.path.dirname(self.path), "*.kicad_sch")):
            if os.path.abspath(path) == self.path:
                continue
            try:
                with open(path, encoding="utf-8") as fh:
                    texts.append(fh.read())
            except OSError:
                pass
        return texts

    # ---- editing operations --------------------------------------------------------
    def add_symbol(self, lib_id: str, x: float, y: float, reference: str | None = None, value: str | None = None,
                   rotation: float = 0, mirror: str | None = None, unit: int = 1, footprint: str | None = None,
                   properties: dict[str, str] | None = None, dnp: bool = False) -> dict:
        lib = self.ensure_lib_symbol(lib_id)
        x, y = geometry.snap(x), geometry.snap(y)
        is_power = lib.find("power") is not None
        lib_props = {p.value(0): p for p in lib.lists("property")}
        prefix = (lib_props["Reference"].value(1) if "Reference" in lib_props else "U") or "U"
        if is_power:
            prefix = "#PWR"
        if not reference or reference.endswith("?"):
            reference = self.next_reference(prefix if not reference else reference[:-1])
        elif any(s.reference == reference for s in self.symbols()) and unit == 1:
            raise SchematicError(f"reference {reference} already exists")
        if value is None:
            value = lib_props["Value"].value(1) if "Value" in lib_props else lib_id.split(":", 1)[1]
        style = self._style()
        node = L("symbol", L("lib_id", S(lib_id)), L("at", x, y, int(rotation) % 360))
        if mirror in ("x", "y"):
            node.append(L("mirror", mirror))
        node.append(L("unit", unit))
        if style["body_style"]:
            node.append(L("body_style", 1))
        elif style["convert"]:
            node.append(L("convert", 1))
        node.append(L("exclude_from_sim", "no"))
        node.append(L("in_bom", "no" if is_power else "yes"))
        node.append(L("on_board", "yes"))
        if style["in_pos_files"]:
            node.append(L("in_pos_files", "no" if is_power else "yes"))
        node.append(L("dnp", "yes" if dnp else "no"))
        node.append(L("uuid", S(new_uuid())))
        values = {"Reference": reference, "Value": value}
        if footprint is not None:
            values["Footprint"] = footprint
        for k, v in (properties or {}).items():
            values[k] = v
        seen = set()
        for name, prop in lib_props.items():
            if name.startswith("ki_"):
                continue
            seen.add(name)
            node.append(self._place_property(prop, values.get(name, prop.value(1) or ""), (x, y, rotation), mirror,
                                             hide=is_power and name == "Reference"))
        for name, v in values.items():
            if name not in seen:
                node.append(L("property", S(name), S(v), L("at", x, y, 0), _effects(hide=True)))
        for pin in geometry.pins_for_unit(geometry.library_pins(lib), unit):
            node.append(L("pin", S(pin.number), L("uuid", S(new_uuid()))))
        node.append(L("instances", L("project", S(self.project_name()),
                                     L("path", S(self.instance_path()), L("reference", S(reference)), L("unit", unit)))))
        self._insert_item(node)
        self.changes.append(f"added {reference} ({lib_id}) at ({x}, {y})")
        return {"reference": reference, "value": value, "lib_id": lib_id, "at": [x, y, rotation],
                "pins": geometry.placed_pins(lib, (x, y, rotation), mirror, unit)}

    def _place_property(self, lib_prop: SList, value: str, at: tuple[float, float, float], mirror: str | None,
                        hide: bool = False) -> SList:
        name = lib_prop.value(0) or ""
        lat = lib_prop.find("at")
        lx, ly, la = (_f(lat.value(0)), _f(lat.value(1)), _f(lat.value(2))) if lat else (0.0, 0.0, 0.0)
        dx, dy = geometry.transform(lx, ly, at[2], mirror)
        angle = la
        if int(at[2]) % 180 == 90:
            angle = 0 if int(la) % 180 == 90 else 90
        prop = L("property", S(name), S(value), L("at", round(at[0] + dx, 4), round(at[1] + dy, 4), int(angle)))
        hidden = hide or lib_prop.find("hide") is not None or _effects_hidden(lib_prop)
        for child in lib_prop.lists():
            if child.head in ("show_name", "do_not_autoplace"):
                prop.append(clone(child))
        if hidden:
            prop.append(L("hide", "yes"))
        effects = lib_prop.find("effects")
        eff = clone(effects) if effects is not None else _effects()
        for h in list(eff.lists("hide")):
            eff.remove(h)
        prop.append(eff)
        return prop

    def set_property(self, reference: str, name: str, value: str, hide: bool | None = None) -> None:
        units = self.symbol_units(reference)
        if not units:
            raise SchematicError(f"no symbol with reference '{reference}'")
        for sym in units:
            prop = sym.node.property(name)
            if prop is None:
                x, y, _ = sym.at
                prop = L("property", S(name), S(value), L("at", x, y, 0), _effects(hide=True if hide is None else hide))
                last_prop = max((i for i, it in enumerate(sym.node.items) if isinstance(it, SList) and it.head == "property"), default=len(sym.node.items) - 1)
                sym.node.insert(last_prop + 1, prop)
            else:
                prop.items[2] = Atom(value, True)
            if hide is not None:
                _set_hidden(prop, hide)
            if name == "Reference":
                for path in _instance_paths(sym.node):
                    ref = path.find("reference")
                    if ref is not None:
                        ref.items[1] = Atom(value, True)
        self.changes.append(f"set {reference}.{name} = {value!r}")

    def remove_symbol(self, reference: str) -> None:
        units = self.symbol_units(reference)
        if not units:
            raise SchematicError(f"no symbol with reference '{reference}'")
        for sym in units:
            self.root.remove(sym.node)
        self.changes.append(f"removed {reference}")

    def move_symbol(self, reference: str, x: float, y: float, rotation: float | None = None) -> None:
        sym = self.find_symbol(reference)
        ox, oy, orot = sym.at
        nx, ny = geometry.snap(x), geometry.snap(y)
        nrot = orot if rotation is None else int(rotation) % 360
        sym.node.find("at").set_atoms(nx, ny, int(nrot))
        for prop in sym.node.lists("property"):
            pat = prop.find("at")
            if pat is not None:
                pat.set_atoms(round(_f(pat.value(0)) - ox + nx, 4), round(_f(pat.value(1)) - oy + ny, 4), int(_f(pat.value(2))))
        self.changes.append(f"moved {reference} to ({nx}, {ny}, {nrot})")

    def add_wire(self, points: list[list[float]]) -> list[dict]:
        if len(points) < 2:
            raise SchematicError("a wire needs at least two points")
        made = []
        for (x1, y1), (x2, y2) in zip(points, points[1:]):
            a = (round(x1, 4), round(y1, 4))
            b = (round(x2, 4), round(y2, 4))
            if a == b:
                continue
            self._insert_item(L("wire", L("pts", L("xy", *a), L("xy", *b)),
                                L("stroke", L("width", 0), L("type", "default")), L("uuid", S(new_uuid()))))
            made.append({"from": list(a), "to": list(b)})
        self.changes.append(f"added wire through {len(points)} points")
        return made

    def add_label(self, text: str, x: float, y: float, kind: str = "label", rotation: float = 0,
                  shape: str = "bidirectional") -> None:
        if kind not in LABEL_KINDS:
            raise SchematicError(f"label kind must be one of {LABEL_KINDS}")
        rot = int(rotation) % 360
        justify = "left bottom" if rot in (0, 90) else "right bottom"
        if kind == "label":
            node = L("label", S(text), L("at", round(x, 4), round(y, 4), rot), _effects(justify=justify), L("uuid", S(new_uuid())))
        else:
            if shape not in GLOBAL_LABEL_SHAPES:
                raise SchematicError(f"label shape must be one of {GLOBAL_LABEL_SHAPES}")
            just = "left" if rot in (0, 90) else "right"
            node = L(kind, S(text), L("shape", shape), L("at", round(x, 4), round(y, 4), rot), L("fields_autoplaced", "yes"),
                     _effects(justify=just), L("uuid", S(new_uuid())))
            if kind == "global_label":
                node.append(L("property", S("Intersheetrefs"), S("${INTERSHEET_REFS}"), L("at", round(x, 4), round(y, 4), 0),
                              _effects(justify=just, hide=True)))
        self._insert_item(node)
        self.changes.append(f"added {kind} '{text}' at ({x}, {y})")

    def add_junction(self, x: float, y: float) -> None:
        self._insert_item(L("junction", L("at", round(x, 4), round(y, 4)), L("diameter", 0), L("color", 0, 0, 0, 0),
                            L("uuid", S(new_uuid()))))
        self.changes.append(f"added junction at ({x}, {y})")

    def add_no_connect(self, x: float, y: float) -> None:
        self._insert_item(L("no_connect", L("at", round(x, 4), round(y, 4)), L("uuid", S(new_uuid()))))
        self.changes.append(f"added no-connect at ({x}, {y})")

    def no_connect_pin(self, reference: str, pin: str) -> None:
        p = self.pin(reference, pin)
        self.add_no_connect(p["x"], p["y"])

    def connect_pins(self, a: tuple[str, str], b: tuple[str, str]) -> list[dict]:
        """Draw an orthogonal wire from pin ``a`` to pin ``b`` (via a stub out of each pin)."""
        pa, pb = self.pin(*a), self.pin(*b)
        stub = geometry.GRID * 2
        ax, ay = pa["x"] + pa["outward"][0] * stub, pa["y"] + pa["outward"][1] * stub
        bx, by = pb["x"] + pb["outward"][0] * stub, pb["y"] + pb["outward"][1] * stub
        if pa["outward"][0] != 0:  # horizontal exit: go horizontally first
            mid = [(bx, ay)] if pb["outward"][0] == 0 else [((ax + bx) / 2, ay), ((ax + bx) / 2, by)]
        else:
            mid = [(ax, by)] if pb["outward"][1] == 0 else [(ax, (ay + by) / 2), (bx, (ay + by) / 2)]
        pts = [(pa["x"], pa["y"]), (ax, ay), *mid, (bx, by), (pb["x"], pb["y"])]
        pts = [(geometry.snap(x), geometry.snap(y)) for x, y in pts]
        compact = [pts[0]]
        for p in pts[1:]:
            if p != compact[-1]:
                compact.append(p)
        # Drop collinear interior points.
        simplified = [compact[0]]
        for i in range(1, len(compact) - 1):
            (x0, y0), (x1, y1), (x2, y2) = simplified[-1], compact[i], compact[i + 1]
            if (x0 == x1 == x2) or (y0 == y1 == y2):
                continue
            simplified.append(compact[i])
        simplified.append(compact[-1])
        made = self.add_wire([list(p) for p in simplified])
        self.changes[-1] = f"wired {a[0]}:{a[1]} to {b[0]}:{b[1]}"
        return made

    def connect_pin_to_net(self, reference: str, pin: str, net: str, kind: str = "label", stub: float = 2.54) -> dict:
        """Attach ``net`` to a pin with a short wire stub ending in a label (or a power symbol)."""
        p = self.pin(reference, pin)
        ex = geometry.snap(p["x"] + p["outward"][0] * stub)
        ey = geometry.snap(p["y"] + p["outward"][1] * stub)
        self.add_wire([[p["x"], p["y"]], [ex, ey]])
        ox, oy = p["outward"]
        if kind == "power":
            lib_id = net if ":" in net else f"power:{net}"
            lib = self.ensure_lib_symbol(lib_id)
            pins = geometry.library_pins(lib)
            # Point the power symbol's body away from the pin it feeds.
            rotation = next((r for r in (0, 90, 180, 270) if pins and geometry._direction(pins[0].angle, r, None) == (ox, oy)), 0)
            self.add_symbol(lib_id, ex, ey, rotation=rotation)
        else:
            rotation = {(1, 0): 0, (0, -1): 90, (-1, 0): 180, (0, 1): 270}.get((ox, oy), 0)
            self.add_label(net, ex, ey, kind=kind, rotation=rotation)
        self.changes[-1] = f"connected {reference}:{pin} to net {net}"
        return {"pin": [p["x"], p["y"]], "end": [ex, ey]}

    # ---- removal -------------------------------------------------------------------
    def wiring(self) -> dict[str, list[dict]]:
        """Wires, junctions and no-connect flags with their uuids (for targeted removal)."""
        def pt(node: SList) -> list[float]:
            return [_f(node.value(0)), _f(node.value(1))]
        wires = []
        for w in self.root.lists("wire"):
            xy = list(w.find("pts").lists("xy"))
            wires.append({"from": pt(xy[0]), "to": pt(xy[-1]), "uuid": w.child_value("uuid")})
        return {
            "wires": wires,
            "junctions": [{"at": pt(j.find("at")), "uuid": j.child_value("uuid")} for j in self.root.lists("junction")],
            "no_connects": [{"at": pt(n.find("at")), "uuid": n.child_value("uuid")} for n in self.root.lists("no_connect")],
        }

    def remove_item(self, uuid: str) -> str:
        """Remove any top-level item (wire, label, junction, no-connect, symbol, ...) by uuid."""
        for item in list(self.root.lists()):
            if item.child_value("uuid") == uuid and item.head not in ("kicad_sch", "lib_symbols"):
                self.root.remove(item)
                what = item.head or "item"
                if what == "symbol":
                    what = f"symbol {SymbolRef(item).reference}"
                elif what in LABEL_KINDS:
                    what = f"{what} '{item.value(0)}'"
                self.changes.append(f"removed {what} ({uuid})")
                return what
        raise SchematicError(f"no item with uuid {uuid}")

    def remove_label(self, text: str, x: float | None = None, y: float | None = None) -> int:
        """Remove labels named ``text`` (all of them, or only the one at x,y)."""
        removed = 0
        for kind in LABEL_KINDS:
            for lab in list(self.root.lists(kind)):
                if lab.value(0) != text:
                    continue
                if x is not None and y is not None and _key(*_xy(lab)) != _key(x, y):
                    continue
                self.root.remove(lab)
                removed += 1
        if not removed:
            raise SchematicError(f"no label '{text}'" + (f" at ({x}, {y})" if x is not None else ""))
        self.changes.append(f"removed {removed} label(s) '{text}'")
        return removed

    def remove_wire(self, x: float, y: float) -> int:
        """Remove every wire segment with an endpoint at (x, y)."""
        target = _key(x, y)
        removed = 0
        for w in list(self.root.lists("wire")):
            if target in {_key(_f(p.value(0)), _f(p.value(1))) for p in w.find("pts").lists("xy")}:
                self.root.remove(w)
                removed += 1
        if not removed:
            raise SchematicError(f"no wire ends at ({x}, {y})")
        self.changes.append(f"removed {removed} wire(s) at ({x}, {y})")
        return removed

    def disconnect_pin(self, reference: str, pin: str) -> dict:
        """Undo the wiring attached to one pin: follow its wires up to the next part pin or branch
        point, removing those wires and the labels, no-connect flags and power symbols on the way."""
        start = self.pin(reference, pin)
        start_key = _key(start["x"], start["y"])
        power_refs: dict[tuple[float, float], list[SList]] = {}
        part_pins: dict[tuple[float, float], int] = {}
        for sym in self.symbols():
            lib = self.lib_symbol(sym.lib_id)
            if lib is None:
                continue
            for p in geometry.placed_pins(lib, sym.at, sym.mirror, sym.unit, sym.body_style):
                k = _key(p["x"], p["y"])
                if lib.find("power") is not None:
                    power_refs.setdefault(k, []).append(sym.node)
                elif not (sym.reference == reference and p["number"] == start["number"]):
                    part_pins[k] = part_pins.get(k, 0) + 1
        junctions = {_key(*_xy(j)) for j in self.root.lists("junction")}
        removed = {"wires": 0, "labels": 0, "no_connects": 0, "power_symbols": 0}

        def clear_point(k: tuple[float, float]) -> None:
            for kind in LABEL_KINDS:
                for lab in list(self.root.lists(kind)):
                    if _key(*_xy(lab)) == k:
                        self.root.remove(lab)
                        removed["labels"] += 1
            for nc in list(self.root.lists("no_connect")):
                if _key(*_xy(nc)) == k:
                    self.root.remove(nc)
                    removed["no_connects"] += 1
            for node in power_refs.pop(k, []):
                if any(it is node for it in self.root.items):
                    self.root.remove(node)
                    removed["power_symbols"] += 1

        queue, seen = [start_key], set()
        while queue:
            k = queue.pop()
            if k in seen:
                continue
            seen.add(k)
            clear_point(k)
            for w in list(self.root.lists("wire")):
                ends = [_key(_f(p.value(0)), _f(p.value(1))) for p in w.find("pts").lists("xy")]
                if k not in ends:
                    continue
                self.root.remove(w)
                removed["wires"] += 1
                for other in ends:
                    if other == k or other in part_pins or other in junctions:
                        continue
                    still = sum(1 for w2 in self.root.lists("wire")
                                if other in {_key(_f(p.value(0)), _f(p.value(1))) for p in w2.find("pts").lists("xy")})
                    if still <= 1:  # a plain corner or the stub's end, not a branch point
                        queue.append(other)
        self.changes.append(f"disconnected {reference}:{pin} ({', '.join(f'{v} {k}' for k, v in removed.items() if v) or 'nothing attached'})")
        return removed

    # ---- batch ---------------------------------------------------------------------
    def apply(self, op: dict[str, Any]) -> Any:
        """Apply one operation dict (``{"op": "add_symbol", ...}``)."""
        name = op.get("op")
        handler: Callable[..., Any] | None = OPERATIONS.get(name or "")
        if handler is None:
            raise SchematicError(f"unknown operation '{name}'; known: {', '.join(sorted(OPERATIONS))}")
        args = {k: v for k, v in op.items() if k != "op"}
        try:
            return handler(self, **args)
        except TypeError as exc:
            raise SchematicError(f"bad arguments for {name}: {exc}") from exc


def _key(x: float, y: float) -> tuple[float, float]:
    return (round(float(x), 2), round(float(y), 2))


def _xy(node: SList) -> tuple[float, float]:
    at = node.find("at")
    return (_f(at.value(0)), _f(at.value(1))) if at is not None else (0.0, 0.0)


def _pin_pair(value: str) -> tuple[str, str]:
    if ":" not in value:
        raise SchematicError(f"pin must be written as 'REF:PIN', got '{value}'")
    ref, pin = value.split(":", 1)
    return ref, pin


OPERATIONS: dict[str, Callable[..., Any]] = {
    "add_symbol": lambda s, lib_id, x, y, **kw: s.add_symbol(lib_id, x, y, **kw),
    "set_property": lambda s, reference, name, value, hide=None: s.set_property(reference, name, value, hide),
    "set_value": lambda s, reference, value: s.set_property(reference, "Value", value),
    "set_footprint": lambda s, reference, footprint: s.set_property(reference, "Footprint", footprint),
    "remove_symbol": lambda s, reference: s.remove_symbol(reference),
    "move_symbol": lambda s, reference, x, y, rotation=None: s.move_symbol(reference, x, y, rotation),
    "add_wire": lambda s, points: s.add_wire(points),
    "add_label": lambda s, text, x, y, kind="label", rotation=0, shape="bidirectional": s.add_label(text, x, y, kind, rotation, shape),
    "add_junction": lambda s, x, y: s.add_junction(x, y),
    "add_no_connect": lambda s, x, y: s.add_no_connect(x, y),
    "no_connect_pin": lambda s, pin: s.no_connect_pin(*_pin_pair(pin)),
    "connect_pins": lambda s, a, b: s.connect_pins(_pin_pair(a), _pin_pair(b)),
    "connect_pin_to_net": lambda s, pin, net, kind="label": s.connect_pin_to_net(*_pin_pair(pin), net, kind),
    "disconnect_pin": lambda s, pin: s.disconnect_pin(*_pin_pair(pin)),
    "remove_item": lambda s, uuid: s.remove_item(uuid),
    "remove_label": lambda s, text, x=None, y=None: s.remove_label(text, x, y),
    "remove_wire": lambda s, x, y: s.remove_wire(x, y),
}


def _instance_paths(symbol: SList):
    inst = symbol.find("instances")
    if inst is None:
        return
    for project in inst.lists("project"):
        yield from project.lists("path")


def _effects_hidden(prop: SList) -> bool:
    eff = prop.find("effects")
    if eff is None:
        return False
    hide = eff.find("hide")
    return (hide is not None and hide.value(0) in (None, "yes")) or any(a.value == "hide" for a in eff.atoms())


def _set_hidden(prop: SList, hidden: bool) -> None:
    for h in list(prop.lists("hide")):
        prop.remove(h)
    eff = prop.find("effects")
    if eff is not None:
        for h in list(eff.lists("hide")):
            eff.remove(h)
    if hidden:
        index = prop.index_of(eff) if eff is not None else len(prop.items)
        prop.insert(index, L("hide", "yes"))


def _ref_key(ref: str):
    m = re.match(r"([^\d]*)(\d*)(.*)", ref)
    assert m
    return (m.group(1), int(m.group(2)) if m.group(2) else -1, m.group(3))


def new_schematic_text(paper: str = "A4", version: int = 20260101, generator_version: str = "10.0") -> str:
    """A blank root schematic in KiCad 10 layout."""
    doc = L("kicad_sch", L("version", version), L("generator", S("eeschema")), L("generator_version", S(generator_version)),
            L("uuid", S(new_uuid())), L("paper", S(paper)), L("lib_symbols"),
            L("sheet_instances", L("path", S("/"), L("page", S("1")))), L("embedded_fonts", "no"))
    return dumps(doc) + "\n"


__all__ += ["new_schematic_text", "OPERATIONS"]
