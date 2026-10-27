"""The beginner demo (demo/button-light) keeps working: its firmware passes step 4's scenario on the reference schematic (the same
circuit the design brief's example builds), its deliberate failure fails, and its checker judges a workspace by KiCad."""
import os
import shutil
import subprocess
import sys

import pytest

from dsh_kicad_sidecar.footprints import default_footprint_dirs
from dsh_kicad_sidecar.freerouting import locate
from dsh_kicad_sidecar.tools import Toolbox

from conftest import FIXTURES, needs_kicad_cli, needs_symbols

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "demo", "button-light"))
SRC = os.path.normpath(os.path.join(HERE, "..", "src"))
pytestmark = [pytest.mark.skipif(not os.path.isdir(DEMO), reason="the demo is not in this checkout"), needs_kicad_cli, needs_symbols]
needs_freerouting = pytest.mark.skipif(not locate().ok, reason="Freerouting (and Java) not installed")
needs_footprints = pytest.mark.skipif(not default_footprint_dirs(), reason="KiCad footprint libraries not installed")

# step 4 of the script: a press at 1 s turns the light on and it stays on; a press at 2 s turns it off
STIMULI = [{"at": "1s", "press": "SW1", "name": "first press"}, {"at": "1.3s", "release": "SW1"},
           {"at": "2s", "press": "SW1", "name": "second press"}, {"at": "2.3s", "release": "SW1"}]
ASSERTIONS = [{"led": "D2", "is": "off", "from": "0s", "to": "0.99s"}, {"led": "D2", "is": "on", "after": "first press", "within": "50ms"},
              {"led": "D2", "is": "on", "from": "1.1s", "to": "1.99s"}, {"led": "D2", "is": "off", "after": "second press", "within": "50ms"},
              {"led": "D2", "is": "off", "from": "2.1s", "to": "3s"}]


def workspace(tmp_path):
    """The demo's workspace after step 2: the reference circuit, its brief, and the program copied in."""
    for name in ("usb_attiny_blocks.kicad_sch", "usb_attiny_blocks.kicad_pro"):
        shutil.copy(os.path.join(FIXTURES, "usb_attiny_blocks", name), tmp_path / name)
    shutil.copy(os.path.join(DEMO, "firmware", "button_light.hex"), tmp_path / "button_light.hex")
    (tmp_path / "design-brief.md").write_text("# Design brief\n\nA USB-C powered ATtiny85: a button on PB3 toggles the LED on PB4.\n")
    return str(tmp_path / "usb_attiny_blocks.kicad_sch")


def test_the_demo_firmware_toggles_the_light(tmp_path):
    sch = workspace(tmp_path)
    tb = Toolbox(roots=[str(tmp_path)])
    result = tb.call("simulate_firmware", {"path": sch, "firmware": str(tmp_path / "button_light.hex"), "duration": "3s",
                                           "stimuli": STIMULI, "assertions": ASSERTIONS})
    assert result["passed"] is True, result["assertions"]
    on, off = result["assertions"][1]["first_at"], result["assertions"][3]["first_at"]
    assert on == pytest.approx(1.020, abs=0.002) and off == pytest.approx(2.020, abs=0.002)  # the program's 20 ms debouncing
    # the script's deliberate failure: within 10 ms is too soon
    strict = tb.call("simulate_firmware", {"path": sch, "firmware": str(tmp_path / "button_light.hex"), "duration": "1.5s",
                                           "stimuli": STIMULI[:1], "assertions": [{"led": "D2", "is": "on", "after": "first press", "within": "10ms"}]})
    assert strict["passed"] is False and strict["assertions"][0]["reason"] == "never on in that window (it was off)"


def check(tmp_path):
    return subprocess.run([sys.executable, os.path.join(DEMO, "check.py"), SRC, str(tmp_path)], capture_output=True, text=True, timeout=600)


def test_the_checker_wants_the_board_too(tmp_path):
    workspace(tmp_path)
    run = check(tmp_path)
    assert run.returncode == 1 and "13/13 checks passed" in run.stdout and "no board yet" in run.stdout


@needs_freerouting
@needs_footprints
def test_the_checker_passes_the_finished_demo(tmp_path):
    sch = workspace(tmp_path)
    tb = Toolbox(roots=[str(tmp_path)])
    pcb = tb.call("update_pcb", {"schematic": sch})["pcb"]  # step 5, as the kicad-pcb-layout skill does it
    tb.call("fab_preset", {"path": pcb, "preset": "jlcpcb"})
    tb.call("edit_pcb", {"path": pcb, "operations": [
        {"op": "auto_place"}, {"op": "add_zone", "net": "GND", "layers": ["F.Cu", "B.Cu"], "name": "GND", "connect_pads": "solid"}]})
    assert tb.call("autoroute", {"pcb": pcb})["unrouted"] == 0
    assert tb.call("export_fab", {"pcb": pcb, "preset": "jlcpcb", "preview": False})["exported"]
    run = check(tmp_path)
    assert run.returncode == 0, run.stdout[-3000:]
    assert "11/11 board requirements satisfied" in run.stdout and "The demo's result holds." in run.stdout
