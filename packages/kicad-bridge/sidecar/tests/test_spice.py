import math

import pytest

from dsh_kicad_sidecar import spice
from dsh_kicad_sidecar.spice import SimulationError, evaluate, parse_probe, parse_raw, parse_value, prepare_netlist
from dsh_kicad_sidecar.tools import ToolError, Toolbox

from conftest import needs_kicad_cli, needs_symbols

needs_ngspice = pytest.mark.skipif(spice.locate_ngspice() is None, reason="ngspice not installed")

OP_RAW = """Title: t
Date: today
Plotname: Operating Point
Flags: real
No. Variables: 3
No. Points: 1
Variables:
\t0\t/vcc\tvoltage
\t1\t/out\tvoltage
\t2\tv1#branch\tcurrent
Values:
 0\t5.000000000000000e+00
\t2.500000000000000e+00
\t-2.500000000000000e-03
"""

TRAN_RAW = """Title: t
Plotname: Transient Analysis
Flags: real
No. Variables: 2
No. Points: 5
Variables:
\t0\ttime\ttime
\t1\t/out\tvoltage
Values:
 0\t0.0e+00
\t0.0e+00
 1\t1.0e-03
\t1.0e+00
 2\t2.0e-03
\t2.0e+00
 3\t3.0e-03
\t3.0e+00
 4\t4.0e-03
\t4.0e+00
"""

# first-order low pass, fc = 1 kHz, sampled at three frequencies
AC_RAW = """Title: t
Plotname: AC Analysis
Flags: complex
No. Variables: 3
No. Points: 4
Variables:
\t0\tfrequency\tfrequency
\t1\t/in\tvoltage
\t2\t/out\tvoltage
Values:
 0\t1.0e+01,0.0e+00
\t1.0e+00,0.0e+00
\t9.999500e-01,-1.0e-02
 1\t1.0e+02,0.0e+00
\t1.0e+00,0.0e+00
\t9.950372e-01,-9.950372e-02
 2\t1.0e+03,0.0e+00
\t1.0e+00,0.0e+00
\t5.0e-01,-5.0e-01
 3\t1.0e+04,0.0e+00
\t1.0e+00,0.0e+00
\t9.90099e-03,-9.90099e-02
"""


def results():
    return {"op": parse_raw(OP_RAW), "tran": parse_raw(TRAN_RAW), "ac": parse_raw(AC_RAW)}


NODES = {"/vcc", "/out", "/in", "0"}


def check(assertion, order=("op", "tran", "ac")):
    return evaluate(assertion, results(), NODES, list(order))


def test_parse_value():
    assert parse_value("10k") == 10000
    assert parse_value("100n") == pytest.approx(1e-7)
    assert parse_value("1Meg") == 1e6
    assert parse_value("20ms") == pytest.approx(0.02)
    assert parse_value("3.3V") == 3.3
    assert parse_value(5) == 5.0
    for bad in ("abc", "", True):
        with pytest.raises(SimulationError):
            parse_value(bad)


def test_parse_probe():
    assert parse_probe("v(Out)").text == "V(Out)"
    assert parse_probe("V(a, b)").names == ("a", "b")
    assert parse_probe("I(R1)").unit == "A"
    for bad in ("Vout", "I(a,b)", "X(a)"):
        with pytest.raises(SimulationError):
            parse_probe(bad)


def test_prepare_netlist_drops_unsimulatable_parts_and_flags_modelless_diodes():
    text = ".title KiCad schematic\nC1 /OUT GND 100n\nJ1 __J1\nD1 GND Net-_D1-A_ LED\nR1 /IN /OUT 10k\n.end\n"
    lines, ignored, modelless = prepare_netlist(text)
    assert ignored == ["J1"] and modelless == ["D1"]
    assert not any(line.startswith("J1") for line in lines)
    assert ".end" not in [line.strip().lower() for line in lines]


def test_prepare_netlist_accepts_diodes_with_a_model():
    lines, _, modelless = prepare_netlist(".title t\n.model __D1 D\nD1 A K __D1\nD2 A K DFAST\n.model DFAST D(IS=1e-12)\n.end\n")
    assert modelless == []


def test_raw_parse_real_and_complex():
    op = parse_raw(OP_RAW)
    assert op["vectors"]["/vcc"] == [5.0] and op["vectors"]["v1#branch"] == [-0.0025]
    named = parse_raw(OP_RAW.replace("/vcc\tvoltage", "v(/vcc)\tvoltage").replace("v1#branch", "i(v1)"))
    assert named["vectors"]["/vcc"] == [5.0] and named["vectors"]["v1#branch"] == [-0.0025]
    ac = parse_raw(AC_RAW)
    assert ac["complex"] and ac["vectors"]["/out"][2] == complex(0.5, -0.5)


def test_op_assertions():
    assert check({"probe": "V(OUT)", "analysis": "op", "min": 2.4, "max": 2.6})["passed"]
    bad = check({"probe": "V(vcc)", "analysis": "op", "min": 3.2, "max": 3.4})
    assert not bad["passed"] and bad["value"] == 5.0 and bad["unit"] == "V"
    assert check({"probe": "I(V1)", "analysis": "op", "abs": True, "equals": "2.5m", "tol_pct": 1})["passed"]
    assert check({"probe": "V(vcc,out)", "analysis": "op", "equals": 2.5})["passed"]
    assert check({"probe": "V(GND)", "analysis": "op", "equals": 0})["passed"]


def test_tran_measures():
    t = lambda **kw: check({"probe": "V(out)", "analysis": "tran", **kw})
    assert t(measure="final", equals=4)["passed"]
    assert t(measure="max", equals=4)["passed"] and t(measure="min", equals=0)["passed"]
    assert t(measure="pp", equals=4)["passed"]
    assert t(measure="mean", equals=2)["passed"]
    assert t(measure="at", at="2.5m", equals=2.5)["passed"]
    assert t(measure="mean", **{"from": "2m", "to": "4m"}, equals=3)["passed"]
    assert t(measure="rms", equals=math.sqrt(16 / 3), tol_pct=1)["passed"]
    with pytest.raises(SimulationError, match="outside the simulated range"):
        t(measure="at", at="1", min=0)


def test_ac_measures():
    a = lambda **kw: check({"probe": "V(out)", "analysis": "ac", "ref": "V(in)", **kw})
    assert a(measure="gain_db", at=10, min=-0.1, max=0.1)["passed"]
    assert a(measure="gain_db", at=1000, equals=-3.0103, tol=0.05)["passed"]
    assert a(measure="phase_deg", at=1000, equals=-45, tol=0.5)["passed"]
    assert a(measure="lowpass_cutoff_hz", equals=1000, tol_pct=5)["passed"]
    assert a(measure="peak_gain_db", max=0.1)["passed"]


def test_assertion_errors():
    with pytest.raises(SimulationError, match="needs min, max or equals"):
        check({"probe": "V(out)", "analysis": "op"})
    with pytest.raises(SimulationError, match="no net named nowhere"):
        check({"probe": "V(nowhere)", "analysis": "op", "min": 0})
    with pytest.raises(SimulationError, match="name its analysis"):
        check({"probe": "V(out)", "min": 0})
    with pytest.raises(SimulationError, match="not run"):
        evaluate({"probe": "V(out)", "analysis": "ac", "min": 0}, {"op": parse_raw(OP_RAW)}, NODES, ["op"])
    with pytest.raises(SimulationError, match="does not apply"):
        check({"probe": "V(out)", "analysis": "op", "measure": "rms", "min": 0})


def test_analysis_commands():
    assert spice._analysis_command({"type": "op"}) == ("op", "op")
    assert spice._analysis_command({"type": "tran", "stop": "10m", "step": "10u"}) == ("tran", "tran 1e-05 0.01")
    assert spice._analysis_command({"type": "ac", "start": 10, "stop": "1Meg", "points": 10}) == ("ac", "ac dec 10 10 1000000")
    for bad in ({"type": "tran"}, {"type": "ac", "start": 10}, {"type": "noise"}, {"type": "tran", "stop": 1, "step": 1e-9}):
        with pytest.raises(SimulationError):
            spice._analysis_command(bad)


# ---- with KiCad and ngspice ------------------------------------------------------------------
def build(tmp_path, parts, wiring, name="circuit"):
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / f"{name}.kicad_sch")
    tb.call("create_schematic", {"path": path})
    tb.call("edit_schematic", {"path": path, "operations": [*parts, *wiring]})
    return tb, path


def divider(tmp_path):
    return build(tmp_path, [
        {"op": "add_symbol", "lib_id": "Simulation_SPICE:VDC", "x": 50.8, "y": 50.8, "reference": "V1", "value": "5", "properties": {"Sim.Params": "dc=5"}},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 38.1, "reference": "R1", "value": "1k"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 63.5, "reference": "R2", "value": "1k"},
    ], [
        {"op": "connect_pin_to_net", "pin": "V1:1", "net": "VCC", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "V1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R1:1", "net": "VCC", "kind": "label"},
        {"op": "connect_pins", "a": "R1:2", "b": "R2:1"},
        {"op": "connect_pin_to_net", "pin": "R2:1", "net": "MID", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R2:2", "net": "GND", "kind": "power"},
    ])


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_simulate_divider(tmp_path):
    tb, path = divider(tmp_path)
    result = tb.call("simulate", {"path": path, "assertions": [
        {"probe": "V(MID)", "equals": 2.5, "tol": 0.01},
        {"probe": "V(MID)", "min": 3, "name": "mid above 3 V (wrong)"},
        {"probe": "I(R1)", "equals": "2.5m", "tol_pct": 1, "abs": True}]})
    assert result["passed"] is False
    assert [a["passed"] for a in result["assertions"]] == [True, False, True]
    assert result["analyses"][0]["values"]["V(MID)"] == pytest.approx(2.5)
    assert result["netlist"].endswith(".cir")


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_simulate_without_assertions_reports_the_operating_point(tmp_path):
    tb, path = divider(tmp_path)
    result = tb.call("simulate", {"path": path})
    assert result["passed"] is None and result["analyses"][0]["values"]["V(VCC)"] == pytest.approx(5)


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_simulate_rc_filter_ac_and_tran(tmp_path):
    tb, path = build(tmp_path, [
        {"op": "add_symbol", "lib_id": "Simulation_SPICE:VSIN", "x": 50.8, "y": 50.8, "reference": "V1", "value": "SIN",
         "properties": {"Sim.Params": "dc=0 ampl=1 f=1k ac=1"}},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 38.1, "reference": "R1", "value": "1k", "rotation": 90},
        {"op": "add_symbol", "lib_id": "Device:C", "x": 101.6, "y": 63.5, "reference": "C1", "value": "159n"},
    ], [
        {"op": "connect_pin_to_net", "pin": "V1:1", "net": "IN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "V1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R1:1", "net": "IN", "kind": "label"},
        {"op": "connect_pins", "a": "R1:2", "b": "C1:1"},
        {"op": "connect_pin_to_net", "pin": "C1:1", "net": "OUT", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "C1:2", "net": "GND", "kind": "power"},
    ])
    result = tb.call("simulate", {
        "path": path,
        "analyses": [{"type": "ac", "start": 10, "stop": "1Meg", "points": 20}, {"type": "tran", "stop": "5m", "step": "5u"}],
        "assertions": [
            {"probe": "V(OUT)", "analysis": "ac", "measure": "lowpass_cutoff_hz", "equals": 1000, "tol_pct": 5},
            {"probe": "V(OUT)", "analysis": "ac", "measure": "gain_db", "at": 10, "min": -0.1},
            {"probe": "V(OUT)", "analysis": "tran", "measure": "max", "max": 1.0}]})
    assert result["passed"], result["assertions"]


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_simulate_led_current_flows_forward(tmp_path):
    tb, path = build(tmp_path, [
        {"op": "add_symbol", "lib_id": "Simulation_SPICE:VDC", "x": 50.8, "y": 50.8, "reference": "V1", "value": "5", "properties": {"Sim.Params": "dc=5"}},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 38.1, "reference": "R1", "value": "330"},
        {"op": "add_symbol", "lib_id": "Device:LED", "x": 76.2, "y": 63.5, "reference": "D1", "value": "LED",
         "properties": {"Sim.Device": "D", "Sim.Params": "is=1e-18 n=2 rs=3"}},
    ], [
        {"op": "connect_pin_to_net", "pin": "V1:1", "net": "VCC", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "V1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R1:1", "net": "VCC", "kind": "label"},
        {"op": "connect_pins", "a": "R1:2", "b": "D1:2"},
        {"op": "connect_pin_to_net", "pin": "D1:1", "net": "GND", "kind": "power"},
    ])
    result = tb.call("simulate", {"path": path, "assertions": [{"probe": "I(D1)", "min": "5m", "max": "15m", "abs": True}]})
    assert result["passed"], result


@needs_kicad_cli
@needs_symbols
def test_simulate_without_ngspice_says_how_to_install(tmp_path, monkeypatch):
    tb, path = divider(tmp_path)
    monkeypatch.setattr(spice, "locate_ngspice", lambda explicit=None: None)
    with pytest.raises(ToolError, match="ngspice was not found"):
        tb.call("simulate", {"path": path})


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_simulate_needs_ground(tmp_path):
    tb, path = build(tmp_path, [
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 38.1, "reference": "R1", "value": "1k"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 63.5, "reference": "R2", "value": "1k"},
    ], [{"op": "connect_pin_to_net", "pin": "R1:1", "net": "A", "kind": "label"}, {"op": "connect_pins", "a": "R1:2", "b": "R2:1"},
        {"op": "connect_pin_to_net", "pin": "R2:2", "net": "B", "kind": "label"}])
    with pytest.raises(ToolError, match="no ground"):
        tb.call("simulate", {"path": path})


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_simulate_refuses_a_diode_without_sim_device(tmp_path):
    tb, path = build(tmp_path, [
        {"op": "add_symbol", "lib_id": "Simulation_SPICE:VDC", "x": 50.8, "y": 50.8, "reference": "V1", "value": "5", "properties": {"Sim.Params": "dc=5"}},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 76.2, "y": 38.1, "reference": "R1", "value": "330"},
        {"op": "add_symbol", "lib_id": "Device:LED", "x": 76.2, "y": 63.5, "reference": "D1", "value": "LED"},
    ], [
        {"op": "connect_pin_to_net", "pin": "V1:1", "net": "VCC", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "V1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "R1:1", "net": "VCC", "kind": "label"},
        {"op": "connect_pins", "a": "R1:2", "b": "D1:2"},
        {"op": "connect_pin_to_net", "pin": "D1:1", "net": "GND", "kind": "power"},
    ])
    with pytest.raises(ToolError, match="D1 has no SPICE model.*set_sim_model"):
        tb.call("simulate", {"path": path})


# ---- vendor models and Monte Carlo -----------------------------------------------------------
LDO_LIB = """* behavioural 3.3 V LDO
.subckt LDO33 IN GND OUT
B1 n1 GND V=min(V(IN,GND)-0.3,3.3)
Rs n1 OUT 0.1
.ends LDO33
"""


def ldo_circuit(tmp_path, name="LDO33"):
    (tmp_path / "ldo.lib").write_text(LDO_LIB)
    tb, path = build(tmp_path, [
        {"op": "add_symbol", "lib_id": "Simulation_SPICE:VDC", "x": 50.8, "y": 50.8, "reference": "V1", "value": "5", "properties": {"Sim.Params": "dc=5"}},
        {"op": "add_symbol", "lib_id": "Regulator_Linear:AMS1117-3.3", "x": 101.6, "y": 38.1, "reference": "U1", "value": "AMS1117-3.3"},
        {"op": "add_symbol", "lib_id": "Device:R", "x": 127, "y": 63.5, "reference": "R1", "value": "330"},
        {"op": "set_sim_model", "reference": "U1", "library": "ldo.lib", "name": name, "pins": {"1": "GND", "2": "OUT", "3": "IN"}},
    ], [
        {"op": "connect_pin_to_net", "pin": "V1:1", "net": "VIN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "V1:2", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:3", "net": "VIN", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "U1:1", "net": "GND", "kind": "power"},
        {"op": "connect_pin_to_net", "pin": "U1:2", "net": "V3V3", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R1:1", "net": "V3V3", "kind": "label"},
        {"op": "connect_pin_to_net", "pin": "R1:2", "net": "GND", "kind": "power"},
    ])
    return tb, path


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_simulate_a_vendor_subcircuit_bound_with_set_sim_model(tmp_path):
    tb, path = ldo_circuit(tmp_path)
    result = tb.call("simulate", {"path": path, "assertions": [{"probe": "V(V3V3)", "min": 3.2, "max": 3.4}, {"probe": "I(R1)", "equals": "10m", "tol_pct": 5}]})
    assert result["passed"], result["assertions"]
    assert all("." not in key for key in result["analyses"][0]["values"])  # the subcircuit's inner nodes stay out of the summary
    # Dropout: the model follows its input below 3.6 V.
    low = tb.call("simulate", {"path": path, "assertions": [{"probe": "V(V3V3)", "min": 3.2}]})
    assert low["passed"]


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_simulate_reports_a_model_kicad_cannot_load(tmp_path):
    tb, path = ldo_circuit(tmp_path)
    text = open(path, encoding="utf-8").read().replace('"Sim.Name" "LDO33"', '"Sim.Name" "NOPE"')
    open(path, "w", encoding="utf-8").write(text)
    with pytest.raises(ToolError, match=r"(?s)KiCad could not build the SPICE netlist.*NOPE.*kicad_sim_model"):
        tb.call("simulate", {"path": path})


def test_varying_elements_and_tolerances():
    lines = [".title t", "R1 a b 10k", "C1 a 0 100n", "L1 a b 4.7u", "V1 a 0 DC 5 ", "V2 c 0 SIN(0 1 1k)", "XU1 a b c LDO33", "R2 a b {rval}", "D1 a b DMOD"]
    found = spice.varying_elements(lines)
    assert set(found) == {"R1", "C1", "L1", "V1"} and found["R1"][2] == 10000 and found["V1"][2] == 5
    assert spice._percent("5%", "t") == 5 and spice._percent(2, "t") == 2
    with pytest.raises(SimulationError):
        spice._percent("150%", "t")


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_monte_carlo_counts_how_often_each_assertion_holds(tmp_path):
    tb, path = divider(tmp_path)
    loose = {"probe": "V(MID)", "equals": 2.5, "tol_pct": 6, "name": "mid within 6 %"}
    tight = {"probe": "V(MID)", "equals": 2.5, "tol_pct": 0.5, "name": "mid within 0.5 %"}
    result = tb.call("simulate", {"path": path, "assertions": [loose, tight], "monte_carlo": {"runs": 40, "seed": 7}})
    mc = result["monte_carlo"]
    held, broke = mc["assertions"]
    assert (held["passes"], held["runs"], held["passed"]) == (40, 40, True)
    assert 0 < broke["passes"] < 40 and broke["passed"] is False and broke["first_failure"]["varied"].keys() == {"R1", "R2"}
    assert held["min"] < 2.5 < held["max"] and held["min"] > 2.5 * 0.94
    assert mc["tolerances"] == {"R1": 5.0, "R2": 5.0} and mc["varied"] == ["R1", "R2"]
    assert result["passed"] is False  # the nominal run holds, the Monte Carlo does not
    again = tb.call("simulate", {"path": path, "assertions": [loose, tight], "monte_carlo": {"runs": 40, "seed": 7}})
    assert again["monte_carlo"]["assertions"][1]["passes"] == broke["passes"]  # seeded: repeatable
    # a pass rate below 100 % can be acceptable
    relaxed = tb.call("simulate", {"path": path, "assertions": [tight], "monte_carlo": {"runs": 40, "seed": 7, "min_pass_rate": 0.1}})
    assert relaxed["monte_carlo"]["passed"] is True


@needs_kicad_cli
@needs_symbols
@needs_ngspice
def test_monte_carlo_tolerances_and_errors(tmp_path):
    tb, path = divider(tmp_path)
    ok = {"probe": "V(MID)", "min": 2, "max": 3}
    one = tb.call("simulate", {"path": path, "assertions": [ok], "monte_carlo": {"runs": 5, "tolerances": {"R": 0, "R1": "10%", "V1": 2}}})
    assert one["monte_carlo"]["tolerances"] == {"R1": 10.0, "V1": 2.0}
    gauss = tb.call("simulate", {"path": path, "assertions": [ok], "monte_carlo": {"runs": 5, "distribution": "gaussian"}})
    assert gauss["monte_carlo"]["distribution"] == "gaussian"
    for mc, message in (({"runs": 1}, "between 2 and"), ({"tolerances": {"R9": 5}}, "no such element"), ({"tolerances": {"R": 0, "C": 0, "L": 0}}, "nothing to vary"),
                        ({"distribution": "cauchy"}, "distribution"), ({"min_pass_rate": 0}, "min_pass_rate")):
        with pytest.raises(ToolError, match=message):
            tb.call("simulate", {"path": path, "assertions": [ok], "monte_carlo": mc})
    with pytest.raises(ToolError, match="give assertions"):
        tb.call("simulate", {"path": path, "monte_carlo": {}})
