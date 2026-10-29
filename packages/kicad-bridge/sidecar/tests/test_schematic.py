import pytest

from dsh_kicad_sidecar.geometry import transform
from dsh_kicad_sidecar.schematic import Schematic, SchematicError
from dsh_kicad_sidecar.sexpr import dumps, parse
from dsh_kicad_sidecar.tools import Toolbox

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


@needs_symbols
def test_sideways_two_pin_part_gets_readable_fields(project):
    s = Schematic(project("blank"))
    s.add_symbol("Device:R", 100.33, 80.01, reference="R1", value="10k", rotation=90)
    sym = s.find_symbol("R1")
    ref = sym.node.property("Reference").find("at")
    val = sym.node.property("Value").find("at")
    assert float(ref.value(1)) < 80.01 < float(val.value(1))  # above and below the body
    assert ref.value(2) == "90" and val.value(2) == "90"
    assert float(ref.value(0)) == float(val.value(0)) == 100.33


@needs_symbols
def test_derived_symbols_report_and_place_their_pins(project):
    from dsh_kicad_sidecar.symbols import SymbolLibraries

    hits = {r["lib_id"]: r for r in SymbolLibraries().search("attiny85", limit=10)}
    assert hits["MCU_Microchip_ATtiny:ATtiny85-20S"]["pins"] == 8
    s = Schematic(project("blank"))
    placed = s.add_symbol("MCU_Microchip_ATtiny:ATtiny85-20S", 100.33, 80.01)
    assert placed["reference"] == "U1" and len(placed["pins"]) == 8
    names = {p["name"] for p in placed["pins"]}
    assert {"VCC", "GND"} <= names and any("PB0" in n for n in names)


def _nets(cli, path):
    return {n["name"]: {(x["ref"], x["pin"]) for x in n["nodes"]} for n in cli.netlist(path)["nets"]}


@needs_symbols
@needs_kicad_cli
def test_blocks_frame_parts_and_move_with_their_wiring(project):
    from dsh_kicad_sidecar.kicad_cli import KiCadCli

    path = project("rc_filter")
    cli = KiCadCli()
    before = _nets(cli, path)
    s = Schematic(path)
    unframed = s.summary()  # no block yet: every part is outside one (power symbols aside)
    assert "blocks" not in unframed and unframed["outside_blocks"] == ["C1", "J1", "R1"]
    s.apply({"op": "set_page", "paper": "A3", "title": "RC filter", "rev": "v0.2"})
    made = s.apply({"op": "add_block", "title": "FILTER", "references": ["R1", "C1"]})
    assert s.summary()["outside_blocks"] == s.outside_blocks() == ["J1"]
    s.apply({"op": "add_block", "title": "INPUT", "references": ["J1"]})
    blocks = {b["title"]: b for b in s.blocks()}
    assert blocks["FILTER"]["references"] == ["C1", "R1"] and blocks["INPUT"]["references"] == ["J1"]
    assert blocks["FILTER"]["at"] == made["at"] and "overlaps" not in made
    summary = s.summary()
    assert summary["page"]["paper"] == "A3" and summary["title_block"]["title"] == "RC filter"
    assert "outside_blocks" not in summary and {t["text"] for t in summary["texts"]} == {"FILTER", "INPUT"}
    old = {p["number"]: (p["x"], p["y"]) for p in s.pins("C1")}
    s.apply({"op": "move_block", "title": "FILTER", "dx": 101.6, "dy": 50.8})
    new = {p["number"]: (p["x"], p["y"]) for p in s.pins("C1")}
    assert all(new[n] == (round(old[n][0] + 101.6, 4), round(old[n][1] + 50.8, 4)) for n in old)
    assert {b["title"]: b for b in s.blocks()}["FILTER"]["references"] == ["C1", "R1"]
    s.save()
    # Same connectivity, still a clean ERC: the wires, labels and power symbols travelled along.
    assert _nets(cli, path) == before
    assert cli.erc(path)["passed"]


@needs_symbols
def test_edit_results_name_the_parts_outside_every_block(project):
    path = project("rc_filter")
    tb = Toolbox()
    edit = lambda *ops: tb.call("edit_schematic", {"path": path, "operations": list(ops)})
    # A batch that places or moves nothing says nothing about blocks.
    assert "outside_blocks" not in edit({"op": "set_value", "reference": "R1", "value": "4k7"})
    framed = edit({"op": "add_block", "title": "FILTER", "references": ["R1", "C1"]})
    assert framed["blocks"] == [{"title": "FILTER", "references": ["C1", "R1"]}] and framed["outside_blocks"] == ["J1"]
    done = edit({"op": "add_block", "title": "INPUT", "references": ["J1"]})
    assert [b["title"] for b in done["blocks"]] == ["FILTER", "INPUT"] and done["outside_blocks"] == []
    # A new part outside every frame is named; a power symbol is not a part of any block.
    placed = edit({"op": "add_symbol", "lib_id": "Device:R", "x": 250.19, "y": 160.02, "reference": "R2"},
                  {"op": "add_symbol", "lib_id": "power:GND", "x": 260.35, "y": 160.02})
    assert placed["outside_blocks"] == ["R2"]
    assert "outside_blocks" not in tb.call("edit_schematic", {"path": project("blank"), "operations": [
        {"op": "add_symbol", "lib_id": "power:GND", "x": 50.8, "y": 50.8}]})  # nothing but power symbols: nothing to frame


@needs_symbols
def test_move_symbols_refuses_to_tear_a_wire(project):
    s = Schematic(project("rc_filter"))
    with pytest.raises(SchematicError, match="R1:2 → C1:1"):
        s.apply({"op": "move_symbols", "references": ["R1"], "dx": 10, "dy": 0})
    result = s.apply({"op": "move_symbols", "references": ["R1", "C1"], "dx": 12.7, "dy": 0})
    assert result["attached"]["labels"] >= 1 and result["attached"]["power"] >= 1


def test_text_rectangle_and_page_validation(project):
    s = Schematic(project("blank"))
    s.apply({"op": "add_text", "text": "Note", "x": 20, "y": 20, "size": 2.54, "bold": True})
    s.apply({"op": "add_rectangle", "x": 10, "y": 10, "width": 50, "height": 30})
    assert [b["title"] for b in s.blocks()] == ["Note"]  # a titled frame reads as a block
    with pytest.raises(SchematicError):
        s.apply({"op": "add_block", "title": "Note", "x": 100, "y": 10, "width": 20, "height": 20})
    over = s.apply({"op": "add_block", "title": "B", "x": 40, "y": 20, "width": 40, "height": 40})
    assert over["overlaps"] == ["Note"]
    with pytest.raises(SchematicError):
        s.apply({"op": "add_block", "title": "C"})
    with pytest.raises(SchematicError):
        s.apply({"op": "set_page", "paper": "A9"})
    s.apply({"op": "set_page", "comments": ["first", "second"], "date": "2026-10-21"})
    tb = s.root.find("title_block")
    assert [c.head for c in tb.lists()] == ["date", "comment", "comment"]
    assert dumps(parse(s.text())) == s.text()


def _segments(s):
    return [(tuple(w["from"]), tuple(w["to"])) for w in s.wiring()["wires"]]


def _crosses_box(seg, box):
    (x0, y0), (x1, y1) = seg
    return min(x0, x1) <= box[2] and box[0] <= max(x0, x1) and min(y0, y1) <= box[3] and box[1] <= max(y0, y1)


@needs_symbols
@needs_kicad_cli
def test_connect_pins_routes_around_parts_and_other_nets(project):
    """The straight line is blocked by a part and crossed by another net: the wire goes around the part,
    crosses the other net's wire at a right angle, and KiCad sees exactly the two pins joined."""
    from dsh_kicad_sidecar import geometry
    from dsh_kicad_sidecar.kicad_cli import KiCadCli

    path = project("blank")
    s = Schematic(path)
    for ref, x in (("R1", 40.64), ("R2", 60.96), ("R3", 81.28)):
        s.add_symbol("Device:R", x, 50.8, reference=ref, rotation=90)  # pins on y=50.8, 3.81 mm either side
    s.add_wire([[71.12, 38.1], [71.12, 63.5]])  # another net, across the gap between R2 and R3
    s.add_label("OTHER", 71.12, 38.1)
    s.add_label("OTHER", 71.12, 63.5)
    result = s.apply({"op": "connect_pins", "a": "R1:2", "b": "R3:1"})
    assert result["points"][0] == [44.45, 50.8] and result["points"][-1] == [77.47, 50.8]
    assert "note" not in result and "junctions" not in result
    lib = s.lib_symbol("Device:R")
    r2 = s.find_symbol("R2")
    body = geometry.body_bbox(lib, r2.at, r2.mirror, r2.unit)
    new = list(zip(result["points"], result["points"][1:]))
    assert not any(_crosses_box(seg, body) for seg in new)
    s.save()
    nets = _nets(KiCadCli(), path)
    joined = next(n for n in nets.values() if ("R1", "2") in n)
    assert joined == {("R1", "2"), ("R3", "1")}
    assert all(("R2", p) not in n for n in nets.values() if len(n) > 1 for p in ("1", "2"))
    assert not any(("R1", "2") in n for name, n in nets.items() if "OTHER" in name)


@needs_symbols
@needs_kicad_cli
def test_connect_pins_joins_existing_wiring_with_a_junction(project):
    from dsh_kicad_sidecar.kicad_cli import KiCadCli

    path = project("blank")
    s = Schematic(path)
    s.add_symbol("Device:R", 50.8, 50.8, reference="R1", rotation=90)
    s.add_symbol("Device:R", 76.2, 50.8, reference="R2", rotation=90)
    s.add_symbol("Device:R", 63.5, 66.04, reference="R3")  # vertical, pin 1 on top under the R1-R2 wire
    s.apply({"op": "connect_pins", "a": "R1:2", "b": "R2:1"})
    tap = s.apply({"op": "connect_pins", "a": "R3:1", "b": "R1:2"})
    assert tap["junctions"] and tap["points"][-1] in tap["junctions"]
    assert "joining existing wiring" in s.changes[-1]
    assert s.apply({"op": "connect_pins", "a": "R2:1", "b": "R3:1"}) == {"already_connected": True}
    s.save()
    nets = _nets(KiCadCli(), path)
    assert next(n for n in nets.values() if ("R1", "2") in n) == {("R1", "2"), ("R2", "1"), ("R3", "1")}


@needs_symbols
def test_connect_pins_refuses_a_blocked_pin_and_flags_detours(project):
    s = Schematic(project("blank"))
    s.add_symbol("Device:R", 50.8, 50.8, reference="R1")  # vertical: pin 1 at (50.8, 46.99) points up
    s.add_symbol("Device:R", 50.8, 44.45, reference="R2", rotation=90)  # lies across that exit
    s.add_symbol("Device:R", 76.2, 50.8, reference="R3")
    with pytest.raises(SchematicError, match="cannot wire R1:1 to R3:1.*connect_pin_to_net"):
        s.apply({"op": "connect_pins", "a": "R1:1", "b": "R3:1"})
    s.add_symbol("MCU_Microchip_ATtiny:ATtiny85-20S", 127, 63.5, reference="U1")
    s.add_symbol("Device:R", 101.6, 63.5, reference="R4", rotation=90)
    away = s.apply({"op": "connect_pins", "a": "U1:5", "b": "R4:2"})  # a right-side pin wired to a part on the left
    assert "face each other" in away["note"]


@needs_symbols
@needs_kicad_cli
def test_power_symbol_on_a_wired_pin_branches_off_the_wire(project):
    from dsh_kicad_sidecar.kicad_cli import KiCadCli

    path = project("blank")
    s = Schematic(path)
    s.add_symbol("Device:C", 50.8, 50.8, reference="C1")
    s.add_symbol("Device:C", 63.5, 50.8, reference="C2")
    s.apply({"op": "connect_pins", "a": "C1:2", "b": "C2:2"})  # both bottom pins: a U under the caps
    before = _segments(s)
    out = s.apply({"op": "connect_pin_to_net", "pin": "C1:2", "net": "GND", "kind": "power"})
    assert out["from"] != out["pin"] and out["end"][1] > out["from"][1]  # hangs below the wire
    stub = next(seg for seg in _segments(s) if seg not in before)
    for a, b in before:  # the stub does not lie on top of an existing wire
        assert not (a[0] == b[0] == stub[0][0] == stub[1][0] and min(a[1], b[1]) < max(stub[0][1], stub[1][1])
                    and min(stub[0][1], stub[1][1]) < max(a[1], b[1]))
    assert any(j["at"] == out["from"] for j in s.wiring()["junctions"])
    free = s.apply({"op": "connect_pin_to_net", "pin": "C1:1", "net": "+3V3", "kind": "power"})
    assert "from" not in free and free["end"] == [50.8, 44.45]  # an unwired pin keeps the plain stub
    s.save()
    nets = _nets(KiCadCli(), path)
    assert {("C1", "2"), ("C2", "2")} <= nets["GND"] and ("C1", "1") in nets["+3V3"]


@needs_symbols
def test_power_symbols_always_get_a_hash_reference(project):
    """A power symbol annotated without '#' is a real part to KiCad (a netlist entry with no footprint, so
    schematic parity fails): the library's own prefix is used, and a given prefix or reference gains the '#'."""
    path = project("blank")
    s = Schematic(path)
    refs = [s.add_symbol("power:PWR_FLAG", 50.8, 50.8 + 5.08 * i, reference=ref)["reference"]
            for i, ref in enumerate(["FLG?", "FLG7", None, "#FLG?"])]
    assert refs == ["#FLG1", "#FLG7", "#FLG2", "#FLG3"]
    gnd = [s.add_symbol("power:GND", 76.2, 50.8 + 5.08 * i, reference=ref)["reference"] for i, ref in enumerate([None, "PWR?"])]
    assert gnd == ["#PWR1", "#PWR2"]
    assert s.add_symbol("Device:R", 101.6, 50.8, reference="R?")["reference"] == "R1"  # ordinary parts are untouched
    with pytest.raises(SchematicError, match="#FLG7 already exists"):
        s.add_symbol("power:PWR_FLAG", 50.8, 76.2, reference="FLG7")
    s.save()
    assert {sym.reference for sym in Schematic(path).symbols()} == {"#FLG1", "#FLG7", "#FLG2", "#FLG3", "#PWR1", "#PWR2", "R1"}
