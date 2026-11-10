"""kicad_cli plumbing that does not need KiCad: report normalization and the stream handling
that turned a failing rasterizer into an AttributeError instead of a message."""
import os
import subprocess
import sys

import pytest

from dsh_kicad_sidecar import kicad_cli
from dsh_kicad_sidecar.kicad_cli import KiCadCli, KiCadCliError, normalize_report, output_of, parse_netlist_xml

from conftest import needs_kicad_cli


def _proc(stdout=None, stderr=None, returncode=4):
    return subprocess.CompletedProcess(args=["x"], returncode=returncode, stdout=stdout, stderr=stderr)


def test_output_of_survives_a_discarded_stream():
    """subprocess text=True leaves a stream as None when the child's bytes do not decode; formatting
    an error message on it must still work (this is what crashed `convert` on Windows)."""
    assert output_of(_proc(stdout="", stderr=None)) == ""
    assert output_of(_proc(stdout=None, stderr="Invalid Parameter - 150")) == "Invalid Parameter - 150"
    assert output_of(_proc(stdout="out", stderr="err")) == "errout"
    assert output_of(_proc(stdout=None, stderr=None)) == ""


def test_a_failing_command_reports_its_output_even_without_stderr():
    """A decode failure must not hide the real failure behind a TypeError."""
    with pytest.raises(KiCadCliError) as info:
        # A real command that fails: an output directory on a drive that does not exist.
        KiCadCli(sys.executable).run("sch", "export", "svg", "-o", os.path.join(os.sep, "no-such-drive", "x"), "nope.kicad_sch")
    assert "failed" in str(info.value)


def test_version_probe_tolerates_undecodable_output(monkeypatch):
    """_probe_version reads stdout; a None there must read as "no version", not crash locating."""
    monkeypatch.setattr(kicad_cli.subprocess, "run", lambda *a, **k: _proc(stdout=None, stderr=None, returncode=0))
    assert kicad_cli._probe_version(["/usr/bin/kicad-cli"]) is None


@pytest.mark.skipif(sys.platform != "win32", reason="System32/convert.exe exists on Windows only")
def test_windows_convert_is_not_a_rasterizer():
    """The FAT→NTFS `convert` sits in System32 and is found by name; it must be rejected."""
    found = kicad_cli.rasterizer_path("convert")
    assert found is None or "ImageMagick" in (subprocess.run([found, "-version"], capture_output=True, text=True,
                                                             encoding="utf-8", errors="replace").stdout or "")


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
