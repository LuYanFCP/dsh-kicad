"""Check an agent-made board for the finished usb_attiny_blocks schematic (prompt.md): KiCad's DRC with schematic parity and the fab
zip (evals/board_check.py), and the schematic left as given (KiCad's netlist of it against input/, and its ERC).

    python evals/pcb-from-existing-sch/verify.py packages/kicad-bridge/sidecar/src /path/to/usb_attiny_blocks.kicad_sch

Set up a run by copying input/ into an empty workspace. Exit code 0 only when every check holds.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.dirname(HERE))
import board_check  # noqa: E402
from dsh_kicad_sidecar.kicad_cli import KiCadCli  # noqa: E402

sch = os.path.abspath(sys.argv[2])
cli = KiCadCli()


def design(path):
    """Parts (reference, value, symbol, footprint) and connections (net → pins), as KiCad's netlist has them."""
    net = cli.netlist(path)
    parts = sorted((c["reference"], c["value"], c["lib_id"], c["footprint"]) for c in net["components"])
    nets = sorted((n["name"], tuple(sorted((x["ref"], x["pin"]) for x in n["nodes"]))) for n in net["nets"])
    return parts, nets


given, now = design(os.path.join(HERE, "input", "usb_attiny_blocks.kicad_sch")), design(sch)
erc = cli.erc(sch)
checks = [
    ("the schematic is as given (KiCad netlist: parts, values, footprints, connections)", given == now, "" if given == now else "it was changed"),
    ("ERC: 0 errors", erc["counts"]["error"] == 0, str(erc["counts"])),
    *board_check.check_board(sys.argv[1], os.path.splitext(sch)[0] + ".kicad_pcb"),
]
sys.exit(0 if board_check.report(checks, "REQUIREMENTS", "requirements") else 1)
