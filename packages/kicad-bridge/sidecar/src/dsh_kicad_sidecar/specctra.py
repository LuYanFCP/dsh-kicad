"""Specctra DSN export and SES import: the files the Freerouting autorouter reads and writes.

kicad-cli (10.0.7) has neither, and pcbnew's ``ExportSpecctraDSN`` / ``ImportSpecctraSES`` only run in KiCad's own
Python, so the sidecar writes the design and reads the session itself. KiCad's exporter (``specctra_export.cpp``) is
the reference, and ``tests/test_specctra.py`` checks the pads written here against the ones pcbnew writes.

The DSN written here:

- micrometres (``(resolution um 10)``), Y pointing up: the board point (x, y) mm is (1000·x, −1000·y);
- one image per footprint, placed front side up at 0° on the footprint's position. Pins carry their offsets on the
  board and their pads' absolute angles, and padstacks name the copper layers the pads are on, so rotated and
  back-side parts need none of Specctra's rotation and mirroring rules;
- pins named as KiCad names them, duplicate pad numbers ``2``, ``2@1``, …; holes without copper (NPTH) are keepouts;
- the closed Edge.Cuts outline is the boundary, pulled in so tracks keep KiCad's copper-to-edge clearance; cutouts and
  rule areas that forbid tracks or vias are keepouts;
- tracks and vias already on the board are fixed wiring, ``(type fix)`` when locked and ``(type protect)`` otherwise:
  the router keeps them and completes what is missing;
- nets that are not to be routed (``nets`` / ``exclude_nets``) are left out of the network. Their pads and copper stay
  on the board as obstacles without a net.

Copper zones are not exported: they are refilled after routing (``kicad-cli pcb drc --refill-zones --save-board``).
"""

from __future__ import annotations

import fnmatch
import hashlib
import math
import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from .pcb import (DEFAULT_CLASS, EDGE, Board, PcbError, _arc_points, _f, _layers_of, _net_name_of, _rotate, _shape_points,
                  _track_locked, _xy)

__all__ = ["Dsn", "Session", "SpecctraError", "import_session", "parse_ses", "write_dsn"]

# Added to every clearance handed to the router: Freerouting's integer geometry otherwise ends a track 1–2 µm inside
# KiCad's limit now and then, which KiCad's DRC reports.
CLEARANCE_MARGIN = 0.01
SMD_SMD_CLEARANCE = 0.05  # what KiCad's exporter allows between SMD pads (they are fixed; it only quiets the router)
CORNER_STEPS = 4  # polygon edges per rounded pad corner
DEFAULT_RULES = {"min_copper_edge_clearance": 0.5, "min_hole_clearance": 0.25}  # KiCad's defaults


class SpecctraError(ValueError):
    pass


# ---- writing ---------------------------------------------------------------------------

def _num(value: float) -> str:
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def _um(mm: float) -> str:
    return _num(mm * 1000)


def _pt(x: float, y: float) -> str:
    """A board point (mm, Y down) in DSN units (µm, Y up)."""
    return f"{_um(x)} {_um(-y)}"


def _q(name: str) -> str:
    """A DSN token, quoted when KiCad's exporter quotes it (``SPECCTRA_LEXER::GetQuoteChar``): empty, or holding
    white space, ``(``, ``)``, ``%``, ``{``, ``}``, or a ``-`` after the first character. DSN strings have no escapes."""
    needs = not name or any(c in "\t\r\n ()%{}" for c in name) or "-" in name[1:]
    return f'"{name}"' if needs else name


class _Names:
    """Unique DSN identifiers for board names; a name a DSN string cannot hold (a double quote) gets a stand-in."""

    def __init__(self, prefix: str):
        self.prefix = prefix
        self.used: set[str] = set()

    def add(self, name: str) -> str:
        base = name if name and '"' not in name else f"{self.prefix}{len(self.used) + 1}"
        out, n = base, 1
        while out in self.used:
            n += 1
            out = f"{base}_{n}"
        self.used.add(out)
        return out


@dataclass
class Dsn:
    """A written design plus what the import needs to map the session back onto the board."""

    text: str
    nets: dict[str, str]  # DSN net name → board net name, for the nets handed to the router
    vias: dict[str, tuple[float, float]]  # via padstack → (diameter, drill) mm
    routed: list[str]  # board nets in the network
    left_out: list[str]  # board nets kept out of the network (nets / exclude_nets)
    fixed: dict[str, int]  # existing tracks and vias written as fixed wiring
    notes: list[str] = field(default_factory=list)


def _copper_of(layers: list[str], copper: list[str]) -> list[str]:
    out: list[str] = []
    for name in layers:
        if name in ("*.Cu", "F&B.Cu"):
            out += copper if name == "*.Cu" else [l for l in ("F.Cu", "B.Cu") if l in copper]
        elif name in copper:
            out.append(name)
    return [l for l in copper if l in out]


def select_nets(board_nets: list[str], nets: Iterable[str] | None, exclude: Iterable[str] | None) -> tuple[list[str], list[str]]:
    """The board nets to route and the ones left out. Names may be glob patterns (``/LED*``); a name that matches no
    net is an error, so a typo does not silently route everything."""

    def expand(patterns: Iterable[str], what: str) -> set[str]:
        if isinstance(patterns, str):
            raise SpecctraError(f"{what} must be a list of net names")
        out: set[str] = set()
        for pattern in patterns:
            if not isinstance(pattern, str) or not pattern:
                raise SpecctraError(f"{what} must be a list of net names")
            hits = fnmatch.filter(board_nets, pattern) if any(c in pattern for c in "*?[") else [pattern] if pattern in board_nets else []
            if not hits:
                near = [n for n in board_nets if pattern.strip("/*").lower() in n.lower()][:8] or board_nets[:20]
                raise SpecctraError(f"{what}: no net '{pattern}' on this board (nets: {', '.join(near)})")
            out.update(hits)
        return out

    chosen = expand(nets, "nets") if nets is not None else set(board_nets)
    if exclude:
        chosen -= expand(exclude, "exclude_nets")
    return [n for n in board_nets if n in chosen], [n for n in board_nets if n not in chosen]


def _default_class(board: Board) -> dict[str, Any]:
    named = next((c for c in board.project().get("net_settings", {}).get("classes") or [] if c.get("name") == "Default"), {})
    return {**DEFAULT_CLASS, **named}


def _via_name(diameter: float, drill: float, first: int, last: int) -> str:
    return f"Via[{first}-{last}]_{_um(diameter)}:{_um(drill)}_um"


def write_dsn(board: Board, nets: Iterable[str] | None = None, exclude_nets: Iterable[str] | None = None,
              clearance_margin: float = CLEARANCE_MARGIN, name: str | None = None) -> Dsn:
    """The board as a Specctra design for Freerouting (see the module docstring for the conventions)."""
    copper = board.copper_layers()
    if not copper:
        raise SpecctraError("the board has no copper layers")
    layer_types = {l["name"]: l["type"] for l in board.layer_table()}
    codes = board._net_codes()
    routed, left_out = select_nets(board.nets(), nets, exclude_nets)
    net_names = _Names("net")
    dsn_net = {n: net_names.add(n) for n in routed}
    default = _default_class(board)
    rules = {**DEFAULT_RULES, **board.design_rules()}
    notes: list[str] = []

    def clearance(cls: dict[str, Any]) -> float:
        return float(cls.get("clearance") or default["clearance"]) + clearance_margin

    vias: dict[str, tuple[float, float]] = {}
    via_shapes: dict[str, str] = {}

    def via(diameter: float, drill: float, span: list[str] | None = None) -> str:
        span = span or copper
        first, last = copper.index(span[0]), copper.index(span[-1])
        key = _via_name(diameter, drill, first, last)
        if key not in via_shapes:
            vias[key] = (diameter, drill)
            shapes = "".join(f"\n      (shape (circle {l} {_um(diameter)}))" for l in copper[first:last + 1])
            via_shapes[key] = f"    (padstack {_q(key)}{shapes}\n      (attach off)\n    )"
        return key

    # Net classes of the routed nets, each with its via.
    classes: dict[str, dict[str, Any]] = {}
    for net in routed:
        cls = board.net_class_of(net)
        entry = classes.setdefault(cls.get("name") or "Default", {"values": cls, "nets": []})
        entry["nets"].append(net)
    default_via = via(float(default["via_diameter"]), float(default["via_drill"]))

    # Footprints: one image each; pads become pins, holes without copper keepouts.
    padstacks: dict[str, str] = {}
    images: list[str] = []
    places: list[str] = []
    keepouts: list[str] = []
    net_pins: dict[str, list[str]] = {n: [] for n in routed}
    refs = _Names("FP")
    hole_extra = float(rules.get("min_hole_clearance") or 0)
    for fp in board.footprints():
        x0, y0, _ = fp.at
        ref = None
        pins: list[str] = []
        seen: dict[str, int] = {}
        for pad in fp.node.lists("pad"):
            px, py = fp.to_board(*_xy(pad.find("at")))
            kind = pad.value(1) or ""
            if kind == "np_thru_hole":
                drill = pad.find("drill")
                size = max([_f(a.value) for a in drill.atoms() if a.value != "oval"] or [0.0]) if drill is not None else 0.0
                if size > 0:
                    for layer in copper:
                        keepouts.append(f'    (keepout "" (circle {layer} {_um(size + 2 * hole_extra)} {_pt(px, py)}))')
                continue
            layers = _copper_of(_layers_of(pad), copper)
            if not layers:
                continue
            stack = _padstack(pad, layers, copper, padstacks)
            number = pad.value(0) or "NC"
            k = seen.get(number, 0)
            seen[number] = k + 1
            pin_id = number if k == 0 else f"{number}@{k}"
            ref = ref or refs.add(fp.reference or "FP")
            angle = _f(pad.find("at").value(2)) % 360
            rotate = f" (rotate {_num(angle)})" if angle else ""
            pins.append(f"      (pin {_q(stack)}{rotate} {_q(pin_id)} {_um(px - x0)} {_um(-(py - y0))})")
            net = _net_name_of(pad, codes)
            if net in net_pins:
                net_pins[net].append(f"{_q(ref)}-{_q(pin_id)}")
        if ref is None:
            continue
        images.append(f"    (image {_q(ref)}\n" + "\n".join(pins) + "\n    )")
        places.append(f"    (component {_q(ref)} (place {_q(ref)} {_pt(x0, y0)} front 0))")
        for zone in fp.node.lists("zone"):
            keepouts += _rule_area(zone, copper)

    # Board outline, cutouts and rule areas.
    boundary, cutouts, outline_notes = _outline(board)
    notes += outline_notes
    edge = float(rules.get("min_copper_edge_clearance") or 0)
    inset = max(0.0, edge - clearance(default) + clearance_margin)
    if inset:
        boundary = _offset(boundary, -inset)
    for hole in cutouts:
        grown = _offset(hole, inset) if inset else hole
        for layer in copper:
            keepouts.append(f'    (keepout "" (polygon {layer} 0 {_path_points(grown, close=True)}))')
    for zone in board.root.lists("zone"):
        keepouts += _rule_area(zone, copper)
    keepouts += _copper_drawings(board, copper)

    # Existing copper: fixed wiring.
    wiring: list[str] = []
    fixed = {"tracks": 0, "vias": 0}
    for item in board.root.lists():
        if item.head not in ("segment", "arc", "via"):
            continue
        net = _net_name_of(item, codes)
        net_part = f" (net {_q(dsn_net[net])})" if net in dsn_net else ""
        kind = " (type fix)" if _track_locked(item) else " (type protect)"
        if item.head == "via":
            ends = [copper.index(l) for l in _layers_of(item) if l in copper]  # a via lists the ends of its span
            span = copper[min(ends):max(ends) + 1] if len(ends) >= 2 else copper
            name_ = via(_f(item.child_value("size")), _f(item.child_value("drill")), span)
            wiring.append(f"    (via {_q(name_)} {_pt(*_xy(item.find('at')))}{net_part}{kind})")
            fixed["vias"] += 1
            continue
        layer = item.child_value("layer")
        if layer not in copper:
            continue
        if item.head == "segment":
            points = [_xy(item.find("start")), _xy(item.find("end"))]
        else:
            points = _arc_points(_xy(item.find("start")), _xy(item.find("mid")), _xy(item.find("end")), steps=12)
        wiring.append(f"    (wire (path {layer} {_um(_f(item.child_value('width')))} {_path_points(points)}){net_part}{kind})")
        fixed["tracks"] += 1

    # Network and classes.
    network: list[str] = []
    for net in routed:
        if net_pins[net]:
            network.append(f"    (net {_q(dsn_net[net])}\n      (pins {' '.join(net_pins[net])})\n    )")
    for cls_name, entry in classes.items():
        members = [dsn_net[n] for n in entry["nets"] if net_pins[n]]
        if not members:
            continue
        values = entry["values"]
        use_via = via(float(values.get("via_diameter") or default["via_diameter"]), float(values.get("via_drill") or default["via_drill"]))
        width = float(values.get("track_width") or default["track_width"])
        network.append(f"    (class {_q('kicad_default' if cls_name == 'Default' else cls_name)} {' '.join(_q(m) for m in members)}\n"
                       f"      (circuit (use_via {_q(use_via)}))\n"
                       f"      (rule (width {_um(width)}) (clearance {_um(clearance(values))}))\n    )")

    layers_text = "\n".join(
        f"    (layer {l} (type {'power' if layer_types.get(l) == 'power' else 'signal'}) (property (index {i})))"
        for i, l in enumerate(copper))
    title = name or board.path.rsplit("/", 1)[-1]
    text = "\n".join([
        f"(pcb {_q(title)}",
        "  (parser\n    (string_quote \")\n    (space_in_quoted_tokens on)\n    (host_cad \"KiCad's Pcbnew\")\n"
        "    (host_version \"dsh-kicad\")\n  )",
        "  (resolution um 10)",
        "  (unit um)",
        "  (structure",
        layers_text,
        f"    (boundary (path pcb 0 {_path_points(boundary, close=True)}))",
        *keepouts,
        f"    (via {_q(default_via)})",
        f"    (rule (width {_um(float(default['track_width']))}) (clearance {_um(clearance(default))})"
        f" (clearance {_um(SMD_SMD_CLEARANCE)} (type smd_smd)))",
        "  )",
        "  (placement",
        *places,
        "  )",
        "  (library",
        *images,
        *padstacks.values(),
        *via_shapes.values(),
        "  )",
        "  (network",
        *network,
        "  )",
        "  (wiring",
        *wiring,
        "  )",
        ")",
        "",
    ])
    return Dsn(text=text, nets={v: k for k, v in dsn_net.items()}, vias=vias, routed=routed, left_out=left_out,
               fixed=fixed, notes=notes)


def _path_points(points: list[tuple[float, float]], close: bool = False) -> str:
    pts = list(points) + ([points[0]] if close and points and points[0] != points[-1] else [])
    return "  ".join(_pt(x, y) for x, y in pts)


def _padstack(pad: Any, layers: list[str], copper: list[str], padstacks: dict[str, str]) -> str:
    """Register the padstack of one pad (its copper shape in its own frame, unrotated) and return its name."""
    shape = pad.value(2) or "circle"
    size = pad.find("size")
    w, h = (_f(size.value(0)), _f(size.value(1))) if size is not None else (0.0, 0.0)
    drill = pad.find("drill")
    offset = drill.find("offset") if drill is not None else None
    ox, oy = _xy(offset) if offset is not None else (0.0, 0.0)
    if shape == "oval" and abs(w - h) < 1e-9:
        shape = "circle"
    if shape == "roundrect":
        r = min(w, h) * _f(pad.child_value("roundrect_rratio"), 0.25)
        if r <= 1e-9:
            shape = "rect"
    if shape == "trapezoid":
        delta = pad.find("rect_delta")
        dx, dy = _xy(delta) if delta is not None else (0.0, 0.0)
        w, h, shape = w + abs(dy), h + abs(dx), "rect"  # the bounding box: wider than the pad, never narrower
    if shape == "custom":
        custom = [(ox + x, oy + y) for x, y in _custom_polygon(pad, w, h)]
    if shape not in ("circle", "rect", "oval", "roundrect", "custom"):
        shape = "rect"
    if shape == "circle":
        desc, geometry = f"Round_{_um(w)}", lambda l: f"(circle {l} {_um(w)}{'' if not (ox or oy) else ' ' + _pt(ox, oy)})"
    elif shape == "rect":
        desc, geometry = f"Rect_{_um(w)}x{_um(h)}", lambda l: f"(rect {l} {_pt(ox - w / 2, oy + h / 2)} {_pt(ox + w / 2, oy - h / 2)})"
    elif shape == "oval":
        half = (max(w, h) - min(w, h)) / 2
        a, b = ((ox - half, oy), (ox + half, oy)) if w > h else ((ox, oy - half), (ox, oy + half))
        desc, geometry = f"Oval_{_um(w)}x{_um(h)}", lambda l: f"(path {l} {_um(min(w, h))} {_pt(*a)} {_pt(*b)})"
    elif shape == "roundrect":
        poly = _roundrect(w, h, r, ox, oy)
        desc, geometry = f"RoundRect_{_um(w)}x{_um(h)}_{_um(r)}", lambda l: f"(polygon {l} 0 {_path_points(poly, close=True)})"
    else:
        outline = _path_points(custom, close=True)
        desc = f"Custom_{hashlib.sha1(outline.encode()).hexdigest()[:10]}"
        geometry = lambda l: f"(polygon {l} 0 {outline})"  # noqa: E731
        ox = oy = 0.0  # the outline already includes the offset
    # Named like KiCad's padstacks: [T]op, [B]ottom or [A]ll layers.
    side = "A" if layers == copper and len(layers) > 1 else "T" if layers == ["F.Cu"] else "B" if layers == ["B.Cu"] else "+".join(layers)
    name = f"{desc}[{side}]Pad" + (f"_off_{_um(ox)}_{_um(oy)}" if ox or oy else "")
    body = "".join(f"\n      (shape {geometry(l)})" for l in layers)
    padstacks[name] = f"    (padstack {_q(name)}{body}\n      (attach off)\n    )"
    return name


def _roundrect(w: float, h: float, r: float, ox: float, oy: float) -> list[tuple[float, float]]:
    """A rounded rectangle as a polygon around it: corner points sit on a slightly larger radius, so the polygon
    covers the true pad (KiCad's exporter does the same)."""
    r = min(r, w / 2, h / 2)
    grow = r / math.cos(math.pi / (4 * CORNER_STEPS))
    centres = [(w / 2 - r, h / 2 - r, 0), (-(w / 2 - r), h / 2 - r, 90), (-(w / 2 - r), -(h / 2 - r), 180), (w / 2 - r, -(h / 2 - r), 270)]
    points = []
    for cx, cy, start in centres:
        for i in range(CORNER_STEPS + 1):
            a = math.radians(start + 90 * i / CORNER_STEPS)
            rr = grow if 0 < i < CORNER_STEPS else r
            points.append((ox + cx + rr * math.cos(a), oy + cy + rr * math.sin(a)))
    return points


def _custom_polygon(pad: Any, w: float, h: float) -> list[tuple[float, float]]:
    """The copper of a custom pad as one polygon in the pad's frame: the primitive polygon that holds the anchor and
    every other primitive when there is one (the usual case, and exact), otherwise the convex hull of everything
    (larger than the pad, never smaller)."""
    anchor = (_circle_points(0, 0, max(w, h) / 2) if (pad.find("options") is not None
                                                      and pad.find("options").child_value("anchor") == "circle")
              else [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)])
    shapes: list[list[tuple[float, float]]] = [anchor]
    primitives = pad.find("primitives")
    for prim in primitives.lists() if primitives is not None else []:
        points = _shape_points(prim)
        width = _f(prim.child_value("width"))
        filled = prim.child_value("fill") in ("yes", "solid")
        if prim.head in ("gr_line", "gr_arc", "gr_curve") or (not filled and prim.head != "gr_poly"):
            points = _hull([q for a, b in zip(points, points[1:]) for q in _segment_box(a, b, max(width, 0.001))])
        elif width > 0:
            points = _offset(points, width / 2)
        if len(points) >= 3:
            shapes.append(points)
    for candidate in sorted(shapes[1:], key=lambda poly: -abs(_area(poly))):
        if all(_inside(q, candidate) for other in shapes if other is not candidate for q in other):
            return candidate
    return _hull([q for poly in shapes for q in poly])


def _circle_points(cx: float, cy: float, r: float, steps: int = 16) -> list[tuple[float, float]]:
    grow = r / math.cos(math.pi / steps)  # the polygon goes around the circle
    return [(cx + grow * math.cos(2 * math.pi * i / steps), cy + grow * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def _segment_box(a: tuple[float, float], b: tuple[float, float], width: float) -> list[tuple[float, float]]:
    """The rectangle a stroke of ``width`` from a to b covers (square ends, so it covers KiCad's round ones)."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    length = math.hypot(dx, dy)
    ux, uy = (dx / length, dy / length) if length > 1e-9 else (1.0, 0.0)
    hw = width / 2
    nx, ny = -uy * hw, ux * hw
    a2, b2 = (a[0] - ux * hw, a[1] - uy * hw), (b[0] + ux * hw, b[1] + uy * hw)
    return [(a2[0] + nx, a2[1] + ny), (b2[0] + nx, b2[1] + ny), (b2[0] - nx, b2[1] - ny), (a2[0] - nx, a2[1] - ny)]


def _hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    pts = sorted(set((round(x, 6), round(y, 6)) for x, y in points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[float, float]] = []
    upper: list[tuple[float, float]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def _inside(point: tuple[float, float], poly: list[tuple[float, float]], tol: float = 1e-6) -> bool:
    """Point in polygon (even-odd), points on the edge count as inside."""
    x, y = point
    inside = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if abs((x2 - x1) * (y - y1) - (y2 - y1) * (x - x1)) <= tol * max(1.0, math.hypot(x2 - x1, y2 - y1)) \
                and min(x1, x2) - tol <= x <= max(x1, x2) + tol and min(y1, y2) - tol <= y <= max(y1, y2) + tol:
            return True
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            inside = not inside
    return inside


TEXTS = ("gr_text", "gr_text_box", "fp_text", "fp_text_box", "property")
# KiCad's stroke font: advance per character in character widths, spacing included (measured with pcbnew 10).
_ADVANCE = {ch: adv for adv, chars in (
    (0.381, "`"), (0.476, "!',.:;Iij"), (0.524, "l"), (0.571, "^ft"), (0.619, "r"), (0.667, "()[]\\{}"), (0.714, "~"),
    (0.762, ' "*J_Tvy'), (0.81, "Lksxz"), (0.857, "?AFVYce"), (0.905, "Eabdghnopqu"), (0.952, "$0123456789SXZ|"),
    (1.0, "#BCDGKPR"), (1.048, "/HNOQUw"), (1.143, "%MW"), (1.238, "&+-<=>"), (1.286, "@"), (1.333, "m")) for ch in chars}
SHAPES = ("line", "arc", "rect", "circle", "poly", "curve")


def _copper_drawings(board: Board, copper: list[str]) -> list[str]:
    """Texts and graphics on copper layers (board drawings and footprint items) as keepouts: the router must not run
    a track through a copper logo or label (KiCad's exporter leaves them out, and its DRC then reports shorts)."""
    out: list[str] = []

    def emit(polys: list[list[tuple[float, float]]], layers: list[str]) -> None:
        out.extend(f'    (keepout "" (polygon {layer} 0 {_path_points(poly, close=True)}))' for poly in polys for layer in layers)

    def take(node: Any, fp: Any) -> None:
        layers = _copper_of(_layers_of(node), copper)
        if not layers:
            return
        if node.head in TEXTS:
            if not _hidden(node):
                box = _text_box(node, fp)
                if box:
                    emit([box], layers)
            return
        points = _shape_points(node)
        if fp is not None:
            points = [fp.to_board(x, y) for x, y in points]
        if not points:
            return
        stroke = node.find("stroke")
        width = _f(stroke.child_value("width") if stroke is not None else node.child_value("width"))
        closed = node.head[3:] in ("rect", "circle", "poly")
        if closed and node.child_value("fill") in ("yes", "solid") and len(points) >= 3:
            emit([points], layers)
        ends = list(zip(points, points[1:] + ([points[0]] if closed else [])))
        emit([_segment_box(a, b, max(width, 0.01)) for a, b in ends], layers)

    for item in board.root.lists():
        if item.head in TEXTS or (item.head or "")[3:] in SHAPES and (item.head or "").startswith("gr_"):
            take(item, None)
    for fp in board.footprints():
        for child in fp.node.lists():
            head = child.head or ""
            if head in TEXTS or (head.startswith("fp_") and head[3:] in SHAPES):
                take(child, fp)
    return out


def _hidden(node: Any) -> bool:
    for holder in (node, node.find("effects")):
        if holder is None:
            continue
        flag = holder.find("hide")
        if (flag is not None and (flag.value(0) or "yes") == "yes") or any(a.value == "hide" for a in holder.atoms()):
            return True
    return False


def _text_box(node: Any, fp: Any) -> list[tuple[float, float]] | None:
    """A box around a text, as KiCad's own bounding box (stroke-font advances, a line with descenders) plus a few
    percent. The router keeps its clearance from it."""
    if node.head in ("gr_text_box", "fp_text_box"):
        pts = node.find("pts")
        points = [_xy(p) for p in pts.lists("xy")] if pts is not None else [_xy(node.find("start")), _xy(node.find("end"))]
        if fp is not None:
            points = [fp.to_board(x, y) for x, y in points]
        xs, ys = [p[0] for p in points], [p[1] for p in points]
        return [(min(xs), min(ys)), (max(xs), min(ys)), (max(xs), max(ys)), (min(xs), max(ys))]
    text = (node.value(0) if node.head == "gr_text" else node.value(1)) or ""
    at = node.find("at")
    if not text or at is None:
        return None
    x, y = _xy(at)
    if fp is not None:
        x, y = fp.to_board(x, y)
    effects = node.find("effects")
    font = effects.find("font") if effects is not None else None
    size = font.find("size") if font is not None else None
    h, w = (_f(size.value(0), 1.0), _f(size.value(1), 1.0)) if size is not None else (1.0, 1.0)  # (size height width)
    thickness = _f(font.child_value("thickness") if font is not None else None, h * 0.15)
    lines = text.split("\\n") if "\\n" in text else text.split("\n")
    width = max(sum(_ADVANCE.get(c, 1.0) for c in line) for line in lines) * w * 1.03 + thickness
    height = (len(lines) - 1) * h * 1.62 + h * 1.6 + thickness
    justify = [a.value for a in effects.find("justify").atoms()] if effects is not None and effects.find("justify") is not None else []
    x0, x1 = (0.0, width) if "left" in justify else (-width, 0.0) if "right" in justify else (-width / 2, width / 2)
    if "mirror" in justify:
        x0, x1 = -x1, -x0
    y0, y1 = (0.0, height) if "top" in justify else (-height, 0.0) if "bottom" in justify else (-height / 2, height / 2)
    angle = _f(at.value(2))
    return [(x + dx, y + dy) for dx, dy in (_rotate(cx, cy, angle) for cx, cy in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)))]


def _rule_area(zone: Any, copper: list[str]) -> list[str]:
    keepout = zone.find("keepout")
    if keepout is None:
        return []
    tracks = keepout.child_value("tracks") == "not_allowed"
    vias = keepout.child_value("vias") == "not_allowed"
    if not (tracks or vias):
        return []
    polygon = zone.find("polygon")
    pts = polygon.find("pts") if polygon is not None else None
    points = [_xy(p) for p in pts.lists("xy")] if pts is not None else []
    if len(points) < 3:
        return []
    kind = "keepout" if tracks and vias else "wire_keepout" if tracks else "via_keepout"
    return [f'    ({kind} "" (polygon {layer} 0 {_path_points(points, close=True)}))'
            for layer in _copper_of(_layers_of(zone), copper)]


def _outline(board: Board) -> tuple[list[tuple[float, float]], list[list[tuple[float, float]]], list[str]]:
    """The board boundary and its cutouts from Edge.Cuts (board drawings and footprint graphics)."""
    pieces: list[tuple[bool, list[tuple[float, float]]]] = []

    def take(node: Any, fp: Any = None) -> None:
        head = (node.head or "")[3:]
        if head == "arc":
            points = _arc_points(_xy(node.find("start")), _xy(node.find("mid")), _xy(node.find("end")))
        else:
            points = _shape_points(node)
        if not points:
            return
        if fp is not None:
            points = [fp.to_board(x, y) for x, y in points]
        closed = head in ("rect", "circle", "poly")
        pieces.append((closed, points + [points[0]] if closed and not _near(points[0], points[-1]) else points))

    for item in board.outline_items():
        take(item)
    for fp in board.footprints():
        for child in fp.node.lists():
            if (child.head or "").startswith("fp_") and child.child_value("layer") == EDGE:
                take(child, fp)
    if not pieces:
        raise SpecctraError("the board has no outline on Edge.Cuts; add one (kicad_edit_pcb set_board_outline) before routing")
    loops = [p for closed, p in pieces if closed]
    loops += _chain([p for closed, p in pieces if not closed])
    notes: list[str] = []
    closed = [l for l in loops if len(l) >= 3 and _near(l[0], l[-1])]
    if not closed:
        try:
            box = board.outline_polygon()
        except PcbError as exc:
            raise SpecctraError(str(exc)) from exc
        notes.append("the Edge.Cuts outline is not closed; routing inside its bounding box")
        return box, [], notes
    closed = [l[:-1] if _near(l[0], l[-1]) and len(l) > 3 else l for l in closed]
    outer = max(closed, key=lambda l: abs(_area(l)))
    if len(closed) < len(loops):
        notes.append("part of the Edge.Cuts outline is not closed and was ignored")
    return outer, [l for l in closed if l is not outer], notes


def _near(a: tuple[float, float], b: tuple[float, float], tol: float = 0.005) -> bool:
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol


def _chain(pieces: list[list[tuple[float, float]]]) -> list[list[tuple[float, float]]]:
    """Join open line/arc pieces end to end into loops (or the longest runs that do not close)."""
    remaining = [list(p) for p in pieces]
    out = []
    while remaining:
        run = remaining.pop(0)
        grown = True
        while grown and not (len(run) > 2 and _near(run[0], run[-1])):
            grown = False
            for i, piece in enumerate(remaining):
                if _near(run[-1], piece[0]):
                    run += piece[1:]
                elif _near(run[-1], piece[-1]):
                    run += piece[::-1][1:]
                elif _near(run[0], piece[-1]):
                    run = piece[:-1] + run
                elif _near(run[0], piece[0]):
                    run = piece[::-1][:-1] + run
                else:
                    continue
                remaining.pop(i)
                grown = True
                break
        out.append(run)
    return out


def _area(poly: list[tuple[float, float]]) -> float:
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1])) / 2


def _offset(poly: list[tuple[float, float]], distance: float) -> list[tuple[float, float]]:
    """Grow (distance > 0) or shrink (< 0) a simple polygon by moving every edge along its normal (mitred corners,
    limited at very sharp ones)."""
    if len(poly) < 3 or not distance:
        return poly
    sign = 1 if _area(poly) > 0 else -1  # Y down: positive area runs clockwise on screen
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = poly[i - 1], poly[i], poly[(i + 1) % n]
        normals = []
        for a, b in ((p0, p1), (p1, p2)):
            dx, dy = b[0] - a[0], b[1] - a[1]
            length = math.hypot(dx, dy) or 1.0
            normals.append((-dy / length * sign, dx / length * sign))
        (n1x, n1y), (n2x, n2y) = normals
        mx, my = n1x + n2x, n1y + n2y
        dot = mx * n1x + my * n1y
        if abs(dot) < 0.2:  # an almost reversed corner: do not shoot the miter far away
            mx, my, dot = n1x, n1y, 1.0
        scale = distance / dot
        out.append((p1[0] - mx * scale, p1[1] - my * scale))
    return out


# ---- reading the session ---------------------------------------------------------------

def _tokens(text: str):
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c in " \t\r\n":
            i += 1
        elif c in "()":
            yield c
            i += 1
        elif c == '"':
            end = text.find('"', i + 1)
            newline = text.find("\n", i + 1)
            if end < 0 or (0 <= newline < end):  # a lone quote, as in (string_quote ")
                yield '"'
                i += 1
            else:
                yield text[i + 1:end]
                i = end + 1
        else:
            j = i
            while j < n and text[j] not in " \t\r\n()":
                j += 1
            yield text[i:j]
            i = j


def parse_tree(text: str) -> list:
    """A DSN/SES file as nested lists of strings."""
    stack: list[list] = [[]]
    for token in _tokens(text):
        if token == "(":
            stack.append([])
        elif token == ")":
            if len(stack) < 2:
                raise SpecctraError("unbalanced parentheses in the Specctra file")
            done = stack.pop()
            stack[-1].append(done)
        else:
            stack[-1].append(token)
    if len(stack) != 1 or not stack[0] or not isinstance(stack[0][0], list):
        raise SpecctraError("not a Specctra file (unbalanced or empty)")
    return stack[0][0]


def _children(node: list, head: str) -> list[list]:
    return [c for c in node[1:] if isinstance(c, list) and c and c[0] == head]


def _child(node: list, head: str) -> list | None:
    found = _children(node, head)
    return found[0] if found else None


UNIT_MM = {"inch": 25.4, "mil": 0.0254, "cm": 10.0, "mm": 1.0, "um": 0.001}


@dataclass
class SesWire:
    net: str
    layer: str
    width: float
    points: list[tuple[float, float]]
    kind: str | None = None


@dataclass
class SesVia:
    net: str
    padstack: str
    at: tuple[float, float]
    kind: str | None = None


@dataclass
class Session:
    wires: list[SesWire]
    vias: list[SesVia]
    via_diameters: dict[str, float]
    placements: dict[str, tuple[float, float, str, float]]


def _scale(node: list | None, default: float = 0.0001) -> float:
    res = _child(node, "resolution") if node is not None else None
    if res is None or len(res) < 3:
        return default
    try:
        return UNIT_MM[res[1].lower()] / float(res[2])
    except (KeyError, ValueError, ZeroDivisionError) as exc:
        raise SpecctraError(f"unknown resolution {res[1:]} in the session") from exc


def parse_ses(text: str) -> Session:
    """Wires, vias and placements of a Freerouting session, in board millimetres (Y down)."""
    root = parse_tree(text)
    if not root or root[0] != "session":
        raise SpecctraError(f"not a Specctra session file (starts with '{root[0] if root else ''}')")
    placements: dict[str, tuple[float, float, str, float]] = {}
    placement = _child(root, "placement")
    if placement is not None:
        scale = _scale(placement)
        for comp in _children(placement, "component"):
            for place in _children(comp, "place"):
                try:
                    placements[place[1]] = (float(place[2]) * scale, -float(place[3]) * scale, place[4], float(place[5]))
                except (IndexError, ValueError):
                    continue
    routes = _child(root, "routes")
    wires: list[SesWire] = []
    vias: list[SesVia] = []
    diameters: dict[str, float] = {}
    if routes is None:
        return Session(wires, vias, diameters, placements)
    scale = _scale(routes)
    library = _child(routes, "library_out")
    for stack in _children(library, "padstack") if library is not None else []:
        for shape in _children(stack, "shape"):
            circle = _child(shape, "circle")
            if circle is not None and len(circle) >= 3:
                diameters[stack[1]] = max(diameters.get(stack[1], 0.0), float(circle[2]) * scale)
    network = _child(routes, "network_out")
    for net in _children(network, "net") if network is not None else []:
        name = net[1] if len(net) > 1 and isinstance(net[1], str) else ""
        for wire in _children(net, "wire"):
            kind = _child(wire, "type")
            path = _child(wire, "path")
            if path is None or len(path) < 7:
                continue
            values = [float(v) for v in path[3:] if isinstance(v, str)]
            points = [(values[i] * scale, -values[i + 1] * scale) for i in range(0, len(values) - 1, 2)]
            wires.append(SesWire(name, path[1], float(path[2]) * scale, points, kind[1] if kind and len(kind) > 1 else None))
        for via in _children(net, "via"):
            kind = _child(via, "type")
            try:
                at = (float(via[2]) * scale, -float(via[3]) * scale)
            except (IndexError, ValueError):
                continue
            vias.append(SesVia(name, via[1], at, kind[1] if kind and len(kind) > 1 else None))
    return Session(wires, vias, diameters, placements)


# ---- importing ---------------------------------------------------------------------------

def _key(point: tuple[float, float]) -> tuple[int, int]:
    return round(point[0] * 1000), round(point[1] * 1000)  # 1 µm cells


def _touching(index: dict, point: tuple[float, float]):
    kx, ky = _key(point)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            yield from index.get((kx + dx, ky + dy), ())


def import_session(board: Board, session: Session, dsn: Dsn) -> dict[str, Any]:
    """Add the session's new tracks and vias to ``board`` (in memory). Only nets the DSN handed to the router are
    taken; wires and vias the board already has (the fixed wiring) are skipped. Footprints are never moved."""
    codes = board._net_codes()
    copper = set(board.copper_layers())
    segments: dict[tuple[str, str], dict] = {}
    via_index: dict[str, dict] = {}
    for item in board.root.lists():
        if item.head in ("segment", "arc", "via"):
            net = _net_name_of(item, codes)
            if item.head == "via":
                via_index.setdefault(net, {}).setdefault(_key(_xy(item.find("at"))), []).append(_xy(item.find("at")))
            else:
                a, b = _xy(item.find("start")), _xy(item.find("end"))
                index = segments.setdefault((net, item.child_value("layer") or ""), {})
                index.setdefault(_key(a), []).append((a, b))

    def known(net: str, layer: str, a, b) -> bool:
        index = segments.get((net, layer), {})
        return any((_near(a, s, 0.002) and _near(b, e, 0.002)) or (_near(a, e, 0.002) and _near(b, s, 0.002))
                   for s, e in list(_touching(index, a)) + list(_touching(index, b)))

    added = {"segments": 0, "vias": 0, "length": 0.0}
    nets: set[str] = set()
    skipped: dict[str, int] = {}
    for wire in session.wires:
        net = dsn.nets.get(wire.net)
        if net is None:
            skipped["wires on nets that were not routed"] = skipped.get("wires on nets that were not routed", 0) + 1
            continue
        if wire.kind in ("fix", "protect") or wire.layer not in copper:
            continue
        run: list[tuple[float, float]] = []

        def flush() -> None:
            if len(run) >= 2:
                result = board.add_track([[round(x, 6), round(y, 6)] for x, y in run], net, wire.layer, round(wire.width, 6))
                added["segments"] += len(result["segments"])
                added["length"] += result["length"]
                nets.add(net)
            run.clear()

        for a, b in zip(wire.points, wire.points[1:]):
            if math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6:
                continue
            if known(net, wire.layer, a, b):
                flush()
                continue
            if not run:
                run.append(a)
            run.append(b)
        flush()
    for via in session.vias:
        net = dsn.nets.get(via.net)
        if net is None or via.kind in ("fix", "protect"):
            continue
        if any(_near(via.at, p, 0.002) for p in _touching(via_index.get(net, {}), via.at)):
            continue
        diameter, drill = dsn.vias.get(via.padstack) or (session.via_diameters.get(via.padstack), None)
        board.add_via(round(via.at[0], 6), round(via.at[1], 6), net, diameter=diameter, drill=drill)
        via_index.setdefault(net, {}).setdefault(_key(via.at), []).append(via.at)
        added["vias"] += 1
        nets.add(net)
    moved = []
    for fp in board.footprints():
        place = session.placements.get(fp.reference)
        if place is not None and not (_near(place[:2], fp.at[:2], 0.002)):
            moved.append(fp.reference)
    out: dict[str, Any] = {"segments": added["segments"], "vias": added["vias"], "length": round(added["length"], 3),
                           "nets": sorted(nets)}
    if moved:
        out["ignored_moves"] = moved  # the router may not move parts; the board keeps the placement
    if skipped:
        out["skipped"] = skipped
    return out
