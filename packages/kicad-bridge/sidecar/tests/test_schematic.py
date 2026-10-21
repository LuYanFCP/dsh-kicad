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


@needs_symbols
@needs_kicad_cli
def test_disconnect_pin_undoes_label_and_power_connections(project):
    from dsh_kicad_sidecar.kicad_cli import KiCadCli

    path = project("rc_filter")
    cli = KiCadCli()
    s = Schematic(path)
    labels_before = sum(1 for _ in s.root.lists("label"))
    removed = s.apply({"op": "disconnect_pin", "pin": "C1:2"})  # its GND power symbol + stub
    assert removed == {"wires": 1, "labels": 0, "no_connects": 0, "power_symbols": 1}
    removed = s.apply({"op": "disconnect_pin", "pin": "J1:1"})  # IN label + stub
    assert removed["wires"] == 1 and removed["labels"] == 1
    assert sum(1 for _ in s.root.lists("label")) == labels_before - 1
    s.save()
    nets = {n["name"]: {(x["ref"], x["pin"]) for x in n["nodes"]} for n in cli.netlist(path)["nets"]}
    assert ("C1", "2") not in nets.get("GND", set()) and ("J1", "1") not in nets.get("/IN", set())
    # The rest of the design is untouched: R1-C1 still share OUT.
    assert {("R1", "2"), ("C1", "1")} <= nets["/OUT"]
    # Re-adding restores a clean ERC.
    s = Schematic(path)
    s.apply({"op": "connect_pin_to_net", "pin": "C1:2", "net": "GND", "kind": "power"})
    s.apply({"op": "connect_pin_to_net", "pin": "J1:1", "net": "IN"})
    s.save()
    assert cli.erc(path)["passed"]


@needs_symbols
def test_disconnect_pin_stops_at_the_other_part(project):
    s = Schematic(project("rc_filter"))
    s.apply({"op": "disconnect_pin", "pin": "R1:2"})  # the R1-C1 wire; must not touch C1's OUT label
    assert any(l["text"] == "OUT" for l in s.summary()["labels"])
    assert all(_ for _ in s.pins("C1"))


def test_remove_item_label_and_wire(project):
    s = Schematic(project("rc_filter"))
    wiring = s.wiring()
    first = wiring["wires"][0]
    s.apply({"op": "remove_item", "uuid": first["uuid"]})
    assert len(s.wiring()["wires"]) == len(wiring["wires"]) - 1
    assert s.apply({"op": "remove_label", "text": "OUT"}) == 2
    with pytest.raises(SchematicError):
        s.apply({"op": "remove_label", "text": "NOPE"})
    w = s.wiring()["wires"][0]
    assert s.apply({"op": "remove_wire", "x": w["from"][0], "y": w["from"][1]}) >= 1
    with pytest.raises(SchematicError):
        s.apply({"op": "remove_item", "uuid": "00000000-dead"})
    summary = s.summary(include_wiring=True)
    assert "wiring" in summary and all("uuid" in l for l in summary["labels"])
