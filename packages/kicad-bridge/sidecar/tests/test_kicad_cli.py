import os

from dsh_kicad_sidecar.kicad_cli import KiCadCli, normalize_report, parse_netlist_xml

from conftest import needs_kicad_cli


def test_normalize_erc_report():
    report = {"source": "x.kicad_sch", "sheets": [{"path": "/", "violations": [
        {"severity": "error", "type": "pin_not_connected", "description": "Pin not connected", "items": [{"description": "R1 pin 1", "pos": {"x": 1, "y": 2}}]},
        {"severity": "warning", "type": "lib_symbol_mismatch", "description": "w", "items": [], "excluded": True},
    ]}]}
    out = normalize_report(report, "erc")
    assert out["passed"] is False
    assert out["counts"] == {"error": 1, "warning": 0, "exclusion": 1, "total": 1}
    assert out["violations"][0]["sheet"] == "/"


def test_parse_netlist_xml():
    xml = """<export><components><comp ref="R1"><value>1k</value><libsource lib="Device" part="R"/></comp></components>
    <nets><net code="1" name="/A"><node ref="R1" pin="1" pintype="passive"/></net></nets></export>"""
    out = parse_netlist_xml(xml)
    assert out["components"][0] == {"reference": "R1", "value": "1k", "footprint": "", "lib_id": "Device:R", "sheet": "/"}
    assert out["nets"][0] == {"name": "/A", "code": 1, "nodes": [{"ref": "R1", "pin": "1", "pin_type": "passive"}]}


@needs_kicad_cli
def test_erc_bom_netlist_svg(project, tmp_path):
    path = project("rc_filter")
    cli = KiCadCli()
    assert cli.erc(path)["passed"]
    nets = {n["name"] for n in cli.netlist(path)["nets"]}
    assert {"/IN", "/OUT", "GND"} <= nets
    bom = cli.bom(path)
    assert {r["Refs"] for r in bom["rows"]} >= {"R1", "C1", "J1"}
    svgs = cli.export_sch_svg(path, str(tmp_path / "svg"))
    assert svgs and open(svgs[0]).read().lstrip().startswith("<?xml")
    assert os.path.getsize(svgs[0]) > 1000
