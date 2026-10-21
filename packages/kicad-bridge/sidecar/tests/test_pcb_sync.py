"""Schematic → board sync (kicad_update_pcb), judged by KiCad: ``kicad-cli pcb drc --schematic-parity`` for the
link between board and schematic, ``kicad-cli pcb upgrade --force`` (a KiCad re-save) for the file text, and
KiCad's IPC-D-356 export for pad positions."""
import os
import re
import shutil
import subprocess

import pytest

from dsh_kicad_sidecar.footprints import FootprintLibraries, default_footprint_dirs
from dsh_kicad_sidecar.kicad_cli import KiCadCli, find_kicad_cli
from dsh_kicad_sidecar.lib_tables import LibTable
from dsh_kicad_sidecar.netlist import Netlist, NetlistComponent, NetlistPin, read_netlist
from dsh_kicad_sidecar.pcb import Board
from dsh_kicad_sidecar.pcb_sync import SyncRefused, apply_sync, create_board, native_version, plan_sync, stackup, update_pcb
from dsh_kicad_sidecar.schematic import Schematic
from dsh_kicad_sidecar.tools import ToolError, Toolbox

from conftest import needs_kicad_cli, needs_symbols

DEMOS = os.environ.get("KICAD_DEMOS", "/usr/share/kicad/demos")
needs_footprints = pytest.mark.skipif(not default_footprint_dirs(), reason="KiCad footprint libraries not installed")


@pytest.fixture(scope="module")
def cli():
    return KiCadCli()


def demo(tmp_path, rel, keep_board=True):
    """A copy of a KiCad demo project; returns its schematic."""
    src = os.path.join(DEMOS, rel)
    if not os.path.isfile(src):
        pytest.skip(f"KiCad demo {rel} not installed")
    dst = tmp_path / "demo"
    shutil.copytree(os.path.dirname(src), dst)
    if not keep_board:
        for name in os.listdir(dst):
            if name.endswith(".kicad_pcb"):
                os.unlink(dst / name)
    return str(dst / os.path.basename(src))


def resaved_identical(path, tmp_path):
    """Does KiCad, loading and saving the board, write the same bytes? (the regression test the design asks for)"""
    copy = tmp_path / "resaved" / os.path.basename(path)
    os.makedirs(copy.parent, exist_ok=True)
    shutil.copyfile(path, copy)
    subprocess.run([find_kicad_cli()[0], "pcb", "upgrade", "--force", str(copy)], check=True, capture_output=True)
    return copy.read_text(encoding="utf-8") == open(path, encoding="utf-8").read()


def placement(path):
    return {fp.reference: (fp.at, fp.side, fp.locked) for fp in Board(path).footprints()}


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


USB_ATTINY_REFS = ["C1", "C2", "C3", "D1", "D2", "J1", "J2", "R1", "R2", "R3", "R4", "R5", "SW1", "U1", "U2"]


# ---- creating a board --------------------------------------------------------------------

def test_default_stackup_matches_kicads_formula():
    def layers(n):
        return [(l.value(0), l.child_value("type"), l.child_value("thickness")) for l in stackup(n).lists("layer")]

    two = layers(2)
    assert [name for name, _, _ in two] == ["F.SilkS", "F.Paste", "F.Mask", "F.Cu", "dielectric 1", "B.Cu", "B.Mask",
                                            "B.Paste", "B.SilkS"]
    assert ("dielectric 1", "core", "1.51") in two  # 1.6 mm board − 2 × 35 µm copper − 2 × 10 µm mask
    four = layers(4)
    assert [(n, t, th) for n, t, th in four if n.startswith(("In", "dielectric"))] == [
        ("dielectric 1", "core", "0.48"), ("In1.Cu", "copper", "0.035"), ("dielectric 2", "prepreg", "0.48"),
        ("In2.Cu", "copper", "0.035"), ("dielectric 3", "core", "0.48")]


@needs_kicad_cli
@needs_footprints
def test_creates_the_usb_attiny_board(project, cli, tmp_path):
    sch = project("usb_attiny")
    r = update_pcb(cli, sch)
    pcb = r["pcb"]
    assert pcb == sch[:-4] + "_pcb" and r["created"] and r["written"] and r["files"] == [pcb]
    assert r["counts"] == {"created": 1, "added": 15, "outline": 1}
    # KiCad's verdict: every symbol is on the board with its nets and fields, and nothing else is wrong.
    assert r["parity"] == {"total": 0, "by_type": {}} and r["drc"]["parity"] == 0
    assert {v["type"] for v in r["drc"]["violations"]} == {"unconnected_items"} and r["drc"]["unrouted"] == 39
    b = Board(pcb)
    assert b.version == native_version(cli) and not b.numbered_nets
    assert sorted(fp.reference for fp in b.footprints()) == USB_ATTINY_REFS
    x0, y0, x1, y1 = b.outline()["bbox"]
    assert all(x0 < c[0] and y0 < c[1] and c[2] < x1 and c[3] < y1 for c in (fp.courtyard() for fp in b.footprints()))
    assert [l.value(0) for l in b.root.find("setup").find("stackup").lists("layer")][3:6] == ["F.Cu", "dielectric 1", "B.Cu"]
    j1 = b.footprint("J1")
    assert {p["number"]: p["net"] for p in j1.pads()}["SH"] == "GND"  # all four shield pads share pin SH's net
    assert not any(p.value(0) == "KiLib_Generator" for fp in b.footprints() for p in fp.node.lists("property"))
    # What the sync writes is what KiCad writes: a KiCad re-save changes no byte.
    assert resaved_identical(pcb, tmp_path)
    # Idempotent: a second run plans nothing and does not touch the file.
    text = open(pcb).read()
    again = update_pcb(cli, sch)
    assert (again["changes"], again["written"], again["flagged"]) == ([], False, []) and open(pcb).read() == text
    assert again["parity"]["total"] == 0


@needs_kicad_cli
@needs_footprints
def test_four_layer_board(project, cli, tmp_path):
    r = update_pcb(cli, project("usb_attiny"), copper_layers=4)
    b = Board(r["pcb"])
    assert set(b.copper_layers()) == {"F.Cu", "In1.Cu", "In2.Cu", "B.Cu"} and r["board"]["copper_layers"] == b.copper_layers()
    assert len(list(b.root.find("setup").find("stackup").lists("layer"))) == 13
    assert r["parity"]["total"] == 0
    assert resaved_identical(r["pcb"], tmp_path)


@needs_kicad_cli
@needs_footprints
def test_dry_run_writes_nothing(project, cli):
    sch = project("usb_attiny")
    dry = update_pcb(cli, sch, dry_run=True)
    assert dry["created"] and not dry["written"] and not os.path.exists(dry["pcb"]) and "drc" not in dry
    assert len([c for c in dry["changes"] if c.startswith("added ")]) == 15
    update_pcb(cli, sch, drc=False)
    s = Schematic(sch)
    s.set_property("R2", "Value", "470")
    s.save()
    text = open(dry["pcb"]).read()
    dry = update_pcb(cli, sch, dry_run=True)
    assert dry["changes"] == ["R2: Value '330' → '470'"] and not dry["written"] and open(dry["pcb"]).read() == text


# Stock footprints that each needed a rule to come out the way KiCad writes them (found by placing one
# footprint of every library, 20 times over, and comparing with KiCad's re-save).
TRICKY_FOOTPRINTS = [
    "Button_Switch_SMD:SW_DIP_SPSTx01_Slide_Omron_A6S-110x_W8.9mm_P2.54mm",  # (point) goes before the pads
    "Connector_Coaxial:SMA_Amphenol_901-143_Horizontal",                    # (zone_layer_connections) on a board
    "Connector_PCBEdge:SODIMM-200_1.8V_Card_edge",                           # In1.Cu … In30.Cu trimmed; inner-only keepouts go
    "RF_Module:Atmel_ATSAMR21G18-MR210UA_NoRFPads",                          # … down to one layer: (layer …)
    "RF_Module:ESP32-WROOM-32",                                              # keepout zone in board coordinates
    "Package_SIP:SIP4_Sharp-SSR_P7.62mm_Angled_NoHole",                      # identical lines, ordered by uuid
    "Sensor_Pressure:Honeywell_ABPDAN",                                      # text boxes, ordered by uuid
    "Module:RaspberryPi_Pico_SMD",                                           # groups over different layers
    "Module:RaspberryPi_Pico_Common_SMD",                                    # keepouts with arcs keep the library's order
    "Heatsink:Heatsink_AAVID_590302B03600G",                                 # groups
    "Symbol:Smolhaj_Scale_0.1",                                              # a dimension and its text share a uuid
    "Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",  # library uuids replaced
    "Package_DFN_QFN:QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm_ThermalVias",       # 48 pins: (pins …) wraps at column 72
]


@needs_kicad_cli
@needs_footprints
def test_tricky_library_footprints_come_out_as_kicad_writes_them(cli, tmp_path):
    table = LibTable("fp", str(tmp_path), 10)
    comps = []
    for n, lib_id in enumerate(TRICKY_FOOTPRINTS):
        try:
            path = table.resolve(lib_id)
        except LookupError:
            pytest.skip(f"{lib_id} is not in this KiCad's libraries")
        pads = list(dict.fromkeys(re.findall(r'\(pad "((?:[^"\\]|\\.)+)"', open(path, encoding="utf-8").read())))
        comps.append(NetlistComponent(
            reference=f"U{n + 1}", value=lib_id.split(":")[1], footprint=lib_id, lib_id="Device:Part",
            path=f"/00000000-0000-4000-8000-{n:012d}", sheet_name="/", sheet_file="tricky.kicad_sch",
            fields={"Datasheet": "~", "Description": "", "MPN": f"P{n}"}, flags={"dnp"} if n % 4 == 0 else set(),
            fp_filters="X*" if n % 3 == 0 else None, units=[("A", pads)],
            pins={p: NetlistPin(p, f"/N{n}_{p}", "IO", "passive") for p in pads}))
    board = create_board(cli, str(tmp_path / "tricky.kicad_pcb"))
    plan = plan_sync(board, Netlist(comps, []), table, cli=cli)
    apply_sync(plan)
    board.save()
    assert len(board.footprints()) == len(TRICKY_FOOTPRINTS)
    assert resaved_identical(board.path, tmp_path)


# ---- updating a placed and routed board --------------------------------------------------

@needs_kicad_cli
@needs_footprints
@needs_symbols
def test_resync_after_schematic_edits_keeps_the_layout(project, cli, tmp_path):
    sch = project("usb_attiny")
    pcb = update_pcb(cli, sch, drc=False)["pcb"]
    # Lay the board out the way the agent does, then let KiCad fill the zone and save it.
    b = Board(pcb, libraries=FootprintLibraries())
    for op in [
        {"op": "set_board_outline", "width": 60, "height": 40, "x": 100, "y": 100},
        {"op": "move_footprint", "reference": "U1", "x": 130, "y": 120, "rotation": 90},
        {"op": "move_footprint", "reference": "R2", "x": 120, "y": 112},
        {"op": "move_footprint", "reference": "R3", "x": 140, "y": 112, "side": "back"},
        {"op": "move_footprint", "reference": "J1", "x": 106, "y": 120, "rotation": -90},
        {"op": "lock_footprint", "reference": "J1"},
        {"op": "add_track", "points": ["R2:1", [118, 112]]},
        {"op": "add_via", "x": 150, "y": 135, "net": "GND"},
        {"op": "add_zone", "net": "GND", "layer": "B.Cu"},
        {"op": "add_mounting_hole", "x": 104, "y": 136},
    ]:
        b.apply(op)
    b.save()
    subprocess.run([find_kicad_cli()[0], "pcb", "drc", "--refill-zones", "--save-board", "-o", str(tmp_path / "drc.rpt"), pcb],
                   check=True, capture_output=True)
    laid_out = open(pcb).read()
    before = placement(pcb)
    tracks = Board(pcb).tracks()

    # An unchanged schematic changes nothing, not even on a board KiCad saved.
    same = update_pcb(cli, sch)
    assert same["changes"] == [] and not same["written"] and open(pcb).read() == laid_out
    assert same["parity"]["total"] == 0  # the board-only mounting hole is no extra footprint

    # Change a value, remove a resistor, add one, rename a net, and move a pin to another net.
    s = Schematic(sch)
    s.set_property("R2", "Value", "470")
    s.remove_symbol("R5")
    s.add_symbol("Device:R", 40.64, 140.97, reference="R6", value="10k", footprint="Resistor_SMD:R_0603_1608Metric")
    s.connect_pin_to_net("R6", "1", "+3V3", kind="power")
    s.connect_pin_to_net("R6", "2", "PB3_BTN", kind="label")
    s.apply({"op": "disconnect_pin", "pin": "R1:1"})
    s.connect_pin_to_net("R1", "1", "+5V", kind="power")
    s.save()
    with open(sch, encoding="utf-8") as fh:
        text = fh.read()
    with open(sch, "w", encoding="utf-8") as fh:
        fh.write(text.replace('(label "PB4_LED"', '(label "LED"'))

    r = update_pcb(cli, sch)
    assert r["changes"] == [
        "net /PB4_LED renamed to /LED (its tracks, vias and zones follow)",
        "R1:1 net +3V3 → +5V",
        "R2: Value '330' → '470'",
        f"added R6 (Resistor_SMD:R_0603_1608Metric) at ({r['staged'][0]['at'][0]:g}, {r['staged'][0]['at'][1]:g}), "
        "staged right of the board for placement",
    ]
    assert r["flagged"] == [f"R5 (Resistor_SMD:R_0603_1608Metric): no symbol at {Board(pcb).footprint('R5').node.child_value('path')}; "
                            "kept (delete_removed: true deletes it)"]
    assert r["parity"] == {"total": 1, "by_type": {"extra_footprint": 1}}  # R5 until it is deleted
    after = Board(pcb)
    # Placement, rotation, side and lock of every part that stays are untouched, and so is the copper.
    assert {ref: v for ref, v in placement(pcb).items() if ref != "R6"} == before
    assert {t["uuid"]: t["net"] for t in after.tracks()} == {t["uuid"]: ("/LED" if t["net"] == "/PB4_LED" else t["net"]) for t in tracks}
    assert [z["net"] for z in after.zones()] == ["GND"]
    r6 = after.footprint("R6")
    assert r6.at[0] > after.outline()["bbox"][2] and r6.at[:2] == tuple(r["staged"][0]["at"])  # staged right of the outline
    assert {p["number"]: p["net"] for p in r6.pads()} == {"1": "+3V3", "2": "/PB3_BTN"}

    deleted = update_pcb(cli, sch, delete_removed=True)
    assert deleted["changes"] == [f"removed R5 (Resistor_SMD:R_0603_1608Metric): {r['flagged'][0].split(': ', 1)[1].split(';')[0]}"]
    assert deleted["parity"]["total"] == 0 and "H1" in placement(pcb)  # the mounting hole is board-only, not extra
    final = open(pcb).read()
    again = update_pcb(cli, sch, delete_removed=True)
    assert again["changes"] == [] and open(pcb).read() == final
    assert resaved_identical(pcb, tmp_path)


@needs_kicad_cli
@needs_footprints
def test_relinks_by_reference_and_rewrites_only_the_path(project, cli):
    sch = project("usb_attiny")
    pcb = update_pcb(cli, sch, drc=False)["pcb"]
    good = open(pcb).read()
    path = Board(pcb).footprint("R1").node.child_value("path")
    with open(pcb, "w", encoding="utf-8") as fh:  # the symbol was deleted and re-created: R1's link is stale
        fh.write(good.replace(path, "/00000000-0000-4000-8000-000000000000"))
    r = update_pcb(cli, sch)
    assert r["changes"] == [f"R1: relinked to its symbol by reference ({path})"] and open(pcb).read() == good


@needs_kicad_cli
@needs_footprints
def test_swapped_footprint_keeps_position_rotation_side_and_lock(project, cli):
    sch = project("usb_attiny")
    pcb = update_pcb(cli, sch, drc=False)["pcb"]
    b = Board(pcb)
    b.apply({"op": "move_footprint", "reference": "R3", "x": 125, "y": 110, "rotation": 90, "side": "back"})
    b.apply({"op": "lock_footprint", "reference": "R3"})
    b.save()
    old = b.footprint("R3")
    s = Schematic(sch)
    s.apply({"op": "set_footprint", "reference": "R3", "footprint": "Resistor_SMD:R_0805_2012Metric"})
    s.save()
    r = update_pcb(cli, sch)
    assert r["changes"] == ["R3: footprint Resistor_SMD:R_0603_1608Metric → Resistor_SMD:R_0805_2012Metric (kept at (125, 110) 90° back)"]
    r3 = Board(pcb).footprint("R3")
    assert (r3.lib_id, r3.at, r3.side, r3.locked, r3.uuid) == ("Resistor_SMD:R_0805_2012Metric", old.at, "back", True, old.uuid)
    assert r["parity"]["total"] == 0
    theirs = kicad_pads(pcb)
    for p in r3.pads():
        assert p["at"] == pytest.approx(theirs[("R3", p["number"])], abs=0.003)


# ---- refusing ------------------------------------------------------------------------------

@needs_kicad_cli
@needs_footprints
def test_refuses_with_every_ref_pin_and_writes_nothing(project, cli):
    sch = project("usb_attiny")
    with open(sch, encoding="utf-8") as fh:
        text = fh.read()
    # #9's bug: power flags annotated without '#' are real parts to KiCad, with no footprint.
    text = text.replace('"#FLG01"', '"FLG1"')
    with open(sch, "w", encoding="utf-8") as fh:
        fh.write(text)
    s = Schematic(sch)
    s.apply({"op": "set_footprint", "reference": "U2", "footprint": "Package_TO_SOT_SMD:SOT-23"})  # 3 pads for a 3-pin regulator: fine
    s.apply({"op": "set_footprint", "reference": "U1", "footprint": "Package_TO_SOT_SMD:SOT-23"})  # an 8-pin MCU on 3 pads: pins 4–8 have no pad
    s.apply({"op": "set_footprint", "reference": "R4", "footprint": "Nope_Library:R_0603"})  # in no library
    s.save()
    with pytest.raises(SyncRefused) as err:
        update_pcb(cli, sch)
    assert not os.path.exists(sch[:-4] + "_pcb")
    problems = {(i["reference"], i["problem"]) for i in err.value.issues}
    assert problems == {("FLG1", "no_footprint"), ("U1", "pins_without_pads"), ("R4", "footprint_not_found")}
    message = str(err.value)
    assert "U1:4, U1:5, U1:6, U1:7, U1:8: no pad with that number on Package_TO_SOT_SMD:SOT-23 (its pads: 1, 2, 3)" in message
    assert "FLG1: the symbol has no footprint; power:PWR_FLAG is a power symbol" in message and "#FLG01" in message
    assert "R4: footprint Nope_Library:R_0603 not found (library 'Nope_Library'" in message


def test_board_must_sit_next_to_its_schematic(tmp_path, cli):
    with pytest.raises(Exception, match="the board must be usb.kicad_pcb next to usb.kicad_sch"):
        update_pcb(cli, str(tmp_path / "usb.kicad_sch"), str(tmp_path / "other.kicad_pcb"))


# ---- KiCad's demo projects -----------------------------------------------------------------

DEMO_PROJECTS = ["ecc83/ecc83-pp.kicad_sch", "pic_programmer/pic_programmer.kicad_sch",
                 "complex_hierarchy/complex_hierarchy.kicad_sch", "stickhub/StickHub.kicad_sch",
                 "royalblue54L_feather/nfc_antenna/RoyalBlue54L-NFC-Antenna/RoyalBlue54L-NFC-Antenna.kicad_sch"]


@needs_kicad_cli
@needs_footprints
@pytest.mark.parametrize("rel", DEMO_PROJECTS)
def test_demo_board_from_scratch(rel, cli, tmp_path):
    """Hierarchical sheets, multi-unit symbols, project footprint libraries: parity 0, KiCad re-saves the same
    bytes, a second run changes nothing."""
    sch = demo(tmp_path, rel, keep_board=False)
    r = update_pcb(cli, sch)
    assert r["created"] and r["parity"] == {"total": 0, "by_type": {}}, r["drc"]["violations"][:5]
    assert r["counts"]["added"] == len(Board(r["pcb"]).footprints()) >= 1
    assert resaved_identical(r["pcb"], tmp_path)
    text = open(r["pcb"]).read()
    assert update_pcb(cli, sch, drc=False)["changes"] == [] and open(r["pcb"]).read() == text


@needs_kicad_cli
@needs_footprints
@pytest.mark.parametrize("rel, kinds", [
    ("pic_programmer/pic_programmer.kicad_sch", {}),  # KiCad keeps this board in sync: nothing to do
    ("ecc83/ecc83-pp.kicad_sch", {"upgraded", "swapped", "field", "pad", "attr"}),
    ("complex_hierarchy/complex_hierarchy.kicad_sch", {"upgraded", "swapped"}),
    ("stickhub/StickHub.kicad_sch", {"upgraded", "field", "pad", "attr"}),
])
def test_demo_board_update_keeps_placement(rel, kinds, cli, tmp_path):
    """KiCad's own boards: footprints renamed to the symbols' libraries are swapped in place, everything placed
    stays where it is, and parity ends at 0 (the demos start at 0–68 parity issues)."""
    sch = demo(tmp_path, rel)
    pcb = sch[:-4] + "_pcb"
    before, text = placement(pcb), open(pcb).read()
    r = update_pcb(cli, sch)
    assert set(r["counts"]) == set(kinds) and r["flagged"] == []
    assert r["parity"]["total"] == 0, r["drc"]["violations"][:5]
    assert placement(pcb) == before
    if not kinds:
        assert not r["written"] and open(pcb).read() == text
    synced = open(pcb).read()
    assert update_pcb(cli, sch, drc=False)["changes"] == [] and open(pcb).read() == synced


@needs_kicad_cli
@needs_footprints
def test_demo_with_pins_kicad_has_no_pads_for_is_refused(cli, tmp_path):
    sch = demo(tmp_path, "cm5_minima/CM5_MINIMA_3.kicad_sch", keep_board=False)
    with pytest.raises(SyncRefused) as err:
        update_pcb(cli, sch)
    # The same four pins KiCad's parity check reports on the demo's own board ("No pad found for pin M1").
    assert [(i["reference"], i.get("pins")) for i in err.value.issues] == [("J701", ["M1", "M2", "M3", "M4"])]


@needs_kicad_cli
@needs_footprints
def test_numbered_net_board_keeps_its_format(cli, tmp_path):
    """KiCad 8/9 boards number their nets. Planned and applied directly (no upgrade), the board stays in its
    format, and KiCad 10 reading it confirms parity."""
    sch = demo(tmp_path, "ecc83/ecc83-pp.kicad_sch")
    pcb = sch[:-4] + "_pcb"
    board = Board(pcb)
    assert board.numbered_nets and board.version == 20241229
    plan = plan_sync(board, read_netlist(cli, sch), LibTable("fp", os.path.dirname(sch), 10), cli=cli)
    apply_sync(plan)
    board.save()
    text = open(pcb).read()
    assert "(version 20241229)" in text and "(units" not in text  # KiCad 9 footprints have no unit/pin map
    assert '(net 1 "GND")' in text  # pads name their net with its code
    assert cli.drc(pcb, schematic_parity=True)["parity"] == 0


# ---- the tool --------------------------------------------------------------------------------

@needs_kicad_cli
@needs_footprints
def test_toolbox_update_pcb(project):
    sch = project("usb_attiny")
    tb = Toolbox()
    out = tb.call("update_pcb", {"schematic": sch, "dry_run": True})
    assert out["created"] and not out["written"]
    out = tb.call("update_pcb", {"schematic": sch})
    assert out["written"] and out["drc"]["parity"] == 0 and out["drc"]["path"] == out["pcb"]
    with pytest.raises(ToolError, match="copper_layers must be 2 or 4"):
        tb.call("update_pcb", {"schematic": sch, "copper_layers": 6})
    s = Schematic(sch)
    s.apply({"op": "set_footprint", "reference": "U1", "footprint": "Package_TO_SOT_SMD:SOT-23"})
    s.save()
    with pytest.raises(ToolError, match=r"refused, nothing was written[\s\S]*U1:4"):
        tb.call("update_pcb", {"schematic": sch})
