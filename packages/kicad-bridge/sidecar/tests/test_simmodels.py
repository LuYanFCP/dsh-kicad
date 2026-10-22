import pytest

from dsh_kicad_sidecar import simmodels
from dsh_kicad_sidecar.simmodels import ModelError, parse_models, plan_pins
from dsh_kicad_sidecar.tools import ToolError, Toolbox

from conftest import needs_kicad_cli, needs_symbols

LIB = """* Vendor LDO, 3.3 V
* Pins: IN GND OUT
.SUBCKT LDO33 IN GND OUT  ; behavioural
B1 n1 GND V=min(V(IN,GND)-0.3,3.3)
Rs n1 OUT 0.1
.ENDS LDO33
.subckt OPAMP1 INP INN OUT
+ VCC VEE PARAMS: gain=1e5
E1 OUT 0 VALUE={LIMIT(1e5*V(INP,INN),V(VEE),V(VCC))}
.ends
.model D1N4148 D(IS=2.52n RS=0.568)
.MODEL Q2N3904 NPN (IS=6.7e-15 BF=416)
.model RMOD R(R=1)
"""


def test_parse_models():
    models = {m["name"]: m for m in parse_models(LIB)}
    assert models["LDO33"] == {"name": "LDO33", "kind": "subckt", "pins": ["IN", "GND", "OUT"], "comment": "Vendor LDO, 3.3 V | Pins: IN GND OUT"}
    assert models["OPAMP1"]["pins"] == ["INP", "INN", "OUT", "VCC", "VEE"]  # continuation line, PARAMS ignored
    assert models["D1N4148"]["type"] == "D" and models["Q2N3904"]["type"] == "NPN"


SYMBOL_BJT = [{"number": "1", "name": "E"}, {"number": "2", "name": "B"}, {"number": "3", "name": "C"}]
SYMBOL_LDO = [{"number": "1", "name": "GND"}, {"number": "2", "name": "VO"}, {"number": "3", "name": "VI"}]


def model(name):
    return next(m for m in parse_models(LIB) if m["name"] == name)


def test_plan_pins_matches_by_name_in_the_models_order():
    value, rows, notes = plan_pins(SYMBOL_BJT, model("Q2N3904"))
    assert value == "1=E 2=B 3=C" and notes == []
    assert [r["model_pin"] for r in rows] == ["E", "B", "C"]


def test_plan_pins_refuses_to_guess():
    with pytest.raises(ModelError, match=r"cannot match model LDO33's pins IN, OUT .*symbol pins: 1\(GND\), 2\(VO\), 3\(VI\)"):
        plan_pins(SYMBOL_LDO, model("LDO33"))


def test_plan_pins_explicit_mapping_is_checked():
    value, _, _ = plan_pins(SYMBOL_LDO, model("LDO33"), {"VI": "IN", "2": "out", "1": "GND"})
    assert value == "1=GND 2=OUT 3=IN"
    assert plan_pins(SYMBOL_LDO, model("LDO33"), "1=GND 2=OUT 3=IN")[0] == value
    with pytest.raises(ModelError, match="no pin 'VOUT'"):
        plan_pins(SYMBOL_LDO, model("LDO33"), {"1": "GND", "2": "VOUT", "3": "IN"})
    with pytest.raises(ModelError, match="symbol has no pin '9'"):
        plan_pins(SYMBOL_LDO, model("LDO33"), {"9": "IN", "1": "GND", "2": "OUT"})
    with pytest.raises(ModelError, match="given twice"):
        plan_pins(SYMBOL_LDO, model("LDO33"), {"1": "GND", "2": "GND", "3": "OUT"})


def test_plan_pins_notes_duplicate_pin_names_and_unknown_device_types():
    symbol = [{"number": "10", "name": "GND"}, {"number": "2", "name": "GND"}, {"number": "1", "name": "IN"}, {"number": "3", "name": "OUT"}]
    value, _, notes = plan_pins(symbol, model("LDO33"))
    assert value == "1=IN 2=GND 3=OUT" and "named GND" in notes[0]
    with pytest.raises(ModelError, match="no pin mapping"):
        plan_pins(SYMBOL_BJT, model("RMOD"))


def test_normalize_pin():
    assert simmodels.normalize_pin("~{RESET}") == simmodels.normalize_pin("reset")
    assert simmodels.normalize_pin("V-") != simmodels.normalize_pin("V+")
    assert simmodels.normalize_pin("GND") != simmodels.normalize_pin("VO")


def test_scan_a_folder_and_filter(tmp_path):
    (tmp_path / "parts.lib").write_text(LIB)
    (tmp_path / "notes.txt").write_text(".model IGNORED D")
    (tmp_path / ".dsh-kicad").mkdir()
    (tmp_path / ".dsh-kicad" / "x.cir").write_text(".model HIDDEN D")
    found = simmodels.scan(str(tmp_path))
    assert [f["file"].rsplit("/", 1)[1] for f in found["files"]] == ["parts.lib"] and found["models"] == 5
    only = simmodels.scan(str(tmp_path / "parts.lib"), "op")
    assert [m["name"] for m in only["files"][0]["models"]] == ["OPAMP1"]
    with pytest.raises(ModelError, match="does not exist"):
        simmodels.scan(str(tmp_path / "missing"))


def test_load_model_lists_what_exists(tmp_path):
    (tmp_path / "parts.lib").write_text(LIB)
    assert simmodels.load_model(str(tmp_path / "parts.lib"), "ldo33")["name"] == "LDO33"
    with pytest.raises(ModelError, match="no model named NOPE .*it has: LDO33, OPAMP1"):
        simmodels.load_model(str(tmp_path / "parts.lib"), "NOPE")


def test_library_reference_is_relative_to_the_project(tmp_path):
    (tmp_path / "models").mkdir()
    (tmp_path / "models" / "a.lib").write_text(LIB)
    sch = str(tmp_path / "x.kicad_sch")
    assert simmodels.library_reference(sch, "models/a.lib")[1] == "models/a.lib"
    assert simmodels.library_reference(sch, "${KIPRJMOD}/models/a.lib")[1] == "models/a.lib"
    assert simmodels.library_reference(sch, str(tmp_path / "models" / "a.lib"))[1] == "models/a.lib"
    with pytest.raises(ModelError, match="does not exist"):
        simmodels.library_reference(sch, "nope.lib")


# ---- through kicad_edit_schematic ------------------------------------------------------------
@needs_kicad_cli
@needs_symbols
def test_set_sim_model_binds_a_library_model_and_a_builtin_device(tmp_path):
    (tmp_path / "parts.lib").write_text(LIB)
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / "m.kicad_sch")
    tb.call("create_schematic", {"path": path})
    tb.call("edit_schematic", {"path": path, "operations": [
        {"op": "add_symbol", "lib_id": "Transistor_BJT:2N3904", "x": 76.2, "y": 38.1, "reference": "Q1", "value": "2N3904"},
        {"op": "add_symbol", "lib_id": "Regulator_Linear:AMS1117-3.3", "x": 101.6, "y": 38.1, "reference": "U1", "value": "AMS1117-3.3"},
        {"op": "add_symbol", "lib_id": "Device:LED", "x": 127, "y": 38.1, "reference": "D1", "value": "LED"},
    ]})
    result = tb.call("edit_schematic", {"path": path, "operations": [
        {"op": "set_sim_model", "reference": "Q1", "library": "parts.lib", "name": "q2n3904"},
        {"op": "set_sim_model", "reference": "U1", "library": "parts.lib", "name": "LDO33", "pins": {"1": "GND", "2": "OUT", "3": "IN"}},
        {"op": "set_sim_model", "reference": "D1", "device": "D", "params": "is=1e-18 n=2 rs=3"},
    ]})
    q1, u1, d1 = (r["result"] for r in result["results"])
    assert (q1["device"], q1["pins"], q1["name"]) == ("NPN", "1=E 2=B 3=C", "Q2N3904")
    assert (u1["device"], u1["pins"], u1["library"]) == ("SUBCKT", "1=GND 2=OUT 3=IN", "parts.lib")
    assert d1["params"] == "is=1e-18 n=2 rs=3" and "pins" not in d1  # Device:LED already carries Sim.Pins
    comps = {c["reference"]: c for c in tb.call("read_schematic", {"path": path})["components"]}
    assert comps["U1"]["properties"]["Sim.Library"] == "parts.lib" and comps["U1"]["properties"]["Sim.Pins"] == "1=GND 2=OUT 3=IN"
    assert comps["D1"]["properties"]["Sim.Device"] == "D"


@needs_kicad_cli
@needs_symbols
def test_set_sim_model_errors_name_the_fix(tmp_path):
    (tmp_path / "parts.lib").write_text(LIB)
    tb = Toolbox(roots=[str(tmp_path)])
    path = str(tmp_path / "m.kicad_sch")
    tb.call("create_schematic", {"path": path})
    tb.call("edit_schematic", {"path": path, "operations": [
        {"op": "add_symbol", "lib_id": "Regulator_Linear:AMS1117-3.3", "x": 101.6, "y": 38.1, "reference": "U1", "value": "AMS1117-3.3"}]})
    for op, message in (
        ({"reference": "U1", "library": "parts.lib", "name": "LDO33"}, "cannot match model LDO33"),
        ({"reference": "U1", "library": "parts.lib", "name": "NOPE"}, "no model named NOPE"),
        ({"reference": "U1", "library": "gone.lib", "name": "LDO33"}, "does not exist"),
        ({"reference": "U1", "library": "parts.lib"}, "library and name together"),
        ({"reference": "U1"}, "library \\+ name, or device"),
        ({"reference": "U9", "device": "D"}, "no symbol with reference"),
    ):
        with pytest.raises(ToolError, match=message):
            tb.call("edit_schematic", {"path": path, "operations": [{"op": "set_sim_model", **op}]})


def test_sim_model_tool(tmp_path):
    (tmp_path / "parts.lib").write_text(LIB)
    tb = Toolbox(roots=[str(tmp_path)])
    result = tb.call("sim_model", {"path": str(tmp_path), "name": "ldo"})
    assert result["models"] == 1 and result["files"][0]["models"][0]["pins"] == ["IN", "GND", "OUT"]
    with pytest.raises(ToolError, match="outside the allowed roots"):
        tb.call("sim_model", {"path": "/etc"})
