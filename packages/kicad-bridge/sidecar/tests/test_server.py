import json
import os
import subprocess
import sys

import pytest

from conftest import needs_kicad_cli, needs_symbols

SRC = os.path.join(os.path.dirname(__file__), "..", "src")


def rpc(lines, *extra):
    env = {**os.environ, "PYTHONPATH": SRC}
    proc = subprocess.run([sys.executable, "-m", "dsh_kicad_sidecar", *extra], input="".join(json.dumps(l) + "\n" for l in lines),
                          capture_output=True, text=True, env=env, timeout=120)
    assert proc.returncode == 0, proc.stderr
    return {m["id"]: m for m in map(json.loads, proc.stdout.splitlines()) if "id" in m}


def test_mcp_handshake_and_tool_list():
    out = rpc([
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "nope"},
    ])
    assert out[1]["result"]["serverInfo"]["name"] == "dsh-kicad-sidecar"
    names = {t["name"] for t in out[2]["result"]["tools"]}
    assert {"read_schematic", "edit_schematic", "erc", "render"} <= names
    assert out[3]["error"]["code"] == -32601


@needs_symbols
def test_tools_call_and_domain_errors(project):
    path = project("rc_filter")
    out = rpc([
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "read_schematic", "arguments": {"path": path}}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "edit_schematic", "arguments": {"path": path, "operations": [{"op": "set_value", "reference": "R9", "value": "1"}]}}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "read_schematic", "arguments": {"path": "/etc/passwd"}}},
    ])
    summary = out[1]["result"]["structuredContent"]
    assert [c["reference"] for c in summary["components"]] == ["C1", "J1", "R1"]
    assert out[2]["result"]["isError"] and "nothing was written" in out[2]["result"]["content"][0]["text"]
    assert out[3]["result"]["isError"]


def test_root_restriction(project, tmp_path):
    path = project("rc_filter")
    out = rpc([{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "read_schematic", "arguments": {"path": path}}}],
              "--root", str(tmp_path / "elsewhere"))
    assert out[1]["result"]["isError"] and "outside the allowed roots" in out[1]["result"]["content"][0]["text"]


@needs_symbols
@needs_kicad_cli
def test_edit_then_erc_over_rpc(project):
    path = project("erc_errors")
    out = rpc([
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "edit_schematic", "arguments": {"path": path, "operations": [
            {"op": "connect_pins", "a": "R1:1", "b": "R1:2"}]}}},
    ])
    assert out[1]["result"]["isError"] is False
    out = rpc([{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "erc", "arguments": {"path": path}}}])
    erc = out[2]["result"]["structuredContent"]
    assert erc["counts"]["error"] == 0


@needs_kicad_cli
def test_render_png(project):
    path = project("rc_filter")
    out = rpc([{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "render", "arguments": {"path": path, "format": "png", "width": 800}}}])
    res = out[1]["result"]
    if res["isError"] and "rasterizer" in res["content"][0]["text"]:
        pytest.skip("no rasterizer installed")
    value = res["structuredContent"]
    assert value["svg"][0].endswith(".svg") and os.path.isfile(value["png"][0])
    assert ".dsh-kicad" in value["output_dir"]


@needs_symbols
def test_library_symbol_and_footprint_search():
    out = rpc([
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "library_symbol", "arguments": {"lib_id": "Regulator_Linear:AMS1117-3.3"}}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "search_footprints", "arguments": {"query": "R 0603", "library": "Resistor_SMD", "limit": 3}}},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "search_footprints", "arguments": {"query": "Connector_USB:USB_C_Receptacle_GCT_USB4125-xx-x_6P_TopMnt_Horizontal"}}},
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "library_symbol", "arguments": {"lib_id": "Device:NOPE"}}},
    ])
    ldo = out[1]["result"]["structuredContent"]
    assert {p["name"] for p in ldo["pins"]} >= {"VI", "VO", "GND"} and ldo["footprint"].startswith("Package_TO_SOT_SMD:SOT-223")
    fps = [r["lib_id"] for r in out[2]["result"]["structuredContent"]["results"]]
    assert "Resistor_SMD:R_0603_1608Metric" in fps
    usb = out[3]["result"]["structuredContent"]["results"][0]
    assert usb["exists"] and set(usb["pads"]) == {"A5", "A9", "A12", "B5", "B9", "B12", "SH"}
    assert out[4]["result"]["isError"]
