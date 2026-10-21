"""Specctra DSN export and SES import. Pin geometry is checked against two oracles: KiCad's own exporter
(pcbnew.ExportSpecctraDSN, in KiCad's Python when it is installed) and KiCad's IPC-D-356 pad positions."""
import math
import os
import re
import shutil
import subprocess

import pytest

from dsh_kicad_sidecar.kicad_cli import find_kicad_cli
from dsh_kicad_sidecar.pcb import Board
from dsh_kicad_sidecar.sexpr import dumps, parse
from dsh_kicad_sidecar.specctra import (SpecctraError, _custom_polygon, _q, import_session, parse_ses, parse_tree,
                                        select_nets, write_dsn)

from conftest import FIXTURES, needs_kicad_cli


@pytest.fixture
def board(tmp_path):
    """rc_board: J1 (1x03 THT header), R1, C1 (rotated 90°) on a 50 × 30 mm outline, nets IN, OUT, GND, unrouted."""
    dst = tmp_path / "rc_board"
    shutil.copytree(os.path.join(FIXTURES, "rc_board"), dst)
    return str(dst / "rc_board.kicad_pcb")


def kicad_python():
    """An interpreter that imports pcbnew (KiCad's own), or None."""
    for candidate in ("/usr/bin/python3", shutil.which("python3")):
        if candidate and subprocess.run([candidate, "-c", "import pcbnew"], capture_output=True).returncode == 0:
            return candidate
    return None


needs_pcbnew = pytest.mark.skipif(kicad_python() is None, reason="no Python with KiCad's pcbnew module")


def nodes(tree, head):
    return [c for c in tree[1:] if isinstance(c, list) and c and c[0] == head]


def node(tree, head):
    found = nodes(tree, head)
    return found[0] if found else None


def pins_of(dsn_text):
    """{"REF-PIN": (x, y, shape bbox)} in board mm from a DSN (front-side placements: offset rotated by the part)."""
    tree = parse_tree(dsn_text)
    library = node(tree, "library")
    stacks = {}
    for stack in nodes(library, "padstack"):
        points = []
        for shape in nodes(stack, "shape"):
            geo = shape[1]
            values = [float(v) for v in geo[2:] if not isinstance(v, list)]
            if geo[0] == "circle":
                r = values[0] / 2
                cx, cy = (values[1], values[2]) if len(values) >= 3 else (0, 0)
                points += [(cx - r, cy - r), (cx + r, cy + r)]
            elif geo[0] == "rect":
                points += [(values[0], values[1]), (values[2], values[3])]
            elif geo[0] in ("path", "polygon"):
                half = values[0] / 2
                pts = list(zip(values[1::2], values[2::2]))
                points += [(x - half, y - half) for x, y in pts] + [(x + half, y + half) for x, y in pts]
        stacks[stack[1]] = points
    images = {img[1]: img for img in nodes(library, "image")}
    out = {}
    for comp in nodes(node(tree, "placement"), "component"):
        for place in nodes(comp, "place"):
            ref, px, py, side, rot = place[1], float(place[2]), float(place[3]), place[4], float(place[5])
            assert side == "front"
            for pin in nodes(images[comp[1]], "pin"):
                rest = [v for v in pin[2:] if not isinstance(v, list)]
                rotate = node(pin, "rotate")
                pin_rot = float(rotate[1]) if rotate else 0.0
                name, x, y = rest[0], float(rest[1]), float(rest[2])

                def turn(vx, vy, deg):
                    a = math.radians(deg)
                    return vx * math.cos(a) - vy * math.sin(a), vx * math.sin(a) + vy * math.cos(a)

                cx, cy = turn(x, y, rot)
                corners = [turn(*turn(vx, vy, pin_rot), rot) for vx, vy in stacks[pin[1]]]
                xs, ys = [c[0] for c in corners], [c[1] for c in corners]
                box = (min(xs) / 1000, -max(ys) / 1000, max(xs) / 1000, -min(ys) / 1000)  # board mm, Y down
                out[f"{ref}-{name}"] = ((px + cx) / 1000, -(py + cy) / 1000, box)
    return out


def network(dsn_text):
    tree = parse_tree(dsn_text)
    return {n[1]: sorted(node(n, "pins")[1:]) for n in nodes(node(tree, "network"), "net")}


# ---- writing ------------------------------------------------------------------------

def test_quoting_follows_kicads_exporter():
    assert [_q(n) for n in ("GND", "+3V3", "/CC1", "-5V", "Net-(D1-A)", "AMS1117-3.3", "a b", "", "x%y", "R1")] == \
        ["GND", "+3V3", "/CC1", "-5V", '"Net-(D1-A)"', '"AMS1117-3.3"', '"a b"', '""', '"x%y"', "R1"]


def test_dsn_of_the_fixture(board):
    dsn = write_dsn(Board(board))
    tree = parse_tree(dsn.text)
    assert tree[0] == "pcb"
    structure = node(tree, "structure")
    assert [l[1] for l in nodes(structure, "layer")] == ["F.Cu", "B.Cu"]
    # The boundary is the 50 × 30 outline pulled in by copper-to-edge (0.5) minus clearance (0.2) = 0.3 mm.
    path = node(node(structure, "boundary"), "path")
    xs, ys = [float(v) for v in path[3::2]], [float(v) for v in path[4::2]]
    assert (min(xs), max(xs), min(ys), max(ys)) == (100300, 149700, -129700, -100300)
    # Rules: KiCad's defaults plus the margin that keeps Freerouting's rounding inside KiCad's limits.
    assert node(structure, "rule")[1:3] == [["width", "200"], ["clearance", "210"]]
    assert network(dsn.text) == {"GND": ["C1-2", "J1-3"], "IN": ["J1-1", "R1-1"], "OUT": ["C1-1", "J1-2", "R1-2"]}
    assert sorted(dsn.nets.values()) == ["GND", "IN", "OUT"] and dsn.left_out == [] and dsn.fixed == {"tracks": 0, "vias": 0}
    (default,) = nodes(node(tree, "network"), "class")
    assert default[1] == "kicad_default" and node(default, "circuit") == ["circuit", ["use_via", "Via[0-1]_600:300_um"]]
    assert dsn.vias == {"Via[0-1]_600:300_um": (0.6, 0.3)}
    pins = pins_of(dsn.text)
    assert pins["C1-1"][:2] == pytest.approx((132.0, 118.775)) and pins["J1-1"][:2] == pytest.approx((105.0, 112.46))


@needs_kicad_cli
def test_pins_are_where_kicad_puts_the_pads(board, tmp_path):
    """Rotated (45°, 90°) and back-side parts: every DSN pin centre on KiCad's IPC-D-356 pad position."""
    b = Board(board)
    b.move_footprint("R1", rotation=45)
    b.move_footprint("J1", side="back")
    b.save()
    pins = pins_of(write_dsn(Board(board)).text)
    out = tmp_path / "pads.ipc"
    subprocess.run([find_kicad_cli()[0], "pcb", "export", "ipcd356", "-o", str(out), board], check=True, capture_output=True)
    kicad = {}
    for line in open(out):
        m = re.match(r"^3[1-6]7(\S*)\s+(\S+)\s+-(\S+).*?X([+-]\d+)Y([+-]\d+)", line)
        if m:
            kicad[f"{m.group(2)}-{m.group(3)}"] = (int(m.group(4)) * 0.00254, -int(m.group(5)) * 0.00254)
    assert set(kicad) == set(pins)
    for name, (x, y) in kicad.items():
        assert pins[name][:2] == pytest.approx((x, y), abs=0.003), name


@needs_pcbnew
@pytest.mark.parametrize("rotation", [0, 90, 30])
def test_matches_kicads_own_exporter(board, tmp_path, rotation):
    """Same pins, same nets and the same copper extents as pcbnew.ExportSpecctraDSN (front-side parts)."""
    b = Board(board)
    b.move_footprint("R1", rotation=rotation)
    b.save()
    out = tmp_path / "kicad.dsn"
    script = "import sys, pcbnew; sys.exit(0 if pcbnew.ExportSpecctraDSN(pcbnew.LoadBoard(sys.argv[1]), sys.argv[2]) else 1)"
    subprocess.run([kicad_python(), "-c", script, board, str(out)], check=True, capture_output=True)
    theirs, ours = pins_of(out.read_text()), pins_of(write_dsn(Board(board)).text)
    assert set(theirs) == set(ours)
    for name in theirs:
        (tx, ty, tbox), (ox, oy, obox) = theirs[name], ours[name]
        assert (ox, oy) == pytest.approx((tx, ty), abs=0.002), name
        assert obox == pytest.approx(tbox, abs=0.02), name
    assert network(out.read_text()) == network(write_dsn(Board(board)).text)


def test_duplicate_pad_numbers_are_numbered_like_kicad(board):
    b = Board(board)
    pad = next(p for p in b.footprint("J1").node.lists("pad") if p.value(0) == "3")
    pad.items[1].set("2")  # J1 now has two pads numbered 2 (like a SOT-223 tab)
    pins = network(write_dsn(b).text)
    assert "J1-2" in pins["OUT"] and "J1-2@1" in pins["GND"]


def test_nets_and_exclude_nets(board):
    b = Board(board)
    dsn = write_dsn(b, nets=["IN", "OUT"], exclude_nets=["OUT"])
    assert dsn.routed == ["IN"] and dsn.left_out == ["GND", "OUT"]
    assert network(dsn.text) == {"IN": ["J1-1", "R1-1"]}
    assert {"J1-2", "J1-3", "C1-1"} <= set(pins_of(dsn.text))  # pads of other nets stay, as obstacles without a net
    assert select_nets(["/A1", "/A2", "GND"], ["/A*"], None) == (["/A1", "/A2"], ["GND"])
    with pytest.raises(SpecctraError, match="no net 'VCC'.*GND"):
        write_dsn(b, nets=["VCC"])
    with pytest.raises(SpecctraError, match="must be a list"):
        write_dsn(b, exclude_nets="GND")


def test_existing_copper_is_fixed_wiring(board):
    b = Board(board)
    b.add_track(["J1:1", [110, 110], "R1:1"], locked=True)
    b.add_track(["C1:2", [134, 117.225]])
    b.add_via(134, 117.225, "GND")
    dsn = write_dsn(b, exclude_nets=["GND"])
    wiring = node(parse_tree(dsn.text), "wiring")
    wires, vias = nodes(wiring, "wire"), nodes(wiring, "via")
    assert dsn.fixed == {"tracks": 3, "vias": 1}
    assert [(node(w, "net") or [None, None])[1] for w in wires] == ["IN", "IN", None]  # GND left out: no net
    assert [node(w, "type")[1] for w in wires] == ["fix", "fix", "protect"]  # locked tracks are fix
    assert vias[0][1] == "Via[0-1]_600:300_um" and node(vias[0], "net") is None


def test_keepouts_texts_and_holes(board):
    b = Board(board)
    b.add_text("COPPER", 125, 125, layer="F.Cu", size=2)
    b.add_keepout(outline=[[140, 101], [148, 101], [148, 108], [140, 108]], layers=["F.Cu"], pads=False, copperpour=False)
    b.add_mounting_hole(145, 125, drill=3.2)
    structure = node(parse_tree(write_dsn(b).text), "structure")
    keepouts = nodes(structure, "keepout")
    polygons = [k[2] for k in keepouts if k[2][0] == "polygon"]
    circles = [k[2] for k in keepouts if k[2][0] == "circle"]
    text = next(p for p in polygons if p[1] == "F.Cu" and float(p[3]) < 125000 and float(p[4]) > -126000)
    xs = [float(v) for v in text[3::2]]
    assert 6 * 1.3 < (max(xs) - min(xs)) / 1000 < 6 * 2 + 1  # "COPPER" at 2 mm: about KiCad's own box
    assert any(p[1] == "F.Cu" and float(p[3]) == 140000 for p in polygons)  # the rule area
    # The hole (no copper) blocks both layers, grown by the hole clearance (0.25): 3.2 + 0.5.
    assert sorted((c[1], c[2]) for c in circles) == [("B.Cu", "3700"), ("F.Cu", "3700")]


def test_custom_pad_keeps_its_notch():
    """A solder-jumper half with a V notch: the polygon is the pad's own (the convex hull would fill the notch)."""
    pad = parse('(pad "2" smd custom (at 0.725 0) (size 0.3 0.3) (layers "B.Cu") (options (clearance outline) (anchor rect))'
                ' (primitives (gr_poly (pts (xy 0.5 -0.75) (xy -0.65 -0.75) (xy -0.15 0) (xy -0.65 0.75) (xy 0.5 0.75))'
                ' (width 0) (fill yes))))').root
    assert _custom_polygon(pad, 0.3, 0.3) == [(0.5, -0.75), (-0.65, -0.75), (-0.15, 0.0), (-0.65, 0.75), (0.5, 0.75)]
    loose = parse('(pad "1" smd custom (at 0 0) (size 1 1) (layers "F.Cu") (options (anchor rect))'
                  ' (primitives (gr_line (start 0 0) (end 3 0) (width 0.2))))').root
    hull = _custom_polygon(loose, 1, 1)  # anchor and a stroke: their hull
    assert min(x for x, _ in hull) == -0.5 and max(x for x, _ in hull) == pytest.approx(3.1)


def test_outline_from_lines_and_arcs(board):
    b = Board(board)
    b.set_board_outline(width=40, height=30, corner_radius=3, x=100, y=100)
    b.root.find("version").items[1].set("20241229")  # an older file: the rounded outline is lines and arcs
    for item in b.outline_items():
        b.root.remove(item)
    for node_ in b._rectangle(100, 100, 40, 30, 3, 0.05):
        b.insert_item(node_)
    dsn = write_dsn(b)
    assert not dsn.notes
    path = node(node(node(parse_tree(dsn.text), "structure"), "boundary"), "path")
    xs = [float(v) for v in path[3::2]]
    assert min(xs) == pytest.approx(100300, abs=1) and max(xs) == pytest.approx(139700, abs=1) and len(xs) > 12


def test_no_outline_is_refused(board):
    b = Board(board)
    for item in b.outline_items():
        b.root.remove(item)
    with pytest.raises(SpecctraError, match="no outline.*set_board_outline"):
        write_dsn(b)


# ---- reading the session ------------------------------------------------------------

def ses(nets, placements=""):
    """A session in Freerouting's layout: units of 0.1 µm, Y up."""
    body = "\n".join(f"      (net {name}\n{chr(10).join(items)}\n      )" for name, items in nets.items())
    return f"""(session rc_board.ses
  (base_design rc_board.dsn)
  (placement
    (resolution um 10)
{placements}
  )
  (was_is
  )
  (routes
    (resolution um 10)
    (parser
      (host_cad "KiCad's Pcbnew")
      (host_version "dsh-kicad")
    )
    (library_out
      (padstack "Via[0-1]_600:300_um"
        (shape
          (circle F.Cu 6000 0 0)
        )
        (shape
          (circle B.Cu 6000 0 0)
        )
        (attach off)
      )
    )
    (network_out
{body}
    )
  )
)
"""


def wire(layer, width_mm, *points, kind=None):
    pts = "  ".join(f"{round(x * 10000)} {round(-y * 10000)}" for x, y in points)
    return f"        (wire (path {layer} {round(width_mm * 10000)} {pts}){f' (type {kind})' if kind else ''})"


def via(x, y, kind=None):
    return f'        (via "Via[0-1]_600:300_um" {round(x * 10000)} {round(-y * 10000)}{f" (type {kind})" if kind else ""})'


def test_parse_session():
    session = parse_ses(ses({"IN": [wire("F.Cu", 0.2, (105, 112.46), (110, 110), (119.175, 110))], "GND": [via(134, 117.225)]},
                            '    (component R (place R1 1200000 -1100000 front 0))'))
    (w,) = session.wires
    assert w.net == "IN" and w.layer == "F.Cu" and w.width == pytest.approx(0.2)
    assert w.points == [pytest.approx((105, 112.46)), pytest.approx((110, 110)), pytest.approx((119.175, 110))]
    assert session.vias[0].at == pytest.approx((134, 117.225)) and session.via_diameters == {"Via[0-1]_600:300_um": pytest.approx(0.6)}
    assert session.placements["R1"] == (pytest.approx(120), pytest.approx(110), "front", 0.0)


def footprint_texts(path):
    return [dumps(fp.node) for fp in Board(path).footprints()]


def test_import_adds_only_new_copper(board):
    before = footprint_texts(board)
    b = Board(board)
    b.add_track(["C1:2", [134, 117.225]], locked=True)  # already there: the session repeats it
    dsn = write_dsn(b, exclude_nets=["OUT"])
    session = parse_ses(ses({
        "IN": [wire("F.Cu", 0.2, (105, 112.46), (110, 110), (119.175, 110))],
        "GND": [wire("F.Cu", 0.2, (132, 117.225), (134, 117.225), kind="fix"),
                wire("F.Cu", 0.2, (132, 117.225), (134, 117.225), (134, 125)),  # first segment exists, second is new
                via(134, 125), wire("B.Cu", 0.2, (134, 125), (105, 125), (105, 117.54))],
        "OUT": [wire("F.Cu", 0.2, (120.825, 110), (132, 118.775))],  # not handed to the router: ignored
    }, '    (component R (place R1 1300000 -1100000 front 0))'))
    result = import_session(b, session, dsn)
    assert result["segments"] == 2 + 1 + 2 and result["vias"] == 1 and result["nets"] == ["GND", "IN"]
    assert result["ignored_moves"] == ["R1"] and result["skipped"] == {"wires on nets that were not routed": 1}
    tracks = b.tracks()
    assert sum(1 for t in tracks if t["kind"] == "segment" and t["net"] == "OUT") == 0
    (locked,) = [t for t in tracks if t.get("locked")]  # the hand-routed track is still there, still the only locked one
    assert (locked["net"], locked["start"], locked["end"]) == ("GND", [132.0, 117.225], [134.0, 117.225])
    b.save()
    assert footprint_texts(board) == before  # the router's moves are not applied: footprints are byte for byte the same


@needs_kicad_cli
def test_imported_routes_connect_in_kicad(board):
    b = Board(board)
    dsn = write_dsn(b)
    session = parse_ses(ses({
        "IN": [wire("F.Cu", 0.2, (105, 112.46), (110, 110), (119.175, 110))],
        "GND": [wire("F.Cu", 0.2, (132, 117.225), (134, 117.225)), via(134, 117.225),
                wire("B.Cu", 0.2, (134, 117.225), (134, 125), (105, 125), (105, 117.54))],
    }))
    import_session(b, session, dsn)
    b.save()
    from dsh_kicad_sidecar.kicad_cli import KiCadCli
    report = KiCadCli().drc(board)
    assert report["unrouted"] == 2 and report["counts"]["error"] == 2  # only OUT's two connections are left
