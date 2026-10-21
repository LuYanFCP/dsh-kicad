"""Board editing, judged by KiCad: every op is checked with ``kicad-cli pcb drc`` (and pad geometry with
KiCad's own IPC-D-356 export)."""
import glob
import json
import os
import re
import shutil
import subprocess
from collections import Counter

import pytest

from dsh_kicad_sidecar.footprints import FootprintLibraries, default_footprint_dirs
from dsh_kicad_sidecar.kicad_cli import KiCadCli, find_kicad_cli
from dsh_kicad_sidecar.pcb import Board, Footprint, PcbError
from dsh_kicad_sidecar.sexpr import parse
from dsh_kicad_sidecar.tools import ToolError, Toolbox

from conftest import FIXTURES, needs_kicad_cli

DEMOS = os.environ.get("KICAD_DEMOS", "/usr/share/kicad/demos")
needs_footprints = pytest.mark.skipif(not default_footprint_dirs(), reason="KiCad footprint libraries not installed")


@pytest.fixture
def board(tmp_path):
    """A copy of the rc_board fixture (KiCad 10 file): J1, R1, C1 placed, 4 connections unrouted."""
    dst = tmp_path / "rc_board"
    shutil.copytree(os.path.join(FIXTURES, "rc_board"), dst)
    return str(dst / "rc_board.kicad_pcb")


def demo(tmp_path, rel):
    src = os.path.join(DEMOS, rel)
    if not os.path.isfile(src):
        pytest.skip(f"KiCad demo {rel} not installed")
    dst = tmp_path / "demo"
    shutil.copytree(os.path.dirname(src), dst)
    return str(dst / os.path.basename(src))


def edit(path, *ops):
    b = Board(path, libraries=FootprintLibraries())
    results = [b.apply(op) for op in ops]
    b.save()
    return results


def drc(path):
    """KiCad's verdict: unrouted count plus the other violations by (severity, type)."""
    b = Board(path)
    report = KiCadCli().drc(path, refill_zones=bool(b.zones()))
    other = Counter((v["severity"], v["type"]) for v in report["violations"] if v.get("category") != "unconnected")
    return report["unrouted"], other


def errors(counter):
    return {t: n for (sev, t), n in counter.items() if sev == "error"}


def kicad_pads(path):
    """Pad centres as KiCad computes them (IPC-D-356 netlist export, 0.0001 inch resolution)."""
    out = os.path.join(os.path.dirname(path), "pads.ipc")
    subprocess.run([find_kicad_cli()[0], "pcb", "export", "ipcd356", "-o", out, path], check=True, capture_output=True)
    pads = {}
    for line in open(out):
        m = re.match(r"^3[1-6]7(\S*)\s+(\S+)\s+-(\S+).*?X([+-]\d+)Y([+-]\d+)", line)
        if m:
            pads[(m.group(2), m.group(3))] = (int(m.group(4)) * 0.00254, -int(m.group(5)) * 0.00254)
    return pads


def kicad_resave(path, tmp_path):
    """Let KiCad load and re-save a copy; returns the root of what KiCad wrote."""
    dst = tmp_path / "resaved"
    shutil.copytree(os.path.dirname(path), dst)
    copy = str(dst / os.path.basename(path))
    subprocess.run([find_kicad_cli()[0], "pcb", "upgrade", "--force", copy], check=True, capture_output=True)
    return parse(open(copy).read()).root


# ---- reading and round trip ----------------------------------------------------------

def round_trip_files():
    files = sorted(glob.glob(os.path.join(FIXTURES, "**", "*.kicad_pcb"), recursive=True))
    return files + sorted(glob.glob(os.path.join(DEMOS, "**", "*.kicad_pcb"), recursive=True), key=os.path.getsize)[:7]


@pytest.mark.parametrize("path", round_trip_files())
def test_read_and_write_back_unchanged_is_byte_identical(path, tmp_path):
    original = open(path, encoding="utf-8").read()
    b = Board(path)
    b.summary()  # reading everything must not touch the tree
    target = tmp_path / os.path.basename(path)
    assert b.save(str(target)) == [str(target)]  # no rules changed: the project file is not rewritten
    assert target.read_text(encoding="utf-8") == original


def test_project_file_round_trips_when_rules_are_untouched(board):
    pro = os.path.splitext(board)[0] + ".kicad_pro"
    b = Board(board)
    assert b.project_text() == open(pro).read()


def test_summary_of_fixture(board):
    s = Board(board).summary(include_pads=True)
    assert s["format"]["nets"] == "named"
    assert s["board"]["outline"] == {"bbox": [100.0, 100.0, 150.0, 130.0], "width": 50.0, "height": 30.0, "items": 1, "shape": "rectangle"}
    assert s["board"]["copper_layers"] == ["F.Cu", "B.Cu"]
    assert s["nets"] == ["GND", "IN", "OUT"]
    assert [f["reference"] for f in s["footprints"]] == ["C1", "J1", "R1"]
    c1 = s["footprints"][0]
    assert c1["rotation"] == 90 and c1["side"] == "front" and c1["pad_nets"] == {"1": "OUT", "2": "GND"}
    assert c1["courtyard"] == [131.27, 116.52, 132.73, 119.48]
    assert {p["number"]: p["at"] for p in c1["pads"]} == {"1": [132.0, 118.775], "2": [132.0, 117.225]}
    assert s["net_classes"][0]["name"] == "Default"


@needs_kicad_cli
def test_fixture_baseline_is_clean_but_unrouted(board):
    unrouted, other = drc(board)
    assert unrouted == 4 and not errors(other)


@needs_kicad_cli
def test_pad_positions_match_kicad_after_move_rotate_flip(board):
    edit(board,
         {"op": "move_footprint", "reference": "R1", "x": 118, "y": 121, "rotation": 30},
         {"op": "move_footprint", "reference": "C1", "side": "back", "rotation": 45},
         {"op": "move_footprint", "reference": "J1", "rotation": -90},
         {"op": "move_footprints", "references": ["J1"], "dx": 1.5, "dy": -2})
    ours = {(fp.reference, p["number"]): p["at"] for fp in Board(board).footprints() for p in fp.pads()}
    theirs = kicad_pads(board)
    assert set(theirs) == set(ours)
    for key, (x, y) in theirs.items():
        assert ours[key] == pytest.approx([x, y], abs=0.003), key


# ---- outline and holes ---------------------------------------------------------------

@needs_kicad_cli
@pytest.mark.parametrize("radius, clipped", [(0, False), (10, True)])
def test_set_board_outline_rectangle(board, radius, clipped):
    # C1 sits where a 10 mm corner radius cuts the corner off: only the rounded board clips its copper.
    edit(board, {"op": "move_footprint", "reference": "C1", "x": 102.5, "y": 102.5},
         {"op": "set_board_outline", "width": 50, "height": 30, "corner_radius": radius})
    outline = Board(board).outline()
    assert outline["width"] == 50 and outline["items"] == 1 and outline.get("corner_radius", 0) == radius
    unrouted, other = drc(board)
    assert unrouted == 4
    assert ("copper_edge_clearance" in errors(other)) is clipped
    assert "invalid_outline" not in errors(other)


@needs_kicad_cli
def test_set_board_outline_through_a_part_is_flagged(board):
    edit(board, {"op": "set_board_outline", "width": 32, "height": 30})  # keeps the old top-left corner
    assert Board(board).outline()["bbox"] == [100.0, 100.0, 132.0, 130.0]
    assert "copper_edge_clearance" in errors(drc(board)[1])


@needs_kicad_cli
def test_set_board_outline_polygon(board):
    edit(board, {"op": "set_board_outline", "points": [[100, 100], [150, 100], [150, 130], [110, 130], [100, 120]]})
    outline = Board(board).outline()
    assert outline["shape"] == "polygon" and len(outline["points"]) == 5
    unrouted, other = drc(board)
    assert unrouted == 4 and not errors(other)


@needs_kicad_cli
@needs_footprints
def test_add_mounting_hole(board):
    (hole,) = edit(board, {"op": "add_mounting_hole", "x": 145, "y": 105})
    assert hole["reference"] == "H1" and hole["footprint"] == "MountingHole:MountingHole_3.2mm_M3"
    assert not errors(drc(board)[1])
    edit(board, {"op": "add_mounting_hole", "x": 105, "y": 115})  # on top of J1
    assert {"hole_clearance", "courtyards_overlap"} <= set(errors(drc(board)[1]))


@needs_kicad_cli
def test_add_mounting_hole_without_libraries(board):
    b = Board(board)  # no footprint libraries: a minimal footprint is generated
    b.apply({"op": "add_mounting_hole", "x": 145, "y": 125, "drill": 2.7, "plated": True})
    b.save()
    pads = kicad_pads(board)
    assert pads[("H1", "1")] == pytest.approx((145, 125), abs=0.003)
    assert not errors(drc(board)[1])


# ---- footprints ----------------------------------------------------------------------

@needs_kicad_cli
def test_move_footprint_off_the_board_is_flagged(board):
    edit(board, {"op": "move_footprint", "reference": "C1", "x": 149.5, "y": 118})
    assert "copper_edge_clearance" in errors(drc(board)[1])


@needs_kicad_cli
def test_flip_to_back_then_route_through_a_via(board):
    moved, *_ = edit(board,
                     {"op": "move_footprint", "reference": "C1", "side": "back"},
                     {"op": "add_track", "points": ["C1:1", [128, 118.775]], "layer": "B.Cu"},
                     {"op": "add_via", "x": 128, "y": 118.775, "net": "OUT"},
                     {"op": "add_track", "points": [[128, 118.775], "R1:2"]})
    assert moved == {"reference": "C1", "at": [132.0, 118.0], "rotation": 90.0, "side": "back"}
    unrouted, other = drc(board)
    assert unrouted == 3 and not errors(other)


@needs_kicad_cli
def test_rotate_then_route_to_the_rotated_pad(board):
    edit(board, {"op": "move_footprint", "reference": "R1", "rotation": 30},
         {"op": "add_track", "points": ["J1:1", [110, 112.46], "R1:1"]})
    unrouted, other = drc(board)
    assert unrouted == 3 and not errors(other)


@needs_kicad_cli
def test_move_footprints_keeps_relative_placement(board):
    before = kicad_pads(board)
    edit(board, {"op": "move_footprints", "references": ["R1", "C1"], "dx": -3, "dy": 5})
    after = kicad_pads(board)
    for (ref, pad), (x, y) in before.items():
        shift = (-3, 5) if ref in ("R1", "C1") else (0, 0)
        assert after[(ref, pad)] == pytest.approx((x + shift[0], y + shift[1]), abs=0.003)
    assert not errors(drc(board)[1])


@needs_kicad_cli
def test_lock_footprint(board, tmp_path):
    edit(board, {"op": "lock_footprint", "reference": "J1"})
    with pytest.raises(PcbError, match="J1 is locked"):
        edit(board, {"op": "move_footprint", "reference": "J1", "x": 110, "y": 110})
    with pytest.raises(PcbError, match="locked footprints cannot move: J1"):
        edit(board, {"op": "move_footprints", "references": ["R1", "J1"], "dx": 1, "dy": 0})
    assert not errors(drc(board)[1])
    resaved = {fp.reference: fp.locked for fp in map(Footprint, kicad_resave(board, tmp_path).lists("footprint"))}
    assert resaved == {"J1": True, "R1": False, "C1": False}
    edit(board, {"op": "lock_footprint", "reference": "J1", "locked": False}, {"op": "move_footprint", "reference": "J1", "x": 106})
    assert not Board(board).footprint("J1").locked


# ---- rules ---------------------------------------------------------------------------

@needs_kicad_cli
def test_set_design_rules(board):
    text_before = open(board).read()
    edit(board, {"op": "set_design_rules", "min_track_width": 0.5})
    assert open(board).read() == text_before  # rules live in the project file
    pro = json.load(open(os.path.splitext(board)[0] + ".kicad_pro"))
    assert pro["board"]["design_settings"]["rules"]["min_track_width"] == 0.5
    edit(board, {"op": "add_track", "points": ["J1:1", [110, 110], "R1:1"], "width": 0.25})
    assert errors(drc(board)[1]) == {"track_width": 2}
    with pytest.raises(PcbError, match="unknown design rule"):
        edit(board, {"op": "set_design_rules", "min_trace": 1})


@needs_kicad_cli
def test_set_net_class(board):
    (cls,) = edit(board, {"op": "set_net_class", "name": "Power", "nets": ["GND"], "clearance": 2.0, "track_width": 0.6})
    assert cls["clearance"] == 2.0 and cls["track_width"] == 0.6
    b = Board(board)
    assert b.net_class_of("GND")["name"] == "Power" and b.net_class_of("IN")["name"] == "Default"
    (track,) = edit(board, {"op": "add_track", "points": ["J1:3", [112, 117.54], [112, 111.5], [122, 111.5]], "net": "GND"})
    assert track["width"] == 0.6  # the class's track width is the default
    assert errors(drc(board)[1]).get("clearance", 0) > 0  # 2 mm from GND is more than this layout has


def test_set_net_class_without_a_project_file(tmp_path, board):
    os.unlink(os.path.splitext(board)[0] + ".kicad_pro")
    edit(board, {"op": "set_net_class", "name": "Power", "nets": ["GND", "VBUS"], "track_width": 0.5})
    pro = json.load(open(os.path.splitext(board)[0] + ".kicad_pro"))
    assert pro["meta"]["filename"] == "rc_board.kicad_pro"
    assert {"netclass": "Power", "pattern": "GND"} in pro["net_settings"]["netclass_patterns"]
    assert Board(board).net_class_of("GND")["track_width"] == 0.5


# ---- copper --------------------------------------------------------------------------

@needs_kicad_cli
def test_add_track_routes_a_connection(board):
    (track,) = edit(board, {"op": "add_track", "points": ["J1:1", [110, 110], "R1:1"]})
    assert track["net"] == "IN" and track["layer"] == "F.Cu" and len(track["segments"]) == 2
    unrouted, other = drc(board)
    assert unrouted == 3 and not errors(other)


@needs_kicad_cli
def test_add_track_across_another_pad_shorts(board):
    edit(board, {"op": "add_track", "points": ["J1:1", [105, 118.5]], "net": "IN"})  # runs over J1:2 and J1:3
    assert "shorting_items" in errors(drc(board)[1])


def test_add_track_checks_pads(board):
    b = Board(board)
    with pytest.raises(PcbError, match="R1:2 is on net 'OUT', not 'IN'"):
        b.apply({"op": "add_track", "points": ["J1:1", "R1:2"], "net": "IN"})
    with pytest.raises(PcbError, match="R1:1 is on F.Cu, not B.Cu"):
        b.apply({"op": "add_track", "points": ["J1:1", "R1:1"], "layer": "B.Cu"})
    with pytest.raises(PcbError, match="net 'VCC' does not exist"):
        b.apply({"op": "add_track", "points": [[1, 1], [2, 2]], "net": "VCC"})
    with pytest.raises(PcbError, match="R1 has no pad '3'"):
        b.apply({"op": "add_track", "points": ["R1:3", [2, 2]]})


@needs_kicad_cli
def test_add_via_joins_layers(board):
    edit(board, {"op": "add_track", "points": ["C1:2", [134, 117.225]]},
         {"op": "add_via", "x": 134, "y": 117.225, "net": "GND"},
         {"op": "add_track", "points": [[134, 117.225], [134, 125], [105, 125], "J1:3"], "layer": "B.Cu"})
    unrouted, other = drc(board)
    assert unrouted == 3 and not errors(other)
    (via,) = [t for t in Board(board).tracks() if t["kind"] == "via"]
    assert via["size"] == 0.6 and via["drill"] == 0.3 and via["layers"] == ["F.Cu", "B.Cu"]


@needs_kicad_cli
def test_add_zone_connects_through_the_pour(board):
    edit(board, {"op": "add_track", "points": ["C1:2", [134, 117.225]]},
         {"op": "add_via", "x": 134, "y": 117.225, "net": "GND"},
         {"op": "add_zone", "net": "GND", "layer": "B.Cu"})
    (zone,) = Board(board).zones()
    assert zone["net"] == "GND" and zone["layers"] == ["B.Cu"] and zone["bbox"] == [100.0, 100.0, 150.0, 130.0]
    unrouted, other = drc(board)  # zones present: refilled before the check
    assert unrouted == 3 and not errors(other)


@needs_kicad_cli
def test_add_keepout(board):
    edit(board, {"op": "add_track", "points": ["J1:1", [110, 110], "R1:1"]},
         {"op": "add_keepout", "outline": [[108, 108], [112, 108], [112, 112], [108, 112]]})
    assert "items_not_allowed" in errors(drc(board)[1])
    (zone,) = Board(board).zones()
    assert zone["keepout"] == ["tracks", "vias", "pads", "copperpour"] and zone["layers"] == ["F.Cu", "B.Cu"]


# ---- silkscreen ----------------------------------------------------------------------

@needs_kicad_cli
def test_add_text(board):
    edit(board, {"op": "add_text", "text": "RC v1", "x": 140, "y": 104},
         {"op": "add_text", "text": "BACK", "x": 140, "y": 125, "layer": "B.SilkS"})
    assert not drc(board)[1]
    texts = Board(board).texts()
    assert [t["layer"] for t in texts] == ["F.SilkS", "B.SilkS"]
    edit(board, {"op": "add_text", "text": "TINY", "x": 140, "y": 110, "size": 0.5})
    assert ("warning", "text_height") in drc(board)[1]


@needs_kicad_cli
def test_set_reference_text(board):
    (ref,) = edit(board, {"op": "set_reference_text", "reference": "R1", "size": 0.5})
    assert ref["at"] == [120.0, 108.57]
    assert drc(board)[1] == Counter({("warning", "text_height"): 1})
    edit(board, {"op": "set_reference_text", "reference": "R1", "size": 1, "x": 120.8, "y": 110})  # onto pad 2
    assert ("warning", "silk_over_copper") in drc(board)[1]
    edit(board, {"op": "set_reference_text", "reference": "R1", "x": 120, "y": 107.5, "hide": True})
    assert not drc(board)[1]
    assert Board(board).footprint("R1").field("Reference").find("hide") is not None


# ---- removal and batches -------------------------------------------------------------

@needs_kicad_cli
def test_remove_item(board):
    (track,) = edit(board, {"op": "add_track", "points": ["J1:1", [110, 110], "R1:1"]})
    assert drc(board)[0] == 3
    edit(board, *({"op": "remove_item", "uuid": u} for u in track["segments"]))
    assert drc(board)[0] == 4
    edit(board, {"op": "remove_item", "uuid": Board(board).footprint("C1").uuid})
    unrouted, other = drc(board)
    assert unrouted == 2 and not errors(other)
    with pytest.raises(PcbError, match="no item with uuid"):
        edit(board, {"op": "remove_item", "uuid": "nope"})


@needs_kicad_cli
@needs_footprints
def test_add_footprint_and_pad_nets(board):
    """The building block for schematic → board sync: a library footprint, placed, with nets on its pads."""
    b = Board(board)
    fp = b.add_footprint(FootprintLibraries().load("Resistor_SMD:R_0603_1608Metric"), "R2", 125, 122, rotation=90,
                         value="1k", lib_id="Resistor_SMD:R_0603_1608Metric")
    b.set_pad_net("R2", "1", "IN")
    b.set_pad_net("R2", "2", "VDD")  # a new net
    b.save()
    assert fp.reference == "R2" and "VDD" in Board(board).nets()
    pads = kicad_pads(board)
    assert pads[("R2", "1")] == pytest.approx(tuple(Board(board).footprint("R2").pad("1")["at"]), abs=0.003)
    unrouted, other = drc(board)
    assert unrouted == 5 and not errors(other)  # R2:1 joins IN; VDD has a single pad


@needs_kicad_cli
def test_toolbox_edit_is_atomic_and_read_reports_unrouted(board):
    pro = os.path.splitext(board)[0] + ".kicad_pro"
    before = (open(board).read(), open(pro).read())
    tb = Toolbox()
    with pytest.raises(ToolError, match="operation 1 .*nothing was written"):
        tb.call("edit_pcb", {"path": board, "operations": [{"op": "set_design_rules", "min_clearance": 0.3},
                                                             {"op": "move_footprint", "reference": "U9", "x": 0, "y": 0}]})
    assert (open(board).read(), open(pro).read()) == before
    dry = tb.call("edit_pcb", {"path": board, "dry_run": True, "operations": [{"op": "add_track", "points": ["J1:1", "R1:1"]}]})
    assert dry["written"] is False and dry["files"] == [] and open(board).read() == before[0]
    done = tb.call("edit_pcb", {"path": board, "operations": [{"op": "add_track", "points": ["J1:1", [110, 110], "R1:1"]},
                                                              {"op": "set_net_class", "name": "Power", "nets": ["GND"], "track_width": 0.5}]})
    assert done["files"] == [board, pro] and done["changes"][0].startswith("track on IN")
    read = tb.call("read_pcb", {"path": board})
    assert read["drc"]["unrouted"] == 3 and read["drc"]["errors"] == 3  # unrouted connections count as errors
    assert read["counts"]["segments"] == 2
    assert any(c["name"] == "Power" and c["nets"] == ["GND"] for c in read["net_classes"])


@needs_kicad_cli
@needs_footprints
def test_kicad_keeps_every_edit_when_it_resaves_the_board(board, tmp_path):
    edit(board,
         {"op": "set_board_outline", "width": 50, "height": 30, "corner_radius": 2},
         {"op": "add_mounting_hole", "x": 104, "y": 126},
         {"op": "move_footprint", "reference": "C1", "side": "back"},
         {"op": "lock_footprint", "reference": "J1"},
         {"op": "add_track", "points": ["J1:1", [110, 110], "R1:1"]},
         {"op": "add_via", "x": 128, "y": 118.775, "net": "OUT"},
         {"op": "add_zone", "net": "GND", "layer": "B.Cu"},
         {"op": "add_keepout", "outline": [[140, 120], [145, 120], [145, 125], [140, 125]]},
         {"op": "add_text", "text": "RC v1", "x": 140, "y": 104})
    ours = parse(open(board).read()).root
    theirs = kicad_resave(board, tmp_path)
    kinds = ("footprint", "segment", "via", "zone", "gr_text", "gr_rect")
    assert Counter(i.head for i in theirs.lists() if i.head in kinds) == Counter(i.head for i in ours.lists() if i.head in kinds)
    rect = theirs.find("gr_rect")
    assert rect.child_value("radius") == "2"


# ---- KiCad 9 boards (numbered nets) --------------------------------------------------

@needs_kicad_cli
def test_numbered_net_board(tmp_path):
    path = demo(tmp_path, "ecc83/ecc83-pp.kicad_pcb")
    b = Board(path)
    assert b.numbered_nets and b.summary()["format"]["nets"] == "numbered"
    seg = next(t for t in b.tracks() if t["net"] == "Net-(P3-P1)")
    edit(path, {"op": "remove_item", "uuid": seg["uuid"]})
    assert drc(path)[0] == 1
    edit(path, {"op": "add_track", "points": [seg["start"], seg["end"]], "net": seg["net"], "layer": seg["layer"], "width": seg["width"]},
         {"op": "add_zone", "net": "GND", "layer": "F.Cu", "outline": [[150, 92], [170, 92], [170, 100], [150, 100]], "priority": 1},
         {"op": "set_board_outline", "width": 52.07, "height": 46.355, "corner_radius": 3})
    unrouted, other = drc(path)
    assert unrouted == 0 and "invalid_outline" not in errors(other)
    text = open(path).read()
    assert '(net 2)' in text and '(net_name "GND")' in text
    assert len(Board(path).outline_items()) == 8  # no rounded rectangles before KiCad 10: lines and arcs
