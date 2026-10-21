"""Read and edit ``.kicad_pcb`` boards through the lossless S-expression tree.

Design rules and net classes live in the project file (``<board>.kicad_pro``, JSON) next to the board, not in
the board itself, so :class:`Board` edits that file too and :meth:`Board.save` writes both together.

Millimetres with Y growing downward; angles in degrees, counter-clockwise as KiCad shows them. Both board
formats are handled: KiCad 10 names nets inline (``(net "GND")``), older files number them and declare every
net at the top (``(net 1 "GND")``).

Building blocks for later phases (schematic → board sync, placement, autorouter import):
:class:`Footprint` (position, side, pads with absolute positions and nets, courtyard box),
:meth:`Board.add_footprint`, :meth:`Board.set_pad_net`, :meth:`Board.ensure_net`, :meth:`Board.net_nodes`,
:meth:`Board.add_track`, :meth:`Board.add_via`, :meth:`Board.insert_item` and :meth:`Board.remove_item`.
"""

from __future__ import annotations

import copy
import fnmatch
import json
import math
import os
import re
import tempfile
import uuid as uuidlib
from dataclasses import dataclass
from typing import Any, Callable

from .sexpr import Atom, Document, SList, L, S, dumps, kicad_layout, parse
from .symbols import clone

__all__ = ["Board", "Footprint", "PcbError", "OPERATIONS", "RULE_KEYS"]


class PcbError(ValueError):
    pass


def new_uuid() -> str:
    return str(uuidlib.uuid4())


# Top-level items in the order KiCad writes them; items of one rank are interleaved (KiCad sorts them itself).
DRAWINGS = ("gr_line", "gr_rect", "gr_circle", "gr_arc", "gr_poly", "gr_curve", "gr_bbox", "gr_text", "gr_text_box",
            "image", "dimension", "target", "table", "barcode", "point")
TRACKS = ("segment", "arc", "via")
_RANK = {
    "version": 0, "generator": 1, "generator_version": 2, "general": 3, "paper": 4, "title_block": 5, "layers": 6,
    "setup": 7, "property": 8, "net": 9, "footprint": 10, **{d: 11 for d in DRAWINGS}, **{t: 12 for t in TRACKS},
    "zone": 13, "group": 14, "generated": 15, "embedded_fonts": 16, "embedded_files": 17,
}
EDGE = "Edge.Cuts"
# Board rules KiCad keeps under board.design_settings.rules in the .kicad_pro (KiCad 8–10).
RULE_KEYS = (
    "allow_blind_buried_vias", "allow_microvias", "max_error", "min_clearance", "min_connection",
    "min_copper_edge_clearance", "min_groove_width", "min_hole_clearance", "min_hole_to_hole", "min_microvia_diameter",
    "min_microvia_drill", "min_resolved_spokes", "min_silk_clearance", "min_text_height", "min_text_thickness",
    "min_through_hole_diameter", "min_track_width", "min_via_annular_width", "min_via_diameter",
    "solder_mask_to_copper_clearance", "use_height_for_length_calcs",
)
NET_CLASS_KEYS = ("track_width", "clearance", "via_diameter", "via_drill", "microvia_diameter", "microvia_drill",
                  "diff_pair_width", "diff_pair_gap", "diff_pair_via_gap")
# KiCad's own defaults, used when the project file does not say.
DEFAULT_CLASS = {"name": "Default", "clearance": 0.2, "track_width": 0.2, "via_diameter": 0.6, "via_drill": 0.3}
COPPER_TYPES = ("signal", "power", "mixed", "jumper")
# Footprint children stored in absolute board coordinates (everything else is relative to the footprint).
_ABSOLUTE_CHILDREN = ("zone", "point", "dimension")
_TEXT_CHILDREN = ("property", "fp_text", "fp_text_box")
_POINT_HEADS = ("at", "xy", "start", "end", "center", "mid")
NAMED_NETS_SINCE = 20260000  # KiCad 10 files name nets inline and drop the numbered declarations
ROUNDED_RECT_SINCE = 20260000  # gr_rect with (radius r)


def _f(value: str | None, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except ValueError:
        return default


def _mm(value: float) -> str:
    """A length the way KiCad writes it: nanometre resolution, no trailing zeros, no ``-0``."""
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def _n(value: float) -> Atom:
    return Atom(_mm(value))


def _norm360(angle: float) -> float:
    angle = round(angle % 360.0, 6)
    return 0.0 if angle == 360.0 else angle


def _norm180(angle: float) -> float:
    """KiCad's footprint orientation range, (-180, 180]."""
    angle = _norm360(angle)
    return angle - 360.0 if angle > 180.0 else angle


def _rotate(x: float, y: float, deg: float) -> tuple[float, float]:
    """KiCad's RotatePoint: counter-clockwise on screen (Y down)."""
    deg = _norm360(deg)
    if deg == 0:
        return x, y
    if deg % 90 == 0:
        c, s = {90: (0, 1), 180: (-1, 0), 270: (0, -1)}[int(deg)]
    else:
        r = math.radians(deg)
        c, s = math.cos(r), math.sin(r)
    return x * c + y * s, -x * s + y * c


def _xy(node: SList | None) -> tuple[float, float]:
    return (_f(node.value(0)), _f(node.value(1))) if node is not None else (0.0, 0.0)


def _set_xy(node: SList, x: float, y: float) -> None:
    atoms = node.atoms()
    atoms[0].set(_mm(x))
    atoms[1].set(_mm(y))


def _set_at(node: SList, x: float, y: float, angle: float | None) -> None:
    """Rewrite ``(at x y [angle])`` in place, keeping the node's whitespace."""
    values = [_mm(x), _mm(y)] + ([_mm(angle)] if angle is not None else [])
    atoms = node.atoms()
    for atom, value in zip(atoms, values):
        atom.set(value)
    if len(atoms) > len(values):
        for extra in atoms[len(values):]:
            node.remove(extra)
    for value in values[len(atoms):]:
        node.append(Atom(value))
        node.ws[-1] = " "


def _flip_layer(name: str) -> str:
    if name.startswith("F."):
        return "B." + name[2:]
    if name.startswith("B."):
        return "F." + name[2:]
    return name


def _uuid(node: SList) -> str | None:
    return node.child_value("uuid") or node.child_value("tstamp")


def _layers_of(node: SList) -> list[str]:
    one = node.child_value("layer")
    if one is not None:
        return [one]
    many = node.find("layers")
    return [a.value for a in many.atoms()] if many is not None else []


def _effects(size: float, thickness: float | None, bold: bool = False, mirror: bool = False) -> SList:
    font = L("font", L("size", _n(size), _n(size)))
    if thickness is not None:
        font.append(L("thickness", _n(thickness)))
    if bold:
        font.append(L("bold", "yes"))
    node = L("effects", font)
    if mirror:
        node.append(L("justify", "mirror"))
    return node


def _stroke(width: float, kind: str = "default") -> SList:
    return L("stroke", L("width", _n(width)), L("type", kind))


def _arc_points(start: tuple[float, float], mid: tuple[float, float], end: tuple[float, float], steps: int = 24):
    """Points along the arc through three points (falls back to the three points when they are collinear)."""
    (ax, ay), (bx, by), (cx, cy) = start, mid, end
    d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(d) < 1e-12:
        return [start, mid, end]
    ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d
    uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d
    r = math.hypot(ax - ux, ay - uy)
    a0, am, a1 = (math.atan2(p[1] - uy, p[0] - ux) for p in (start, mid, end))
    sweep = (a1 - a0) % (2 * math.pi)
    if (am - a0) % (2 * math.pi) > sweep:  # the mid point lies on the other way round
        sweep -= 2 * math.pi
    return [(ux + r * math.cos(a0 + sweep * i / steps), uy + r * math.sin(a0 + sweep * i / steps)) for i in range(steps + 1)]


def _shape_points(node: SList) -> list[tuple[float, float]]:
    """Outline points of a graphic item (lines, rectangles, circles, arcs, polygons) in its own frame."""
    head = (node.head or "")[3:]  # strip fp_ / gr_
    if head == "line":
        return [_xy(node.find("start")), _xy(node.find("end"))]
    if head == "rect":
        (x0, y0), (x1, y1) = _xy(node.find("start")), _xy(node.find("end"))
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    if head == "circle":
        (cx, cy), (ex, ey) = _xy(node.find("center")), _xy(node.find("end"))
        r = math.hypot(ex - cx, ey - cy)
        return [(cx + r * math.cos(2 * math.pi * i / 72), cy + r * math.sin(2 * math.pi * i / 72)) for i in range(72)]
    if head == "arc":
        return _arc_points(_xy(node.find("start")), _xy(node.find("mid")), _xy(node.find("end")))
    if head in ("poly", "curve"):
        pts = node.find("pts")
        return [_xy(p) for p in pts.lists("xy")] if pts is not None else []
    return []


def _bbox(points: list[tuple[float, float]]) -> list[float] | None:
    if not points:
        return None
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]


def _each_point(node: SList, fn: Callable[[float, float], tuple[float, float]]) -> None:
    """Apply ``fn`` to every position (at/xy/start/end/center/mid) inside ``node``."""
    for child in node.lists():
        if child.head in _POINT_HEADS and len(child.atoms()) >= 2:
            x, y = fn(*_xy(child))
            _set_xy(child, x, y)
        else:
            _each_point(child, fn)


def _flip_layers(node: SList) -> None:
    for child in node.lists():
        if child.head in ("layer", "layers"):
            for atom in child.atoms():
                flipped = _flip_layer(atom.value)
                if flipped != atom.value:
                    atom.set(flipped)
                    atom.quoted = True
        elif child.head not in ("model",):
            _flip_layers(child)


def _justify(text: SList) -> SList | None:
    effects = text.find("effects")
    return effects.find("justify") if effects is not None else None


def _toggle_mirror(text: SList) -> None:
    effects = text.find("effects")
    if effects is None:
        effects = text.append(L("effects", L("font", L("size", 1, 1))))
    justify = effects.find("justify")
    if justify is None:
        effects.append(L("justify", "mirror"))
        return
    mirrored = [a for a in justify.atoms() if a.value == "mirror"]
    if mirrored:
        justify.remove(mirrored[0])
        if not justify.atoms():
            effects.remove(justify)
    else:
        justify.append(Atom("mirror"))
        justify.ws[-1] = " "


def _swap_justify(text: SList) -> None:
    """What KiCad's keep-upright does to a text it turns by 180°: left↔right, top↔bottom."""
    justify = _justify(text)
    if justify is None:
        return
    swap = {"left": "right", "right": "left", "top": "bottom", "bottom": "top"}
    for atom in justify.atoms():
        if atom.value in swap:
            atom.set(swap[atom.value])


@dataclass
class Footprint:
    """One placed footprint. Child items are stored relative to the footprint (``at``); pad and text angles
    in the file are absolute (footprint rotation included); zones and points inside a footprint are absolute."""

    node: SList

    @property
    def lib_id(self) -> str:
        return self.node.value(0) or ""

    def field(self, name: str) -> SList | None:
        prop = self.node.property(name)
        if prop is not None:
            return prop
        for text in self.node.lists("fp_text"):  # KiCad 7 and older
            if text.value(0) == name.lower():
                return text
        return None

    def _field_text(self, name: str) -> str:
        node = self.field(name)
        if node is None:
            return ""
        return node.value(1) or ""

    @property
    def reference(self) -> str:
        return self._field_text("Reference")

    @property
    def value(self) -> str:
        return self._field_text("Value")

    @property
    def uuid(self) -> str | None:
        return _uuid(self.node)

    @property
    def at(self) -> tuple[float, float, float]:
        at = self.node.find("at")
        return (_f(at.value(0)), _f(at.value(1)), _f(at.value(2))) if at is not None else (0.0, 0.0, 0.0)

    @property
    def layer(self) -> str:
        return self.node.child_value("layer") or "F.Cu"

    @property
    def side(self) -> str:
        return "back" if self.layer == "B.Cu" else "front"

    @property
    def locked(self) -> bool:
        flag = self.node.find("locked")
        if flag is not None:
            return (flag.value(0) or "yes") == "yes"
        return any(a.value == "locked" for a in self.node.atoms())

    def to_board(self, x: float, y: float) -> tuple[float, float]:
        px, py, rot = self.at
        dx, dy = _rotate(x, y, rot)
        return round(px + dx, 6), round(py + dy, 6)

    def to_local(self, x: float, y: float) -> tuple[float, float]:
        px, py, rot = self.at
        return _rotate(x - px, y - py, -rot)

    def pads(self) -> list[dict[str, Any]]:
        out = []
        for pad in self.node.lists("pad"):
            x, y = self.to_board(*_xy(pad.find("at")))
            size = pad.find("size")
            out.append({
                "number": pad.value(0) or "",
                "type": pad.value(1) or "",
                "shape": pad.value(2) or "",
                "at": [round(x, 4), round(y, 4)],
                "size": [_f(size.value(0)), _f(size.value(1))] if size is not None else [],
                "layers": _layers_of(pad),
                "net": _net_name_of(pad),
                "uuid": _uuid(pad),
            })
        return out

    def pad(self, number: str) -> dict[str, Any]:
        for pad in self.pads():
            if pad["number"] == number:
                return pad
        names = ", ".join(dict.fromkeys(p["number"] for p in self.pads() if p["number"]))
        raise PcbError(f"{self.reference} has no pad '{number}' (pads: {names})")

    def courtyard(self) -> list[float] | None:
        """Absolute bounding box ``[x0, y0, x1, y1]`` of the courtyard on the footprint's side, or None."""
        layers = ("F.CrtYd", "B.CrtYd")
        points = []
        for child in self.node.lists():
            if child.head and child.head.startswith("fp_") and child.child_value("layer") in layers:
                points += [self.to_board(x, y) for x, y in _shape_points(child)]
        return _bbox(points)

    def summary(self, pads: bool = False) -> dict[str, Any]:
        x, y, rot = self.at
        out: dict[str, Any] = {
            "reference": self.reference, "value": self.value, "footprint": self.lib_id,
            "at": [x, y], "rotation": rot, "side": self.side,
        }
        if self.locked:
            out["locked"] = True
        court = self.courtyard()
        if court:
            out["courtyard"] = court
        pad_list = self.pads()
        out["pad_nets"] = {p["number"]: p["net"] for p in pad_list if p["number"] and p["net"]}
        if pads:
            out["pads"] = [{k: p[k] for k in ("number", "net", "at", "layers")} for p in pad_list if p["number"]]
        return out


def _net_name_of(item: SList, codes: dict[int, str] | None = None) -> str:
    """Net name of a pad/track/zone in either format."""
    net = item.find("net")
    if net is None:
        return ""
    atoms = net.atoms()
    if len(atoms) >= 2:
        return atoms[1].value
    if atoms and (atoms[0].quoted or not re.fullmatch(r"-?\d+", atoms[0].value)):
        return atoms[0].value
    name = item.child_value("net_name")
    if name is not None:
        return name
    if atoms and codes is not None:
        return codes.get(int(atoms[0].value), "")
    return ""


class Board:
    """One ``.kicad_pcb`` file plus its project file (rules and net classes)."""

    def __init__(self, path: str, text: str | None = None, project_text: str | None = None, libraries: Any = None):
        self.path = os.path.abspath(path)
        self.libraries = libraries  # FootprintLibraries, for add_mounting_hole
        if text is None:
            with open(self.path, encoding="utf-8") as fh:
                text = fh.read()
        self.doc: Document = parse(text)
        if self.root.head != "kicad_pcb":
            raise PcbError(f"{path} is not a KiCad board (root is '{self.root.head}')")
        self.changes: list[str] = []
        self._project_text = project_text
        self._project: dict[str, Any] | None = None
        self._project_dirty = False

    # ---- basics --------------------------------------------------------------------
    @property
    def root(self) -> SList:
        return self.doc.root

    @property
    def version(self) -> int:
        return int(_f(self.root.child_value("version")))

    def text(self) -> str:
        return dumps(self.doc)

    @property
    def project_path(self) -> str:
        return os.path.splitext(self.path)[0] + ".kicad_pro"

    def project(self) -> dict[str, Any]:
        """The parsed .kicad_pro (``{}`` when there is none). Mutations are saved when marked dirty."""
        if self._project is None:
            text = self._project_text
            if text is None and os.path.isfile(self.project_path):
                with open(self.project_path, encoding="utf-8") as fh:
                    text = fh.read()
            self._project = json.loads(text) if text else {}
        return self._project

    def project_text(self) -> str:
        # KiCad writes 2-space JSON with raw UTF-8 and a trailing newline; this round-trips its files byte for byte.
        return json.dumps(self.project(), indent=2, ensure_ascii=False) + "\n"

    def save(self, path: str | None = None) -> list[str]:
        """Write the board (and the project file when rules or net classes changed). Returns the written paths."""
        target = os.path.abspath(path or self.path)
        files = [(target, self.text())]
        if self._project_dirty:
            pro = self.project()
            pro.setdefault("meta", {}).setdefault("filename", os.path.basename(os.path.splitext(target)[0] + ".kicad_pro"))
            pro["meta"].setdefault("version", 3)
            files.append((os.path.splitext(target)[0] + ".kicad_pro", self.project_text()))
        temps = []
        try:
            for dest, data in files:
                fd, tmp = tempfile.mkstemp(prefix=".dsh-kicad-", suffix=".tmp", dir=os.path.dirname(dest))
                temps.append(tmp)
                with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
                    fh.write(data)
                if os.path.exists(dest):
                    os.chmod(tmp, os.stat(dest).st_mode & 0o777)
            # Everything is on disk before the first rename, so a failure leaves both files as they were.
            for (dest, _), tmp in zip(files, temps):
                os.replace(tmp, dest)
        except BaseException:
            for tmp in temps:
                if os.path.exists(tmp):
                    os.unlink(tmp)
            raise
        return [dest for dest, _ in files]

    def insert_item(self, node: SList) -> SList:
        """Insert a top-level item where KiCad keeps items of its kind. Footprints go where KiCad saves them
        (front side first, then by uuid), so a later save in KiCad does not move them."""
        rank = _RANK.get(node.head or "", 11)
        items = self.root.items
        if node.head == "footprint" and _uuid(node):
            key = _footprint_order(node)
            after = next((i for i, item in enumerate(items) if isinstance(item, SList) and item.head == "footprint"
                          and _footprint_order(item) > key), None)
            if after is not None:
                self.root.insert(after, node)
                return node
        last_same = first_after = None
        for i, item in enumerate(items):
            if not isinstance(item, SList):
                continue
            r = _RANK.get(item.head or "", 11)
            if r == rank:
                last_same = i
            elif r > rank and first_after is None:
                first_after = i
        index = last_same + 1 if last_same is not None else (first_after if first_after is not None else len(items))
        self.root.insert(index, node)
        return node

    # ---- layers --------------------------------------------------------------------
    def layer_table(self) -> list[dict[str, str]]:
        table = self.root.find("layers")
        out = []
        for entry in table.lists() if table is not None else []:
            atoms = [i for i in entry.items if isinstance(i, Atom)]
            if len(atoms) >= 3:
                out.append({"id": atoms[0].value, "name": atoms[1].value, "type": atoms[2].value,
                            "user_name": atoms[3].value if len(atoms) > 3 else ""})
        return out

    def copper_layers(self) -> list[str]:
        return [l["name"] for l in self.layer_table() if l["type"] in COPPER_TYPES]

    def layer_name(self, name: str, copper: bool = False) -> str:
        """Canonical layer name for a canonical or user name (``F.Cu``, ``top_cu``, ``F.Silkscreen``)."""
        for entry in self.layer_table():
            if name in (entry["name"], entry["user_name"]) or name.lower() in (entry["name"].lower(), entry["user_name"].lower()):
                if copper and entry["type"] not in COPPER_TYPES:
                    break
                return entry["name"]
        kind = "copper layer" if copper else "layer"
        options = self.copper_layers() if copper else [l["name"] for l in self.layer_table()]
        raise PcbError(f"no {kind} '{name}' on this board (have: {', '.join(options)})")

    # ---- nets ----------------------------------------------------------------------
    @property
    def numbered_nets(self) -> bool:
        if any(True for _ in self.root.lists("net")):
            return True
        if self.version >= NAMED_NETS_SINCE:
            return False
        return True

    def _net_codes(self) -> dict[int, str]:
        return {int(_f(n.value(0))): n.value(1) or "" for n in self.root.lists("net")}

    def nets(self) -> list[str]:
        """Every net name on the board (declared nets, or the names used by pads, tracks and zones)."""
        if any(True for _ in self.root.lists("net")):
            names = [n for n in self._net_codes().values() if n]
        else:
            names = []
            for fp in self.root.lists("footprint"):
                names += [_net_name_of(p) for p in fp.lists("pad")]
            for item in self.root.lists():
                if item.head in TRACKS or item.head == "zone":
                    names.append(_net_name_of(item))
        return sorted({n for n in names if n})

    def ensure_net(self, name: str) -> str:
        """Make ``name`` a known net (declares it in numbered-net files). Returns the name."""
        if not name:
            raise PcbError("a net name must not be empty")
        if self.numbered_nets and name not in self._net_codes().values():
            codes = self._net_codes()
            if 0 not in codes:
                self.insert_item(L("net", 0, S("")))
            code = max(codes or {0: ""}) + 1
            self.insert_item(L("net", code, S(name)))
            self.changes.append(f"declared net {name}")
        return name

    def rename_net(self, old: str, new: str) -> int:
        """Rename net ``old`` to ``new`` on every pad, track, arc, via and zone, and in the net table of
        numbered-net files. If ``new`` already exists the two nets merge. Returns the number of items changed."""
        if not old or not new:
            raise PcbError("rename_net needs two net names")
        if old == new:
            return 0
        changed = 0
        if any(True for _ in self.root.lists("net")):
            table = {int(_f(n.value(0))): n for n in self.root.lists("net")}
            old_code = next((c for c, n in table.items() if n.value(1) == old), None)
            new_code = next((c for c, n in table.items() if n.value(1) == new), None)
            if old_code is None:
                return 0
            if new_code is None:
                table[old_code].set_atoms(old_code, S(new))  # tracks keep pointing at the code
                code = old_code
            else:
                self.root.remove(table[old_code])
                code = new_code
            for item in self._net_items():
                net = item.find("net")
                atoms = net.atoms() if net is not None else []
                if not atoms or int(_f(atoms[0].value, -1)) != old_code:
                    continue
                if item.head == "pad":
                    net.set_atoms(code, S(new))
                elif code != old_code:
                    net.set_atoms(code)
                name = item.find("net_name")
                if name is not None:
                    name.set_atoms(S(new))
                changed += 1
        else:
            for item in self._net_items():
                if _net_name_of(item) == old:
                    item.find("net").set_atoms(S(new))
                    changed += 1
        self.changes.append(f"renamed net {old} to {new} ({changed} item(s))")
        return changed

    def _net_items(self):
        """Every item that carries a net: pads, tracks, arcs, vias and zones."""
        for item in self.root.lists():
            if item.head == "footprint":
                yield from item.lists("pad")
            elif item.head in TRACKS or item.head == "zone":
                yield item

    def net_code(self, name: str) -> int:
        for code, net in self._net_codes().items():
            if net == name:
                return code
        raise PcbError(f"net '{name}' is not declared on this board")

    def net_nodes(self, name: str, kind: str = "track") -> list[SList]:
        """The ``net`` children for a pad, track/via or zone on ``name`` in this file's format."""
        if not self.numbered_nets:
            return [L("net", S(name))]
        code = self.net_code(name) if name else 0
        if kind == "pad":
            return [L("net", code, S(name))]
        if kind == "zone":
            return [L("net", code), L("net_name", S(name))]
        return [L("net", code)]

    def _require_net(self, name: str) -> str:
        if name not in self.nets():
            known = self.nets()
            hint = f" (nets: {', '.join(known[:40])}{' …' if len(known) > 40 else ''})" if known else " (the board has no nets yet)"
            raise PcbError(f"net '{name}' does not exist on this board{hint}")
        return name

    # ---- footprints ----------------------------------------------------------------
    def footprints(self) -> list[Footprint]:
        return [Footprint(n) for n in self.root.lists("footprint")]

    def footprint(self, reference: str) -> Footprint:
        for fp in self.footprints():
            if fp.reference == reference:
                return fp
        refs = sorted(fp.reference for fp in self.footprints())
        raise PcbError(f"no footprint '{reference}' on the board (have: {', '.join(refs[:60])}{' …' if len(refs) > 60 else ''})")

    def next_reference(self, prefix: str) -> str:
        used = {fp.reference for fp in self.footprints()}
        n = 1
        while f"{prefix}{n}" in used:
            n += 1
        return f"{prefix}{n}"

    def _pad_point(self, ref_pad: str) -> tuple[float, float, dict]:
        if ":" not in ref_pad:
            raise PcbError(f"expected 'REF:PAD', got '{ref_pad}'")
        ref, number = ref_pad.rsplit(":", 1)
        pad = self.footprint(ref).pad(number)
        return pad["at"][0], pad["at"][1], pad

    def add_footprint(self, library_node: SList, reference: str, x: float, y: float, rotation: float = 0,
                      side: str = "front", value: str | None = None, lib_id: str | None = None) -> Footprint:
        """Place a footprint read from a ``.kicad_mod`` (e.g. :meth:`FootprintLibraries.load`).

        Every uuid is fresh, the library header is dropped and the footprint is transformed to its position,
        rotation and side the way KiCad places it. Pads start without nets (see :meth:`set_pad_net`)."""
        if library_node.head != "footprint":
            raise PcbError("not a footprint")
        node = clone(library_node)
        for child in list(node.lists()):
            if child.head in ("version", "generator", "generator_version"):
                node.remove(child)
        if lib_id:
            node.items[1] = S(lib_id)
        layer = node.find("layer")
        if layer is None:
            layer = node.insert(1 + sum(1 for a in node.atoms()), L("layer", S("F.Cu")))
        at_index = node.index_of(layer) + 1
        node.insert(at_index, L("uuid", S(new_uuid())))
        node.insert(at_index + 1, L("at", _n(x), _n(y)))
        _fresh_uuids(node, skip=node.find("uuid"))
        _add_missing_uuids(node)
        fp = Footprint(node)
        for name, text in (("Reference", reference), ("Value", value)):
            field = fp.field(name)
            if text is not None and field is not None:
                field.items[2] = S(text)
        self.insert_item(node)
        if rotation or side == "back":
            self._place(fp, x, y, rotation, flip=side == "back")
        return fp

    def set_pad_net(self, reference: str, pad: str, net: str | None) -> int:
        """Assign ``net`` (or no net) to every pad numbered ``pad`` of ``reference``. Returns the pad count."""
        fp = self.footprint(reference)
        pads = [p for p in fp.node.lists("pad") if p.value(0) == pad]
        if not pads:
            fp.pad(pad)  # raises with the pad list
        if net:
            self.ensure_net(net)
        for node in pads:
            old = node.find("net")
            index = node.index_of(old) if old is not None else _pad_net_index(node)
            if old is not None:
                node.remove(old)
            if net:
                node.insert(index, self.net_nodes(net, "pad")[0])
        self.changes.append(f"{reference}:{pad} → {net or 'no net'}")
        return len(pads)

    def _place(self, fp: Footprint, x: float, y: float, rotation: float, flip: bool = False) -> None:
        """Move/rotate/flip a footprint the way KiCad does (flip = KiCad's left/right flip, then rotate)."""
        ox, oy, orot = fp.at
        new_rot = _norm180(rotation)
        delta = new_rot - orot
        turned = flip or abs(_norm360(delta)) > 1e-9

        def absolute(px: float, py: float) -> tuple[float, float]:
            lx, ly = _rotate(px - ox, py - oy, -orot)
            if flip:
                ly = -ly
            dx, dy = _rotate(lx, ly, new_rot)
            return round(x + dx, 6), round(y + dy, 6)

        for child in fp.node.lists():
            head = child.head
            if head in _ABSOLUTE_CHILDREN:
                _each_point(child, absolute)
                if flip:
                    _flip_layers(child)
            elif head == "pad" and turned:
                at = child.find("at")
                lx, ly = _xy(at)
                local = _f(at.value(2)) - orot
                if flip:
                    ly, local = -ly, -local
                    _flip_pad(child)
                angle = _norm360(new_rot + local)
                _set_at(at, lx, ly, angle if angle else None)
            elif head in _TEXT_CHILDREN:
                at = child.find("at")
                if at is not None:
                    lx, ly = _xy(at)
                    local = _f(at.value(2)) - orot
                    if flip:
                        ly, local = -ly, 180 - local
                    angle = _norm360(new_rot + local)
                    if turned and angle >= 180:  # KiCad keeps footprint texts upright when it rotates them
                        angle = _norm360(angle - 180)
                        _swap_justify(child)
                    if turned or flip:
                        _set_at(at, lx, ly, angle)
                elif flip:
                    _each_point(child, lambda px, py: (px, -py))
                if flip:
                    _flip_layers(child)
                    if any(l[:2] in ("F.", "B.") for l in _layers_of(child)):
                        _toggle_mirror(child)
            elif head and head.startswith("fp_") and flip:
                _each_point(child, lambda px, py: (px, -py))
                _flip_layers(child)
            elif head == "layer" and flip:
                atom = child.atoms()[0]
                atom.set(_flip_layer(atom.value))
                atom.quoted = True
        at = fp.node.find("at")
        _set_at(at, x, y, new_rot if new_rot else None)

    def move_footprint(self, reference: str, x: float | None = None, y: float | None = None,
                       rotation: float | None = None, side: str | None = None) -> dict:
        fp = self.footprint(reference)
        if fp.locked:
            raise PcbError(f"{reference} is locked; unlock it first (lock_footprint with locked: false)")
        if side not in (None, "front", "back"):
            raise PcbError("side must be 'front' or 'back'")
        ox, oy, orot = fp.at
        flip = side is not None and side != fp.side
        nx = ox if x is None else float(x)
        ny = oy if y is None else float(y)
        if rotation is not None:
            nrot = float(rotation)
        else:
            nrot = 180 - orot if flip else orot  # KiCad's flip mirrors left/right
        self._place(fp, nx, ny, nrot, flip=flip)
        x1, y1, r1 = fp.at
        self.changes.append(f"moved {reference} to ({_mm(x1)}, {_mm(y1)}) {_mm(r1)}° {fp.side}")
        return {"reference": reference, "at": [x1, y1], "rotation": r1, "side": fp.side}

    def move_footprints(self, references: list[str], dx: float, dy: float) -> dict:
        if not references:
            raise PcbError("references must not be empty")
        fps = [self.footprint(r) for r in references]
        locked = [fp.reference for fp in fps if fp.locked]
        if locked:
            raise PcbError(f"locked footprints cannot move: {', '.join(locked)} (unlock them first)")
        for fp in fps:
            x, y, rot = fp.at
            self._place(fp, round(x + dx, 6), round(y + dy, 6), rot)
        self.changes.append(f"moved {', '.join(references)} by ({_mm(dx)}, {_mm(dy)})")
        return {"moved": references}

    def lock_footprint(self, reference: str, locked: bool = True) -> None:
        fp = self.footprint(reference)
        node = fp.node
        for flag in list(node.lists("locked")):
            node.remove(flag)
        for atom in [a for a in node.atoms() if a.value == "locked"]:
            node.remove(atom)
        if locked:
            if self.version >= 20240000:
                node.insert(2, L("locked", "yes"))  # KiCad writes it before (layer ...)
            else:
                node.insert(2, Atom("locked"))
                node.ws[2] = " "
        self.changes.append(f"{'locked' if locked else 'unlocked'} {reference}")

    # ---- outline -------------------------------------------------------------------
    def outline_items(self) -> list[SList]:
        return [i for i in self.root.lists() if i.head in DRAWINGS and i.child_value("layer") == EDGE]

    def outline(self) -> dict[str, Any] | None:
        items = self.outline_items()
        points = [p for i in items for p in _shape_points(i)]
        box = _bbox(points)
        if box is None:
            return None
        out: dict[str, Any] = {"bbox": box, "width": round(box[2] - box[0], 4), "height": round(box[3] - box[1], 4),
                               "items": len(items)}
        if len(items) == 1 and items[0].head == "gr_rect":
            out["shape"] = "rectangle"
            if items[0].find("radius") is not None:
                out["corner_radius"] = _f(items[0].child_value("radius"))
        elif len(items) == 1 and items[0].head == "gr_poly":
            out["shape"] = "polygon"
            out["points"] = [list(p) for p in _shape_points(items[0])]
        else:
            out["shape"] = "segments"
        return out

    def outline_polygon(self) -> list[tuple[float, float]]:
        """The board outline as a polygon (a lone rectangle or polygon exactly, otherwise its bounding box)."""
        items = self.outline_items()
        if len(items) == 1 and items[0].head == "gr_poly":
            return _shape_points(items[0])
        info = self.outline()
        if info is None:
            raise PcbError("the board has no outline on Edge.Cuts yet; add one with set_board_outline")
        x0, y0, x1, y1 = info["bbox"]
        return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

    def set_board_outline(self, width: float | None = None, height: float | None = None, corner_radius: float = 0,
                          x: float | None = None, y: float | None = None, points: list | None = None,
                          line_width: float = 0.05) -> dict:
        """Replace everything on Edge.Cuts with a rectangle (optionally rounded) or a closed polygon."""
        old = self.outline()
        if points is not None:
            pts = [_pair(p, "points") for p in points]
            if len(pts) < 3:
                raise PcbError("an outline polygon needs at least 3 points")
            nodes = [L("gr_poly", L("pts", *(L("xy", _n(px), _n(py)) for px, py in pts)), _stroke(line_width),
                       L("fill", self._fill_no()), L("layer", S(EDGE)), L("uuid", S(new_uuid())))]
            desc = f"polygon outline with {len(pts)} points"
        else:
            if width is None or height is None or float(width) <= 0 or float(height) <= 0:
                raise PcbError("set_board_outline needs width and height (> 0), or points")
            w, h, r = float(width), float(height), float(corner_radius or 0)
            if r < 0 or r > min(w, h) / 2:
                raise PcbError(f"corner_radius must be between 0 and {_mm(min(w, h) / 2)}")
            if x is None or y is None:
                x0, y0 = self._default_origin(old, w, h)
                x = x0 if x is None else x
                y = y0 if y is None else y
            nodes = self._rectangle(float(x), float(y), w, h, r, line_width)
            desc = f"{_mm(w)} × {_mm(h)} mm outline at ({_mm(float(x))}, {_mm(float(y))})" + (f", corner radius {_mm(r)}" if r else "")
        removed = self.outline_items()
        for item in removed:
            self.root.remove(item)
        for node in nodes:
            self.insert_item(node)
        self.changes.append(f"board outline: {desc}" + (f" (replaced {len(removed)} Edge.Cuts item(s))" if removed else ""))
        return self.outline() or {}

    def _default_origin(self, old: dict | None, w: float, h: float) -> tuple[float, float]:
        if old is not None:
            return old["bbox"][0], old["bbox"][1]
        boxes = [fp.courtyard() or [*fp.at[:2], *fp.at[:2]] for fp in self.footprints()]
        if boxes:
            cx = (min(b[0] for b in boxes) + max(b[2] for b in boxes)) / 2
            cy = (min(b[1] for b in boxes) + max(b[3] for b in boxes)) / 2
            return round(cx - w / 2, 4), round(cy - h / 2, 4)
        return 100.0, 100.0

    def _fill_no(self) -> str:
        return "no" if self.version >= 20241000 else "none"

    def _rectangle(self, x: float, y: float, w: float, h: float, r: float, line_width: float) -> list[SList]:
        x1, y1 = x + w, y + h
        tail = [L("layer", S(EDGE))]
        if not r or self.version >= ROUNDED_RECT_SINCE:
            rect = L("gr_rect", L("start", _n(x), _n(y)), L("end", _n(x1), _n(y1)))
            if r:
                rect.append(L("radius", _n(r)))
            for child in (_stroke(line_width), L("fill", self._fill_no()), *tail, L("uuid", S(new_uuid()))):
                rect.append(child)
            return [rect]
        # Older formats have no rounded rectangle: four lines and four quarter arcs.
        k = r * (1 - math.sqrt(0.5))
        segments = [((x + r, y), (x1 - r, y)), ((x1, y + r), (x1, y1 - r)), ((x1 - r, y1), (x + r, y1)), ((x, y1 - r), (x, y + r))]
        arcs = [((x, y + r), (x + k, y + k), (x + r, y)), ((x1 - r, y), (x1 - k, y + k), (x1, y + r)),
                ((x1, y1 - r), (x1 - k, y1 - k), (x1 - r, y1)), ((x + r, y1), (x + k, y1 - k), (x, y1 - r))]
        nodes = [L("gr_line", L("start", _n(a[0]), _n(a[1])), L("end", _n(b[0]), _n(b[1])), _stroke(line_width), *tail,
                   L("uuid", S(new_uuid()))) for a, b in segments]
        nodes += [L("gr_arc", L("start", _n(s[0]), _n(s[1])), L("mid", _n(m[0]), _n(m[1])), L("end", _n(e[0]), _n(e[1])),
                    _stroke(line_width), *tail, L("uuid", S(new_uuid()))) for s, m, e in arcs]
        return nodes

    def add_mounting_hole(self, x: float, y: float, drill: float = 3.2, plated: bool = False,
                          footprint: str | None = None, reference: str | None = None) -> dict:
        """A mounting hole footprint from KiCad's MountingHole library when installed, otherwise a minimal one."""
        reference = reference or self.next_reference("H")
        drill = float(drill)
        candidates = [footprint] if footprint else _mounting_hole_ids(drill, plated)
        node = None
        if self.libraries is not None:
            for lib_id in candidates:
                try:
                    node, chosen = self.libraries.load(lib_id), lib_id
                    break
                except LookupError:
                    continue
        if node is None:
            if footprint:
                raise PcbError(f"footprint '{footprint}' not found in the installed libraries")
            chosen = candidates[-1]
            node = _mounting_hole_node(drill, plated)
        fp = self.add_footprint(node, reference, float(x), float(y), value="MountingHole", lib_id=chosen)
        # No symbol stands behind a hole added here: board_only keeps schematic parity (and sync) from calling it extra.
        set_attr_flags(fp.node, {"board_only": True})
        self.changes.append(f"added mounting hole {reference} ({chosen}) at ({_mm(float(x))}, {_mm(float(y))})")
        return {"reference": reference, "footprint": chosen, "uuid": fp.uuid}

    # ---- rules (project file) ------------------------------------------------------
    def design_rules(self) -> dict[str, Any]:
        return dict(self.project().get("board", {}).get("design_settings", {}).get("rules", {}))

    def set_design_rules(self, **rules: Any) -> dict:
        if not rules:
            raise PcbError(f"set_design_rules needs at least one of: {', '.join(RULE_KEYS)}")
        current = self.project().setdefault("board", {}).setdefault("design_settings", {}).setdefault("rules", {})
        for key, value in rules.items():
            if key not in RULE_KEYS and key not in current:
                raise PcbError(f"unknown design rule '{key}' (known: {', '.join(RULE_KEYS)})")
            if key.startswith(("allow_", "use_")):
                if not isinstance(value, bool):
                    raise PcbError(f"{key} must be true or false")
            elif isinstance(value, bool) or not isinstance(value, (int, float)) or value < 0:
                raise PcbError(f"{key} must be a non-negative number (mm)")
            current[key] = value
        self._project_dirty = True
        self.changes.append("design rules: " + ", ".join(f"{k} = {v}" for k, v in rules.items()))
        return {k: current[k] for k in rules}

    def _net_settings(self) -> dict[str, Any]:
        return self.project().get("net_settings", {})

    def net_classes(self) -> list[dict[str, Any]]:
        settings = self._net_settings()
        classes = settings.get("classes") or [DEFAULT_CLASS]
        patterns = settings.get("netclass_patterns") or []
        assignments = settings.get("netclass_assignments") or {}
        out = []
        for cls in classes:
            name = cls.get("name", "")
            entry = {k: cls[k] for k in ("name", *NET_CLASS_KEYS) if k in cls}
            nets = [p.get("pattern") for p in patterns if p.get("netclass") == name]
            nets += [net for net, names in assignments.items() if name in (names if isinstance(names, list) else [names])]
            if nets:
                entry["nets"] = nets
            out.append(entry)
        return out

    def net_class_of(self, net: str) -> dict[str, Any]:
        """The effective class values for a net (highest-priority matching class, gaps filled from Default)."""
        settings = self._net_settings()
        classes = {c.get("name"): c for c in settings.get("classes") or []}
        default = {**DEFAULT_CLASS, **classes.get("Default", {})}
        matches = []
        for pattern in settings.get("netclass_patterns") or []:
            if fnmatch.fnmatchcase(net, pattern.get("pattern", "")) and pattern.get("netclass") in classes:
                matches.append(classes[pattern["netclass"]])
        assigned = (settings.get("netclass_assignments") or {}).get(net)
        for name in assigned if isinstance(assigned, list) else [assigned] if assigned else []:
            if name in classes:
                matches.append(classes[name])
        if not matches:
            return default
        best = min(matches, key=lambda c: c.get("priority", 0))
        return {**default, **best}

    def set_net_class(self, name: str, nets: list[str] | None = None, track_width: float | None = None,
                      clearance: float | None = None, via_diameter: float | None = None, via_drill: float | None = None,
                      via: dict | None = None, **other: Any) -> dict:
        """Create or update a net class in the project file and (optionally) make it own ``nets``."""
        if not name:
            raise PcbError("a net class needs a name")
        if via is not None:
            if not isinstance(via, dict):
                raise PcbError("via must be {diameter, drill}")
            via_diameter = via.get("diameter", via_diameter)
            via_drill = via.get("drill", via_drill)
        values = {"track_width": track_width, "clearance": clearance, "via_diameter": via_diameter, "via_drill": via_drill}
        for key, value in other.items():
            if key not in NET_CLASS_KEYS:
                raise PcbError(f"unknown net class field '{key}' (known: {', '.join(NET_CLASS_KEYS)}, nets)")
            values[key] = value
        values = {k: v for k, v in values.items() if v is not None}
        for key, value in values.items():
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
                raise PcbError(f"{key} must be a positive number (mm)")
        settings = self.project().setdefault("net_settings", {})
        classes = settings.setdefault("classes", [])
        if not classes:
            classes.append(dict(DEFAULT_CLASS, priority=2147483647))
        cls = next((c for c in classes if c.get("name") == name), None)
        created = cls is None
        if created:
            template = next((c for c in classes if c.get("name") == "Default"), DEFAULT_CLASS)
            others = [c.get("priority", 0) for c in classes if c.get("name") != "Default"]
            cls = copy.deepcopy(template)
            cls["name"] = name
            cls["priority"] = max(others) + 1 if others else 0
            classes.append(cls)
        cls.update(values)
        unknown: list[str] = []
        if nets is not None:
            if name == "Default":
                raise PcbError("nets belong to Default unless another class claims them; assign them to a named class")
            if isinstance(nets, str) or not all(isinstance(n, str) and n for n in nets):
                raise PcbError("nets must be a list of net names")
            patterns = [p for p in settings.get("netclass_patterns") or []
                        if p.get("netclass") != name and p.get("pattern") not in nets]
            patterns += [{"netclass": name, "pattern": n} for n in nets]
            settings["netclass_patterns"] = patterns
            assignments = settings.get("netclass_assignments")
            if isinstance(assignments, dict):
                for net in nets:
                    assignments.pop(net, None)
            board_nets = set(self.nets())
            unknown = [n for n in nets if not any(c in n for c in "*?") and n not in board_nets]
        self._project_dirty = True
        desc = ", ".join(f"{k} {v}" for k, v in values.items())
        self.changes.append(f"{'created' if created else 'updated'} net class {name}" + (f": {desc}" if desc else "")
                            + (f"; nets {', '.join(nets)}" if nets else ""))
        result: dict[str, Any] = {"name": name, **{k: cls.get(k) for k in ("track_width", "clearance", "via_diameter", "via_drill")}}
        if unknown:
            result["note"] = f"not on the board yet: {', '.join(unknown)}"
        return result

    # ---- copper --------------------------------------------------------------------
    def tracks(self) -> list[dict[str, Any]]:
        codes = self._net_codes()
        out = []
        for item in self.root.lists():
            if item.head in ("segment", "arc"):
                out.append({"kind": item.head, "uuid": _uuid(item), "net": _net_name_of(item, codes), "layer": item.child_value("layer"),
                            "start": list(_xy(item.find("start"))), "end": list(_xy(item.find("end"))), "width": _f(item.child_value("width"))})
            elif item.head == "via":
                out.append({"kind": "via", "uuid": _uuid(item), "net": _net_name_of(item, codes), "at": list(_xy(item.find("at"))),
                            "size": _f(item.child_value("size")), "drill": _f(item.child_value("drill")), "layers": _layers_of(item)})
        return out

    def add_track(self, points: list, net: str | None = None, layer: str = "F.Cu", width: float | None = None) -> dict:
        """Straight segments through ``points`` ([x, y] or "REF:PAD", which snaps to the pad centre)."""
        if not isinstance(points, list) or len(points) < 2:
            raise PcbError("a track needs at least two points")
        layer = self.layer_name(layer, copper=True)
        pts: list[tuple[float, float]] = []
        pad_nets: list[tuple[str, str]] = []
        for p in points:
            if isinstance(p, str):
                x, y, pad = self._pad_point(p)
                if not _pad_on_layer(pad["layers"], layer):
                    raise PcbError(f"{p} is on {'/'.join(pad['layers'][:1]) or 'another layer'}, not {layer}; "
                                   f"put the track on that layer or add a via")
                pad_nets.append((p, pad["net"]))
                pts.append((x, y))
            else:
                pts.append(_pair(p, "points"))
        if net is None:
            named = [n for _, n in pad_nets if n]
            if not named:
                raise PcbError("add_track needs a net (or a pad endpoint 'REF:PAD' that has one)")
            net = named[0]
        self._require_net(net)
        for ref_pad, pad_net in pad_nets:
            if pad_net != net:
                raise PcbError(f"{ref_pad} is on net '{pad_net or '(none)'}', not '{net}'")
        width = float(width if width is not None else self.net_class_of(net).get("track_width") or DEFAULT_CLASS["track_width"])
        if width <= 0:
            raise PcbError("width must be > 0")
        uuids, length = [], 0.0
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            if math.hypot(bx - ax, by - ay) < 1e-6:
                continue
            uid = new_uuid()
            self.insert_item(L("segment", L("start", _n(ax), _n(ay)), L("end", _n(bx), _n(by)), L("width", _n(width)),
                               L("layer", S(layer)), *self.net_nodes(net, "track"), L("uuid", S(uid))))
            uuids.append(uid)
            length += math.hypot(bx - ax, by - ay)
        if not uuids:
            raise PcbError("the track has no length")
        self.changes.append(f"track on {net} ({layer}, {_mm(width)} mm, {len(uuids)} segment(s), {round(length, 3)} mm)")
        return {"net": net, "layer": layer, "width": width, "segments": uuids, "length": round(length, 4)}

    def add_via(self, x: float, y: float, net: str, diameter: float | None = None, drill: float | None = None,
                size: float | None = None) -> dict:
        self._require_net(net)
        cls = self.net_class_of(net)
        diameter = float(diameter or size or cls.get("via_diameter") or DEFAULT_CLASS["via_diameter"])
        drill = float(drill or cls.get("via_drill") or DEFAULT_CLASS["via_drill"])
        if drill <= 0 or diameter <= drill:
            raise PcbError("a via needs drill > 0 and diameter > drill")
        uid = new_uuid()
        self.insert_item(L("via", L("at", _n(float(x)), _n(float(y))), L("size", _n(diameter)), L("drill", _n(drill)),
                           L("layers", S("F.Cu"), S("B.Cu")), *self.net_nodes(net, "track"), L("uuid", S(uid))))
        self.changes.append(f"via on {net} at ({_mm(float(x))}, {_mm(float(y))}), {_mm(diameter)}/{_mm(drill)} mm")
        return {"uuid": uid, "net": net, "diameter": diameter, "drill": drill}

    def _zone_layers(self, layer: Any, layers: Any) -> list[str]:
        wanted = layers if layers is not None else layer
        if wanted is None:
            raise PcbError("a zone needs a layer (or layers)")
        if isinstance(wanted, str):
            wanted = self.copper_layers() if wanted in ("all", "*.Cu") else [wanted]
        return [self.layer_name(l, copper=True) for l in wanted]

    def _zone_polygon(self, outline: Any) -> list[tuple[float, float]]:
        if outline in (None, "board"):
            return self.outline_polygon()
        if not isinstance(outline, list) or len(outline) < 3:
            raise PcbError("outline must be 'board' or at least 3 [x, y] points")
        return [_pair(p, "outline") for p in outline]

    def _zone(self, net: str | None, layers: list[str], polygon: list[tuple[float, float]], name: str | None,
              priority: int | None, extra: list[SList]) -> SList:
        node = L("zone")
        if net:
            for child in self.net_nodes(net, "zone"):
                node.append(child)
        elif self.numbered_nets:
            node.append(L("net", 0))
            node.append(L("net_name", S("")))
        node.append(L("layer", S(layers[0])) if len(layers) == 1 else L("layers", *(S(l) for l in layers)))
        node.append(L("uuid", S(new_uuid())))
        if name:
            node.append(L("name", S(name)))
        node.append(L("hatch", "edge", 0.5))
        if priority:
            node.append(L("priority", int(priority)))
        for child in extra:
            node.append(child)
        node.append(L("polygon", L("pts", *(L("xy", _n(px), _n(py)) for px, py in polygon))))
        return node

    def add_zone(self, net: str, layer: Any = None, layers: Any = None, outline: Any = "board", name: str | None = None,
                 priority: int | None = None, clearance: float | None = None, min_thickness: float = 0.25,
                 connect_pads: str = "thermal", thermal_gap: float = 0.5, thermal_bridge_width: float = 0.5) -> dict:
        """A copper pour; KiCad fills it (kicad-cli pcb drc --refill-zones, or the GUI)."""
        self._require_net(net)
        zone_layers = self._zone_layers(layer, layers)
        polygon = self._zone_polygon(outline)
        modes = {"thermal": None, "solid": "yes", "none": "no", "thru_hole_only": "thru_hole_only"}
        if connect_pads not in modes:
            raise PcbError(f"connect_pads must be one of {', '.join(modes)}")
        clearance = float(clearance if clearance is not None else self.net_class_of(net).get("clearance") or 0.5)
        connect = L("connect_pads", *([modes[connect_pads]] if modes[connect_pads] else []), L("clearance", _n(clearance)))
        extra = [connect, L("min_thickness", _n(float(min_thickness)))]
        if self.numbered_nets:
            extra.append(L("filled_areas_thickness", "no"))
        fill = L("fill", L("thermal_gap", _n(float(thermal_gap))), L("thermal_bridge_width", _n(float(thermal_bridge_width))))
        if not self.numbered_nets:
            fill.append(L("island_removal_mode", 0))
        extra.append(fill)
        node = self._zone(net, zone_layers, polygon, name, priority, extra)
        self.insert_item(node)
        self.changes.append(f"zone {net} on {', '.join(zone_layers)}" + (" over the board" if outline in (None, "board") else f" ({len(polygon)} points)"))
        return {"uuid": node.child_value("uuid"), "net": net, "layers": zone_layers}

    def add_keepout(self, outline: Any = None, layers: Any = None, layer: Any = None, tracks: bool = True, vias: bool = True,
                    pads: bool = True, copperpour: bool = True, footprints: bool = False, name: str | None = None) -> dict:
        """A rule area forbidding tracks/vias/pads/copper pours/footprints (True = not allowed) inside ``outline``."""
        if outline is None:
            raise PcbError("add_keepout needs an outline: [[x, y], ...] or 'board'")
        zone_layers = self._zone_layers(layer, layers if layers is not None or layer is not None else "all")
        polygon = self._zone_polygon(outline)
        rules = {"tracks": tracks, "vias": vias, "pads": pads, "copperpour": copperpour, "footprints": footprints}
        if not any(rules.values()):
            raise PcbError("a keepout must forbid at least one of tracks, vias, pads, copperpour, footprints")
        keepout = L("keepout", *(L(k, "not_allowed" if v else "allowed") for k, v in rules.items()))
        extra = [L("connect_pads", L("clearance", 0)), L("min_thickness", 0.25)]
        if self.numbered_nets:
            extra.append(L("filled_areas_thickness", "no"))
        extra += [keepout, L("placement", L("enabled", "no"), L("sheetname", S(""))),
                  L("fill", L("thermal_gap", 0.5), L("thermal_bridge_width", 0.5))]
        node = self._zone(None, zone_layers, polygon, name, None, extra)
        self.insert_item(node)
        forbidden = [k for k, v in rules.items() if v]
        self.changes.append(f"keepout on {', '.join(zone_layers)} ({', '.join(forbidden)} not allowed)")
        return {"uuid": node.child_value("uuid"), "layers": zone_layers, "not_allowed": forbidden}

    def zones(self) -> list[dict[str, Any]]:
        codes = self._net_codes()
        out = []
        for z in self.root.lists("zone"):
            pts = z.find("polygon")
            poly = [_xy(p) for p in pts.find("pts").lists("xy")] if pts is not None and pts.find("pts") is not None else []
            entry: dict[str, Any] = {"uuid": _uuid(z), "layers": _layers_of(z), "bbox": _bbox(poly)}
            net = _net_name_of(z, codes)
            if net:
                entry["net"] = net
            for key in ("name", "priority"):
                if z.child_value(key) is not None:
                    entry[key] = z.child_value(key)
            keepout = z.find("keepout")
            if keepout is not None:
                entry["keepout"] = [k.head for k in keepout.lists() if k.value(0) == "not_allowed"]
            if (entry.get("name") or "").startswith("$teardrop"):
                continue
            out.append(entry)
        return out

    # ---- silkscreen ----------------------------------------------------------------
    def add_text(self, text: str, x: float, y: float, layer: str = "F.SilkS", size: float = 1.0,
                 thickness: float | None = None, rotation: float = 0, bold: bool = False) -> dict:
        if not text:
            raise PcbError("text must not be empty")
        layer = self.layer_name(layer)
        thickness = float(thickness) if thickness is not None else round(float(size) * 0.15, 4)
        uid = new_uuid()
        self.insert_item(L("gr_text", S(text), L("at", _n(float(x)), _n(float(y)), _n(_norm360(float(rotation)))),
                           L("layer", S(layer)), L("uuid", S(uid)),
                           _effects(float(size), thickness, bold=bold, mirror=layer.startswith("B."))))
        self.changes.append(f"text '{text}' on {layer} at ({_mm(float(x))}, {_mm(float(y))})")
        return {"uuid": uid}

    def set_reference_text(self, reference: str, x: float | None = None, y: float | None = None,
                           size: float | None = None, thickness: float | None = None, rotation: float | None = None,
                           hide: bool | None = None) -> dict:
        """Position (absolute board mm), size, rotation or visibility of a footprint's reference designator."""
        fp = self.footprint(reference)
        field = fp.field("Reference")
        if field is None:
            raise PcbError(f"{reference} has no reference field")
        at = field.find("at")
        if at is None:
            at = field.insert(3, L("at", 0, 0, 0))
        lx, ly = _xy(at)
        angle = _f(at.value(2))
        if x is not None or y is not None:
            bx, by = fp.to_board(lx, ly)
            lx, ly = fp.to_local(float(x) if x is not None else bx, float(y) if y is not None else by)
        if rotation is not None:
            angle = _norm360(float(rotation))
        _set_at(at, round(lx, 6), round(ly, 6), angle)
        if size is not None or thickness is not None:
            effects = field.find("effects") or field.append(_effects(1.0, 0.15))
            font = effects.find("font") or effects.insert(1, L("font", L("size", 1, 1)))
            if size is not None:
                if float(size) <= 0:
                    raise PcbError("size must be > 0")
                node = font.find("size") or font.append(L("size", 1, 1))
                node.set_atoms(_n(float(size)), _n(float(size)))
            if thickness is not None:
                node = font.find("thickness") or font.append(L("thickness", 0.15))
                node.set_atoms(_n(float(thickness)))
        if hide is not None:
            _set_hidden(field, bool(hide))
        self.changes.append(f"reference text of {reference}" + "".join(
            f" {k}={v}" for k, v in (("x", x), ("y", y), ("size", size), ("thickness", thickness), ("rotation", rotation), ("hide", hide))
            if v is not None))
        bx, by = fp.to_board(lx, ly)
        return {"reference": reference, "at": [round(bx, 4), round(by, 4)], "rotation": angle}

    def texts(self) -> list[dict[str, Any]]:
        return [{"text": t.value(0), "at": list(_xy(t.find("at"))), "layer": t.child_value("layer"), "uuid": _uuid(t)}
                for t in self.root.lists("gr_text")]

    # ---- removal -------------------------------------------------------------------
    def remove_item(self, uuid: str) -> str:
        """Remove a top-level item (footprint, track, via, zone, text, outline shape, ...) by uuid."""
        for item in list(self.root.lists()):
            if _uuid(item) == uuid and item.head not in ("kicad_pcb", "setup", "layers"):
                self.root.remove(item)
                what = item.head or "item"
                if what == "footprint":
                    what = f"footprint {Footprint(item).reference}"
                elif what in TRACKS:
                    what = f"{what} on {_net_name_of(item, self._net_codes()) or 'no net'}"
                elif what == "gr_text":
                    what = f"text '{item.value(0)}'"
                for group in list(self.root.lists("group")):
                    members = group.find("members")
                    for atom in [a for a in (members.atoms() if members is not None else []) if a.value == uuid]:
                        members.remove(atom)
                self.changes.append(f"removed {what} ({uuid})")
                return what
        raise PcbError(f"no item with uuid {uuid} (uuids: kicad_read_pcb with include_items)")

    # ---- reading -------------------------------------------------------------------
    def summary(self, include_footprints: bool = True, include_pads: bool = False, include_items: bool = False) -> dict[str, Any]:
        general = self.root.find("general")
        stackup = None
        setup = self.root.find("setup")
        if setup is not None and setup.find("stackup") is not None:
            stackup = []
            for layer in setup.find("stackup").lists("layer"):
                entry = {"layer": layer.value(0), "type": layer.child_value("type")}
                if layer.child_value("thickness") is not None:
                    entry["thickness"] = _f(layer.child_value("thickness"))
                if layer.child_value("material") is not None:
                    entry["material"] = layer.child_value("material")
                stackup.append(entry)
        tracks = self.tracks()
        footprints = self.footprints()
        nets = self.nets()
        out: dict[str, Any] = {
            "path": self.path,
            "format": {"version": self.version, "generator_version": self.root.child_value("generator_version"),
                       "nets": "numbered" if self.numbered_nets else "named"},
            "board": {
                "outline": self.outline(),
                "thickness": _f(general.child_value("thickness"), 1.6) if general is not None else 1.6,
                "copper_layers": self.copper_layers(),
            },
            "counts": {"footprints": len(footprints), "nets": len(nets),
                       "segments": sum(1 for t in tracks if t["kind"] in ("segment", "arc")),
                       "vias": sum(1 for t in tracks if t["kind"] == "via"), "zones": len(self.zones())},
            "project_file": self.project_path if os.path.isfile(self.project_path) or self._project_text else None,
            "design_rules": self.design_rules(),
            "net_classes": self.net_classes(),
        }
        if stackup:
            out["board"]["stackup"] = stackup
        zones = self.zones()
        if zones:
            out["zones"] = zones
        out["nets"] = nets if len(nets) <= 300 else nets[:300] + [f"… {len(nets) - 300} more"]
        if include_footprints:
            out["footprints"] = sorted((fp.summary(pads=include_pads) for fp in footprints), key=lambda f: _ref_key(f["reference"]))
        if include_items:
            out["items"] = {"tracks": tracks, "texts": self.texts(),
                            "outline": [{"kind": i.head, "uuid": _uuid(i)} for i in self.outline_items()]}
        return out

    # ---- batch ---------------------------------------------------------------------
    def apply(self, op: dict[str, Any]) -> Any:
        """Apply one operation dict (``{"op": "add_track", ...}``)."""
        name = op.get("op")
        handler = OPERATIONS.get(name or "")
        if handler is None:
            raise PcbError(f"unknown operation '{name}'; known: {', '.join(sorted(OPERATIONS))}")
        args = {k: v for k, v in op.items() if k != "op"}
        try:
            return handler(self, **args)
        except TypeError as exc:
            raise PcbError(f"bad arguments for {name}: {exc}") from exc


# ---- helpers ------------------------------------------------------------------------

def _pair(value: Any, what: str) -> tuple[float, float]:
    if (not isinstance(value, (list, tuple)) or len(value) != 2
            or not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in value)):
        raise PcbError(f"{what} must be [x, y] pairs in mm, got {value!r}")
    return float(value[0]), float(value[1])


def _pad_on_layer(layers: list[str], layer: str) -> bool:
    return any(l == layer or l in ("*.Cu", "F&B.Cu") for l in layers)


# Footprint (attr …) flags in the order KiCad writes them.
ATTR_ORDER = ("smd", "through_hole", "board_only", "exclude_from_pos_files", "exclude_from_bom",
              "allow_missing_courtyard", "dnp", "allow_soldermask_bridges")


def attr_flags(footprint: SList) -> list[str]:
    attr = footprint.find("attr")
    return [a.value for a in attr.atoms()] if attr is not None else []


def set_attr_flags(footprint: SList, flags: dict[str, bool]) -> bool:
    """Set (True) or clear (False) footprint attribute flags, keeping KiCad's order. Returns whether it changed."""
    have = attr_flags(footprint)
    want = [f for f in have if flags.get(f, True)] + [f for f, on in flags.items() if on and f not in have]
    want.sort(key=lambda f: ATTR_ORDER.index(f) if f in ATTR_ORDER else len(ATTR_ORDER))
    if want == have:
        return False
    attr = footprint.find("attr")
    if attr is None:
        # KiCad writes (attr …) after the symbol link (path, sheetname, sheetfile, units), before the graphics.
        anchor = next((i for i, item in enumerate(footprint.items) if isinstance(item, SList) and (
            item.head in ("duplicate_pad_numbers_are_jumpers", "net_tie_pad_groups", "jumper_pad_groups", "pad", "model",
                          "group", "embedded_fonts", "embedded_files", "zone") or (item.head or "").startswith("fp_"))),
                      len(footprint.items))
        if want:
            footprint.insert(anchor, L("attr", *want))
    elif want:
        footprint.items[footprint.index_of(attr)] = kicad_layout(L("attr", *want), _depth_of_attr(footprint, attr))
    else:
        footprint.remove(attr)
    return True


def _depth_of_attr(footprint: SList, attr: SList) -> int:
    """Nesting depth of a footprint's (attr) from its indentation (2 on a board, 1 in a .kicad_mod)."""
    ws = footprint.ws[footprint.index_of(attr)] or ""
    return ws.count("\t") if "\n" in ws else 2


def _footprint_order(node: SList) -> tuple[int, str]:
    """KiCad's save order of footprints (BOARD_ITEM::ptr_cmp): by layer (front before back), then by uuid."""
    return (1 if node.child_value("layer") == "B.Cu" else 0), _uuid(node) or ""


def _pad_net_index(pad: SList) -> int:
    for i, item in enumerate(pad.items):
        if isinstance(item, SList) and item.head in ("pinfunction", "pintype", "uuid", "tstamp"):
            return i
    return len(pad.items)


def _fresh_uuids(node: SList, skip: SList | None = None) -> None:
    for child in node.lists():
        if child.head in ("uuid", "tstamp") and child is not skip:
            child.items[1] = S(new_uuid())
        else:
            _fresh_uuids(child, skip)


def _add_missing_uuids(footprint: SList) -> None:
    """Library footprints carry no uuids; KiCad gives every placed field, graphic and pad one."""
    for child in footprint.lists():
        head = child.head or ""
        if child.find("uuid") is not None or not (head == "pad" or head.startswith("fp_") or
                                                  (head == "property" and child.find("layer") is not None)):
            continue
        effects = child.find("effects") if head in _TEXT_CHILDREN else None
        node = L("uuid", S(new_uuid()))
        if effects is not None:
            child.insert(child.index_of(effects), node)
        else:
            child.append(node)


def _flip_pad(pad: SList) -> None:
    """Mirror a pad's own geometry top/bottom (KiCad's PAD::Flip) and move it to the other side's layers."""
    _flip_layers(pad)
    drill = pad.find("drill")
    offset = drill.find("offset") if drill is not None else None
    if offset is not None:
        x, y = _xy(offset)
        _set_xy(offset, x, -y)
    delta = pad.find("rect_delta")
    if delta is not None:
        x, y = _xy(delta)
        _set_xy(delta, x, -y)
    chamfer = pad.find("chamfer")
    if chamfer is not None:
        swap = {"top_left": "bottom_left", "bottom_left": "top_left", "top_right": "bottom_right", "bottom_right": "top_right"}
        for atom in chamfer.atoms():
            if atom.value in swap:
                atom.set(swap[atom.value])
    primitives = pad.find("primitives")
    if primitives is not None:
        _each_point(primitives, lambda px, py: (px, -py))


def _set_hidden(field: SList, hidden: bool) -> None:
    for flag in list(field.lists("hide")):
        field.remove(flag)
    for atom in [a for a in field.atoms() if a.value == "hide"]:
        field.remove(atom)
    effects = field.find("effects")
    if effects is not None:
        for flag in list(effects.lists("hide")):
            effects.remove(flag)
        for atom in [a for a in effects.atoms() if a.value == "hide"]:
            effects.remove(atom)
    if hidden:
        layer = field.find("layer")
        index = field.index_of(layer) + 1 if layer is not None else len(field.items)
        if field.head == "fp_text":  # KiCad 7 and older: a bare token
            field.insert(index, Atom("hide"))
            field.ws[index] = " "
        else:
            field.insert(index, L("hide", "yes"))


def _mounting_hole_ids(drill: float, plated: bool) -> list[str]:
    metric = {2.2: "M2", 2.7: "M2.5", 3.2: "M3", 3.7: "M3.5", 4.3: "M4", 5.3: "M5", 6.4: "M6", 8.4: "M8"}.get(round(drill, 1))
    size = _mm(drill)
    suffix = "_Pad" if plated else ""
    ids = [f"MountingHole:MountingHole_{size}mm_{metric}{suffix}"] if metric else []
    return ids + [f"MountingHole:MountingHole_{size}mm{suffix}"]


def _mounting_hole_node(drill: float, plated: bool) -> SList:
    """A minimal mounting-hole footprint for machines without KiCad's footprint libraries."""
    pad_size = drill * 2 if plated else drill
    court = pad_size / 2 + 0.25
    text = lambda name, value, y, layer: L(  # noqa: E731
        "property", S(name), S(value), L("at", 0, _n(y), 0), L("layer", S(layer)), L("uuid", S(new_uuid())),
        _effects(1.0, 0.15))
    pad = (L("pad", S("1"), "thru_hole", "circle", L("at", 0, 0), L("size", _n(pad_size), _n(pad_size)), L("drill", _n(drill)),
             L("layers", S("*.Cu"), S("*.Mask")), L("uuid", S(new_uuid())))
           if plated else
           L("pad", S(""), "np_thru_hole", "circle", L("at", 0, 0), L("size", _n(drill), _n(drill)), L("drill", _n(drill)),
             L("layers", S("*.Cu"), S("*.Mask")), L("uuid", S(new_uuid()))))
    return L("footprint", S(f"MountingHole_{_mm(drill)}mm"), L("layer", S("F.Cu")),
             L("descr", S(f"Mounting hole, {_mm(drill)} mm drill{', plated' if plated else ''}")),
             text("Reference", "H", -court - 1.0, "F.SilkS"), text("Value", "MountingHole", court + 1.0, "F.Fab"),
             L("attr", "exclude_from_pos_files", "exclude_from_bom"),
             L("fp_circle", L("center", 0, 0), L("end", _n(court), 0), _stroke(0.05, "solid"), L("fill", "no"),
               L("layer", S("F.CrtYd")), L("uuid", S(new_uuid()))),
             pad)


def _ref_key(ref: str):
    m = re.match(r"([^\d]*)(\d*)(.*)", ref)
    prefix, number, rest = m.groups() if m else (ref, "", "")
    return (prefix, int(number) if number else -1, rest)


OPERATIONS: dict[str, Callable[..., Any]] = {
    "set_board_outline": lambda b, **kw: b.set_board_outline(**kw),
    "add_mounting_hole": lambda b, x, y, **kw: b.add_mounting_hole(x, y, **kw),
    "move_footprint": lambda b, reference, x=None, y=None, rotation=None, side=None: b.move_footprint(reference, x, y, rotation, side),
    "move_footprints": lambda b, references, dx, dy: b.move_footprints(references, dx, dy),
    "lock_footprint": lambda b, reference, locked=True: b.lock_footprint(reference, locked),
    "set_design_rules": lambda b, **rules: b.set_design_rules(**rules),
    "set_net_class": lambda b, name, **kw: b.set_net_class(name, **kw),
    "add_track": lambda b, points, net=None, layer="F.Cu", width=None: b.add_track(points, net, layer, width),
    "add_via": lambda b, x, y, net, **kw: b.add_via(x, y, net, **kw),
    "add_zone": lambda b, net, **kw: b.add_zone(net, **kw),
    "add_keepout": lambda b, **kw: b.add_keepout(**kw),
    "add_text": lambda b, text, x, y, **kw: b.add_text(text, x, y, **kw),
    "set_reference_text": lambda b, reference, **kw: b.set_reference_text(reference, **kw),
    "remove_item": lambda b, uuid: b.remove_item(uuid),
}
