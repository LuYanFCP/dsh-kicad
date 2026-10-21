"""Initial placement by functional block (#12; docs/pcb-architecture.md, "Placement").

The board is grouped the way the schematic is drawn: every functional block (an ``add_block`` frame in the
schematic next to the board) becomes a group of footprints. Without blocks the sheets are the groups, and on
a flat schematic without blocks the parts gather around the ICs and connectors they are wired to.

Each group is laid out on its own, then the groups are laid out on the board, both by the same greedy packer:
the first part (an IC, or the group's connectors in a row along an edge) goes first, then the part most
connected to what is placed goes to the free spot, among those touching a placed part, with the shortest
weighted connections, and a final pass re-places every part once the others are known. Heuristics:

* connectors sit on the board edge facing outward: a footprint's "PCB Edge" mark lands on the edge (otherwise
  the side its body reaches furthest beyond its pads, or its courtyard, does);
* decoupling capacitors go next to their IC's power pins (a capacitor between an IC's power net and ground,
  found through the nets; bulk capacitors on a regulator output stay with the regulator);
* a crystal goes next to its IC, its load capacitors next to it;
* power parts (regulators, power packages, big inductors) get extra room.

The outline is fitted around the parts (connectors on its edges, unlocked mounting holes in its corners)
unless the user drew one; parts placed inside a user's outline must fit it. Reference designators and values
on silkscreen that cover a pad or other silkscreen are moved to a free spot next to their part.

* :func:`auto_place` — the whole board, or only some footprints (``auto_place`` op of ``kicad_edit_pcb``).
* :func:`place_block` — one block into a rectangle (``place_block`` op).
* :func:`check_placement` — courtyard overlaps, footprints outside the outline, reference text over pads.
* :func:`ratsnest_length` — every net's minimum spanning tree over its pads, summed: the placement metric.
"""

from __future__ import annotations

import math
import os
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any

from .pcb import Board, Footprint, PcbError, _f, _mm, _net_name_of, _ref_key, _rotate, _set_at, _shape_points, _xy, attr_flags
from .pcb_sync import Uuids

__all__ = ["OPERATIONS", "apply", "auto_place", "check_placement", "place_block", "ratsnest_length"]

GAP = 1.0          # mm between the courtyards of parts in one group
GROUP_GAP = 2.5    # mm between groups
MARGIN = 1.0       # mm between a part and the board edge (connectors facing the edge sit on it)
POWER_HALO = 1.0   # extra mm around power parts
GRID = 0.05        # mm grid for footprint positions
NEAR = 12          # placed items a new one may touch, nearest to where its connections pull it
EDGE_CLEARANCE = 0.5  # mm copper to board edge, KiCad's default rule (the board's own rule wins)
EPS = 1e-6

SIDES = ("bottom", "right", "top", "left")
# A group is laid out with its connectors facing the bottom edge; this rotation turns it to face each side.
_SIDE_ROTATION = {"bottom": 0, "right": 90, "top": 180, "left": 270}
_COURTYARD = ("F.CrtYd", "B.CrtYd")
_FAB = ("F.Fab", "B.Fab")
_SILK = ("F.SilkS", "B.SilkS")
_MOVABLE_TEXT = ("Reference", "Value", "reference", "value")  # moved off pads by _tidy_texts, not packed around
_MARK = re.compile(r"(pcb|board)[\s_-]*edge|edge[\s_-]*of[\s_-]*(the[\s_-]*)?(pcb|board)", re.I)
_POWER_PACKAGE = re.compile(r"TO-220|TO-247|TO-252|TO-263|TO-3P|D2PAK|DPAK|SOT-223|PowerPAK|PowerPAD|SOT-669|LFPAK", re.I)
_GROUND = re.compile(r"^/?(.*[/_])?(GND\w*|\w*GND|VSS\w*|0V)$", re.I)
_POWER_NET = re.compile(r"^/?(.*[/_])?([+-]\d+V\d*\w*|\+\w+|V(CC|DD|BUS|BAT|IN|SYS|MOTOR)\w*|\d+V\d*)$", re.I)
# kicad_update_pcb's placeholder outline has this uuid; auto_place replaces it with a fitted one.
_PLACEHOLDER = Uuids("outline")().value(0)

Box = tuple[float, float, float, float]


# ---- geometry ---------------------------------------------------------------------------

def _bounds(points) -> Box | None:
    points = list(points)
    if not points:
        return None
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def _corners(box: Box):
    return [(box[0], box[1]), (box[2], box[1]), (box[2], box[3]), (box[0], box[3])]


def _turn_box(box: Box, deg: float) -> Box:
    return _bounds(_rotate(x, y, deg) for x, y in _corners(box))  # type: ignore[return-value]


def _shift(box: Box, dx: float, dy: float) -> Box:
    return box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy


def _union(a: Box | None, b: Box | None) -> Box | None:
    if a is None or b is None:
        return a or b
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def _hits(a: Box, b: Box, sep: float = 0.0) -> bool:
    """Do two boxes come closer than ``sep``?"""
    return a[0] < b[2] + sep - EPS and b[0] < a[2] + sep - EPS and a[1] < b[3] + sep - EPS and b[1] < a[3] + sep - EPS


def _inside(box: Box, outer: Box, tol: float = 1e-4) -> bool:
    return box[0] >= outer[0] - tol and box[1] >= outer[1] - tol and box[2] <= outer[2] + tol and box[3] <= outer[3] + tol


def _snap(value: float, how: str = "round") -> float:
    k = value / GRID
    k = math.ceil(k - 1e-6) if how == "up" else math.floor(k + 1e-6) if how == "down" else round(k)
    return round(k * GRID, 4)


def _point_in_polygon(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            inside = not inside
    return inside


def _out(side: str, box: Box) -> float:
    """How far ``box`` reaches towards ``side`` (larger is further out)."""
    return {"bottom": box[3], "right": box[2], "top": -box[1], "left": -box[0]}[side]


def _in(side: str, box: Box) -> float:
    """Where ``box`` starts, seen from ``side`` (its edge facing the board's middle)."""
    return {"bottom": box[1], "right": box[0], "top": -box[3], "left": -box[2]}[side]


def _axis(side: str) -> int:
    return 1 if side in ("top", "bottom") else 0


def _sign(side: str) -> int:
    return 1 if side in ("bottom", "right") else -1


# ---- parts --------------------------------------------------------------------------------

@dataclass
class _Shape:
    """A footprint at rotation 0 relative to its origin: courtyard box, pads and the side it faces, if any."""

    box: Box                              # courtyard plus silkscreen (except the movable Reference and Value)
    pads: list[tuple[float, float, str]]  # x, y, net
    copper: Box
    face: str | None = None               # connectors: the side their mating end faces
    face_at: float = 0.0                  # where the board edge goes: the "PCB Edge" mark, or past body and pads
    mark: bool = False                    # face_at comes from the footprint's own edge mark

    def turned(self, deg: float) -> _Shape:
        deg = deg % 360
        if not deg:
            return self
        pads = [(*_rotate(x, y, deg), net) for x, y, net in self.pads]
        face, face_at = self.face, self.face_at
        if face:
            # The edge line passes through the point face_at along the face direction; rotate that point.
            px, py = {"bottom": (0, face_at), "top": (0, -face_at), "right": (face_at, 0), "left": (-face_at, 0)}[face]
            px, py = _rotate(px, py, deg)
            face = SIDES[(SIDES.index(face) + int(round(deg / 90))) % 4]
            face_at = _sign(face) * (py if _axis(face) else px)
        return _Shape(_turn_box(self.box, deg), pads, _turn_box(self.copper, deg), face, face_at, self.mark)

    def edge_line(self, side: str, clearance: float) -> float:
        """Where the board edge goes when this footprint sits on ``side``: its edge mark, or just past its body,
        silkscreen and (by the copper-to-edge clearance) its pads."""
        if self.face == side:
            return self.face_at
        return max(_out(side, self.box), _out(side, self.copper) + clearance)


def _local_shape(fp: Footprint, connector: bool, edge_clearance: float = EDGE_CLEARANCE) -> _Shape:
    rot = fp.at[2]
    court: list[tuple[float, float]] = []
    fab: list[tuple[float, float]] = []
    silk: list[tuple[float, float]] = []
    copper: list[tuple[float, float]] = []
    pads = []
    for child in fp.node.lists():
        head = child.head or ""
        layer = child.child_value("layer")
        if head.startswith("fp_") and head not in ("fp_text", "fp_text_box"):
            if layer in _COURTYARD:
                court += _shape_points(child)
            elif layer in _FAB:
                fab += _shape_points(child)
            elif layer in _SILK:
                stroke = child.find("stroke")
                half = _f(stroke.child_value("width") if stroke is not None else child.child_value("width"), 0.12) / 2
                for x, y in _shape_points(child):
                    silk += [(x - half, y - half), (x + half, y + half)]
        elif head in ("fp_text", "property") and layer in _SILK and child.value(0) not in _MOVABLE_TEXT:
            box = _text_box(fp, child)  # artwork such as a cathode "K" stays with the part
            if box is not None:
                silk += [fp.to_local(x, y) for x, y in _corners(box)]
        elif head == "pad":
            at = child.find("at")
            x, y = _xy(at)
            size = child.find("size")
            w, h = (_f(size.value(0)), _f(size.value(1))) if size is not None else (0.0, 0.0)
            angle = (_f(at.value(2)) if at is not None else 0.0) - rot
            if round(angle) % 180 == 90:
                w, h = h, w
            elif round(angle) % 90:
                w = h = math.hypot(w, h)
            copper += [(x - w / 2, y - h / 2), (x + w / 2, y + h / 2)]
            pads.append((x, y, _net_name_of(child)))
    box = _bounds(court)
    cu = _bounds(copper)
    if box is None:
        box = _union(_bounds(fab), (cu[0] - 0.25, cu[1] - 0.25, cu[2] + 0.25, cu[3] + 0.25) if cu else None) or (-0.5, -0.5, 0.5, 0.5)
    box = _union(box, _bounds(silk))
    shape = _Shape(box, pads, cu or box)
    if connector:
        _find_face(fp, shape, cu or box, edge_clearance)
    return shape


def _find_face(fp: Footprint, shape: _Shape, copper: Box, edge_clearance: float) -> None:
    """The side a connector's mating end faces: its "PCB Edge" mark, else the side where its body reaches
    clearly further beyond the pads than on any other side (right-angle headers, side-entry sockets)."""
    cx, cy = (copper[0] + copper[2]) / 2, (copper[1] + copper[3]) / 2
    for text in fp.node.lists("fp_text"):
        if not _MARK.search(text.value(1) or ""):
            continue
        tx, ty = _xy(text.find("at"))
        layer = text.child_value("layer")
        lines = []
        for g in fp.node.lists("fp_line"):
            if g.child_value("layer") != layer:
                continue
            (x0, y0), (x1, y1) = _xy(g.find("start")), _xy(g.find("end"))
            if abs(y0 - y1) < 1e-3:
                lines.append((abs(y0 - ty), "h", y0))
            elif abs(x0 - x1) < 1e-3:
                lines.append((abs(x0 - tx), "v", x0))
        if lines:
            _, kind, at = min(lines)
        else:
            node = text.find("at")
            angle = ((_f(node.value(2)) if node is not None else 0.0) - fp.at[2]) % 180
            kind, at = ("v", tx) if round(angle) == 90 else ("h", ty)
        if kind == "h":
            shape.face = "bottom" if at > cy else "top"
        else:
            shape.face = "right" if at > cx else "left"
        shape.face_at, shape.mark = _sign(shape.face) * at, True
        return
    b = shape.box
    reach = {"bottom": b[3] - copper[3], "top": copper[1] - b[1], "right": b[2] - copper[2], "left": copper[0] - b[0]}
    ranked = sorted(reach, key=reach.get, reverse=True)
    if reach[ranked[0]] >= 1.5 and reach[ranked[0]] - reach[ranked[1]] >= 1.0:
        shape.face = ranked[0]
        shape.face_at = max(_out(ranked[0], b), _out(ranked[0], copper) + edge_clearance)


def _prefix(reference: str) -> str:
    m = re.match(r"[A-Za-z_#]*", reference)
    return (m.group(0) if m else "").upper()


def _farads(value: str) -> float:
    m = re.match(r"\s*(\d+(?:[.,]\d+)?)\s*([pnuµμm]?)", value or "")
    if not m:
        return math.inf
    scale = {"p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "μ": 1e-6, "m": 1e-3, "": 1.0}[m.group(2)]
    return float(m.group(1).replace(",", ".")) * scale


def is_ground(net: str) -> bool:
    return bool(_GROUND.match(net or ""))


def is_power(net: str) -> bool:
    return bool(_POWER_NET.match(net or ""))


@dataclass
class _Part:
    fp: Footprint
    shape: _Shape
    kind: str               # connector ic crystal capacitor hole other
    hot: bool               # power part: extra room
    fixed: bool
    pintypes: dict[str, str] = field(default_factory=dict)  # net → strongest pin type of this part on it

    @property
    def ref(self) -> str:
        return self.fp.reference

    @property
    def key(self) -> str:
        return self.fp.uuid or self.fp.reference

    @property
    def nets(self) -> set[str]:
        return {n for _, _, n in self.shape.pads if n and not n.startswith("unconnected-")}

    @property
    def pad_count(self) -> int:
        return len({p.value(0) for p in self.fp.node.lists("pad") if p.value(0)})

    @property
    def area(self) -> float:
        b = self.shape.box
        return (b[2] - b[0]) * (b[3] - b[1])

    def placed(self) -> tuple[Box, list[tuple[float, float, str]]]:
        """Placement box (courtyard plus silkscreen) and pads where the part is now."""
        x, y, rot = self.fp.at
        s = self.shape.turned(rot)
        return _shift(s.box, x, y), [(px + x, py + y, n) for px, py, n in s.pads]


def _make_part(fp: Footprint, fixed: bool, edge_clearance: float = EDGE_CLEARANCE) -> _Part:
    lib = fp.lib_id.split(":", 1)[0]
    prefix = _prefix(fp.reference)
    pads = list(fp.node.lists("pad"))
    netted = {p.value(0) for p in pads if _net_name_of(p)}
    drilled = any(p.value(1) in ("np_thru_hole", "thru_hole") for p in pads)
    if lib.startswith("MountingHole") or ("board_only" in attr_flags(fp.node) and drilled and not netted):
        kind = "hole"
    elif lib.startswith(("TestPoint", "Fiducial")):
        kind = "other"
    elif (lib.startswith(("Connector", "TerminalBlock")) or prefix in ("J", "CN", "CON", "USB")
          or (prefix == "P" and not lib.startswith(("Package_", "Socket")))):  # P: old-style connectors, not IC sockets
        kind = "connector"
    elif prefix == "Y" or lib.startswith(("Crystal", "Oscillator")):
        kind = "crystal"
    elif prefix in ("U", "IC") or len(netted) >= 5:
        kind = "ic"
    elif prefix == "C" and len(netted) == 2:
        kind = "capacitor"
    else:
        kind = "other"
    shape = _local_shape(fp, kind == "connector", edge_clearance)
    pintypes: dict[str, str] = {}
    for p in pads:
        net, kind_of_pin = _net_name_of(p), p.child_value("pintype") or ""
        if net and (kind_of_pin.startswith("power") or net not in pintypes):
            pintypes[net] = kind_of_pin
    b = shape.box
    hot = ("power_out" in pintypes.values() or bool(_POWER_PACKAGE.search(fp.lib_id))
           or (prefix == "L" and (b[2] - b[0]) * (b[3] - b[1]) >= 16))
    return _Part(fp, shape, kind, hot and kind != "connector", fixed, pintypes)


# ---- nets ---------------------------------------------------------------------------------

def _net_weights(parts: list[_Part]) -> dict[str, float]:
    counts: dict[str, int] = defaultdict(int)
    for p in parts:
        for _, _, net in p.shape.pads:
            if net and not net.startswith("unconnected-"):
                counts[net] += 1
    weights = {}
    for net, n in counts.items():
        w = 1.0 if n <= 3 else 2.0 / (n - 1)
        if is_ground(net):
            w *= 0.3
        elif is_power(net):
            w *= 0.5
        weights[net] = max(w, 0.05) if n > 1 else 0.0
    return weights


@dataclass
class _Bond:
    """A strong pull between specific pads of two parts (decoupling capacitor ↔ IC power pin, crystal ↔ IC)."""

    mine: list[int]
    other: str
    theirs: list[int]
    weight: float


def _bonds(parts: list[_Part]) -> tuple[dict[str, list[_Bond]], dict[str, str]]:
    """Pad-level pulls inside one set of parts, and which part each capacitor or crystal belongs to."""
    bonds: dict[str, list[_Bond]] = defaultdict(list)
    owner: dict[str, str] = {}

    def pads_on(p: _Part, net: str) -> list[int]:
        return [i for i, (_, _, n) in enumerate(p.shape.pads) if n == net]

    def bond(a: _Part, b: _Part, net: str, weight: float) -> None:
        ia, ib = pads_on(a, net), pads_on(b, net)
        if ia and ib:
            bonds[a.key].append(_Bond(ia, b.key, ib, weight))
            bonds[b.key].append(_Bond(ib, a.key, ia, weight))

    ics = [p for p in parts if p.kind == "ic"]
    load: dict[str, int] = defaultdict(int)
    crystals = [p for p in parts if p.kind == "crystal"]
    for y in crystals:
        signals = [n for n in y.nets if not is_ground(n)]
        best = max(ics, key=lambda u: (sum(1 for n in signals if n in u.nets), u.pad_count), default=None)
        if best is not None and any(n in best.nets for n in signals):
            owner[y.key] = best.key
            for n in signals:
                bond(y, best, n, 4.0)
    caps = sorted((p for p in parts if p.kind == "capacitor"), key=lambda p: (_farads(p.fp.value), _ref_key(p.ref)))
    for c in caps:
        nets = sorted(c.nets)
        if len(nets) != 2:
            continue
        crystal = next((y for y in crystals if any(n in y.nets and not is_ground(n) for n in nets)), None)
        if crystal is not None:  # a load capacitor
            owner[c.key] = crystal.key
            for n in nets:
                if not is_ground(n):
                    bond(c, crystal, n, 3.0)
            continue
        ground = [n for n in nets if is_ground(n)]
        rail = [n for n in nets if not is_ground(n)]
        if len(ground) != 1 or len(rail) != 1:
            continue
        g, v = ground[0], rail[0]
        candidates = [u for u in ics if v in u.nets and g in u.nets]
        powered = [u for u in candidates if u.pintypes.get(v, "").startswith("power")] or candidates
        if not powered:
            continue
        # Bulk capacitors belong to the regulator driving the rail, small ones to the parts it feeds.
        drivers = [u for u in powered if u.pintypes.get(v) == "power_out"]
        if _farads(c.fp.value) >= 1e-6 and drivers:
            powered = drivers
        ic = min(powered, key=lambda u: (load[u.key], -u.pad_count, _ref_key(u.ref)))
        load[ic.key] += 1
        owner[c.key] = ic.key
        bond(c, ic, v, 4.0)
        bond(c, ic, g, 2.0)
    return bonds, owner


# ---- the packer ---------------------------------------------------------------------------

@dataclass
class _Item:
    box: Box
    pads: list[tuple[float, float, str]]
    halo: float
    side: str | None = None  # edge groups: the board edge they sit on


class _Packer:
    """Greedy placement of rigid items (parts, or whole groups) by wire length and compactness."""

    def __init__(self, gap: float, weights: dict[str, float], bonds: dict[str, list[_Bond]] | None = None,
                 compact: float = 0.6, region: Box | None = None, aspect: float | None = None):
        self.gap, self.weights, self.bonds = gap, weights, bonds or {}
        self.compact, self.region, self.aspect = compact, region, aspect
        self.limit: dict[str, float] = {}  # side → coordinate no box may cross
        self.items: dict[str, _Item] = {}
        self.net_pads: dict[str, list[tuple[float, float, str]]] = defaultdict(list)
        self.centre: tuple[float, float] = (0.0, 0.0)

    # bookkeeping
    def add(self, key: str, item: _Item) -> None:
        self.items[key] = item
        for x, y, net in item.pads:
            if net:
                self.net_pads[net].append((x, y, key))

    def remove(self, key: str) -> _Item:
        item = self.items.pop(key)
        for x, y, net in item.pads:
            if net:
                self.net_pads[net] = [t for t in self.net_pads[net] if t[2] != key]
        return item

    def bbox(self, skip: str | None = None) -> Box | None:
        out = None
        for key, item in self.items.items():
            if key != skip:
                out = _union(out, item.box)
        return out

    def free(self, box: Box, halo: float, skip: str | None = None) -> bool:
        if self.region is not None and not _inside(box, self.region):
            return False
        for side, at in self.limit.items():
            if _out(side, box) > _sign(side) * at + EPS:
                return False
        return not any(k != skip and _hits(box, it.box, self.gap + max(halo, it.halo)) for k, it in self.items.items())

    # cost
    def _size(self, box: Box | None) -> float:
        if box is None:
            return 0.0
        w, h = box[2] - box[0], box[3] - box[1]
        return max(w, h * self.aspect) * 2 if self.aspect else w + h

    def wire(self, key: str, pads: list[tuple[float, float, str]]) -> float:
        total = 0.0
        for x, y, net in pads:
            w = self.weights.get(net, 0.0)
            if not w:
                continue
            best = min((math.hypot(x - tx, y - ty) for tx, ty, k in self.net_pads.get(net, ()) if k != key), default=None)
            if best is not None:
                total += w * best
        for bond in self.bonds.get(key, ()):
            other = self.items.get(bond.other)
            if other is None:
                continue
            total += bond.weight * min(math.hypot(pads[i][0] - other.pads[j][0], pads[i][1] - other.pads[j][1])
                                       for i in bond.mine for j in bond.theirs)
        return total

    def cost(self, key: str, item: _Item, base: Box | None) -> float:
        return self.wire(key, item.pads) + self.compact * (self._size(_union(base, item.box)) - self._size(base))

    def pull(self, key: str, pads: list[tuple[float, float, str]]) -> float:
        """How strongly an unplaced item is tied to what is placed (orders the greedy growth)."""
        total = 0.0
        for _, _, net in pads:
            if any(k != key for _, _, k in self.net_pads.get(net, ())):
                total += self.weights.get(net, 0.0)
        return total + sum(b.weight for b in self.bonds.get(key, ()) if b.other in self.items)

    # search
    def _want(self, key: str, box: Box, pads: list[tuple[float, float, str]]) -> tuple[float, float]:
        """Where the item's box centre would like to be: its pads next to what they connect to."""
        sx = sy = sw = 0.0
        for x, y, net in pads:
            w = self.weights.get(net, 0.0)
            targets = [(tx, ty) for tx, ty, k in self.net_pads.get(net, ()) if k != key]
            if w and targets:
                tx = sum(t[0] for t in targets) / len(targets)
                ty = sum(t[1] for t in targets) / len(targets)
                sx, sy, sw = sx + w * (tx - x), sy + w * (ty - y), sw + w
        for bond in self.bonds.get(key, ()):
            other = self.items.get(bond.other)
            if other is None:
                continue
            tx = sum(other.pads[j][0] for j in bond.theirs) / len(bond.theirs)
            ty = sum(other.pads[j][1] for j in bond.theirs) / len(bond.theirs)
            x = sum(pads[i][0] for i in bond.mine) / len(bond.mine)
            y = sum(pads[i][1] for i in bond.mine) / len(bond.mine)
            sx, sy, sw = sx + bond.weight * (tx - x), sy + bond.weight * (ty - y), sw + bond.weight
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        if sw:
            return sx / sw + cx, sy / sw + cy
        bb = self.bbox(key)
        return ((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2) if bb else self.centre

    def _candidates(self, key: str, box: Box, halo: float, want: tuple[float, float], everywhere: bool = False):
        """Origins that put ``box`` (relative to the origin) against a placed item, or centred on ``want``."""
        w, h = box[2] - box[0], box[3] - box[1]
        out = [(_snap(want[0] - w / 2 - box[0]), _snap(want[1] - h / 2 - box[1]))]
        others = [(k, it) for k, it in self.items.items() if k != key]
        others.sort(key=lambda kv: math.hypot((kv[1].box[0] + kv[1].box[2]) / 2 - want[0], (kv[1].box[1] + kv[1].box[3]) / 2 - want[1]))
        for _, it in others if everywhere else others[:NEAR]:
            b, sep = it.box, self.gap + max(halo, it.halo)
            ys = {b[1], b[3] - h, (b[1] + b[3] - h) / 2, min(max(want[1] - h / 2, b[1] - h + 0.2), b[3] - 0.2)}
            xs = {b[0], b[2] - w, (b[0] + b[2] - w) / 2, min(max(want[0] - w / 2, b[0] - w + 0.2), b[2] - 0.2)}
            for ty in ys:
                out.append((_snap(b[2] + sep - box[0], "up"), _snap(ty - box[1])))
                out.append((_snap(b[0] - sep - w - box[0], "down"), _snap(ty - box[1])))
            for tx in xs:
                out.append((_snap(tx - box[0]), _snap(b[3] + sep - box[1], "up")))
                out.append((_snap(tx - box[0]), _snap(b[1] - sep - h - box[1], "down")))
        if self.region is not None:  # also try each candidate pushed back inside the region
            r = self.region
            out += [(_snap(min(max(x, r[0] - box[0]), r[2] - box[2]), "up"), _snap(min(max(y, r[1] - box[1]), r[3] - box[3]), "up"))
                    for x, y in out[:]]
        return list(dict.fromkeys(out))

    def best(self, key: str, variants: list[tuple[Any, Box, list[tuple[float, float, str]]]], halo: float = 0.0):
        """The cheapest free placement among ``variants`` ((tag, box, pads) relative to the item origin):
        returns (cost, x, y, tag), or None when nothing fits."""
        base = self.bbox(key)
        found = None
        for everywhere in (False, True):
            for n, (tag, box, pads) in enumerate(variants):
                want = self._want(key, box, pads)
                for x, y in self._candidates(key, box, halo, want, everywhere):
                    placed = _shift(box, x, y)
                    if not self.free(placed, halo, key):
                        continue
                    item = _Item(placed, [(px + x, py + y, net) for px, py, net in pads], halo)
                    c = self.cost(key, item, base) + 0.01 * n  # ties go to the first variant (no turn)
                    if found is None or c < found[0] - EPS:
                        found = (c, x, y, tag)
            if found is not None or not self.items:
                break
        if found is None and self.region is not None:
            found = self._scan(key, variants, halo, base)
        return found

    def _scan(self, key, variants, halo, base):
        """Last resort inside a region: every 0.5 mm grid position."""
        r = self.region
        found = None
        for n, (tag, box, pads) in enumerate(variants):
            y = r[1] - box[1]
            while y + box[3] <= r[3] + EPS:
                x = r[0] - box[0]
                while x + box[2] <= r[2] + EPS:
                    sx, sy = _snap(x, "up"), _snap(y, "up")
                    placed = _shift(box, sx, sy)
                    if self.free(placed, halo, key):
                        item = _Item(placed, [(px + sx, py + sy, net) for px, py, net in pads], halo)
                        c = self.cost(key, item, base) + 0.01 * n
                        if found is None or c < found[0]:
                            found = (c, sx, sy, tag)
                    x += 0.5
                y += 0.5
        return found


# ---- groups ---------------------------------------------------------------------------------

@dataclass
class _Group:
    title: str
    parts: list[_Part]
    edge: bool = False
    # layout relative to the group origin: part key → (x, y, rotation); edge groups face the bottom edge at y = 0
    at: dict[str, tuple[float, float, float]] = field(default_factory=dict)

    def variant(self, deg: float) -> tuple[Box, list[tuple[float, float, str]], dict[str, tuple[float, float, float]]]:
        """The laid-out group turned by ``deg`` about its origin: box, pads, part positions."""
        box = None
        pads: list[tuple[float, float, str]] = []
        at = {}
        for p in self.parts:
            x, y, rot = self.at[p.key]
            x, y = _rotate(x, y, deg)
            rot = (rot + deg) % 360
            s = p.shape.turned(rot)
            at[p.key] = (round(x, 6), round(y, 6), rot)
            box = _union(box, _shift(s.box, x, y))
            pads += [(px + x, py + y, n) for px, py, n in s.pads]
        return box or (0, 0, 0, 0), pads, at


def _halo(p: _Part) -> float:
    return POWER_HALO if p.hot else 0.0


def _facing(p: _Part, side: str) -> float:
    """The rotation that makes a connector face ``side``; one without a face lies along the edge."""
    if p.shape.face:
        return (_SIDE_ROTATION[side] - _SIDE_ROTATION[p.shape.face]) % 360
    b = p.shape.box
    along = (b[2] - b[0]) >= (b[3] - b[1])
    return (_SIDE_ROTATION[side] + (0 if along else 90)) % 360


def _layout_group(g: _Group, weights: dict[str, float], gap: float, margin: float, size: tuple[float, float] | None = None,
                  edge_clearance: float = EDGE_CLEARANCE) -> None:
    """Lay out one group around its origin. Edge groups put their connectors in a row whose edges (the
    footprints' "PCB Edge" marks) lie on y = 0, facing down, with everything else above them."""
    bonds, owner = _bonds(g.parts)
    region = None
    if size is not None:
        w, h = size
        region = (-w / 2, -h, w / 2, 0.0) if g.edge else (-w / 2, -h / 2, w / 2, h / 2)
    packer = _Packer(gap, weights, bonds, region=region)
    placed: set[str] = set()
    todo = list(g.parts)

    def put(p: _Part, x: float, y: float, rot: float) -> None:
        s = p.shape.turned(rot)
        packer.add(p.key, _Item(_shift(s.box, x, y), [(px + x, py + y, n) for px, py, n in s.pads], _halo(p)))
        g.at[p.key] = (x, y, rot)
        placed.add(p.key)
        todo.remove(p)

    first: list[_Part] = []
    if g.edge:
        row = sorted((p for p in g.parts if p.kind == "connector"), key=lambda p: (-p.pad_count, _ref_key(p.ref)))
        shapes = [(p, _facing(p, "bottom")) for p in row]
        width = sum(p.shape.turned(r).box[2] - p.shape.turned(r).box[0] for p, r in shapes) + gap * (len(shapes) - 1)
        x = -width / 2
        for p, rot in shapes:
            s = p.shape.turned(rot)
            edge_at = s.edge_line("bottom", edge_clearance)
            ox = _snap(x - s.box[0], "up")
            put(p, ox, _snap(-edge_at, "down"), rot)
            x = ox + s.box[2] + gap + _halo(p)
            first.append(p)
        packer.limit = {"bottom": -margin}
    else:
        anchor = max(g.parts, key=lambda p: (p.kind == "ic", p.kind == "connector", p.pad_count, p.area, -_ref_key(p.ref)[1]))
        s = anchor.shape
        put(anchor, _snap(-(s.box[0] + s.box[2]) / 2), _snap(-(s.box[1] + s.box[3]) / 2), 0)
        first.append(anchor)

    def priority(p: _Part):
        boss = owner.get(p.key)
        bonded = boss is not None and boss in placed
        return (bonded, -_farads(p.fp.value) if bonded else 0.0, packer.pull(p.key, p.shape.pads), p.pad_count,
                -_ref_key(p.ref)[1])

    def variants(p: _Part):
        return [(rot, s.box, s.pads) for rot in (0, 90, 180, 270) for s in [p.shape.turned(rot)]]

    while todo:
        p = max(todo, key=priority)
        found = packer.best(p.key, variants(p), _halo(p))
        if found is None:
            raise PcbError(f"{g.title}: {p.ref} does not fit" + (f" in {_mm(size[0])} × {_mm(size[1])} mm" if size else ""))
        _, x, y, rot = found
        put(p, x, y, rot)
    # Second thoughts: every part re-placed once all the others are known.
    for _ in range(2):
        moved = False
        for p in g.parts:
            if p in first:
                continue
            old = packer.remove(p.key)
            base = packer.bbox()
            here = packer.cost(p.key, old, base)
            found = packer.best(p.key, variants(p), _halo(p))
            if found is not None and found[0] < here - 1e-3:
                _, x, y, rot = found
                s = p.shape.turned(rot)
                packer.add(p.key, _Item(_shift(s.box, x, y), [(px + x, py + y, n) for px, py, n in s.pads], _halo(p)))
                g.at[p.key] = (x, y, rot)
                moved = True
            else:
                packer.add(p.key, old)
        if not moved:
            break


def _schematic_blocks(board: Board) -> list[dict[str, Any]]:
    """Functional blocks of the schematic paired with the board (same name, same directory), sub-sheets too."""
    from .schematic import Schematic

    root = os.path.splitext(board.path)[0] + ".kicad_sch"
    if not os.path.isfile(root):
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    todo = [root]
    while todo:
        path = todo.pop(0)
        if path in seen or not os.path.isfile(path):
            continue
        seen.add(path)
        try:
            sch = Schematic(path)
            out += [{"title": b["title"], "references": b["references"]} for b in sch.blocks() if b["references"]]
            todo += [os.path.join(os.path.dirname(path), s["file"]) for s in sch.summary(include_components=False).get("sheets", [])]
        except Exception:  # noqa: BLE001 — an unreadable schematic just means no blocks
            continue
    return out


def _cluster(parts: list[_Part], weights: dict[str, float]) -> list[tuple[str, list[_Part]]]:
    """No blocks: every IC and connector gathers the parts wired to it (decoupling and crystals to their IC)."""
    seeds = sorted((p for p in parts if p.kind in ("ic", "connector")), key=lambda p: (-p.pad_count, _ref_key(p.ref)))
    if not seeds:
        return [("parts", parts)] if parts else []
    _, owner = _bonds(parts)
    by_key = {p.key: p for p in parts}
    home: dict[str, str] = {s.key: s.key for s in seeds}
    for p in parts:
        boss = owner.get(p.key)
        while boss is not None and boss not in home and boss in owner:
            boss = owner[boss]
        if boss in home:
            home[p.key] = home[boss]

    def strength(p: _Part, members: set[str], floor: float) -> float:
        total = 0.0
        for net in p.nets:
            if is_ground(net) or weights.get(net, 0) < floor:
                continue
            total += weights[net] * sum(1 for q in parts if q.key in members and q.key != p.key and net in q.nets)
        return total

    # Signal nets first (a pull-up joins the part it pulls up, not the rail), then any net but ground.
    for floor in (0.25, 0.0):
        for _ in range(len(parts)):
            clusters: dict[str, set[str]] = defaultdict(set)
            for k, s in home.items():
                clusters[s].add(k)
            changed = False
            for p in parts:
                if p.key in home:
                    continue
                scores = {s: strength(p, members, floor) for s, members in clusters.items()}
                best = max(scores, key=lambda s: (scores[s], -_ref_key(by_key[s].ref)[1]), default=None)
                if best is not None and scores[best] > 0:
                    home[p.key] = best
                    changed = True
            if not changed:
                break
    groups: dict[str, list[_Part]] = defaultdict(list)
    for p in parts:
        groups[home.get(p.key, "")].append(p)
    out = []
    for s, members in groups.items():
        title = f"{by_key[s].ref} ({by_key[s].fp.value})" if s else "other parts"
        out.append((title, members))
    return out


def _groups(board: Board, parts: list[_Part], weights: dict[str, float], given: list | None) -> list[_Group]:
    """Blocks given by the caller, else the schematic's blocks, else its sheets, else connectivity. ``parts``
    are the movable ones; locked or unlisted footprints named by a block stay where they are."""
    by_ref = {p.ref: p for p in parts}
    taken: set[str] = set()
    out: list[_Group] = []
    if given is not None:
        if not isinstance(given, list) or not all(isinstance(g, dict) and isinstance(g.get("references"), list) for g in given):
            raise PcbError("groups must be [{title, references:[...]}, ...]")
        blocks = given
    else:
        blocks = _schematic_blocks(board)
    for i, b in enumerate(blocks):
        members = [by_ref[r] for r in b["references"] if r in by_ref and r not in taken]
        if given is not None:
            on_board = {fp.reference for fp in board.footprints()}
            unknown = [r for r in b["references"] if r not in on_board]
            if unknown:
                raise PcbError(f"group {b.get('title') or i + 1}: no footprint {', '.join(unknown)} on the board")
        if members:
            taken.update(p.ref for p in members)
            out.append(_Group(str(b.get("title") or f"group {i + 1}"), members))
    rest = [p for p in parts if p.ref not in taken]
    if rest:
        sheets: dict[str, list[_Part]] = defaultdict(list)
        for p in rest:
            sheets[p.fp.node.child_value("sheetname") or p.fp._field_text("Sheetname") or "/"].append(p)
        if len(sheets) > 1:
            for name, members in sorted(sheets.items()):
                for title, cluster in _cluster(members, weights) if len(members) > 12 else [(name, members)]:
                    out.append(_Group(title if title != name else f"sheet {name}", cluster))
        else:
            out += [_Group(title, members) for title, members in _cluster(rest, weights)]
    seen: dict[str, int] = defaultdict(int)
    for g in out:
        g.edge = any(p.kind == "connector" for p in g.parts)
        seen[g.title] += 1
        if seen[g.title] > 1:  # titles are the groups' keys: a block title repeated in another sheet gets a number
            g.title = f"{g.title} ({seen[g.title]})"
    return out


# ---- the board ---------------------------------------------------------------------------

@dataclass
class _Plan:
    """Where every group goes: (group, rotation, x, y, side)."""

    spots: list[tuple[_Group, float, float, float, str | None]] = field(default_factory=list)
    edges: dict[str, float] = field(default_factory=dict)  # side → outward coordinate of the board edge


def _order(groups: list[_Group], packer: _Packer, variants, degree: dict[str, float]) -> _Group:
    """The next group to place: the one most tied to what is placed, then the most connected one overall."""
    return max(groups, key=lambda g: (packer.pull(g.title, variants[g.title][1]), degree[g.title], len(g.parts), -groups.index(g)))


def _degree(groups: list[_Group], weights: dict[str, float]) -> dict[str, float]:
    """How strongly each group is wired to the others."""
    nets_of = {g.title: {n for p in g.parts for n in p.nets} for g in groups}
    return {g.title: sum(weights.get(n, 0.0) for n in nets_of[g.title] if any(n in nets_of[o.title] for o in groups if o is not g))
            for g in groups}


def _edge_spot(packer: _Packer, g: _Group, side: str, plan: _Plan, margin: float, fixed_edge: float | None):
    """Best spot for an edge group on ``side``: its connectors' edge on the board edge, sliding along it.
    Returns (cost, x, y, rotation, edge, item) or None."""
    rot = _SIDE_ROTATION[side]
    box, pads, _ = g.variant(rot)
    axis, sign, along = _axis(side), _sign(side), 1 - _axis(side)
    low, high = ("left", "right") if along == 0 else ("top", "bottom")
    same = [it for it in packer.items.values() if it.side == side]
    others = [it for it in packer.items.values() if it.side != side]
    span = box[along + 2] - box[along]
    if packer.region is not None:
        lo_b, hi_b = packer.region[along], packer.region[along + 2]
    else:
        inner = None
        for it in others:
            inner = _union(inner, it.box)
        # Along the edge the group may reach past the parts (the board grows), not past an edge already fixed.
        lo_b = inner[along] - span if inner else -span
        hi_b = inner[along + 2] + span if inner else span
        if low in plan.edges:
            lo_b = max(lo_b, -plan.edges[low] + margin)
        if high in plan.edges:
            hi_b = min(hi_b, plan.edges[high] - margin)
    lo, hi = lo_b - box[along], hi_b - box[along + 2]
    if lo > hi + EPS:
        if packer.region is not None:
            return None
        lo = hi = (lo + hi) / 2
    want = packer._want(g.title, box, pads)
    ts = {lo, hi, (lo + hi) / 2, min(max(want[along] - (box[along] + box[along + 2]) / 2, lo), hi)}
    step = max(0.5, (hi - lo) / 80)
    t = lo
    while t < hi:
        ts.add(t)
        t += step
    base = packer.bbox()
    found = None
    for t in sorted(ts):
        t = _snap(t, "up" if t <= lo + EPS else "down" if t >= hi - EPS else "round")
        a0, a1 = box[along] + t, box[along + 2] + t
        if any(it.box[along] < a1 + packer.gap and a0 < it.box[along + 2] + packer.gap for it in same):
            continue  # side by side with the groups already on this edge, never in front of them
        if fixed_edge is not None:
            edge = fixed_edge
        else:
            # Past every part by the margin, behind the parts in its way by the gap, and level with this
            # edge's other groups (pushed out later if this one needs more room).
            need = [plan.edges.get(side, -math.inf)]
            need += [_out(side, it.box) + margin for it in others]
            need += [_out(side, it.box) + packer.gap + it.halo - _in(side, box) for it in others
                     if it.box[along] < a1 + packer.gap and a0 < it.box[along + 2] + packer.gap]
            edge = max(need)
            edge = _snap(edge if edge > -math.inf else 0.0, "up")
        origin = [0.0, 0.0]
        origin[axis] = sign * edge
        origin[along] = t
        placed = _shift(box, origin[0], origin[1])
        if packer.region is not None:
            body = list(placed)  # the connectors' overhang beyond the edge may leave the region, the rest may not
            i = {"bottom": 3, "right": 2, "top": 1, "left": 0}[side]
            body[i] = packer.region[i]
            if not _inside(tuple(body), packer.region):
                continue
        if any(_hits(placed, it.box, packer.gap + it.halo) for it in packer.items.values()):
            continue
        item = _Item(placed, [(x + origin[0], y + origin[1], n) for x, y, n in pads], 0.0, side)
        c = packer.cost(g.title, item, base) if packer.region is None else packer.wire(g.title, item.pads)
        if found is None or c < found[0] - EPS:
            found = (c, origin[0], origin[1], rot, edge, item)
    return found


def _layout_board(groups: list[_Group], fixed: list[_Part], weights: dict[str, float], gap: float, margin: float,
                  region: Box | None = None, aspect: float | None = None, compact: float = 0.6) -> _Plan:
    """Place the laid-out groups: the inner groups grow from the most connected one; groups holding a
    connector go on the edge that suits their connections best. With ``region`` (a fixed outline) the edges are
    the region's and the groups on them are placed first."""
    inner = (region[0] + margin, region[1] + margin, region[2] - margin, region[3] - margin) if region else None
    packer = _Packer(gap, weights, region=inner, aspect=aspect, compact=compact)
    if region is not None:
        packer.centre = ((region[0] + region[2]) / 2, (region[1] + region[3]) / 2)
    for p in fixed:
        box, pads = p.placed()
        packer.add(p.key, _Item(box, pads, 0.0))
    variants = {g.title: g.variant(0) for g in groups}
    plan = _Plan()
    core = [g for g in groups if not g.edge]
    edge = [g for g in groups if g.edge]

    def place_core(g: _Group) -> None:
        options = [(rot, *g.variant(rot)[:2]) for rot in (0, 90, 180, 270)]
        if not packer.items:
            rot, box, pads = options[0]
            cx, cy = packer.centre
            x, y = _snap(cx - (box[0] + box[2]) / 2), _snap(cy - (box[1] + box[3]) / 2)
        else:
            found = packer.best(g.title, options)
            if found is None:
                raise PcbError(f"block {g.title} does not fit on the board" + (" inside the outline" if region else ""))
            _, x, y, rot = found
            box, pads = g.variant(rot)[:2]
        packer.add(g.title, _Item(_shift(box, x, y), [(px + x, py + y, n) for px, py, n in pads], 0.0))
        plan.spots.append((g, rot, x, y, None))

    def place_edge(g: _Group) -> None:
        best = None
        for side in SIDES:
            fixed_edge = None
            if region is not None:
                fixed_edge = _out(side, region)
            found = _edge_spot(packer, g, side, plan, margin, fixed_edge)
            if found is not None and (best is None or found[0] < best[0] - EPS):
                best = (*found, side)
        if best is None:
            if region is None:
                raise PcbError(f"block {g.title} found no place on the board edge")
            g.edge = False  # no room on any edge of a fixed outline: place it inside
            place_core(g)
            return
        _, x, y, rot, at, item, side = best
        packer.add(g.title, item)
        plan.edges[side] = max(plan.edges.get(side, -math.inf), at)
        plan.spots.append((g, rot, x, y, side))

    degree = _degree(groups, weights)
    order = ([edge, core] if region is not None else [core, edge])
    for batch, place in zip(order, (place_edge, place_core) if region is not None else (place_core, place_edge)):
        todo = list(batch)
        while todo:
            g = _order(todo, packer, variants, degree)
            todo.remove(g)
            place(g)
    # Second thoughts: every inner group re-placed once the edges and the other groups are known (and kept
    # inside the edges the connector groups have claimed).
    packer.limit = {side: _sign(side) * (at - margin) for side, at in plan.edges.items()}
    for i, (g, rot, x, y, side) in enumerate(plan.spots):
        if side is not None or len(plan.spots) < 3:
            continue
        old = packer.remove(g.title)
        here = packer.cost(g.title, old, packer.bbox())
        found = packer.best(g.title, [(r, *g.variant(r)[:2]) for r in (0, 90, 180, 270)])
        if found is not None and found[0] < here - 1e-3:
            _, x, y, rot = found
            box, pads = g.variant(rot)[:2]
            packer.add(g.title, _Item(_shift(box, x, y), [(px + x, py + y, n) for px, py, n in pads], 0.0))
            plan.spots[i] = (g, rot, x, y, None)
        else:
            packer.add(g.title, old)
    return plan


def _parts_at(plan: _Plan) -> dict[str, tuple[float, float, float]]:
    out = {}
    for g, rot, x, y, _ in plan.spots:
        for key, (px, py, prot) in g.variant(rot)[2].items():
            out[key] = (round(px + x, 4), round(py + y, 4), prot % 360)
    return out


def _boxes(parts: list[_Part], at: dict[str, tuple[float, float, float]]) -> dict[str, Box]:
    out = {}
    for p in parts:
        x, y, rot = at.get(p.key, p.fp.at)
        out[p.key] = _shift(p.shape.turned(rot).box, x, y)
    return out


def _fit_outline(plan: _Plan, parts: list[_Part], at: dict[str, tuple[float, float, float]], margin: float) -> Box:
    """The board edges around the placed parts: an edge group's side runs along its connectors' edge marks,
    every other side ``margin`` past the outermost part. Edge groups are moved out onto their final edge."""
    boxes = _boxes(parts, at)
    side_of = {}
    for g, _, _, _, side in plan.spots:
        for p in g.parts:
            side_of[p.key] = side
    edges = {}
    for side in SIDES:
        reach = [_out(side, b) + margin for k, b in boxes.items() if side_of.get(k) != side]
        edges[side] = _snap(max([plan.edges.get(side, -math.inf)] + reach), "up")
    _push_edges(plan, at, edges)
    return -edges["left"], -edges["top"], edges["right"], edges["bottom"]


def _push_edges(plan: _Plan, at: dict[str, tuple[float, float, float]], edges: dict[str, float]) -> None:
    for i, (g, rot, x, y, side) in enumerate(plan.spots):
        if side is None:
            continue
        current = _sign(side) * (y if _axis(side) else x)
        delta = edges[side] - current
        if abs(delta) < EPS:
            continue
        dx, dy = (0.0, _sign(side) * delta) if _axis(side) else (_sign(side) * delta, 0.0)
        plan.spots[i] = (g, rot, round(x + dx, 4), round(y + dy, 4), side)
        for p in g.parts:
            px, py, prot = at[p.key]
            at[p.key] = (round(px + dx, 4), round(py + dy, 4), prot)
    for side in plan.edges:
        plan.edges[side] = edges[side]


def _place_holes(holes: list[_Part], parts: list[_Part], at: dict[str, tuple[float, float, float]], outline: Box,
                 plan: _Plan, gap: float, margin: float) -> Box:
    """Unlocked mounting holes go to the corners; the outline grows until every corner is free."""
    x0, y0, x1, y1 = outline
    boxes = list(_boxes(parts, at).values())
    for _ in range(200):
        spots = []
        clash = None
        for p, (cx, cy) in zip(holes, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            b = p.shape.box
            hx = x0 + margin - b[0] if cx == 0 else x1 - margin - b[2]
            hy = y0 + margin - b[1] if cy == 0 else y1 - margin - b[3]
            hx, hy = _snap(hx, "up" if cx == 0 else "down"), _snap(hy, "up" if cy == 0 else "down")
            spots.append((p, hx, hy))
            if clash is None and any(_hits(_shift(b, hx, hy), o, gap) for o in boxes):
                clash = (cx, cy)
        if clash is None:
            for p, hx, hy in spots:
                at[p.key] = (hx, hy, 0.0)
            return x0, y0, x1, y1
        cx, cy = clash
        if cx == 0:
            x0 -= 0.5
        else:
            x1 += 0.5
        if cy == 0:
            y0 -= 0.5
        else:
            y1 += 0.5
        _push_edges(plan, at, {"left": -x0, "top": -y0, "right": x1, "bottom": y1})
        boxes = list(_boxes(parts, at).values())
    raise PcbError("could not find free corners for the mounting holes")


# ---- reference designators ---------------------------------------------------------------

def _text_box(fp: Footprint, field) -> Box | None:
    if field is None or field.find("layer") is None or "SilkS" not in (field.child_value("layer") or ""):
        return None
    if field.find("hide") is not None and (field.child_value("hide") or "yes") == "yes":
        return None
    effects = field.find("effects")
    if effects is not None and (effects.find("hide") is not None or any(a.value == "hide" for a in effects.atoms())):
        return None
    if any(a.value == "hide" for a in field.atoms()):
        return None
    text = field.value(1)  # (property "Reference" "R1" …) and KiCad 7's (fp_text reference "R1" …)
    font = effects.find("font") if effects is not None else None
    size = font.find("size") if font is not None else None
    h = _f(size.value(0), 1.0) if size is not None else 1.0
    w_char = _f(size.value(1), h) if size is not None else h
    thick = _f(font.child_value("thickness"), 0.15 * h) if font is not None else 0.15 * h
    width = max(len(text or ""), 1) * w_char * 0.9 + thick
    height = h + thick
    at = field.find("at")
    lx, ly = _xy(at)
    angle = _f(at.value(2)) if at is not None else 0.0
    cx, cy = fp.to_board(lx, ly)
    if round(angle) % 180 == 90:
        width, height = height, width
    justify = effects.find("justify") if effects is not None else None
    marks = [a.value for a in justify.atoms()] if justify is not None else []
    dx = width / 2 if "left" in marks else -width / 2 if "right" in marks else 0.0
    dy = height / 2 if "top" in marks else -height / 2 if "bottom" in marks else 0.0
    if round(angle) % 180 == 90:
        dx, dy = dy, dx
    return cx + dx - width / 2, cy + dy - height / 2, cx + dx + width / 2, cy + dy + height / 2


def _pad_boxes(fp: Footprint) -> list[Box]:
    """Board-coordinate boxes of a footprint's pads (pad angles in the file are absolute)."""
    out = []
    for pad in fp.node.lists("pad"):
        at, size = pad.find("at"), pad.find("size")
        if size is None:
            continue
        x, y = fp.to_board(*_xy(at))
        w, h = _f(size.value(0)), _f(size.value(1))
        angle = round(_f(at.value(2)) if at is not None else 0.0) % 180
        if angle == 90:
            w, h = h, w
        elif angle:
            w = h = math.hypot(w, h)
        out.append((x - w / 2, y - h / 2, x + w / 2, y + h / 2))
    return out


def _silk_segments(fp: Footprint) -> list[tuple[float, float, float, float, float]]:
    """A footprint's silkscreen drawings as board-coordinate segments (x0, y0, x1, y1, half stroke width)."""
    out = []
    for child in fp.node.lists():
        head = child.head or ""
        if not head.startswith("fp_") or head in ("fp_text", "fp_text_box") or child.child_value("layer") not in ("F.SilkS", "B.SilkS"):
            continue
        stroke = child.find("stroke")
        half = _f(stroke.child_value("width") if stroke is not None else child.child_value("width"), 0.12) / 2
        pts = [fp.to_board(x, y) for x, y in _shape_points(child)]
        if head in ("fp_rect", "fp_poly", "fp_circle") and len(pts) > 2:
            pts.append(pts[0])
        out += [(a[0], a[1], b[0], b[1], half) for a, b in zip(pts, pts[1:])]
    return out


def _segment_hits(seg: tuple[float, float, float, float, float], box: Box, clearance: float) -> bool:
    """Does a stroked segment come within ``clearance`` of ``box``? (Liang–Barsky clip on the grown box.)"""
    x0, y0, x1, y1, half = seg
    g = half + clearance
    bx0, by0, bx1, by1 = box[0] - g, box[1] - g, box[2] + g, box[3] + g
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for p, q in ((-dx, x0 - bx0), (dx, bx1 - x0), (-dy, y0 - by0), (dy, by1 - y0)):
        if abs(p) < 1e-12:
            if q < 0:
                return False
            continue
        r = q / p
        if p < 0:
            t0 = max(t0, r)
        else:
            t1 = min(t1, r)
        if t0 > t1:
            return False
    return True


def _tidy_texts(board: Board, refs: set[str], outline: Box | None) -> list[str]:
    """Move the reference designators (and values shown on silkscreen) of ``refs`` that cover a pad or other
    silkscreen, or leave the board, to a free spot next to their part (horizontal when possible)."""
    fps = board.footprints()
    pads = [b for fp in fps for b in _pad_boxes(fp)]
    silk = [seg for fp in fps for seg in _silk_segments(fp)]
    courts = {fp.reference: fp.courtyard() for fp in fps}
    texts = {(fp.reference, name): _text_box(fp, fp.field(name)) for fp in fps for name in ("Reference", "Value")}
    artwork = [b for fp in fps for t in (*fp.node.lists("fp_text"), *fp.node.lists("property"))
               if t.value(0) not in _MOVABLE_TEXT for b in [_text_box(fp, t)] if b is not None]
    inner = (outline[0] + 0.25, outline[1] + 0.25, outline[2] - 0.25, outline[3] - 0.25) if outline else None
    moved = []

    def bad(key: tuple[str, str], box: Box, level: int) -> bool:
        """0: off pads and the board edge; 1: also off other silkscreen; 2: also off other parts."""
        if inner is not None and not _inside(box, inner):
            return True
        if any(_hits(box, pb, 0.15) for pb in pads):
            return True
        if level >= 1 and (any(_segment_hits(seg, box, 0.1) for seg in silk) or any(_hits(box, t, 0.15) for t in artwork)
                           or any(k != key and t is not None and _hits(box, t, 0.15) for k, t in texts.items())):
            return True
        return level >= 2 and any(k != key[0] and c is not None and _hits(box, c, 0.0) for k, c in courts.items())

    for fp, name in sorted(((fp, name) for fp in fps for name in ("Reference", "Value")), key=lambda t: (_ref_key(t[0].reference), t[1])):
        ref, key = fp.reference, (fp.reference, name)
        box = texts.get(key)
        if ref not in refs or box is None or not bad(key, box, 1):
            continue
        w, h = box[2] - box[0], box[3] - box[1]
        court = courts.get(ref) or box
        cx, cy = (court[0] + court[2]) / 2, (court[1] + court[3]) / 2
        options = []
        for horizontal in (True, False):
            tw, th = (max(w, h), min(w, h)) if horizontal else (min(w, h), max(w, h))
            for d in (0.15, 0.6, 1.2, 2.0):
                for f in (0.5, 0.0, 1.0):  # centred on the side, then flush with either end
                    ax = court[0] + tw / 2 + f * (court[2] - court[0] - tw)
                    ay = court[1] + th / 2 + f * (court[3] - court[1] - th)
                    options += [(ax, court[1] - th / 2 - d, horizontal, tw, th), (ax, court[3] + th / 2 + d, horizontal, tw, th),
                                (court[0] - tw / 2 - d, ay, horizontal, tw, th), (court[2] + tw / 2 + d, ay, horizontal, tw, th)]
            options.append((cx, cy, horizontal, tw, th))  # on the part's body (big parts have room between their pads)
        ox, oy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        options.sort(key=lambda o: (not o[2], math.hypot(o[0] - ox, o[1] - oy)))
        choice = None
        for level in (2, 1, 0):
            for x, y, horizontal, tw, th in options:
                cand = (x - tw / 2, y - th / 2, x + tw / 2, y + th / 2)
                if not bad(key, cand, level):
                    choice = (x, y, horizontal, cand)
                    break
            if choice or not bad(key, box, 0):
                break  # a text already off pads only moves to a spot that is clean
        if choice is None:
            continue
        x, y, horizontal, cand = choice
        _set_text(fp.field(name), fp, round(x, 4), round(y, 4), 0.0 if horizontal else 90.0)
        texts[key] = cand
        moved.append(ref if name == "Reference" else f"{ref} (value)")
    return moved


def _set_text(field, fp: Footprint, x: float, y: float, angle: float) -> None:
    """Centre a footprint text at board (x, y) with absolute angle ``angle``."""
    at = field.find("at")
    lx, ly = fp.to_local(x, y)
    _set_at(at, round(lx, 6), round(ly, 6), angle)
    effects = field.find("effects")
    justify = effects.find("justify") if effects is not None else None
    if justify is not None:
        keep = [a for a in justify.atoms() if a.value == "mirror"]
        if keep:
            for a in [a for a in justify.atoms() if a.value != "mirror"]:
                justify.remove(a)
        else:
            effects.remove(justify)


# ---- checks and metric -------------------------------------------------------------------

def ratsnest_length(board: Board) -> dict[str, Any]:
    """Every net's minimum spanning tree over its pad centres (straight lines, what KiCad's ratsnest draws
    before routing), summed in mm: the placement metric. Pads without a net and ``unconnected-…`` nets are
    left out."""
    nets: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for fp in board.footprints():
        for pad in fp.pads():
            net = pad["net"]
            if net and not net.startswith("unconnected-"):
                nets[net].append(tuple(pad["at"]))
    per_net = {}
    for net, pts in nets.items():
        if len(pts) < 2:
            continue
        dist = [math.inf] * len(pts)
        done = [False] * len(pts)
        dist[0] = 0.0
        total = 0.0
        for _ in pts:
            i = min((j for j in range(len(pts)) if not done[j]), key=lambda j: dist[j])
            done[i] = True
            total += dist[i]
            for j in range(len(pts)):
                if not done[j]:
                    dist[j] = min(dist[j], math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]))
        per_net[net] = round(total, 3)
    return {"total": round(sum(per_net.values()), 2), "nets": per_net}


def _edge_overhang(fp: Footprint, outline: Box) -> tuple[str, float] | None:
    """A connector whose edge mark lies on the outline: (side, how far the courtyard may pass the edge)."""
    part = _make_part(fp, fp.locked)
    if part.kind != "connector" or not part.shape.face:
        return None
    x, y, rot = fp.at
    s = part.shape.turned(rot)
    line = s.face_at + _sign(s.face) * (y if _axis(s.face) else x)
    edge = _out(s.face, outline)
    if abs(line - edge) > 0.05:
        return None
    return s.face, max(0.0, _out(s.face, _shift(s.box, x, y)) - edge)


def check_placement(board: Board) -> dict[str, Any]:
    """What KiCad's DRC does not say about a placement: footprints (courtyards) outside the outline, and the
    courtyard overlaps and reference designators over pads it reports, from the same geometry the placer uses.
    A connector whose "PCB Edge" mark lies on the outline may overhang that edge (``overhang``)."""
    fps = board.footprints()
    courts = {fp.reference: (fp.courtyard() or _bounds(p for b in _pad_boxes(fp) for p in _corners(b)), fp.side) for fp in fps}
    overlaps = []
    refs = sorted(courts, key=_ref_key)
    for i, a in enumerate(refs):
        for b in refs[i + 1:]:
            (ba, sa), (bb, sb) = courts[a], courts[b]
            if ba and bb and sa == sb and _hits(ba, bb):
                overlaps.append([a, b])
    out: dict[str, Any] = {"courtyard_overlaps": overlaps, "outside_outline": [], "overhang": {}, "reference_over_pads": []}
    info = board.outline()
    if info is not None:
        poly = board.outline_polygon()
        box = tuple(info["bbox"])
        rect = info.get("shape") == "rectangle"
        for fp in fps:
            court = courts[fp.reference][0]
            if court is None:
                continue
            allowed = _edge_overhang(fp, box) if rect else None  # type: ignore[arg-type]
            check = list(court)
            if allowed:
                side, by = allowed
                if by > 1e-3:
                    out["overhang"][fp.reference] = {"side": side, "mm": round(by, 3)}
                i = {"bottom": 3, "right": 2, "top": 1, "left": 0}[side]
                check[i] = box[i]
            inside = _inside(tuple(check), box) if rect else all(_point_in_polygon(x, y, poly) for x, y in _corners(tuple(check)))
            if not inside:
                out["outside_outline"].append(fp.reference)
    pads = [(fp.reference, b) for fp in fps for b in _pad_boxes(fp)]
    for fp in fps:
        t = _text_box(fp, fp.field("Reference"))
        if t is not None and any(_hits(t, b, 0.0) for _, b in pads):
            out["reference_over_pads"].append(fp.reference)
    out["ratsnest_mm"] = ratsnest_length(board)["total"]
    return out


# ---- operations ---------------------------------------------------------------------------

def _outline_mode(board: Board, outline: str | None) -> str:
    items = board.outline_items()
    placeholder = len(items) == 1 and (items[0].child_value("uuid") or "") == _PLACEHOLDER
    if outline is None:
        return "fit" if not items or placeholder else "keep"
    if outline not in ("fit", "keep"):
        raise PcbError("outline must be 'fit' (size the board to the parts) or 'keep' (place inside the current outline)")
    if outline == "keep" and not items:
        raise PcbError("outline 'keep' needs an outline on Edge.Cuts; use 'fit' or set_board_outline first")
    return outline


def _edge_clearance(board: Board) -> float:
    value = board.design_rules().get("min_copper_edge_clearance")
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0 else EDGE_CLEARANCE


def _number(value: Any, name: str, minimum: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value < minimum:
        raise PcbError(f"{name} must be a number ≥ {_mm(minimum)} (mm)")
    return float(value)


def auto_place(board: Board, groups: list | None = None, references: list | None = None, outline: str | None = None,
               gap: float = GAP, group_gap: float = GROUP_GAP, margin: float = MARGIN) -> dict[str, Any]:
    """Lay out the board from the schematic's functional blocks (``groups`` overrides them).

    ``references`` limits the placement to those footprints (new ones staged by kicad_update_pcb, say);
    every other footprint stays where it is. ``outline``: ``fit`` sizes a rectangle to the parts (the default
    when the board has no outline or only kicad_update_pcb's placeholder), ``keep`` places inside the current
    one (the default otherwise). Locked footprints never move."""
    gap, group_gap, margin = _number(gap, "gap"), _number(group_gap, "group_gap"), _number(margin, "margin")
    mode = _outline_mode(board, outline)
    if references is not None and (not isinstance(references, list) or not all(isinstance(r, str) for r in references)):
        raise PcbError("references must be a list of footprint references")
    fps = board.footprints()
    wanted = set(references) if references is not None else None
    if wanted is not None:
        known = {fp.reference for fp in fps}
        missing = sorted(wanted - known, key=_ref_key)
        if missing:
            raise PcbError(f"no footprint {', '.join(missing)} on the board")
    clearance = _edge_clearance(board)
    parts = []
    for fp in fps:
        movable = not fp.locked and (wanted is None or fp.reference in wanted)
        parts.append(_make_part(fp, not movable, clearance))
    weights = _net_weights(parts)
    before = ratsnest_length(board)["total"]
    holes = sorted((p for p in parts if p.kind == "hole" and not p.fixed), key=lambda p: _ref_key(p.ref))
    if mode == "keep" or wanted is not None:
        for p in holes:  # inside a kept outline the holes stay where they are
            p.fixed = True
        holes = []
    holes = holes[:4]  # to the corners of the fitted outline; any more are packed like the other parts
    movable = [p for p in parts if not p.fixed and p not in holes]
    fixed = [p for p in parts if p.fixed]
    if not movable:
        raise PcbError("nothing to place: every footprint is locked" + (" or not listed" if wanted is not None else ""))
    group_list = _groups(board, movable, weights, groups)
    for g in group_list:
        _layout_group(g, weights, gap, margin, edge_clearance=clearance)
    region: Box | None = None
    if mode == "keep":
        info = board.outline()
        region = tuple(info["bbox"])  # type: ignore[assignment]
    notes: list[str] = []
    plan = None
    at: dict[str, tuple[float, float, float]] = {}
    if region is not None and not fixed:
        plan, at, needed = _fit_into(board, group_list, movable, weights, region, gap, group_gap, margin, clearance, notes)
    if plan is None:
        try:
            plan = _layout_board(group_list, fixed, weights, group_gap, margin, region=region)
        except PcbError as exc:
            if region is None or fixed:
                raise
            raise PcbError(f"the parts do not fit inside the {_mm(region[2] - region[0])} × {_mm(region[3] - region[1])} mm "
                           f"outline: laid out they need about {_mm(needed[0])} × {_mm(needed[1])} mm ({exc}); enlarge it "
                           f"with set_board_outline, or use outline: 'fit'") from exc
        at = _parts_at(plan)
    new_outline: Box | None = None
    if mode == "fit":
        new_outline = _fit_outline(plan, movable + fixed, at, margin)
        if holes:
            new_outline = _place_holes(holes, movable + fixed, at, new_outline, plan, gap, margin)
        if not fixed:  # put the board's top-left corner where the old outline's was (or at 100, 100)
            old = board.outline()
            ox, oy = (old["bbox"][0], old["bbox"][1]) if old else (100.0, 100.0)
            dx, dy = _snap(ox - new_outline[0]), _snap(oy - new_outline[1])
            at = {k: (round(x + dx, 4), round(y + dy, 4), r) for k, (x, y, r) in at.items()}
            new_outline = _shift(new_outline, dx, dy)
    for p in movable + holes:
        x, y, rot = at[p.key]
        board._place(p.fp, x, y, rot)
    if new_outline is not None:
        x0, y0, x1, y1 = new_outline
        board.set_board_outline(width=round(x1 - x0, 4), height=round(y1 - y0, 4), x=x0, y=y0)
    final_outline = new_outline or (tuple(board.outline()["bbox"]) if board.outline() else None)
    mark = len(board.changes)
    tidied = _tidy_texts(board, {p.ref for p in movable + holes}, final_outline)
    del board.changes[mark:]
    sides = {}
    summary = []
    for g, _, _, _, side in plan.spots:
        box = None
        for p in g.parts:
            box = _union(box, p.placed()[0])
        entry: dict[str, Any] = {"title": g.title, "references": sorted((p.ref for p in g.parts), key=_ref_key),
                                 "box": [round(v, 2) for v in box] if box else None}
        if side:
            entry["edge"] = side
            for p in g.parts:
                if p.kind == "connector":
                    sides[p.ref] = side
        summary.append(entry)
    board.changes.append(f"auto_place: {len(movable) + len(holes)} footprint(s) in {len(group_list)} group(s): "
                         + "; ".join(f"{e['title']} ({', '.join(e['references'])})" + (f" on the {e['edge']} edge" if e.get("edge") else "")
                                     for e in summary))
    if holes:
        board.changes.append(f"mounting holes {', '.join(p.ref for p in holes)} in the corners")
    if tidied:
        board.changes.append(f"moved the silkscreen text of {', '.join(tidied)} off pads and other silkscreen")
    checks = check_placement(board)
    after = checks.pop("ratsnest_mm")
    if checks["outside_outline"]:
        notes.append(f"outside the outline: {', '.join(checks['outside_outline'])}")
    result: dict[str, Any] = {
        "placed": len(movable) + len(holes), "groups": summary, "edge_connectors": sides,
        "outline": {"mode": mode, "bbox": [round(v, 3) for v in final_outline] if final_outline else None},
        "ratsnest_mm": {"before": before, "after": after}, "checks": checks,
    }
    if notes:
        result["notes"] = notes
    return result


def _fit_into(board: Board, groups: list[_Group], movable: list[_Part], weights: dict[str, float], region: Box, gap: float,
              group_gap: float, margin: float, clearance: float, notes: list[str]):
    """Lay out freely for the outline's shape and keep the result when it fits, centred, with the connector groups
    moved out onto the outline's edges; tighter (more compaction, then smaller gaps) until it does. Returns
    (plan or None, part positions, the smallest size seen)."""
    aspect = (region[2] - region[0]) / max(region[3] - region[1], 1e-6)
    needed = (math.inf, math.inf)
    for scale in (1.0, 0.6, 0.35):
        if scale != 1.0:
            for g in groups:
                g.at.clear()
                _layout_group(g, weights, gap * scale, margin, edge_clearance=clearance)
        for compact in (0.6, 2.0):
            plan = _layout_board(groups, [], weights, group_gap * scale, margin, aspect=aspect, compact=compact)
            at = _parts_at(plan)
            size = _fit_outline(plan, movable, at, margin)
            w, h = size[2] - size[0], size[3] - size[1]
            if w * h < needed[0] * needed[1]:
                needed = (w, h)
            if w > region[2] - region[0] + EPS or h > region[3] - region[1] + EPS:
                continue
            dx = _snap((region[0] + region[2]) / 2 - (size[0] + size[2]) / 2)
            dy = _snap((region[1] + region[3]) / 2 - (size[1] + size[3]) / 2)
            plan.spots = [(g, rot, x + dx, y + dy, side) for g, rot, x, y, side in plan.spots]
            plan.edges = {s: v + _sign(s) * (dy if _axis(s) else dx) for s, v in plan.edges.items()}
            at = {k: (round(x + dx, 4), round(y + dy, 4), r) for k, (x, y, r) in at.items()}
            _push_edges(plan, at, {"left": -region[0], "top": -region[1], "right": region[2], "bottom": region[3]})
            if not _fits_polygon(board, movable, at):
                continue
            if scale != 1.0:
                notes.append(f"gaps reduced to {_mm(gap * scale)} mm between parts and {_mm(group_gap * scale)} mm between "
                             f"blocks to fit the outline")
            return plan, at, needed
    for g in groups:  # back to the requested gaps for the fallback
        g.at.clear()
        _layout_group(g, weights, gap, margin, edge_clearance=clearance)
    return None, {}, needed


def _fits_polygon(board: Board, parts: list[_Part], at: dict[str, tuple[float, float, float]]) -> bool:
    items = board.outline_items()
    if len(items) == 1 and items[0].head == "gr_rect":
        return True
    poly = board.outline_polygon()
    return all(_point_in_polygon(x, y, poly) for b in _boxes(parts, at).values() for x, y in _corners(b))


def place_block(board: Board, x: float, y: float, title: str | None = None, references: list | None = None,
                width: float | None = None, height: float | None = None, face: str | None = None,
                gap: float = GAP, margin: float = MARGIN) -> dict[str, Any]:
    """Lay out one functional block (by schematic title, or ``references``) with its box's top-left corner at
    (x, y), or inside the rectangle x, y, width, height. A block holding a connector faces ``face`` (default:
    the nearest outline side) and sits against that side of the rectangle."""
    x, y = _number(x, "x", -1e6), _number(y, "y", -1e6)
    gap, margin = _number(gap, "gap"), _number(margin, "margin")
    if (width is None) != (height is None):
        raise PcbError("give both width and height, or neither")
    size = (_number(width, "width", 0.1), _number(height, "height", 0.1)) if width is not None else None
    if face is not None and face not in SIDES:
        raise PcbError(f"face must be one of {', '.join(SIDES)}")
    if references is None:
        if not title:
            raise PcbError("place_block needs a block title (from the schematic) or references")
        blocks = _schematic_blocks(board)
        block = next((b for b in blocks if b["title"] == title), None)
        if block is None:
            names = ", ".join(repr(b["title"]) for b in blocks) or "none (draw them with add_block in the schematic, or pass references)"
            raise PcbError(f"no block titled {title!r} in {os.path.basename(os.path.splitext(board.path)[0])}.kicad_sch; blocks: {names}")
        references = block["references"]
    if not isinstance(references, list) or not references or not all(isinstance(r, str) for r in references):
        raise PcbError("references must be a non-empty list of footprint references")
    fps = {fp.reference: fp for fp in board.footprints()}
    missing = [r for r in references if r not in fps]
    if missing:
        raise PcbError(f"no footprint {', '.join(missing)} on the board")
    locked = [r for r in references if fps[r].locked]
    if locked:
        raise PcbError(f"locked footprints cannot move: {', '.join(locked)} (unlock them first)")
    members = set(references)
    clearance = _edge_clearance(board)
    parts = [_make_part(fp, ref not in members, clearance) for ref, fp in fps.items()]
    weights = _net_weights(parts)
    mine = [p for p in parts if not p.fixed]
    g = _Group(title or ", ".join(references), mine, any(p.kind == "connector" for p in mine))
    rect = (x, y, x + size[0], y + size[1]) if size else None
    info = board.outline()
    if g.edge and face is None:
        if info is not None:
            ob = info["bbox"]
            target = rect or (x, y, x, y)
            gaps = {"left": target[0] - ob[0], "top": target[1] - ob[1], "right": ob[2] - target[2], "bottom": ob[3] - target[3]}
            face = min(SIDES, key=lambda s: gaps[s])
        else:
            face = "bottom"
    if not g.edge:
        face = None
    _layout_group(g, weights, gap, margin, edge_clearance=clearance)
    others = _Packer(gap, weights)
    for p in parts:
        if p.fixed:
            box, pads = p.placed()
            others.add(p.key, _Item(box, pads, 0.0))
    rotations = [_SIDE_ROTATION[face]] if face else [0, 90, 180, 270]

    def spot(rot: float) -> tuple[float, float] | None:
        box = g.variant(rot)[0]
        bw, bh = box[2] - box[0], box[3] - box[1]
        if rect is None:
            return _snap(x - box[0]), _snap(y - box[1])
        if bw > size[0] + EPS or bh > size[1] + EPS:
            return None
        ox = rect[0] + (size[0] - bw) / 2 - box[0]
        oy = rect[1] + (size[1] - bh) / 2 - box[1]
        if face == "bottom":
            oy = rect[3]
        elif face == "top":
            oy = rect[1]
        elif face == "right":
            ox = rect[2]
        elif face == "left":
            ox = rect[0]
        return _snap(ox), _snap(oy)

    need = g.variant(rotations[0])[0]
    choice = None
    for attempt in range(2):
        for rot in rotations:
            where = spot(rot)
            if where is None:
                continue
            box, pads, _ = g.variant(rot)
            c = others.wire(g.title, [(px + where[0], py + where[1], n) for px, py, n in pads])
            if choice is None or c < choice[0] - EPS:
                choice = (c, rot, *where)
        if choice is not None or size is None or attempt:
            break
        # Too big as laid out: lay it out again inside the rectangle (turned for the face when there is one).
        w, h = size if not face or _axis(face) else (size[1], size[0])
        g.at.clear()
        try:
            _layout_group(g, weights, gap, margin, size=(w, h), edge_clearance=clearance)
        except PcbError:
            break
    if choice is None:
        raise PcbError(f"block {g.title} does not fit in {_mm(size[0])} × {_mm(size[1])} mm "  # type: ignore[index]
                       f"(laid out it needs about {_mm(need[2] - need[0])} × {_mm(need[3] - need[1])} mm)")
    _, rot, ox, oy = choice
    for key, (px, py, prot) in g.variant(rot)[2].items():
        p = next(q for q in mine if q.key == key)
        board._place(p.fp, round(px + ox, 4), round(py + oy, 4), prot)
    outline_box = tuple(info["bbox"]) if info else None
    mark = len(board.changes)
    tidied = _tidy_texts(board, set(references), outline_box)
    del board.changes[mark:]
    box = None
    for p in mine:
        box = _union(box, p.placed()[0])
    clashes = sorted({q.ref for p in mine for q in parts
                      if q.fixed and p.fp.side == q.fp.side and _hits(p.placed()[0], q.placed()[0])}, key=_ref_key)
    board.changes.append(f"placed block {g.title} ({', '.join(sorted(references, key=_ref_key))}) in "
                         f"({_mm(box[0])}, {_mm(box[1])})–({_mm(box[2])}, {_mm(box[3])})" + (f", connectors facing {face}" if face else ""))
    if tidied:
        board.changes.append(f"moved the silkscreen text of {', '.join(tidied)} off pads and other silkscreen")
    result: dict[str, Any] = {"block": g.title, "references": sorted(references, key=_ref_key),
                              "box": [round(v, 2) for v in box], "rotation": rot}
    if face:
        result["face"] = face
    if clashes:
        result["overlaps"] = clashes
    return result


OPERATIONS = {
    "auto_place": auto_place,
    "place_block": place_block,
}


def apply(board: Board, op: dict[str, Any]) -> Any:
    """Apply one placement operation dict (``{"op": "auto_place", ...}``) to ``board``."""
    name = op.get("op")
    handler = OPERATIONS.get(name or "")
    if handler is None:
        raise PcbError(f"unknown placement operation '{name}'; known: {', '.join(sorted(OPERATIONS))}")
    args = {k: v for k, v in op.items() if k != "op"}
    try:
        return handler(board, **args)
    except TypeError as exc:
        raise PcbError(f"bad arguments for {name}: {exc}") from exc
