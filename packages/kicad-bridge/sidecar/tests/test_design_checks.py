"""kicad_check_design: unit tests for a schematic. Each rule judged on the usb_attiny_blocks fixture (USB-C, AMS1117-3.3,
ATtiny85, LEDs) through KiCad's netlist; the sources that make a check count; the checks file the tool keeps."""
import json
import os

import pytest

from dsh_kicad_sidecar import design_checks as dc
from dsh_kicad_sidecar.design_checks import CheckError, rail_voltage
from dsh_kicad_sidecar.kicad_cli import KiCadCli
from dsh_kicad_sidecar.tools import Toolbox, ToolError

from conftest import REGULATOR_PAGES, make_pdf, needs_kicad_cli, needs_pdftotext

BRIEF = "RESET uses a 10k pull-up to +3V3.\nPower LED: Vf 2.0 V, between 1 mA and 20 mA.\nPB4 drives the LED at 3.3 V logic.\nAll grounds are one net.\n"


def reg(quote, page=None):
    return {"pdf": "ams1117.pdf", "quote": quote, **({"page": page} if page else {})}


CHECKS = [
    {"id": "U2-vin", "rule": "max_voltage", "part": "U2", "pin": "U2:VI", "max": 15, "source": reg("Input Voltage 15V", 1)},
    {"id": "U2-cout", "rule": "capacitance", "part": "U2", "pin": "U2:VO", "min": "22u",
     "source": reg("The addition of 22µF solid tantalum on the output will ensure stability for all operating conditions.", 2)},
    {"id": "U2-headroom", "rule": "voltage_difference", "part": "U2", "pin": "U2:VI", "minus": "U2:VO", "min": 1.3,
     "source": reg("The dropout voltage of the device is guaranteed maximum 1.3V")},
    {"id": "U1-reset", "rule": "resistance", "pin": "U1:RESET", "to": "+3V3", "value": "10k",
     "source": {"file": "design-brief.md", "quote": "RESET uses a 10k pull-up to +3V3"}},
    {"id": "D1-current", "rule": "led_current", "led": "D1", "vf": 2.0, "min": "1m", "max": "20m",
     "source": {"file": "design-brief.md", "quote": "Power LED: Vf 2.0 V, between 1 mA and 20 mA"}},
    {"id": "gnd", "rule": "same_net", "pins": ["U2:GND", "U1:GND", "J1:GND"], "source": {"file": "design-brief.md", "quote": "All grounds are one net."}},
    {"id": "made-up", "rule": "capacitance", "part": "U2", "pin": "U2:VI", "min": "10u", "source": reg("A 10uF ceramic input capacitor is required")},
    {"id": "wrong-number", "rule": "max_voltage", "part": "U2", "pin": "U2:VI", "max": 20, "source": reg("Input Voltage 15V")},
    {"id": "unknown-rail", "rule": "max_voltage", "pin": "U1:PB4", "max": 3.3, "source": {"file": "design-brief.md", "quote": "PB4 drives the LED at 3.3 V logic"}},
    {"id": "no-part", "rule": "max_voltage", "pin": "U9:VI", "max": 15, "source": reg("Input Voltage 15V")},
]


@pytest.fixture
def board(project):
    sch = project("usb_attiny_blocks")
    folder = os.path.dirname(sch)
    with open(os.path.join(folder, "ams1117.pdf"), "wb") as fh:
        fh.write(make_pdf(REGULATOR_PAGES))
    with open(os.path.join(folder, "design-brief.md"), "w", encoding="utf-8") as fh:
        fh.write(BRIEF)
    return sch


@needs_kicad_cli
@needs_pdftotext
def test_each_rule_is_judged_on_the_netlist_and_only_with_a_source_that_holds(board):
    data = dc.merge({"rails": {}, "checks": []}, CHECKS)
    out = dc.run(os.path.dirname(board), KiCadCli().netlist(board), data)
    got = {r["id"]: r for r in out["results"]}
    assert {i: r["status"] for i, r in got.items()} == {
        "U2-vin": "pass", "U2-cout": "fail", "U2-headroom": "pass", "U1-reset": "pass", "D1-current": "pass", "gnd": "pass",
        "made-up": "cannot_verify", "wrong-number": "cannot_verify", "unknown-rail": "cannot_verify", "no-part": "fail"}
    assert out["counts"] == {"pass": 5, "fail": 2, "cannot_verify": 3}
    assert got["U2-vin"]["detail"] == "U2:VI on +5V = 5 V, ≤ 15 V" and got["U2-vin"]["source"] == "AMS1117 1A LOW DROPOUT VOLTAGE REGULATOR p.1"
    assert got["U2-cout"]["detail"] == "capacitance +3V3 → GND = 10.1 µF < 22 µF (min) (C2 10u, C3 100n)"
    assert got["U2-headroom"]["detail"].startswith("U2:VI − U2:VO (+5V − +3V3) = 1.7 V")
    assert got["D1-current"]["detail"] == "I(D1) = 1.3 mA, ≥ 1 mA ≤ 20 mA = (3.3 V − 0 V − 2 V) / 1k"
    assert got["made-up"]["detail"] == "source: the quote is not in AMS1117 1A LOW DROPOUT VOLTAGE REGULATOR (2 pages)"
    assert got["wrong-number"]["detail"] == "source: no quote states max 20"
    assert got["unknown-rail"]["detail"].startswith("the voltage of /PB4_LED is unknown")
    assert got["no-part"]["detail"] == "no part U9 in the schematic"
    # A rail whose name does not say its voltage can be declared.
    rails = dc.run(os.path.dirname(board), KiCadCli().netlist(board), dc.merge(data, rails={"/PB4_LED": 3.3}))
    assert next(r for r in rails["results"] if r["id"] == "unknown-rail")["status"] == "pass"


def test_rail_voltages_come_from_the_name_or_a_declaration():
    assert [rail_voltage(n, {}) for n in ("+3V3", "+5V", "+1V8", "+12V", "+3.3V", "GND", "/GNDA", "AGND")] == [3.3, 5, 1.8, 12, 3.3, 0, 0, 0]
    assert rail_voltage("VBUS", {}) is None and rail_voltage("/VBUS", {"VBUS": 5.0}) == 5.0


def test_malformed_checks_are_refused_whole():
    good = CHECKS[0]
    for bad, message in (({**good, "rule": "nope"}, "rule must be one of"), ({**good, "max": "lots"}, "not a number"),
                         ({**CHECKS[1], "min": 22}, "not a plausible bound"), ({**good, "source": {"pdf": "x.pdf"}}, "exact words"),
                         ({k: v for k, v in good.items() if k != "pin"}, "pin is required"), ({**good, "id": "a b"}, "id:")):
        with pytest.raises(CheckError, match=message):
            dc.merge({"rails": {}, "checks": []}, [good, bad])


@needs_kicad_cli
@needs_pdftotext
def test_the_tool_keeps_the_checks_and_reruns_them(board):
    tb = Toolbox()
    file = os.path.join(os.path.dirname(board), "design-checks.json")
    first = tb.call("check_design", {"path": board, "checks": CHECKS[:3]})
    assert first["saved"] and first["counts"] == {"pass": 2, "fail": 1, "cannot_verify": 0}
    assert [c["id"] for c in json.load(open(file, encoding="utf-8"))["checks"]] == ["U2-vin", "U2-cout", "U2-headroom"]
    # the fix makes the failing test pass; a rerun takes the saved checks
    tb.call("edit_schematic", {"path": board, "operations": [{"op": "set_value", "reference": "C2", "value": "22u"}]})
    rerun = tb.call("check_design", {"path": board})
    assert not rerun["saved"] and rerun["counts"] == {"pass": 3, "fail": 0, "cannot_verify": 0}
    replaced = tb.call("check_design", {"path": board, "checks": [{**CHECKS[1], "min": "47u",
                                                                    "source": reg("output capacitor of 47uF")}], "remove": ["U2-vin"]})
    assert [r["id"] for r in replaced["results"]] == ["U2-cout", "U2-headroom"] and replaced["results"][0]["status"] == "cannot_verify"
    before = open(file, encoding="utf-8").read()
    with pytest.raises(ToolError, match="nothing saved"):
        tb.call("check_design", {"path": board, "checks": [{"id": "x", "rule": "max_voltage"}]})
    assert open(file, encoding="utf-8").read() == before


@needs_kicad_cli
def test_offline_a_datasheet_not_read_yet_cannot_verify(board):
    url = "http://example.invalid/ams1117.pdf"
    out = Toolbox().call("check_design", {"path": board, "offline": True, "checks": [
        {"id": "U2-vin", "rule": "max_voltage", "pin": "U2:VI", "max": 15, "source": {"url": url, "quote": "Input Voltage 15V"}}]})
    assert out["results"][0]["status"] == "cannot_verify" and "has not been read yet" in out["results"][0]["detail"]
