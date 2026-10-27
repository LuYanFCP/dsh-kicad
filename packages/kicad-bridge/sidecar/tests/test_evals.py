"""The board evals' checker (evals/board_check.py and the evals' verify.py) against boards the tools build: it passes a finished board,
and names what is missing on an unfinished one or in an incomplete or stale fab zip."""
import importlib.util
import os
import re
import subprocess
import sys
import time
import zipfile

import pytest

from dsh_kicad_sidecar.footprints import default_footprint_dirs
from dsh_kicad_sidecar.freerouting import locate
from dsh_kicad_sidecar.pcb import Board
from dsh_kicad_sidecar.tools import Toolbox

from conftest import needs_kicad_cli, needs_symbols

HERE = os.path.dirname(os.path.abspath(__file__))
EVALS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "evals"))
SRC = os.path.normpath(os.path.join(HERE, "..", "src"))
pytestmark = pytest.mark.skipif(not os.path.isfile(os.path.join(EVALS, "board_check.py")), reason="the evals are not in this checkout")
needs_footprints = pytest.mark.skipif(not default_footprint_dirs(), reason="KiCad footprint libraries not installed")
needs_freerouting = pytest.mark.skipif(not locate().ok, reason="Freerouting (and Java) not installed")


@pytest.fixture(scope="module")
def checker():
    spec = importlib.util.spec_from_file_location("board_check", os.path.join(EVALS, "board_check.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def failed(checks):
    return [name for name, ok, _ in checks if not ok]


def test_the_zip_reader_takes_kicads_file_functions_and_drill_hits(checker, tmp_path):
    path = tmp_path / "fab.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("b-F_Cu.gtl", "%TF.GenerationSoftware,KiCad,Pcbnew,10.0.7*%\n%TF.FileFunction,Copper,L1,Top*%\n%FSLAX46Y46*%\n")
        z.writestr("b-B_Cu.gbl", "G04 #@! TF.FileFunction,Copper,L2,Bot*\n%FSLAX46Y46*%\n")  # X1, the attributes as comments
        z.writestr("b-PTH.drl", "M48\n; #@! TF.FileFunction,Plated,1,2,PTH\nT1C0.300\n%\nG90\nT1\nX1.0Y-2.0\nX3Y4\nT2\nX5.0Y-1.0G85X5.6Y-1.0\nM30\n")
        z.writestr("b-NPTH.drl", "M48\n; #@! TF.FileFunction,NonPlated,1,2,NPTH\n%\nM30\n")
        z.writestr("b-job.gbrjob", '{"FileFunction": "Copper,L1,Top"}')
        z.writestr("assembly/b-pos.csv", "Ref,Val\n")
    assert checker.read_zip(str(path)) == {"functions": ["Copper,L1,Top", "Copper,L2,Bot"], "drill": {"Plated": 3, "NonPlated": 0}}
    board = '\t(via\n\t\t(at 1 2)\n\t)\n\t\t(pad "1" thru_hole oval\n\t\t(pad "" np_thru_hole circle\n\t\t(pad "2" smd rect\n\t(via\n'
    assert checker.board_holes(board) == (3, 1)


@needs_kicad_cli
@needs_symbols
@needs_footprints
def test_an_unfinished_board_fails_with_what_is_missing(checker, project):
    tb = Toolbox()
    pcb = tb.call("update_pcb", {"schematic": project("usb_attiny_blocks")})["pcb"]
    tb.call("edit_pcb", {"path": pcb, "operations": [{"op": "auto_place"}]})
    # KiCad's default rules allow a 0.4 mm non-plated hole; JLCPCB drills them from 0.5 mm, and the check against its limits says so
    x0, y0, _, _ = Board(pcb).outline()["bbox"]
    tb.call("edit_pcb", {"path": pcb, "operations": [{"op": "add_mounting_hole", "x": x0 + 2, "y": y0 + 2, "drill": 0.4, "plated": False}]})
    checks = checker.check_board(SRC, pcb)
    assert failed(checks) == ["0 unrouted connections (KiCad DRC)", "0 DRC errors (KiCad DRC, zones refilled)",
                              "within JLCPCB standard 1-2 layer, 1 oz limits (KiCad DRC with the fab's rules)", "a GND copper pour",
                              "fab zip (kicad_export_fab)"]
    assert {name: detail for name, _, detail in checks}[failed(checks)[2]] == "drill_out_of_range ×1"
    assert {name: detail for name, _, detail in checks}["schematic parity 0 (KiCad DRC)"] == "0 issue(s)"
    assert checker.check_board(SRC, pcb.replace(".kicad_pcb", "-missing.kicad_pcb")) == [("the board exists", False, pcb.replace(".kicad_pcb", "-missing.kicad_pcb"))]


def build(tb, sch):
    """The board the prompts ask for, made with the tools: sync, JLCPCB rules, auto_place, GND pour, autoroute, JLCPCB fab files."""
    pcb = tb.call("update_pcb", {"schematic": sch})["pcb"]
    tb.call("fab_preset", {"path": pcb, "preset": "jlcpcb"})
    tb.call("edit_pcb", {"path": pcb, "operations": [
        {"op": "auto_place"}, {"op": "add_zone", "net": "GND", "layers": ["F.Cu", "B.Cu"], "name": "GND", "connect_pads": "solid"}]})
    assert tb.call("autoroute", {"pcb": pcb})["unrouted"] == 0
    return pcb, tb.call("export_fab", {"pcb": pcb, "preset": "jlcpcb", "preview": False})


def verify(*args):
    return subprocess.run([sys.executable, *args], capture_output=True, text=True, timeout=300)


@needs_freerouting
@needs_kicad_cli
@needs_symbols
@needs_footprints
def test_a_finished_board_passes_and_an_incomplete_or_stale_zip_does_not(checker, project, tmp_path):
    tb = Toolbox()
    sch = project("usb_attiny_blocks")
    pcb, fab = build(tb, sch)
    assert fab["exported"] and failed(checker.check_board(SRC, pcb)) == []
    run = verify(os.path.join(EVALS, "pcb-from-existing-sch", "verify.py"), SRC, sch)
    assert run.returncode == 0, run.stdout[-3000:]
    assert "the schematic is as given" in run.stdout and "13/13 requirements satisfied" in run.stdout
    partial = str(tmp_path / "partial.zip")
    with zipfile.ZipFile(fab["zip"]) as src, zipfile.ZipFile(partial, "w") as dst:
        for name in src.namelist():
            if "Edge_Cuts" not in name:
                dst.writestr(name, src.read(name))
    checks = checker.check_board(SRC, pcb, zip_path=partial)
    assert failed(checks) == ["Gerbers: copper, solder mask and silkscreen on both sides, board outline"]
    assert dict((n, d) for n, _, d in checks)[failed(checks)[0]] == "missing board outline"
    later = time.time() + 60
    os.utime(pcb, (later, later))
    assert failed(checker.check_board(SRC, pcb)) == ["the zip is not older than the board"]
    with open(pcb, encoding="utf-8") as fh:  # one routed segment thinner than JLCPCB makes
        thin = re.sub(r"(\(segment\b[\s\S]*?\(width )[\d.]+", r"\g<1>0.09", fh.read(), count=1)
    with open(pcb, "w", encoding="utf-8") as fh:
        fh.write(thin)
    checks = checker.check_board(SRC, pcb)  # JLCPCB's limits are the project's rules here (kicad_fab_preset): KiCad's own DRC says so
    assert failed(checks) == ["0 DRC errors (KiCad DRC, zones refilled)", "the zip is not older than the board"]
    assert {name: detail for name, _, detail in checks}[failed(checks)[0]] == "track_width ×1"


@needs_freerouting
@needs_kicad_cli
@needs_symbols
@needs_footprints
def test_the_usb_attiny85_eval_judges_both_turns(project):
    sch = project("usb_attiny")
    build(Toolbox(), sch)
    run = verify(os.path.join(EVALS, "usb-attiny85", "verify.py"), SRC, sch, "--pcb")
    assert run.returncode == 0, run.stdout[-3000:]
    assert "22/22 requirements satisfied" in run.stdout and "11/11 board requirements satisfied" in run.stdout
    schematic_only = verify(os.path.join(EVALS, "usb-attiny85", "verify.py"), SRC, sch)
    assert schematic_only.returncode == 0 and "BOARD:" not in schematic_only.stdout
