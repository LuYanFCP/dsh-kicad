import re

from dsh_kicad_sidecar.kicad_cli import KiCadCli
from dsh_kicad_sidecar.netlist import parse_netlist, read_netlist

from conftest import needs_kicad_cli

# Trimmed from `kicad-cli sch export netlist --format kicadsexpr` (KiCad 10) with a sub-sheet added.
NETLIST = """(export
	(version "E")
	(components
		(comp
			(ref "U1")
			(value "AMS1117-3.3")
			(footprint "Package_TO_SOT_SMD:SOT-223-3_TabPin2")
			(fields
				(field
					(name "Footprint") "Package_TO_SOT_SMD:SOT-223-3_TabPin2")
				(field
					(name "Datasheet") "http://www.advanced-monolithic.com/pdf/ds1117.pdf")
				(field
					(name "Description"))
				(field
					(name "MPN") "AMS1117-3.3"))
			(libsource
				(lib "Regulator_Linear")
				(part "AMS1117-3.3"))
			(property
				(name "Sheetname")
				(value "Power"))
			(property
				(name "Sheetfile")
				(value "power.kicad_sch"))
			(property
				(name "dnp"))
			(property
				(name "ki_fp_filters")
				(value "SOT?223*TabPin2*"))
			(sheetpath
				(names "/Power/")
				(tstamps "/8a1c51d2-3c0f-4a40-9a8e-0a7c3b1f0001/"))
			(tstamps "294b9cdc-1111-4c3e-8f1a-000000000001" "294b9cdc-1111-4c3e-8f1a-000000000002")
			(units
				(unit
					(name "A")
					(pins
						(pin
							(num "1"))
						(pin
							(num "2"))
						(pin
							(num "3"))))))
		(comp
			(ref "R1")
			(value "1k")
			(libsource
				(lib "Device")
				(part "R"))
			(property
				(name "exclude_from_board"))
			(sheetpath
				(names "/")
				(tstamps "/"))
			(tstamps "5a0e076c-0000-4000-8000-000000000003")))
	(nets
		(net
			(code "1")
			(name "+3V3")
			(class "Default")
			(node
				(ref "U1")
				(pin "2")
				(pinfunction "VO")
				(pintype "power_out")))
		(net
			(code "2")
			(name "unconnected-(U1-ADJ-Pad1)")
			(class "Default")
			(node
				(ref "U1")
				(pin "1")
				(pinfunction "ADJ")
				(pintype "input+no_connect")))))
"""


def test_parse_netlist_links_footprints_like_kicad():
    net = parse_netlist(NETLIST)
    u1 = net.component("U1")
    # sheet path + the first unit's symbol uuid: what KiCad writes into the footprint's (path …)
    assert u1.path == "/8a1c51d2-3c0f-4a40-9a8e-0a7c3b1f0001/294b9cdc-1111-4c3e-8f1a-000000000001"
    assert u1.unit_paths == [u1.path, "/8a1c51d2-3c0f-4a40-9a8e-0a7c3b1f0001/294b9cdc-1111-4c3e-8f1a-000000000002"]
    assert (u1.footprint, u1.lib_id, u1.sheet_name, u1.sheet_file) == (
        "Package_TO_SOT_SMD:SOT-223-3_TabPin2", "Regulator_Linear:AMS1117-3.3", "/Power/", "power.kicad_sch")
    assert u1.fields == {"Datasheet": "http://www.advanced-monolithic.com/pdf/ds1117.pdf", "Description": "", "MPN": "AMS1117-3.3"}
    assert u1.flags == {"dnp"} and u1.on_board
    assert u1.fp_filters == "SOT?223*TabPin2*"
    assert u1.units == [("A", ["1", "2", "3"])]
    assert u1.pins["2"].net == "+3V3" and u1.pins["2"].function == "VO" and u1.pins["2"].type == "power_out"
    assert u1.pins["1"].net == "unconnected-(U1-ADJ-Pad1)" and u1.pins["1"].type == "input+no_connect"
    assert "3" not in u1.pins

    r1 = net.component("R1")
    assert r1.path == "/5a0e076c-0000-4000-8000-000000000003" and r1.footprint == "" and not r1.on_board
    assert [(n.code, n.name, n.net_class, n.nodes) for n in net.nets] == [
        (1, "+3V3", "Default", [("U1", "2")]), (2, "unconnected-(U1-ADJ-Pad1)", "Default", [("U1", "1")])]


@needs_kicad_cli
def test_usb_attiny_fixture_is_ready_for_a_board(project):
    """The PCB phases (#10, #12, #13) start from this fixture: ERC clean and a footprint on every symbol."""
    path = project("usb_attiny")
    cli = KiCadCli()
    assert cli.erc(path)["counts"]["total"] == 0
    net = read_netlist(cli, path)
    assert len(net.components) == 15 and len(net.nets) == 13
    assert all(c.footprint and c.on_board for c in net.components)
    with open(path, encoding="utf-8") as fh:
        sch = fh.read()
    for c in net.components:  # every footprint path is a symbol uuid of the (single-sheet) schematic
        assert re.fullmatch(r"/[0-9a-f-]{36}", c.path) and f'(uuid "{c.path[1:]}")' in sch
    j1 = net.component("J1")
    assert {j1.pins[p].net for p in ("A12", "B12", "SH")} == {"GND"}
