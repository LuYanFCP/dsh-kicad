"""Read and edit ``.kicad_sch`` files through the lossless S-expression tree."""

from __future__ import annotations

import glob
import math
import os
import re
import tempfile
import uuid as uuidlib
from dataclasses import dataclass
from typing import Any, Callable

from . import geometry, routing
from .sexpr import Atom, Document, SList, L, S, dumps, fmt_num, parse
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
# Landscape paper sizes in mm (KiCad's page sizes).
PAPER_SIZES = {
    "A5": (210.0, 148.0), "A4": (297.0, 210.0), "A3": (420.0, 297.0), "A2": (594.0, 420.0), "A1": (841.0, 594.0),
    "A0": (1189.0, 841.0), "A": (279.4, 215.9), "B": (431.8, 279.4), "C": (558.8, 431.8), "D": (863.6, 558.8),
    "E": (1117.6, 863.6), "USLetter": (279.4, 215.9), "USLegal": (355.6, 215.9), "USLedger": (431.8, 279.4),
}
PAGE_MARGIN = 10.16  # inside KiCad's border
TITLE_BLOCK_HEIGHT = 45.72  # keep the bottom strip free for the title block
BLOCK_TITLE_SIZE = 2.54
BLOCK_HEADER = 5.08  # room for a block's title above its contents
GLOBAL_LABEL_SHAPES = ("input", "output", "bidirectional", "tri_state", "passive")
DETOUR = 25.4  # mm of extra wire beyond the pins' distance before connect_pins suggests labels


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
        out["page"] = self.page()
        blocks = self.blocks()
        if blocks:
            out["blocks"] = blocks
            placed = {r for b in blocks for r in b["references"]}
            loose = sorted({c["reference"] for c in comps if not c.get("power") and c["reference"] not in placed}, key=_ref_key)
            if loose:
                out["outside_blocks"] = loose
        texts = [{"text": t.value(0), "at": list(_xy(t)), "uuid": t.child_value("uuid")} for t in root.lists("text")]
        if texts:
            out["texts"] = texts
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
        if int(rotation) % 180 == 90 and not is_power:
            _autoplace_fields(node, geometry.body_bbox(lib, (x, y, rotation), mirror, unit))
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
        # Field angles are stored relative to the symbol's orientation, so the library angle carries over.
        angle = la
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

    def connect_pins(self, a: tuple[str, str], b: tuple[str, str]) -> dict:
        """Draw a wire from pin ``a`` to pin ``b`` around parts, labels and other nets' wiring (see routing)."""
        pa, pb = self.pin(*a), self.pin(*b)
        name = f"{a[0]}:{a[1]} to {b[0]}:{b[1]}"
        try:
            found = routing.route(self, pa, pb)
        except routing.RouteError as exc:
            raise SchematicError(
                f"cannot wire {name}: {exc}. Move the parts so these pins face each other with free space between them, "
                "or connect both pins to the same net label (connect_pin_to_net) instead") from exc
        if found.connected:
            self.changes.append(f"{name} are already wired together")
            return {"already_connected": True}
        self.add_wire([list(p) for p in found.points])
        for x, y in found.junctions:
            self._insert_item(L("junction", L("at", x, y), L("diameter", 0), L("color", 0, 0, 0, 0), L("uuid", S(new_uuid()))))
        joined = f", joining existing wiring at {', '.join(f'({x}, {y})' for x, y in found.joined)}" if found.joined else ""
        self.changes[-1] = f"wired {name}{joined}"
        out: dict[str, Any] = {"points": [list(p) for p in found.points]}
        if found.junctions:
            out["junctions"] = [list(p) for p in found.junctions]
        length = sum(abs(x1 - x0) + abs(y1 - y0) for (x0, y0), (x1, y1) in zip(found.points, found.points[1:]))
        direct = abs(pb["x"] - pa["x"]) + abs(pb["y"] - pa["y"])
        corners = len(found.points) - 2
        if length - direct > DETOUR or corners > 4:
            out["note"] = (f"the wire takes {round(length, 2)} mm with {corners} corners for pins {round(direct, 2)} mm apart: "
                           "the pins face away from each other or parts are in the way. For a cleaner sheet, move, rotate or "
                           "mirror a part so the pins face each other, or join them with net labels (connect_pin_to_net)")
        return out

    def connect_pin_to_net(self, reference: str, pin: str, net: str, kind: str = "label", stub: float = 2.54) -> dict:
        """Attach ``net`` to a pin with a short wire stub ending in a label (or a power symbol). When a wire
        already leaves the pin, the stub branches off a free point of that wiring instead of covering it."""
        p = self.pin(reference, pin)
        ground = kind == "power" and re.search(r"GND|VSS|^-", net.split(":")[-1].upper()) is not None
        prefer = None if kind != "power" else (0, 1) if ground else (0, -1)
        site = routing.stub_site(self, p, prefer, length=max(1, round(stub / geometry.GRID)))
        (sx, sy), (ox, oy), junction = site if site else ((p["x"], p["y"]), tuple(p["outward"]), False)
        ex, ey = geometry.snap(sx + ox * stub), geometry.snap(sy + oy * stub)
        self.add_wire([[sx, sy], [ex, ey]])
        if junction:
            self._insert_item(L("junction", L("at", sx, sy), L("diameter", 0), L("color", 0, 0, 0, 0), L("uuid", S(new_uuid()))))
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
        out = {"pin": [p["x"], p["y"]], "end": [ex, ey]}
        if (sx, sy) != (p["x"], p["y"]):
            out["from"] = [sx, sy]  # branched off the wire already on the pin
        return out

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

    # ---- page, text and functional blocks ------------------------------------------
    def set_page(self, paper: str | None = None, title: str | None = None, date: str | None = None,
                 rev: str | None = None, company: str | None = None, comments: list[str] | None = None) -> dict:
        """Paper size and title block (fields left out keep their current value)."""
        if paper is not None:
            if paper not in PAPER_SIZES:
                raise SchematicError(f"paper must be one of {', '.join(PAPER_SIZES)}")
            node = self.root.find("paper")
            if node is None:
                self._insert_item(L("paper", S(paper)))
            else:
                node.set_atoms(S(paper))
        fields = {"title": title, "date": date, "rev": rev, "company": company}
        if any(v is not None for v in fields.values()) or comments is not None:
            block = self.root.find("title_block")
            if block is None:
                block = self._insert_item(L("title_block"))
            for name in ("title", "date", "rev", "company"):
                value = fields[name]
                if value is None:
                    continue
                child = block.find(name)
                if child is None:
                    _insert_in_order(block, L(name, S(value)), ("title", "date", "rev", "company", "comment"))
                else:
                    child.set_atoms(S(value))
            for i, value in enumerate(comments or [], start=1):
                child = next((c for c in block.lists("comment") if c.value(0) == str(i)), None)
                if child is None:
                    block.append(L("comment", i, S(value)))
                else:
                    child.set_atoms(i, S(value))
        self.changes.append("set page " + ", ".join(f"{k}={v!r}" for k, v in
                                                     {"paper": paper, **fields, "comments": comments}.items() if v is not None))
        return self.page()

    def page(self) -> dict:
        paper = self.root.child_value("paper") or "A4"
        w, h = PAPER_SIZES.get(paper, PAPER_SIZES["A4"])
        if self.root.find("paper") is not None and "portrait" in [a.value for a in self.root.find("paper").atoms()]:
            w, h = h, w
        return {"paper": paper, "size": [w, h], "drawable": [PAGE_MARGIN, PAGE_MARGIN, w - PAGE_MARGIN, h - TITLE_BLOCK_HEIGHT]}

    def add_text(self, text: str, x: float, y: float, size: float = 1.27, bold: bool = False, rotation: float = 0) -> str:
        """Free text (a note or a block title); (x, y) is its bottom-left corner."""
        font = L("font", L("size", size, size))
        if bold:
            font.append(L("thickness", round(size / 5, 4)))
            font.append(L("bold", "yes"))
        uid = new_uuid()
        self._insert_item(L("text", S(text), L("exclude_from_sim", "no"), L("at", round(x, 4), round(y, 4), int(rotation) % 360),
                            L("effects", font, L("justify", "left", "bottom")), L("uuid", S(uid))))
        self.changes.append(f"added text {text!r} at ({x}, {y})")
        return uid

    def add_rectangle(self, x: float, y: float, width: float, height: float, style: str = "dash") -> str:
        if width <= 0 or height <= 0:
            raise SchematicError("a rectangle needs a positive width and height")
        if style not in ("solid", "dash", "dot", "dash_dot", "dash_dot_dot", "default"):
            raise SchematicError("style must be solid, dash, dot, dash_dot, dash_dot_dot or default")
        uid = new_uuid()
        self._insert_item(L("rectangle", L("start", round(x, 4), round(y, 4)), L("end", round(x + width, 4), round(y + height, 4)),
                            L("stroke", L("width", 0), L("type", style)), L("fill", L("type", "none")), L("uuid", S(uid))))
        self.changes.append(f"added rectangle ({x}, {y}) {width}×{height}")
        return uid

    def add_block(self, title: str, x: float | None = None, y: float | None = None, width: float | None = None,
                  height: float | None = None, references: list[str] | None = None, margin: float = 5.08) -> dict:
        """A functional block: a dashed frame with a bold title in its top-left corner. Give the frame
        explicitly (x, y, width, height) or let it enclose ``references`` with their wiring and labels."""
        if any(b["title"] == title for b in self.blocks()):
            raise SchematicError(f"a block titled {title!r} already exists")
        if references:
            if None not in (x, y, width, height):
                raise SchematicError("give either references or x, y, width and height, not both")
            x0, y0, x1, y1 = self._extent(references)
            x0, y0 = _snap_down(x0 - margin), _snap_down(y0 - margin - BLOCK_HEADER)
            x1, y1 = _snap_up(x1 + margin), _snap_up(y1 + margin)
            x, y, width, height = x0, y0, x1 - x0, y1 - y0
        elif None in (x, y, width, height):
            raise SchematicError("add_block needs x, y, width and height (or references to enclose)")
        assert x is not None and y is not None and width is not None and height is not None
        x, y = geometry.snap(x), geometry.snap(y)
        width, height = geometry.snap(width), geometry.snap(height)
        rect = self.add_rectangle(x, y, width, height)
        text = self.add_text(title, x + 2.54, y + 5.08, size=BLOCK_TITLE_SIZE, bold=True)
        self.changes[-2:] = [f"added block {title!r} at ({x}, {y}) {width}×{height}"]
        frame = (x, y, x + width, y + height)
        overlaps = [b["title"] for b in self.blocks() if b["title"] != title and _overlap(frame, _frame(b))]
        out: dict[str, Any] = {"title": title, "at": [x, y], "size": [width, height], "rectangle": rect, "text": text}
        if overlaps:
            out["overlaps"] = overlaps
        return out

    def blocks(self) -> list[dict]:
        """Titled frames: every rectangle with a text near its top-left corner, plus the parts inside it."""
        texts = [(t, *_xy(t)) for t in self.root.lists("text")]
        frames = []
        for rect in self.root.lists("rectangle"):
            (x0, y0), (x1, y1) = _pt(rect.find("start")), _pt(rect.find("end"))
            x0, x1, y0, y1 = min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1)
            inside = [(t, tx, ty) for t, tx, ty in texts if x0 <= tx <= x1 and y0 <= ty <= min(y1, y0 + 12)]
            if not inside:
                continue
            t = min(inside, key=lambda it: (it[2] - y0) + (it[1] - x0))[0]
            frames.append({"title": t.value(0) or "", "at": [x0, y0], "size": [round(x1 - x0, 4), round(y1 - y0, 4)],
                           "uuid": rect.child_value("uuid"), "title_uuid": t.child_value("uuid"), "references": []})
        for sym in self.symbols():
            lib = self.lib_symbol(sym.lib_id)
            if lib is None or lib.find("power") is not None:
                continue
            cx, cy = _center(geometry.body_bbox(lib, sym.at, sym.mirror, sym.unit, sym.body_style), sym.at)
            # The innermost frame wins when frames nest.
            hits = [f for f in frames if f["at"][0] <= cx <= f["at"][0] + f["size"][0] and f["at"][1] <= cy <= f["at"][1] + f["size"][1]]
            if hits:
                best = min(hits, key=lambda f: f["size"][0] * f["size"][1])
                if sym.reference not in best["references"]:
                    best["references"].append(sym.reference)
        for f in frames:
            f["references"].sort(key=_ref_key)
        return frames

    def _find_block(self, title: str) -> dict:
        blocks = self.blocks()
        for b in blocks:
            if b["title"] == title:
                return b
        raise SchematicError(f"no block titled {title!r}; blocks: {', '.join(repr(b['title']) for b in blocks) or 'none'}")

    def _attached(self, references: list[str]) -> dict[str, Any]:
        """Everything wired to the pins of ``references``: wires, labels, junctions, no-connect flags and power
        symbols, following wires until they reach another part's pin (reported in ``outside``)."""
        refs = set(references)
        moved = [s for s in self.symbols() if s.reference in refs]
        missing = refs - {s.reference for s in moved}
        if missing:
            raise SchematicError(f"no symbol with reference {', '.join(sorted(missing))}")
        start: dict[tuple[float, float], str] = {}
        other_pins: dict[tuple[float, float], str] = {}
        power_at: dict[tuple[float, float], list[SList]] = {}
        for sym in self.symbols():
            lib = self.lib_symbol(sym.lib_id)
            if lib is None:
                continue
            for p in geometry.placed_pins(lib, sym.at, sym.mirror, sym.unit, sym.body_style):
                k = _key(p["x"], p["y"])
                if sym.reference in refs:
                    start[k] = f"{sym.reference}:{p['number']}"
                elif lib.find("power") is not None:
                    power_at.setdefault(k, []).append(sym.node)
                else:
                    other_pins.setdefault(k, f"{sym.reference}:{p['number']}")
        wires = [(w, [_pt(p) for p in w.find("pts").lists("xy")]) for w in self.root.lists("wire")]
        taken_wires: list[SList] = []
        taken_power: list[SList] = []
        visited: set[tuple[float, float]] = set()
        outside: list[str] = []
        queue = [(k, origin) for k, origin in start.items()]
        while queue:
            k, origin = queue.pop()
            if k in visited:
                continue
            visited.add(k)
            if k in other_pins and k not in start:
                outside.append(f"{origin} → {other_pins[k]}")
                continue
            for node in power_at.get(k, []):
                if not any(node is n for n in taken_power):
                    taken_power.append(node)
            for w, pts in wires:
                if any(w is t for t in taken_wires) or not _on_path(k, pts):
                    continue
                taken_wires.append(w)
                queue += [(_key(*p), origin) for p in pts]
                # Wires that end on this one's middle (T connections) belong to the same net.
                for w2, pts2 in wires:
                    if not any(w2 is t for t in taken_wires):
                        queue += [(_key(*p), origin) for p in (pts2[0], pts2[-1]) if _on_path(_key(*p), pts)]
        paths = [pts for w, pts in wires if any(w is t for t in taken_wires)]
        labels = [lab for kind in LABEL_KINDS for lab in self.root.lists(kind)
                  if _key(*_xy(lab)) in visited or any(_on_path(_key(*_xy(lab)), pts) for pts in paths)]
        return {
            "symbols": [s.node for s in moved], "wires": taken_wires, "labels": labels, "power": taken_power,
            "junctions": [j for j in self.root.lists("junction") if _key(*_xy(j)) in visited],
            "no_connects": [n for n in self.root.lists("no_connect") if _key(*_xy(n)) in visited],
            "outside": sorted(set(outside)),
        }

    def _extent(self, references: list[str]) -> tuple[float, float, float, float]:
        """Bounding box of parts plus their visible fields, wiring, labels and power symbols."""
        att = self._attached(references)
        pts: list[tuple[float, float]] = []
        for node in att["symbols"] + att["power"]:
            sym = SymbolRef(node)
            lib = self.lib_symbol(sym.lib_id)
            box = geometry.body_bbox(lib, sym.at, sym.mirror, sym.unit, sym.body_style) if lib is not None else None
            if box:
                pts += [(box[0], box[1]), (box[2], box[3])]
            if lib is not None:
                pts += [(p["x"], p["y"]) for p in geometry.placed_pins(lib, sym.at, sym.mirror, sym.unit, sym.body_style)]
            for prop in node.lists("property"):
                if prop.find("hide") is None and not _effects_hidden(prop) and prop.value(1):
                    px, py = _xy(prop)
                    half = len(prop.value(1) or "") * 0.65
                    pts += [(px - half, py - 1), (px + half, py + 1)]
        for w in att["wires"]:
            pts += [_pt(p) for p in w.find("pts").lists("xy")]
        for lab in att["labels"]:
            lx, ly = _xy(lab)
            length = len(lab.value(0) or "") * 1.0 + (3 if lab.head != "label" else 0)
            rot = int(_f(lab.find("at").value(2)))
            dx, dy = {0: (length, 0), 90: (0, -length), 180: (-length, 0), 270: (0, length)}.get(rot, (length, 0))
            pts += [(lx, ly), (lx + dx, ly + dy), (lx - 1.27, ly - 1.27), (lx + 1.27, ly + 1.27)]
        for n in att["junctions"] + att["no_connects"]:
            pts.append(_xy(n))
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        return min(xs), min(ys), max(xs), max(ys)

    def move_symbols(self, references: list[str], dx: float, dy: float) -> dict:
        """Move parts together with their wires, labels, power symbols, junctions and no-connect flags."""
        if not references:
            raise SchematicError("move_symbols needs at least one reference")
        dx, dy = geometry.snap(dx), geometry.snap(dy)
        att = self._attached(references)
        if att["outside"]:
            raise SchematicError(
                "these pins are wired to parts that are not being moved: " + "; ".join(att["outside"]) +
                ". Move those parts too, or replace the wire with net labels first (disconnect_pin, then "
                "connect_pin_to_net on both ends) so the groups connect by name.")
        moved = 0
        for group in ("symbols", "power", "wires", "labels", "junctions", "no_connects"):
            for node in att[group]:
                _shift(node, dx, dy)
                moved += 1
        self.changes.append(f"moved {', '.join(references)} by ({dx}, {dy}) with {moved - len(att['symbols'])} attached item(s)")
        return {"moved": sorted(set(references), key=_ref_key), "by": [dx, dy],
                "attached": {k: len(att[k]) for k in ("wires", "labels", "power", "junctions", "no_connects")}}

    def move_block(self, title: str, dx: float | None = None, dy: float | None = None,
                   x: float | None = None, y: float | None = None) -> dict:
        """Move a block (frame, title, the parts inside and their wiring) by (dx, dy) or to top-left (x, y)."""
        block = self._find_block(title)
        if x is not None or y is not None:
            dx = (x if x is not None else block["at"][0]) - block["at"][0]
            dy = (y if y is not None else block["at"][1]) - block["at"][1]
        dx, dy = geometry.snap(dx or 0), geometry.snap(dy or 0)
        x0, y0 = block["at"]
        x1, y1 = x0 + block["size"][0], y0 + block["size"][1]
        inside = lambda px, py: x0 <= px <= x1 and y0 <= py <= y1  # noqa: E731
        # Every part inside, including those of nested blocks.
        refs = sorted({s.reference for s in self.symbols()
                       if (lib := self.lib_symbol(s.lib_id)) is not None and lib.find("power") is None
                       and inside(*_center(geometry.body_bbox(lib, s.at, s.mirror, s.unit, s.body_style), s.at))}, key=_ref_key)
        result = self.move_symbols(refs, dx, dy) if refs else {"moved": [], "by": [dx, dy]}
        for item in list(self.root.lists("rectangle")) + list(self.root.lists("text")):
            if item.head == "text":
                hit = inside(*_xy(item))
            else:
                (ax, ay), (bx, by) = _pt(item.find("start")), _pt(item.find("end"))
                hit = item.child_value("uuid") == block["uuid"] or (inside(ax, ay) and inside(bx, by))
            if hit:
                _shift(item, dx, dy)
        self.changes.append(f"moved block {title!r} by ({dx}, {dy})")
        return {"title": title, "at": [round(x0 + dx, 4), round(y0 + dy, 4)], **result}

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


def _autoplace_fields(symbol: SList, bbox: tuple[float, float, float, float] | None) -> None:
    """For a sideways symbol, put Reference above and Value below the body (what KiCad's autoplace does),
    instead of the library positions that end up on top of each other."""
    if bbox is None:
        return
    x0, y0, x1, y1 = bbox
    cx = round((x0 + x1) / 2, 4)
    for name, y in (("Reference", y0 - 1.27), ("Value", y1 + 2.54)):
        prop = symbol.property(name)
        if prop is None or prop.find("hide") is not None:
            continue
        # Relative to a sideways symbol, 90 reads horizontally (what KiCad writes for rotated resistors).
        prop.find("at").set_atoms(cx, round(y, 4), 90)
        eff = prop.find("effects")
        if eff is not None:
            for j in list(eff.lists("justify")):
                eff.remove(j)


def _pt(node: SList | None) -> tuple[float, float]:
    return (_f(node.value(0)), _f(node.value(1))) if node is not None else (0.0, 0.0)


def _on_path(k: tuple[float, float], pts: list[tuple[float, float]]) -> bool:
    """Whether point ``k`` lies on the polyline ``pts`` (endpoints included)."""
    px, py = k
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        if min(ax, bx) - 0.005 <= px <= max(ax, bx) + 0.005 and min(ay, by) - 0.005 <= py <= max(ay, by) + 0.005:
            if abs((bx - ax) * (py - ay) - (by - ay) * (px - ax)) <= 0.01 * max(1.0, abs(bx - ax) + abs(by - ay)):
                return True
    return len(pts) == 1 and _key(*pts[0]) == k


SHIFTED = ("at", "xy", "start", "end", "center", "mid")


def _shift(node: SList, dx: float, dy: float) -> None:
    """Translate every absolute position inside an item (its anchor, field positions, wire points)."""
    for child in node.lists():
        if child.head in SHIFTED:
            atoms = child.atoms()
            if len(atoms) >= 2:
                atoms[0].set(fmt_num(round(_f(atoms[0].value) + dx, 4)))
                atoms[1].set(fmt_num(round(_f(atoms[1].value) + dy, 4)))
        elif child.head not in ("lib_symbols", "instances", "pin"):
            _shift(child, dx, dy)


def _snap_down(v: float, grid: float = 2.54) -> float:
    return round(math.floor(round(v / grid, 6)) * grid, 4)


def _snap_up(v: float, grid: float = 2.54) -> float:
    return round(math.ceil(round(v / grid, 6)) * grid, 4)


def _center(box: tuple[float, float, float, float] | None, at: tuple[float, float, float]) -> tuple[float, float]:
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2) if box else (at[0], at[1])


def _frame(block: dict) -> tuple[float, float, float, float]:
    x, y = block["at"]
    return x, y, x + block["size"][0], y + block["size"][1]


def _overlap(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def _insert_in_order(parent: SList, node: SList, order: tuple[str, ...]) -> None:
    rank = order.index(node.head) if node.head in order else len(order)
    for i, item in enumerate(parent.items):
        if isinstance(item, SList) and item.head in order and order.index(item.head) > rank:
            parent.insert(i, node)
            return
    parent.append(node)


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
    "move_symbols": lambda s, references, dx, dy: s.move_symbols(references, dx, dy),
    "add_text": lambda s, text, x, y, size=1.27, bold=False, rotation=0: s.add_text(text, x, y, size, bold, rotation),
    "add_rectangle": lambda s, x, y, width, height, style="dash": s.add_rectangle(x, y, width, height, style),
    "add_block": lambda s, title, **kw: s.add_block(title, **kw),
    "move_block": lambda s, title, **kw: s.move_block(title, **kw),
    "set_page": lambda s, **kw: s.set_page(**kw),
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
