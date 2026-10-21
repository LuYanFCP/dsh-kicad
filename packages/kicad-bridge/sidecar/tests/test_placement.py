"""Initial placement by functional block (#12), judged by KiCad's DRC (courtyards_overlap, silkscreen, copper to
edge, schematic parity), by the checks KiCad's DRC lacks (footprints outside the outline, connectors on the edge)
and by the ratsnest metric against random placement (the eval metric: printed with ``pytest -s``)."""
import math
import os
import random
import shutil
import statistics

import pytest

from dsh_kicad_sidecar.footprints import FootprintLibraries
from dsh_kicad_sidecar.kicad_cli import KiCadCli
from dsh_kicad_sidecar.netlist import read_netlist
from dsh_kicad_sidecar.pcb import Board, PcbError
from dsh_kicad_sidecar.pcb_sync import update_pcb
from dsh_kicad_sidecar.placement import (SIDES, _edge_overhang, _farads, _make_part, auto_place, check_placement, is_ground,
                                         is_power, place_block, ratsnest_length)
from dsh_kicad_sidecar.schematic import Schematic
from dsh_kicad_sidecar.tools import TOOL_SPECS, ToolError, Toolbox

from conftest import FIXTURES, needs_kicad_cli
from test_pcb_sync import needs_footprints

BLOCKS = {"USB INPUT": ["J1", "R4", "R5"], "PWR SUPPLY": ["C1", "C2", "D1", "R1", "U2"], "MCU": ["C3", "R3", "U1"],
          "ISP": ["J2"], "UI": ["D2", "R2", "SW1"]}
# What the placement must never leave for KiCad's DRC to find (unrouted connections are #13's job).
PLACEMENT_DRC = ("courtyards_overlap", "silk_over_copper", "silk_overlap", "silk_edge_clearance", "copper_edge_clearance",
                 "pth_inside_courtyard", "npth_inside_courtyard", "clearance", "shorting_items", "solder_mask_bridge")


@pytest.fixture(scope="module")
def cli():
    return KiCadCli()


@pytest.fixture(scope="module")
def synced(tmp_path_factory, cli):
    """Boards fresh from kicad_update_pcb (parts packed in rows), one per fixture; tests work on copies."""
    if needs_kicad_cli.args[0] or needs_footprints.args[0]:
        pytest.skip("needs kicad-cli and KiCad's footprint libraries")
    out = {}
    for name in ("usb_attiny", "usb_attiny_blocks"):
        d = tmp_path_factory.mktemp(name) / name
        shutil.copytree(os.path.join(FIXTURES, name), d)
        update_pcb(cli, str(d / f"{name}.kicad_sch"), drc=False)
        out[name] = str(d / f"{name}.kicad_pcb")
    return out


def board_copy(synced, name, tmp_path) -> str:
    dst = tmp_path / name
    shutil.copytree(os.path.dirname(synced[name]), dst)
    return str(dst / f"{name}.kicad_pcb")


def kicad_findings(cli, path):
    report = cli.drc(path, "all", schematic_parity=True)
    parity = [v for v in report["violations"] if v.get("category") == "schematic_parity"]
    return report, {t: n for t, n in report["by_type"].items() if t in PLACEMENT_DRC}, parity


def random_ratsnest(path, seeds=20):
    """Mean ratsnest of footprints dropped at random positions and rotations inside the same outline."""
    values = []
    for seed in range(seeds):
        b = Board(path)
        x0, y0, x1, y1 = b.outline()["bbox"]
        rng = random.Random(seed)
        for fp in b.footprints():
            b._place(fp, rng.uniform(x0, x1), rng.uniform(y0, y1), rng.choice([0, 90, 180, 270]))
        values.append(ratsnest_length(b)["total"])
    return statistics.mean(values)


def pad_at(board, ref_pad):
    ref, number = ref_pad.split(":")
    return board.footprint(ref).pad(number)["at"]


def positions(path):
    return {fp.reference: (fp.at, fp.side) for fp in Board(path).footprints()}


# ---- the acceptance board -------------------------------------------------------------------

@needs_kicad_cli
def test_blocks_fixture_is_usb_attiny_with_frames(cli):
    """The fixture differs from usb_attiny only by the frames (and R1/D1 moved): same ERC, same nets."""
    blocks = os.path.join(FIXTURES, "usb_attiny_blocks", "usb_attiny_blocks.kicad_sch")
    plain = os.path.join(FIXTURES, "usb_attiny", "usb_attiny.kicad_sch")
    assert cli.erc(blocks)["counts"]["error"] == 0

    def nets(path):
        return sorted((n.name, tuple(sorted(n.nodes))) for n in read_netlist(cli, path).nets)

    assert nets(blocks) == nets(plain)
    assert {b["title"]: b["references"] for b in Schematic(blocks).blocks()} == BLOCKS


@pytest.mark.parametrize("name", ["usb_attiny_blocks", "usb_attiny"])
def test_auto_place_passes_kicads_drc(cli, synced, tmp_path, name):
    """usb-attiny85: 0 courtyard overlaps, every footprint inside the outline, USB-C on the board edge."""
    path = board_copy(synced, name, tmp_path)
    board = Board(path)
    result = auto_place(board)
    board.save()
    assert result["placed"] == 15
    assert result["outline"]["mode"] == "fit"  # kicad_update_pcb's placeholder outline is replaced
    checks = result["checks"]
    assert checks["courtyard_overlaps"] == [] and checks["outside_outline"] == [] and checks["reference_over_pads"] == []
    report, findings, parity = kicad_findings(cli, path)
    assert findings == {}, report["violations"]
    assert parity == []
    assert report["unrouted"] == 39  # placement moves parts, it does not change what must be connected
    placed = Board(path)
    outline = tuple(placed.outline()["bbox"])
    j1 = placed.footprint("J1")
    side, overhang = _edge_overhang(j1, outline)  # the USB-C's "PCB Edge" mark lies on the outline
    assert result["edge_connectors"]["J1"] == side
    assert checks["overhang"] == {"J1": {"side": side, "mm": 0.5}}  # its courtyard reaches 0.5 mm past the mark
    assert overhang == pytest.approx(0.5)
    if name == "usb_attiny_blocks":
        assert {g["title"]: g["references"] for g in result["groups"]} == BLOCKS


def test_groups_follow_blocks_and_heuristics(synced, tmp_path):
    """Without blocks the parts gather around ICs and connectors; decoupling capacitors sit at their IC's
    power pin, the CC resistors at the USB-C, both connectors on an edge."""
    path = board_copy(synced, "usb_attiny", tmp_path)
    board = Board(path)
    result = auto_place(board)
    groups = {g["title"].split()[0]: set(g["references"]) for g in result["groups"]}
    assert {"C3", "R3", "U1"} <= groups["U1"]
    assert {"C1", "C2", "U2"} <= groups["U2"]
    assert {"R4", "R5", "J1"} <= groups["J1"]
    assert set(result["edge_connectors"]) == {"J1", "J2"}
    assert math.dist(pad_at(board, "C3:1"), pad_at(board, "U1:8")) < 4.5  # 100n on VCC
    assert math.dist(pad_at(board, "C1:1"), pad_at(board, "U2:3")) < 6  # input capacitor on VI
    assert math.dist(pad_at(board, "C2:1"), pad_at(board, "U2:2")) < 6  # output capacitor on VO
    outline = tuple(board.outline()["bbox"])
    j2 = board.footprint("J2").courtyard()
    assert min(abs(j2[0] - outline[0]), abs(j2[1] - outline[1]), abs(outline[2] - j2[2]), abs(outline[3] - j2[3])) < 1.0


def test_ratsnest_clearly_shorter_than_random(synced, tmp_path):
    """The eval metric: total ratsnest after auto_place against random placement in the same outline (and the
    sync's rows). Measured on KiCad 10.0.7: about 0.6 × random here, 0.3 × on the 57–68 part KiCad demos."""
    for name in ("usb_attiny_blocks", "usb_attiny"):
        path = board_copy(synced, name, tmp_path)
        board = Board(path)
        result = auto_place(board)
        board.save()
        after = result["ratsnest_mm"]["after"]
        rows = result["ratsnest_mm"]["before"]
        rand = random_ratsnest(path)
        print(f"\n{name}: ratsnest {after} mm after auto_place, {rows} mm in the sync's rows, {rand:.1f} mm random (mean of 20)")
        assert after == ratsnest_length(Board(path))["total"]
        assert after < 0.7 * rand
        assert after < 0.6 * rows


def test_ratsnest_length_is_the_minimum_spanning_tree():
    board = Board(os.path.join(FIXTURES, "rc_board", "rc_board.kicad_pcb"))
    nets = ratsnest_length(board)["nets"]
    assert nets["IN"] == round(math.dist(pad_at(board, "J1:1"), pad_at(board, "R1:1")), 3)
    a, b, c = (pad_at(board, p) for p in ("J1:2", "R1:2", "C1:1"))
    tree = min(math.dist(a, b) + math.dist(b, c), math.dist(a, b) + math.dist(a, c), math.dist(a, c) + math.dist(b, c))
    assert nets["OUT"] == pytest.approx(tree, abs=1e-3)
    assert ratsnest_length(board)["total"] == pytest.approx(sum(nets.values()), abs=0.01)


def test_auto_place_is_deterministic(synced, tmp_path):
    first, second = (board_copy(synced, "usb_attiny_blocks", tmp_path / n) for n in ("a", "b"))
    for path in (first, second):
        board = Board(path)
        auto_place(board)
        board.save()
    assert positions(first) == positions(second)


# ---- outlines, locked and staged parts -------------------------------------------------------

def test_keep_places_inside_the_users_outline(cli, synced, tmp_path):
    path = board_copy(synced, "usb_attiny_blocks", tmp_path)
    board = Board(path)
    board.set_board_outline(width=50, height=40, x=100, y=100)
    result = auto_place(board)  # a drawn outline is kept by default
    board.save()
    assert result["outline"] == {"mode": "keep", "bbox": [100, 100, 150, 140]}
    assert result["checks"]["outside_outline"] == [] and result["checks"]["courtyard_overlaps"] == []
    assert _edge_overhang(Board(path).footprint("J1"), (100, 100, 150, 140)) is not None
    assert kicad_findings(cli, path)[1] == {}

    small = Board(path)
    small.set_board_outline(width=15, height=12, x=100, y=100)
    with pytest.raises(PcbError, match="does not fit"):
        auto_place(small)
    with pytest.raises(PcbError, match="outline must be"):
        auto_place(small, outline="grow")


def test_locked_footprints_stay(synced, tmp_path):
    path = board_copy(synced, "usb_attiny_blocks", tmp_path)
    board = Board(path)
    board.lock_footprint("U1")
    at = board.footprint("U1").at
    result = auto_place(board)
    assert board.footprint("U1").at == at
    assert result["placed"] == 14
    assert result["checks"]["courtyard_overlaps"] == [] and result["checks"]["outside_outline"] == []


def test_places_only_the_listed_footprints(synced, tmp_path):
    """New parts staged by kicad_update_pcb: auto_place{references} fits them in, the rest stays."""
    path = board_copy(synced, "usb_attiny_blocks", tmp_path)
    board = Board(path)
    auto_place(board)
    board.move_footprint("R2", 200, 100)  # as if a sync had just staged it right of the board
    before = {fp.reference: fp.at for fp in board.footprints()}
    result = auto_place(board, references=["R2"])
    assert result["placed"] == 1 and result["outline"]["mode"] == "keep"
    assert {fp.reference: fp.at for fp in board.footprints() if fp.reference != "R2"} == {k: v for k, v in before.items() if k != "R2"}
    assert result["checks"]["outside_outline"] == [] and result["checks"]["courtyard_overlaps"] == []
    assert math.dist(pad_at(board, "R2:2"), pad_at(board, "D2:2")) < 8
    with pytest.raises(PcbError, match="no footprint R99"):
        auto_place(board, references=["R99"])


def test_mounting_holes_go_to_the_corners(synced, tmp_path):
    path = board_copy(synced, "usb_attiny_blocks", tmp_path)
    board = Board(path)
    for i in range(4):
        board.add_mounting_hole(150 + 10 * i, 150)
    result = auto_place(board)
    assert result["placed"] == 19
    assert result["checks"]["courtyard_overlaps"] == [] and result["checks"]["outside_outline"] == []
    x0, y0, x1, y1 = board.outline()["bbox"]
    corners = set()
    for ref in ("H1", "H2", "H3", "H4"):
        x, y, _ = board.footprint(ref).at
        corners.add((x < (x0 + x1) / 2, y < (y0 + y1) / 2))
        assert min(x - x0, x1 - x) < 6 and min(y - y0, y1 - y) < 6
    assert len(corners) == 4


# ---- place_block ----------------------------------------------------------------------------

def test_place_block(synced, tmp_path):
    path = board_copy(synced, "usb_attiny_blocks", tmp_path)
    board = Board(path)
    auto_place(board)
    result = place_block(board, title="UI", x=110, y=150)
    assert result["references"] == ["D2", "R2", "SW1"]
    assert result["box"][:2] == pytest.approx([110, 150], abs=0.06)
    box = result["box"]
    for ref in ("D2", "R2", "SW1"):
        c = board.footprint(ref).courtyard()
        assert box[0] - 1e-3 <= c[0] and c[2] <= box[2] + 1e-3

    usb = place_block(board, title="USB INPUT", x=60, y=100, width=20, height=20, face="left")
    j1 = _make_part(board.footprint("J1"), False)
    assert usb["face"] == "left" and j1.shape.turned(board.footprint("J1").at[2]).face == "left"
    assert board.footprint("J1").courtyard()[0] <= 60.0  # its edge mark sits on the rectangle's left side

    with pytest.raises(PcbError, match=r"block PWR SUPPLY does not fit in 4 × 4 mm \(laid out it needs about [\d.]+ × [\d.]+ mm\)"):
        place_block(board, title="PWR SUPPLY", x=60, y=60, width=4, height=4)
    with pytest.raises(PcbError, match="no block titled 'POWER'.*'USB INPUT'"):
        place_block(board, title="POWER", x=0, y=0)
    adhoc = place_block(board, references=["R4", "R5"], x=70, y=70)
    assert adhoc["block"] == "R4, R5"


# ---- the tool -------------------------------------------------------------------------------

def test_edit_pcb_runs_placement_ops(synced, tmp_path):
    path = board_copy(synced, "usb_attiny_blocks", tmp_path)
    box = Toolbox(roots=[str(tmp_path)])
    ops = next(s for s in TOOL_SPECS if s.name == "edit_pcb").schema["properties"]["operations"]["items"]
    assert {"auto_place", "place_block", "move_footprint"} <= set(ops["properties"]["op"]["enum"])
    before = open(path).read()
    dry = box.call("edit_pcb", {"path": path, "operations": [{"op": "auto_place"}], "dry_run": True})
    assert dry["written"] is False and open(path).read() == before
    out = box.call("edit_pcb", {"path": path, "operations": [{"op": "auto_place"}, {"op": "move_footprint", "reference": "D1", "rotation": 90}]})
    assert out["written"] and any(c.startswith("auto_place: 15 footprint(s) in 5 group(s): ") for c in out["changes"])
    assert out["results"][0]["result"]["edge_connectors"]["J1"] in SIDES
    with pytest.raises(ToolError, match=r"operation 0 \(place_block\) failed, nothing was written: no block titled 'NOPE'"):
        box.call("edit_pcb", {"path": path, "operations": [{"op": "place_block", "title": "NOPE", "x": 0, "y": 0}]})
    with pytest.raises(ToolError, match="bad arguments for auto_place"):
        box.call("edit_pcb", {"path": path, "operations": [{"op": "auto_place", "spacing": 3}]})
    read = box.call("read_pcb", {"path": path, "drc": False})
    assert read["placement"]["courtyard_overlaps"] == [] and read["placement"]["outside_outline"] == []
    assert read["placement"]["ratsnest_mm"] > 0


def test_render_3d(synced, tmp_path):
    path = board_copy(synced, "usb_attiny_blocks", tmp_path)
    out = Toolbox(roots=[str(tmp_path)]).call("render", {"path": path, "view": "3d", "width": 640})
    assert out["svg"] == [] and out["png"][0].endswith("usb_attiny_blocks-3d-top.png") and os.path.getsize(out["png"][0]) > 1000
    with pytest.raises(ToolError, match="view 3d needs a .kicad_pcb"):
        Toolbox().call("render", {"path": path.replace(".kicad_pcb", ".kicad_sch"), "view": "3d"})


# ---- pieces ---------------------------------------------------------------------------------

def test_check_placement_flags_overlaps_and_parts_outside(tmp_path):
    path = tmp_path / "rc_board.kicad_pcb"
    shutil.copyfile(os.path.join(FIXTURES, "rc_board", "rc_board.kicad_pcb"), path)
    board = Board(str(path))
    assert check_placement(board)["courtyard_overlaps"] == [] and check_placement(board)["outside_outline"] == []
    board.move_footprint("C1", 160, 118)
    board.move_footprint("R1", 105.5, 112.46)
    checks = check_placement(board)
    assert checks["outside_outline"] == ["C1"]
    assert checks["courtyard_overlaps"] == [["J1", "R1"]]


@needs_footprints
def test_connector_faces():
    """The side a connector's mating end faces: the footprint's "PCB Edge" mark, else where its body reaches."""
    board = Board(os.path.join(FIXTURES, "rc_board", "rc_board.kicad_pcb"), libraries=FootprintLibraries(None))
    expect = {"Connector_USB:USB_C_Receptacle_GCT_USB4125-xx-x_6P_TopMnt_Horizontal": ("bottom", 3.4, True),
              "Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Horizontal": ("right", 10.54, False),
              "Connector_PinHeader_2.54mm:PinHeader_2x03_P2.54mm_Vertical_SMD": (None, 0.0, False)}
    for lib_id, (face, at, mark) in expect.items():
        fp = board.add_footprint(board.libraries.load(lib_id), "J9", 0, 0, lib_id=lib_id)
        shape = _make_part(fp, False).shape
        assert (shape.face, round(shape.face_at, 3), shape.mark) == (face, at, mark), lib_id
        if face:
            turned = shape.turned(90)  # counter-clockwise: what faced down now faces right
            assert turned.face == SIDES[(SIDES.index(face) + 1) % 4] and turned.face_at == pytest.approx(at)
        board.remove_item(fp.uuid)


def test_net_and_value_helpers():
    assert _farads("100n") == pytest.approx(1e-7) and _farads("4.7uF") == pytest.approx(4.7e-6) and _farads("10µ") == pytest.approx(1e-5)
    assert _farads("DNP") == math.inf
    assert all(is_ground(n) for n in ("GND", "/GNDA", "AGND", "VSS", "/power/GND"))
    assert not any(is_ground(n) for n in ("/MOSI", "Net-(D1-A)", "+3V3"))
    assert all(is_power(n) for n in ("+3V3", "+5V", "VBUS", "/VCC", "VDD_IO", "12V"))
    assert not any(is_power(n) for n in ("/MOSI", "GND", "/nRESET", "/CC1"))
