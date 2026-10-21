"""Regenerate tests/fixtures with the sidecar's own editor (needs KiCad symbol libraries; the board
fixture also needs KiCad's pcbnew Python module, i.e. KiCad's Python).

    python tests/make_fixtures.py
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from dsh_kicad_sidecar.schematic import Schematic, new_schematic_text  # noqa: E402


def project(name):
    d = os.path.join(HERE, "fixtures", name)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, f"{name}.kicad_sch"), "w") as fh:
        fh.write(new_schematic_text())
    with open(os.path.join(d, f"{name}.kicad_pro"), "w") as fh:
        json.dump({"meta": {"filename": f"{name}.kicad_pro", "version": 3}}, fh, indent=2)
        fh.write("\n")
    return Schematic(os.path.join(d, f"{name}.kicad_sch"))


def rc_filter():
    """RC low-pass with a 3-pin connector: ERC-clean."""
    s = project("rc_filter")
    s.add_symbol("Connector:Conn_01x03_Pin", 80.01, 90.17, reference="J1", value="IN_OUT_GND")
    s.add_symbol("Device:R", 100.33, 80.01, reference="R1", value="10k", footprint="Resistor_SMD:R_0603_1608Metric")
    s.add_symbol("Device:C", 119.38, 90.17, reference="C1", value="100n", footprint="Capacitor_SMD:C_0603_1608Metric")
    s.add_symbol("power:PWR_FLAG", 139.7, 100.33, reference="#FLG01")
    s.connect_pins(("R1", "2"), ("C1", "1"))
    s.connect_pin_to_net("R1", "1", "IN")
    s.connect_pin_to_net("C1", "1", "OUT")
    s.connect_pin_to_net("C1", "2", "GND", kind="power")
    s.connect_pin_to_net("#FLG01", "1", "GND", kind="power")
    s.connect_pin_to_net("J1", "1", "IN")
    s.connect_pin_to_net("J1", "2", "OUT")
    s.connect_pin_to_net("J1", "3", "GND", kind="power")
    s.save()


def erc_errors():
    """A lone resistor: both pins unconnected."""
    s = project("erc_errors")
    s.add_symbol("Device:R", 100.33, 80.01, reference="R1", value="1k")
    s.save()


def blank():
    project("blank")


def usb_attiny_blocks():
    """usb_attiny with functional block frames (USB INPUT, PWR SUPPLY, MCU, ISP, UI) for block placement.

    Made from the usb_attiny fixture with the schematic editor's own operations: the power LED (R1, D1) moves
    next to the regulator, then five frames are drawn around the parts. ERC and the netlist stay the same
    (tests/test_placement.py checks both)."""
    src = os.path.join(HERE, "fixtures", "usb_attiny")
    d = os.path.join(HERE, "fixtures", "usb_attiny_blocks")
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, "usb_attiny_blocks.kicad_sch")
    shutil.copyfile(os.path.join(src, "usb_attiny.kicad_sch"), path)
    with open(os.path.join(src, "usb_attiny.kicad_pro")) as fh:
        pro = json.load(fh)
    pro.setdefault("meta", {})["filename"] = "usb_attiny_blocks.kicad_pro"
    with open(os.path.join(d, "usb_attiny_blocks.kicad_pro"), "w") as fh:
        json.dump(pro, fh, indent=2)
        fh.write("\n")
    s = Schematic(path)
    s.move_symbols(["R1", "D1"], dx=-38.1, dy=0)
    for title, x, y, w, h in [("USB INPUT", 25.4, 38.1, 55.88, 58.42), ("PWR SUPPLY", 81.28, 30.48, 46.99, 66.04),
                              ("MCU", 139.7, 66.04, 71.12, 58.42), ("ISP", 228.6, 66.04, 38.1, 58.42),
                              ("UI", 152.4, 132.08, 76.2, 30.48)]:
        s.add_block(title, x=x, y=y, width=w, height=h)
    s.save()


def rc_board():
    """A 50 x 30 mm two-layer board with J1, R1 and C1 placed but unrouted (4 missing connections).

    Written by KiCad itself through its pcbnew Python module (run this with KiCad's Python), so the board
    tests start from a file in KiCad's own format."""
    try:
        import pcbnew  # type: ignore
    except ImportError:
        print("rc_board skipped: KiCad's pcbnew Python module is not importable")
        return
    d = os.path.join(HERE, "fixtures", "rc_board")
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, "rc_board.kicad_pcb")
    board = pcbnew.NewBoard(path)
    nets = {}
    for name in ("IN", "OUT", "GND"):
        nets[name] = pcbnew.NETINFO_ITEM(board, name)
        board.Add(nets[name])
    libs = "/usr/share/kicad/footprints"
    for lib, name, ref, value, x, y, rot, pads in [
        ("Connector_PinHeader_2.54mm", "PinHeader_1x03_P2.54mm_Vertical", "J1", "IN_OUT_GND", 105, 112.46, 0, {"1": "IN", "2": "OUT", "3": "GND"}),
        ("Resistor_SMD", "R_0603_1608Metric", "R1", "10k", 120, 110, 0, {"1": "IN", "2": "OUT"}),
        ("Capacitor_SMD", "C_0603_1608Metric", "C1", "100n", 132, 118, 90, {"1": "OUT", "2": "GND"}),
    ]:
        fp = pcbnew.FootprintLoad(os.path.join(libs, f"{lib}.pretty"), name)
        fp.SetFPID(pcbnew.LIB_ID(lib, name))
        fp.SetReference(ref)
        fp.SetValue(value)
        fp.SetPosition(pcbnew.VECTOR2I_MM(x, y))
        fp.SetOrientationDegrees(rot)
        board.Add(fp)
        for pad in fp.Pads():
            pad.SetNet(nets[pads[pad.GetNumber()]])
    outline = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_RECTANGLE)
    outline.SetStart(pcbnew.VECTOR2I_MM(100, 100))
    outline.SetEnd(pcbnew.VECTOR2I_MM(150, 130))
    outline.SetLayer(pcbnew.Edge_Cuts)
    outline.SetWidth(pcbnew.FromMM(0.05))
    board.Add(outline)
    pcbnew.SaveBoard(path, board)
    prl = os.path.join(d, "rc_board.kicad_prl")
    if os.path.exists(prl):
        os.unlink(prl)


if __name__ == "__main__":
    rc_filter()
    erc_errors()
    blank()
    rc_board()
    usb_attiny_blocks()
    print("fixtures written")
