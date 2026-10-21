"""Orthogonal wire routing on the 1.27 mm grid, for ``connect_pins``.

KiCad joins a wire only at its ends: a pin or a wire end lying on the middle of another
wire stays unconnected (a T needs a junction), a label anywhere on a wire joins it, and
wires that cross do not connect. So the router keeps out of symbol bodies, treats other
pins, labels, junctions, no-connect flags and wire ends as walls, crosses other nets'
wires only at a right angle, and may start or end on wiring already attached to either
pin (adding the junction KiCad needs there). Costs keep it short with few corners and
away from text, block frames and the space in front of unused pins.
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass, field

from . import geometry
from .sexpr import SList

__all__ = ["Route", "RouteError", "route", "stub_site"]

G = geometry.GRID
DIRS = ((1, 0), (0, 1), (-1, 0), (0, -1))  # right, down, left, up (Y grows downward)
BEND = 6        # a corner costs as much as 6 grid steps of extra wire
CROSS = 3       # crossing another net's wire
TAP = 3         # starting or ending on existing wiring (a junction) instead of the pin itself
NEAR = 1        # hugging a symbol body
LANE = 4        # the 2.54 mm in front of an unwired pin, kept free for that pin's own wire
TEXT = 5        # through field, label or note text
FRAME = 12      # across (or along) a block frame
CLEARANCE = 0.3  # mm kept around body graphics
MARGIN = 16     # cells searched around the pins before falling back to the whole page

Cell = tuple[int, int]


class RouteError(ValueError):
    pass


@dataclass
class Route:
    points: list[tuple[float, float]] = field(default_factory=list)  # corners, pin to pin
    junctions: list[tuple[float, float]] = field(default_factory=list)  # to add at the ends
    joined: list[tuple[float, float]] = field(default_factory=list)  # ends on existing wiring
    connected: bool = False  # the pins were already wired together


def _cell(x: float, y: float) -> Cell | None:
    i, j = round(x / G), round(y / G)
    return (i, j) if abs(i * G - x) < 0.01 and abs(j * G - y) < 0.01 else None


def _mm(c: Cell) -> tuple[float, float]:
    return (round(c[0] * G, 4), round(c[1] * G, 4))


def _box_cells(x0: float, y0: float, x1: float, y1: float) -> list[Cell]:
    i0, i1 = math.ceil(min(x0, x1) / G - 1e-6), math.floor(max(x0, x1) / G + 1e-6)
    j0, j1 = math.ceil(min(y0, y1) / G - 1e-6), math.floor(max(y0, y1) / G + 1e-6)
    return [(i, j) for i in range(i0, i1 + 1) for j in range(j0, j1 + 1)]


def _f(value: str | None) -> float:
    try:
        return float(value) if value is not None else 0.0
    except ValueError:
        return 0.0


def _hidden(node: SList) -> bool:
    if node.find("hide") is not None and node.child_value("hide") in (None, "yes"):
        return True
    eff = node.find("effects")
    if eff is None:
        return False
    hide = eff.find("hide")
    return (hide is not None and hide.value(0) in (None, "yes")) or any(a.value == "hide" for a in eff.atoms())


def _font_size(node: SList) -> float:
    eff = node.find("effects")
    font = eff.find("font") if eff is not None else None
    size = font.find("size") if font is not None else None
    return _f(size.value(0)) if size is not None else 1.27


def _text_box(x: float, y: float, text: str, size: float, vertical: bool) -> tuple[float, float, float, float]:
    """Rough extent of a text centred on (x, y), generous on both sides of a justified anchor."""
    half = max(len(text), 1) * size * 0.45 + 0.3
    if vertical:
        return x - size / 2, y - half, x + size / 2, y + half
    return x - half, y - size / 2, x + half, y + size / 2


class _Board:
    """Obstacles and costs of one schematic, in grid cells."""

    def __init__(self, sch, ends: list[Cell]):
        self.body: set[Cell] = set()
        self.walls: set[Cell] = set()
        self.soft: dict[Cell, int] = {}
        self.exits: dict[Cell, set[int]] = {}  # directions taken by wires at a cell
        self.mid: dict[Cell, int] = {}  # crossing point on another wire: 0 horizontal, 1 vertical wire
        self.pins: dict[Cell, list[int]] = {}  # pin connection point → outward directions
        self.hulls: list[tuple[float, float, float, float]] = []
        self.pin_hull: dict[Cell, int] = {}
        self.junctions: set[Cell] = set()
        self.no_connects: set[Cell] = set()
        self.segments: list[tuple[Cell, Cell]] = []
        self.seg_at: dict[Cell, list[int]] = {}  # every cell of every segment
        self.ends_at: dict[Cell, list[int]] = {}  # segment endpoints
        self._symbols(sch, set(ends))
        self._wiring(sch)
        self._annotations(sch)

    def _add_soft(self, cells, cost: int) -> None:
        for c in cells:
            self.soft[c] = self.soft.get(c, 0) + cost

    def _symbols(self, sch, ends: set[Cell]) -> None:
        unwired: list[tuple[Cell, int]] = []
        for sym in sch.symbols():
            lib = sch.lib_symbol(sym.lib_id)
            if lib is None:
                continue
            pins = geometry.placed_pins(lib, sym.at, sym.mirror, sym.unit, sym.body_style)
            box = geometry.body_bbox(lib, sym.at, sym.mirror, sym.unit, sym.body_style)
            xs = [p["x"] for p in pins] + ([box[0] - CLEARANCE, box[2] + CLEARANCE] if box else [])
            ys = [p["y"] for p in pins] + ([box[1] - CLEARANCE, box[3] + CLEARANCE] if box else [])
            if xs:
                hull = (min(xs), min(ys), max(xs), max(ys))
                index = len(self.hulls)
                self.hulls.append(hull)
                cells = _box_cells(*hull)
                self.body.update(cells)
                ring = set(_box_cells(hull[0] - G, hull[1] - G, hull[2] + G, hull[3] + G)) - set(cells)
                self._add_soft(ring, NEAR)
            for p in pins:
                c = _cell(p["x"], p["y"])
                if c is None:
                    continue
                d = DIRS.index(tuple(p["outward"])) if tuple(p["outward"]) in DIRS else 0
                self.pins.setdefault(c, []).append(d)
                if xs:
                    self.pin_hull[c] = index
                if c not in ends:
                    unwired.append((c, d))
            for prop in sym.node.lists("property"):
                if _hidden(prop) or not prop.value(1) or prop.find("at") is None:
                    continue
                at = prop.find("at")
                vertical = int(round(sym.at[2] + _f(at.value(2)))) % 180 == 90
                self._add_soft(_box_cells(*_text_box(_f(at.value(0)), _f(at.value(1)), prop.value(1) or "", _font_size(prop), vertical)), TEXT)
        self._unwired = unwired

    def _wiring(self, sch) -> None:
        for kind in ("wire", "bus"):
            for w in sch.root.lists(kind):
                pts = [(_f(p.value(0)), _f(p.value(1))) for p in (w.find("pts") or SList()).lists("xy")]
                for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                    a, b = _cell(x0, y0), _cell(x1, y1)
                    if a is None or b is None or (a[0] != b[0] and a[1] != b[1]):
                        # Off-grid or diagonal: wall off every cell it passes near.
                        n = max(1, int(math.hypot(x1 - x0, y1 - y0) / (G / 4)))
                        for k in range(n + 1):
                            px, py = x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n
                            self.walls.update(_box_cells(px - 0.7, py - 0.7, px + 0.7, py + 0.7))
                        continue
                    if a == b:
                        continue
                    self._segment(a, b, net=kind == "wire")
        for j in sch.root.lists("junction"):
            at = j.find("at")
            c = _cell(_f(at.value(0)), _f(at.value(1))) if at is not None else None
            if c is not None:
                self.junctions.add(c)
                self.walls.add(c)
        for n in sch.root.lists("no_connect"):
            at = n.find("at")
            c = _cell(_f(at.value(0)), _f(at.value(1))) if at is not None else None
            if c is not None:
                self.no_connects.add(c)
                self.walls.add(c)

    def _segment(self, a: Cell, b: Cell, net: bool) -> None:
        horizontal = a[1] == b[1]
        axis = 0 if horizontal else 1
        step = 1 if b[axis] > a[axis] else -1
        forward = DIRS.index((step, 0) if horizontal else (0, step))
        cells = [(a[0] + k * step, a[1]) if horizontal else (a[0], a[1] + k * step) for k in range(abs(b[axis] - a[axis]) + 1)]
        index = len(self.segments)
        if net:
            self.segments.append((a, b))
        for k, c in enumerate(cells):
            taken = self.exits.setdefault(c, set())
            if k > 0:
                taken.add((forward + 2) % 4)
            if k < len(cells) - 1:
                taken.add(forward)
            if net:
                self.seg_at.setdefault(c, []).append(index)
            if k in (0, len(cells) - 1):
                self.walls.add(c)
                if net:
                    self.ends_at.setdefault(c, []).append(index)
            elif c in self.mid and self.mid[c] != (0 if horizontal else 1):
                self.walls.add(c)  # two wires already cross here
            else:
                self.mid[c] = 0 if horizontal else 1

    def _annotations(self, sch) -> None:
        for kind in ("label", "global_label", "hierarchical_label"):
            for lab in sch.root.lists(kind):
                at = lab.find("at")
                if at is None:
                    continue
                x, y, rot = _f(at.value(0)), _f(at.value(1)), int(_f(at.value(2))) % 360
                c = _cell(x, y)
                if c is not None:
                    self.walls.add(c)
                else:
                    self.walls.update(_box_cells(x - 0.7, y - 0.7, x + 0.7, y + 0.7))
                size = _font_size(lab)
                length = len(lab.value(0) or "") * size * 0.9 + (size * 2 if kind != "label" else 0.5)
                dx, dy = {0: (length, 0), 90: (0, -length), 180: (-length, 0), 270: (0, length)}.get(rot, (length, 0))
                pad = size * 0.9
                if dy == 0:
                    box = (x + min(dx, 0) + (0.5 if dx > 0 else -0.5), y - pad, x + max(dx, 0), y + (pad if kind != "label" else 0))
                else:
                    box = (x - pad, y + min(dy, 0), x + (pad if kind != "label" else 0), y + max(dy, 0) - (0.5 if dy > 0 else -0.5))
                self._add_soft(_box_cells(*box), TEXT)
        for t in sch.root.lists("text"):
            at = t.find("at")
            if at is None:
                continue
            x, y, size = _f(at.value(0)), _f(at.value(1)), _font_size(t)
            lines = (t.value(0) or "").split("\n")
            width, height = max(len(line) for line in lines) * size * 0.9, len(lines) * size * 1.6
            if int(_f(at.value(2))) % 180 == 90:
                self._add_soft(_box_cells(x - height, y - width, x, y), TEXT)
            else:
                self._add_soft(_box_cells(x, y - height, x + width, y), TEXT)
        for rect in sch.root.lists("rectangle"):
            s, e = rect.find("start"), rect.find("end")
            if s is None or e is None:
                continue
            x0, y0, x1, y1 = _f(s.value(0)), _f(s.value(1)), _f(e.value(0)), _f(e.value(1))
            for edge in ((x0, y0, x1, y0), (x0, y1, x1, y1), (x0, y0, x0, y1), (x1, y0, x1, y1)):
                self._add_soft(_box_cells(*edge), FRAME)
        for sheet in sch.root.lists("sheet"):
            at, size = sheet.find("at"), sheet.find("size")
            if at is not None and size is not None:
                x, y = _f(at.value(0)), _f(at.value(1))
                self.walls.update(_box_cells(x, y, x + _f(size.value(0)), y + _f(size.value(1))))
        # Unwired pins: keep the 2.54 mm in front of them free for their own wire.
        for c, d in self._unwired:
            if c not in self.exits and c not in self.no_connects:
                ox, oy = DIRS[d]
                self._add_soft([(c[0] + ox, c[1] + oy), (c[0] + 2 * ox, c[1] + 2 * oy)], LANE)

    def needs_junction(self, c: Cell) -> bool:
        """Whether one more wire ending at ``c`` makes three or more connections there (KiCad draws a dot)."""
        return c not in self.junctions and len(set(self.pins.get(c, []))) + len(self.exits.get(c, set())) + 1 >= 3

    def free(self, c: Cell) -> bool:
        return c not in self.body and c not in self.walls and c not in self.mid and c not in self.exits

    # ---- nets ----------------------------------------------------------------------
    def wired_net(self, pin: Cell) -> set[int]:
        """Segments connected to a pin through wire ends (and junctions on a wire's middle)."""
        found: set[int] = set()
        queue = list(self.ends_at.get(pin, []))
        while queue:
            i = queue.pop()
            if i in found:
                continue
            found.add(i)
            a, b = self.segments[i]
            for end in (a, b):
                queue += self.ends_at.get(end, [])
                if end in self.junctions:
                    queue += self.seg_at.get(end, [])
            for c in self.cells_of(i):
                if c in self.junctions:
                    queue += self.seg_at.get(c, [])
        return found

    def cells_of(self, index: int) -> list[Cell]:
        (ax, ay), (bx, by) = self.segments[index]
        if ay == by:
            return [(x, ay) for x in range(min(ax, bx), max(ax, bx) + 1)]
        return [(ax, y) for y in range(min(ay, by), max(ay, by) + 1)]


def _ends(board: _Board, pin: Cell, out: int, net: set[int]) -> list[tuple[Cell, int, bool]]:
    """Where a wire may leave (or arrive at) this end of the connection: (cell, direction, tap)."""
    found: list[tuple[Cell, int, bool]] = []
    if out not in board.exits.get(pin, set()):
        found.append((pin, out, False))
    cells = {c for i in net for c in board.cells_of(i)} - {pin}
    for c in sorted(cells):
        if c in board.no_connects:
            continue
        taken = board.exits.get(c, set())
        if c in board.pins:
            found += [(c, d, True) for d in board.pins[c] if d not in taken]
        elif c not in board.body:
            found += [(c, d, True) for d in range(4) if d not in taken]
    return found


def route(sch, a: dict, b: dict) -> Route:
    """Route a wire between two placed pins (dicts from ``Schematic.pin``)."""
    ca, cb = _cell(a["x"], a["y"]), _cell(b["x"], b["y"])
    if ca is None or cb is None:
        raise RouteError("a pin is off the 1.27 mm grid; move its symbol onto the grid first")
    if ca == cb:
        raise RouteError("both pins are at the same point")
    board = _Board(sch, [ca, cb])
    for c in (ca, cb):
        if c in board.no_connects:
            raise RouteError(f"the pin at {_mm(c)} has a no-connect flag; remove it first (disconnect_pin)")
    out_a, out_b = DIRS.index(tuple(a["outward"])), DIRS.index(tuple(b["outward"]))
    net_a, net_b = board.wired_net(ca), board.wired_net(cb)
    if net_a & net_b:
        return Route(connected=True)
    own = {c for i in net_a | net_b for c in board.cells_of(i)} | {ca, cb}
    sources = _ends(board, ca, out_a, net_a)
    goals: dict[Cell, set[int]] = {}  # goal cell → directions a wire may arrive moving in
    tap_goal: dict[Cell, bool] = {}
    for c, d, tap in _ends(board, cb, out_b, net_b):
        goals.setdefault(c, set()).add((d + 2) % 4)
        tap_goal[c] = tap
    if not sources or not goals:
        raise RouteError("a pin has no free side to leave from")

    # The lane straight out of each end pin may cross its own symbol's outline (short pins).
    lanes: set[Cell] = set()
    for c, out in ((ca, out_a), (cb, out_b)):
        hull = board.hulls[board.pin_hull[c]] if c in board.pin_hull else None
        dx, dy = DIRS[out]
        n = (c[0] + dx, c[1] + dy)
        while hull and n in board.body and n not in board.pins and \
                hull[0] - 1e-6 <= n[0] * G <= hull[2] + 1e-6 and hull[1] - 1e-6 <= n[1] * G <= hull[3] + 1e-6:
            if not any(h is not hull and h[0] - 1e-6 <= n[0] * G <= h[2] + 1e-6 and h[1] - 1e-6 <= n[1] * G <= h[3] + 1e-6
                       for h in board.hulls):
                lanes.add(n)
            n = (n[0] + dx, n[1] + dy)

    page_w, page_h = sch.page()["size"]
    span = [c for c, _, _ in sources] + list(goals)
    full = (min(0, *(c[0] for c in span)), min(0, *(c[1] for c in span)),
            max(round(page_w / G), *(c[0] for c in span)), max(round(page_h / G), *(c[1] for c in span)))
    near = (min(c[0] for c in span) - MARGIN, min(c[1] for c in span) - MARGIN,
            max(c[0] for c in span) + MARGIN, max(c[1] for c in span) + MARGIN)
    region = (max(near[0], full[0]), max(near[1], full[1]), min(near[2], full[2]), min(near[3], full[3]))
    path = _search(board, sources, goals, tap_goal, own, lanes, region)
    if path is None and region != full:
        path = _search(board, sources, goals, tap_goal, own, lanes, full)
    if path is None:
        raise RouteError("no clear path")

    corners = [path[0]]
    for prev, here, nxt in zip(path, path[1:], path[2:]):
        if (here[0] - prev[0], here[1] - prev[1]) != (nxt[0] - here[0], nxt[1] - here[1]):
            corners.append(here)
    corners.append(path[-1])
    result = Route(points=[_mm(c) for c in corners])
    for end in (path[0], path[-1]):
        if end not in (ca, cb):
            result.joined.append(_mm(end))
        if board.needs_junction(end):
            result.junctions.append(_mm(end))
    return result


def _search(board: _Board, sources, goals: dict[Cell, set[int]], tap_goal: dict[Cell, bool], own: set[Cell],
            lanes: set[Cell], region: tuple[int, int, int, int]) -> list[Cell] | None:
    gx0, gy0 = min(c[0] for c in goals), min(c[1] for c in goals)
    gx1, gy1 = max(c[0] for c in goals), max(c[1] for c in goals)

    def h(c: Cell) -> int:
        return max(gx0 - c[0], 0, c[0] - gx1) + max(gy0 - c[1], 0, c[1] - gy1)

    def enter(c: Cell, d: int) -> int | None:
        """Cost of stepping into ``c`` moving in direction ``d`` (None: not allowed)."""
        if not (region[0] <= c[0] <= region[2] and region[1] <= c[1] <= region[3]):
            return None
        if c in own or c in board.walls or (c in board.body and c not in lanes):
            return None
        cost = 1 + board.soft.get(c, 0)
        if c in board.mid:
            if board.mid[c] == d % 2:
                return None  # would run along the other wire
            cost += CROSS
        return cost

    best: dict[tuple[Cell, int], int] = {}
    parent: dict[tuple[Cell, int], tuple[Cell, int]] = {}  # direction -1: the source cell
    heap: list[tuple[int, int, int, Cell, int]] = []

    def push(n: Cell, nd: int, cost: int, came: tuple[Cell, int]) -> None:
        if cost < best.get((n, nd), 1 << 30):
            best[(n, nd)] = cost
            parent[(n, nd)] = came
            heapq.heappush(heap, (cost + h(n), len(parent), cost, n, nd))

    for c, d, tap in sources:
        n = (c[0] + DIRS[d][0], c[1] + DIRS[d][1])
        if n in goals and d in goals[n]:
            return [c, n]
        cost = enter(n, d)
        if cost is not None:
            push(n, d, cost + (TAP if tap else 0), (c, -1))
    while heap:
        _, _, g, c, d = heapq.heappop(heap)
        if g > best[(c, d)]:
            continue
        if c in goals:
            path, state = [c], parent[(c, d)]
            while state[1] != -1:
                path.append(state[0])
                state = parent[state]
            path.append(state[0])
            return path[::-1]
        straight = c in lanes or c in board.mid
        for nd in range(4):
            if nd == (d + 2) % 4 or (straight and nd != d):
                continue
            n = (c[0] + DIRS[nd][0], c[1] + DIRS[nd][1])
            turn = BEND if nd != d else 0
            if n in goals:
                if nd in goals[n]:
                    push(n, nd, g + 1 + turn + (TAP if tap_goal.get(n) else 0), (c, d))
                continue
            step = enter(n, nd)
            if step is not None:
                push(n, nd, g + step + turn, (c, d))
    return None


def stub_site(sch, pin: dict, prefer: tuple[int, int] | None = None, length: int = 2):
    """Where to hang a label or power symbol for ``pin``: the pin itself while its exit is free, otherwise
    the nearest point on the pin's wiring with ``length`` free cells in some direction (preferring
    ``prefer``). Returns ``((x, y), (dx, dy), needs_junction)``, or None when there is no such point."""
    c0 = _cell(pin["x"], pin["y"])
    out = DIRS.index(tuple(pin["outward"]))
    if c0 is None:
        return None
    board = _Board(sch, [c0])
    if out not in board.exits.get(c0, set()):
        return _mm(c0), DIRS[out], False
    net = board.wired_net(c0)
    own = {c for i in net for c in board.cells_of(i)}
    best = None
    for c in own:
        if c in board.no_connects or (c in board.body and c not in board.pins):
            continue
        taken = board.exits.get(c, set())
        for d in (board.pins[c] if c in board.pins else range(4)):
            if d in taken:
                continue
            dx, dy = DIRS[d]
            run = [(c[0] + k * dx, c[1] + k * dy) for k in range(1, length + 2)]
            if not all(board.free(n) and n not in own for n in run[:-1]):
                continue
            cost = abs(c[0] - c0[0]) + abs(c[1] - c0[1])
            cost += 4 if board.needs_junction(c) else 0
            cost += 6 if prefer is not None and DIRS[d] != tuple(prefer) else 0
            cost += sum(board.soft.get(n, 0) for n in run) + (0 if board.free(run[-1]) else 8)
            if best is None or (cost, c, d) < best[0]:
                best = ((cost, c, d), (_mm(c), DIRS[d], board.needs_junction(c)))
    return best[1] if best else None
