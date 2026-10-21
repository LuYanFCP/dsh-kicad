import pytest

from dsh_kicad_sidecar.geometry import transform
from dsh_kicad_sidecar.schematic import Schematic, SchematicError
from dsh_kicad_sidecar.sexpr import dumps, parse

from conftest import needs_kicad_cli, needs_symbols


def test_summary_of_fixture(project):
    s = Schematic(project("rc_filter"))
    summary = s.summary()
    refs = [c["reference"] for c in summary["components"]]
    assert refs == ["C1", "J1", "R1"]
    assert summary["power_nets"] == ["GND", "PWR_FLAG"]
    assert {l["text"] for l in summary["labels"]} == {"IN", "OUT"}
    r1 = next(c for c in summary["components"] if c["reference"] == "R1")
    assert r1["value"] == "10k" and r1["footprint"].startswith("Resistor_SMD")


def test_pins_follow_symbol_transform(project):
    s = Schematic(project("rc_filter"))
    pins = {p["number"]: p for p in s.pins("R1")}
    assert (pins["1"]["x"], pins["1"]["y"]) == (100.33, 76.2)
    assert pins["1"]["outward"] == [0, -1] and pins["2"]["outward"] == [0, 1]


@pytest.mark.parametrize("rot, mirror, expected", [
    (0, None, (1, -2)), (90, None, (-2, -1)), (180, None, (-1, 2)), (270, None, (2, 1)),
    (0, "x", (1, 2)), (0, "y", (-1, -2)), (90, "y", (2, -1)),
])
def test_transform(rot, mirror, expected):
    assert transform(1, 2, rot, mirror) == expected


@needs_symbols
def test_edits_round_trip_and_keep_untouched_text(project):
    path = project("rc_filter")
    original = open(path).read()
    s = Schematic(path)
    s.set_property("R1", "Value", "4k7")
    s.save()
    after = open(path).read()
    assert after.count("\n") == original.count("\n")
    assert '"4k7"' in after and '"10k"' not in after
    assert dumps(parse(after)) == after


@needs_symbols
def test_add_symbol_autoreferences_and_caches_library(project):
    s = Schematic(project("blank"))
    first = s.add_symbol("Device:R", 50, 50)
    second = s.add_symbol("Device:R", 60, 50, reference="R?")
    assert (first["reference"], second["reference"]) == ("R1", "R2")
    assert s.lib_symbol("Device:R") is not None
    assert len(list(s.root.find("lib_symbols").lists("symbol"))) == 1
    sym = s.find_symbol("R2")
    assert sym.node.find("instances") is not None
    assert {p.value(0) for p in sym.node.lists("pin")} == {"1", "2"}
    with pytest.raises(SchematicError):
        s.add_symbol("Device:R", 70, 50, reference="R1")


@needs_symbols
def test_unknown_operation_and_bad_pin(project):
    s = Schematic(project("rc_filter"))
    with pytest.raises(SchematicError, match="unknown operation"):
        s.apply({"op": "explode"})
    with pytest.raises(SchematicError, match="has no pin"):
        s.apply({"op": "connect_pins", "a": "R1:9", "b": "C1:1"})


@needs_symbols
def test_remove_and_move(project):
    s = Schematic(project("rc_filter"))
    s.move_symbol("C1", 130, 90)
    assert s.find_symbol("C1").at[:2] == (129.54, 90.17)
    s.remove_symbol("C1")
    assert all(x.reference != "C1" for x in s.symbols())


@needs_symbols
@needs_kicad_cli
def test_read_edit_erc_loop(project):
    """The closed loop the agent runs: start from an ERC failure, fix it, let KiCad judge."""
    from dsh_kicad_sidecar.kicad_cli import KiCadCli

    path = project("erc_errors")
    cli = KiCadCli()
    before = cli.erc(path)
    assert not before["passed"] and before["by_type"].get("pin_not_connected") == 2
    s = Schematic(path)
    s.apply({"op": "connect_pin_to_net", "pin": "R1:1", "net": "A", "kind": "global_label"})
    s.apply({"op": "no_connect_pin", "pin": "R1:2"})
    s.save()
    after = cli.erc(path)
    assert after["counts"]["error"] == 0, after["violations"]
    nets = {n["name"]: n["nodes"] for n in cli.netlist(path)["nets"]}
    assert any(node["ref"] == "R1" and node["pin"] == "1" for node in nets["A"])
