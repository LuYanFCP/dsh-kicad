"""Library-to-schematic coordinate transforms and pin geometry.

Library symbols use a Y-up frame; schematics use Y-down millimetres. A placed symbol
``(at X Y R)`` with optional ``(mirror x|y)`` maps a library point ``(x, y)`` to the
schematic as: flip Y, rotate counter-clockwise (as seen on screen) by ``R``, then
mirror. This matches KiCad's ``TRANSFORM`` for the orientations it can store.
"""

from __future__ import annotations

from dataclasses import dataclass

from .sexpr import SList

__all__ = ["Pin", "transform", "library_pins", "placed_pins", "snap", "GRID"]

GRID = 1.27


def snap(value: float, grid: float = GRID) -> float:
    return round(round(value / grid) * grid, 4)


def transform(x: float, y: float, rotation: float, mirror: str | None) -> tuple[float, float]:
    """Library offset → schematic offset (relative to the symbol anchor)."""
    dx, dy = x, -y
    r = int(round(rotation)) % 360
    if r == 90:
        dx, dy = dy, -dx
    elif r == 180:
        dx, dy = -dx, -dy
    elif r == 270:
        dx, dy = -dy, dx
    elif r != 0:
        raise ValueError(f"unsupported symbol rotation {rotation}")
    if mirror == "x":
        dy = -dy
    elif mirror == "y":
        dx = -dx
    return dx, dy


@dataclass
class Pin:
    number: str
    name: str
    electrical_type: str
    x: float  # library frame, connection point
    y: float
    angle: float  # direction from the connection point into the body (library frame)
    length: float
    unit: int
    body_style: int
    hidden: bool

    def to_dict(self) -> dict:
        return {"number": self.number, "name": self.name, "type": self.electrical_type}


def _unit_of(sub_name: str) -> tuple[int, int]:
    """``R_1_1`` → (unit 1, body style 1); ``R_0_1`` → common unit."""
    parts = sub_name.rsplit("_", 2)
    try:
        return int(parts[-2]), int(parts[-1])
    except (ValueError, IndexError):
        return 0, 0


def library_pins(lib_symbol: SList) -> list[Pin]:
    pins: list[Pin] = []
    for sub in lib_symbol.lists("symbol"):
        unit, style = _unit_of(sub.value(0) or "")
        for pin in sub.lists("pin"):
            at = pin.find("at")
            if at is None:
                continue
            hidden = pin.find("hide") is not None and pin.child_value("hide") in (None, "yes")
            if any(a.value == "hide" for a in pin.atoms()):
                hidden = True
            pins.append(Pin(
                number=pin.child_value("number") or "",
                name=pin.child_value("name") or "",
                electrical_type=pin.value(0) or "unspecified",
                x=float(at.value(0) or 0), y=float(at.value(1) or 0), angle=float(at.value(2) or 0),
                length=float(pin.child_value("length") or 0),
                unit=unit, body_style=style, hidden=hidden,
            ))
    return pins


def pins_for_unit(pins: list[Pin], unit: int, body_style: int = 1) -> list[Pin]:
    return [p for p in pins if p.unit in (0, unit) and p.body_style in (0, body_style)]


def placed_pins(lib_symbol: SList, at: tuple[float, float, float], mirror: str | None, unit: int,
                body_style: int = 1) -> list[dict]:
    """Absolute schematic positions of the pins of one placed unit."""
    x0, y0, rot = at
    out = []
    for p in pins_for_unit(library_pins(lib_symbol), unit, body_style):
        dx, dy = transform(p.x, p.y, rot, mirror)
        # Outward direction (away from the body) in schematic coordinates.
        ox, oy = _direction(p.angle + 180, rot, mirror)
        out.append({
            **p.to_dict(), "x": round(x0 + dx, 4), "y": round(y0 + dy, 4),
            "outward": [ox, oy], "hidden": p.hidden,
        })
    return out


def _direction(angle: float, rotation: float, mirror: str | None) -> tuple[int, int]:
    a = int(round(angle)) % 360
    lx, ly = {0: (1, 0), 90: (0, 1), 180: (-1, 0), 270: (0, -1)}.get(a, (1, 0))
    dx, dy = transform(lx, ly, rotation, mirror)
    return int(round(dx)), int(round(dy))


def body_bbox(lib_symbol: SList, at: tuple[float, float, float], mirror: str | None, unit: int,
              body_style: int = 1) -> tuple[float, float, float, float] | None:
    """Schematic-space bounding box (x0, y0, x1, y1) of one unit's body graphics."""
    points: list[tuple[float, float]] = []

    def xy(node: SList | None) -> None:
        if node is not None:
            points.append((float(node.value(0) or 0), float(node.value(1) or 0)))

    for sub in lib_symbol.lists("symbol"):
        u, style = _unit_of(sub.value(0) or "")
        if u not in (0, unit) or style not in (0, body_style):
            continue
        for g in sub.lists():
            if g.head == "rectangle":
                xy(g.find("start")); xy(g.find("end"))
            elif g.head in ("polyline", "bezier") and g.find("pts") is not None:
                for p in g.find("pts").lists("xy"):
                    xy(p)
            elif g.head == "arc":
                xy(g.find("start")); xy(g.find("mid")); xy(g.find("end"))
            elif g.head == "circle" and g.find("center") is not None:
                c = g.find("center")
                cx, cy, r = float(c.value(0) or 0), float(c.value(1) or 0), float(g.child_value("radius") or 0)
                points += [(cx - r, cy - r), (cx + r, cy + r)]
    if not points:
        return None
    moved = [transform(px, py, at[2], mirror) for px, py in points]
    xs = [at[0] + dx for dx, _ in moved]
    ys = [at[1] + dy for _, dy in moved]
    return min(xs), min(ys), max(xs), max(ys)
