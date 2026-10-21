"""kicad_autoroute, judged by KiCad's DRC. The orchestration runs against a fake Freerouting everywhere; the end-to-end
tests run the real one when it is installed (the downloaded jar, or $FREEROUTING_JAR) and skip otherwise."""
import json
import os
import queue
import shutil
import subprocess
import sys
import threading

import pytest

from dsh_kicad_sidecar import freerouting
from dsh_kicad_sidecar.autoroute import AutorouteError, autoroute
from dsh_kicad_sidecar.footprints import default_footprint_dirs
from dsh_kicad_sidecar.freerouting import Router, locate
from dsh_kicad_sidecar.kicad_cli import KiCadCli
from dsh_kicad_sidecar.pcb import Board
from dsh_kicad_sidecar.tools import ToolError, Toolbox

from conftest import FIXTURES, needs_kicad_cli, needs_symbols
from test_freerouting import fake_router, posix
from test_specctra import ses, via, wire

SRC = os.path.join(os.path.dirname(__file__), "..", "src")
DEMOS = os.environ.get("KICAD_DEMOS", "/usr/share/kicad/demos")
needs_freerouting = pytest.mark.skipif(not locate().ok, reason="Freerouting (and Java) not installed")
needs_footprints = pytest.mark.skipif(not default_footprint_dirs(), reason="KiCad footprint libraries not installed")


@pytest.fixture
def board(tmp_path):
    dst = tmp_path / "rc_board"
    shutil.copytree(os.path.join(FIXTURES, "rc_board"), dst)
    return str(dst / "rc_board.kicad_pcb")


RC_ROUTES = ses({
    "IN": [wire("F.Cu", 0.2, (105, 112.46), (110, 110), (119.175, 110))],
    "GND": [wire("F.Cu", 0.2, (132, 117.225), (134, 117.225)), via(134, 117.225),
            wire("B.Cu", 0.2, (134, 117.225), (134, 125), (105, 125), (105, 117.54))],
})


def test_missing_freerouting_says_how_to_install_it(board):
    with pytest.raises(AutorouteError) as error:
        autoroute(KiCadCli(), board, Router(problems=[]))
    text = str(error.value)
    assert "Freerouting is not installed" in text and "/kicad-install freerouting" in text and "never with sudo" in text
    assert "Java 25 or newer" in text and "kicad_doctor" in text


def test_old_java_is_named_in_the_error(board):
    router = Router(jar="/x/freerouting-2.5.0.jar", java="/usr/bin/java", java_version=(21, 0, 2), java_required=25,
                    problems=["Freerouting 2.5.0 needs Java 25+, but /usr/bin/java is Java 21.0.2"])
    with pytest.raises(AutorouteError, match="needs Java 25\\+, but /usr/bin/java is Java 21.0.2.*Java 25 or newer"):
        autoroute(KiCadCli(), board, router)


def test_arguments_are_checked(board, tmp_path):
    router = fake_router(tmp_path)
    with pytest.raises(AutorouteError, match="passes must be"):
        autoroute(KiCadCli(), board, router, passes=0)
    with pytest.raises(AutorouteError, match="timeout must be between 5 and 3600"):
        autoroute(KiCadCli(), board, router, timeout=1)
    with pytest.raises(AutorouteError, match="no net 'VCC'"):
        autoroute(KiCadCli(), board, router, nets=["VCC"])


@needs_kicad_cli
def test_autoroute_imports_the_session_and_lets_kicad_judge(board, tmp_path, monkeypatch):
    (tmp_path / "routes.ses").write_text(RC_ROUTES)
    monkeypatch.setenv("FAKE_SES", str(tmp_path / "routes.ses"))
    progress = []
    result = autoroute(KiCadCli(), board, fake_router(tmp_path), passes=5, progress=lambda *a: progress.append(a))
    assert result["written"] and result["files"] == [board]
    assert result["added"] == {"segments": 6, "vias": 1, "length_mm": pytest.approx(5.572 + 9.175 + 2 + 7.775 + 29 + 7.46, abs=0.01)}
    assert result["nets"] == {"routed": 3, "left_out": [], "changed": ["GND", "IN"]}
    assert result["freerouting"]["unrouted"] == 0 and result["freerouting"]["passes"] == 2
    # KiCad's verdict, not the router's: OUT was not in the session, so its two connections are still open.
    assert result["unrouted"] == 2 and result["drc"]["counts"]["error"] == 2
    # Two ways out: by hand, or (after auto_place) more room: clear the routes and place again with a larger gap.
    note = result["notes"][-1]
    assert "2 connection(s) are still unrouted" in note and "add_track" in note
    assert 'remove_tracks{}, auto_place{outline: "fit", gap: 2, group_gap: 4}' in note
    assert progress[0][2].startswith("routing 3 net(s)") and progress[-1][2] == "KiCad DRC"
    work = os.path.join(os.path.dirname(board), ".dsh-kicad", "autoroute")
    assert sorted(os.listdir(work)) == ["rc_board.dsn", "rc_board.log", "rc_board.ses", "rc_board.ses.args"]


@needs_kicad_cli
def test_zones_are_refilled_and_saved(board, tmp_path, monkeypatch):
    b = Board(board)
    b.add_zone("GND", layers=["B.Cu"])
    b.save()
    assert "filled_polygon" not in open(board).read()
    (tmp_path / "routes.ses").write_text(RC_ROUTES)
    monkeypatch.setenv("FAKE_SES", str(tmp_path / "routes.ses"))
    result = autoroute(KiCadCli(), board, fake_router(tmp_path))
    assert result["zones_filled"] and "filled_polygon" in open(board).read()


@posix
@needs_kicad_cli
def test_toolbox_tool_with_the_freerouting_setting(board, tmp_path, monkeypatch):
    (tmp_path / "routes.ses").write_text(RC_ROUTES)
    monkeypatch.setenv("FAKE_SES", str(tmp_path / "routes.ses"))
    tb = Toolbox(freerouting=fake_router(tmp_path, executable=True))
    result = tb.call("autoroute", {"pcb": board, "exclude_nets": ["OUT"], "timeout": 60})
    assert result["nets"]["left_out"] == ["OUT"] and result["added"]["vias"] == 1
    monkeypatch.delenv("FREEROUTING_JAR", raising=False)
    monkeypatch.setattr(freerouting, "data_dir", lambda: str(tmp_path / "nothing downloaded"))
    with pytest.raises(ToolError, match="kicad_autoroute needs the Freerouting autorouter.*missing.jar, which does not exist"):
        Toolbox(freerouting=str(tmp_path / "missing.jar")).call("autoroute", {"pcb": board})


@posix
def test_cancel_and_progress_over_mcp(board, tmp_path):
    """dsh aborts the tool call → the bridge sends notifications/cancelled → Freerouting is stopped, the board untouched."""
    before = open(board).read()
    env = {**os.environ, "PYTHONPATH": SRC, "FAKE_FREEROUTING": "hang"}
    proc = subprocess.Popen([sys.executable, "-m", "dsh_kicad_sidecar", "--freerouting", fake_router(tmp_path, executable=True)],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env=env)
    lines: queue.Queue = queue.Queue()
    threading.Thread(target=lambda: [lines.put(json.loads(l)) for l in proc.stdout], daemon=True).start()

    def send(message):
        proc.stdin.write(json.dumps(message) + "\n")
        proc.stdin.flush()

    def until(predicate):
        while True:
            message = lines.get(timeout=30)
            if predicate(message):
                return message

    try:
        send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}})
        until(lambda m: m.get("id") == 1)
        send({"jsonrpc": "2.0", "id": 7, "method": "tools/call",
              "params": {"name": "autoroute", "arguments": {"pcb": board}, "_meta": {"progressToken": "tok"}}})
        progress = until(lambda m: m.get("method") == "notifications/progress" and "routing pass" in m["params"]["message"])
        assert progress["params"] == {"progressToken": "tok", "progress": 1.0, "message": "routing pass 1: 3 unrouted"}
        send({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": 7, "reason": "aborted"}})
        reply = until(lambda m: m.get("id") == 7)
        assert reply["result"]["isError"] and "cancelled; the board was not changed" in reply["result"]["content"][0]["text"]
    finally:
        proc.stdin.close()
        proc.wait(timeout=30)
    assert open(board).read() == before


# ---- with the real Freerouting --------------------------------------------------------------

@needs_freerouting
@needs_kicad_cli
def test_routes_the_fixture_completely(board):
    result = Toolbox().call("autoroute", {"pcb": board})
    assert result["unrouted"] == 0 and result["drc"]["counts"]["error"] == 0, result["drc"]["by_type"]
    assert result["freerouting"]["state"] == "COMPLETED" and result["added"]["segments"] > 0


# The usb-attiny85 eval board, placed by hand until automatic placement (#12) lands: USB-C at the left edge, the
# regulator and its capacitors next to it, the ATtiny85 with its decoupling capacitor and the ISP header on the right,
# the button and the two LEDs below. 48 × 30 mm, every part on the front.
USB_ATTINY_PLACEMENT = {
    "J1": (104.4, 115, 270), "R4": (111.5, 111.5, 90), "R5": (111.5, 118.5, 90), "U2": (117, 108, 0),
    "C1": (113.5, 102.6, 0), "C2": (121, 102.6, 0), "U1": (131, 115, 0), "C3": (131, 109.8, 0), "J2": (141, 106, 0),
    "SW1": (121, 124, 0), "R3": (126, 109.8, 0), "R2": (133, 122, 0), "D2": (138, 122, 0), "R1": (133, 126, 0),
    "D1": (138, 126, 0),
}
# Critical nets routed by hand and locked: the USB-C CC pull-downs and the regulator's 3.3 V output (wide).
USB_ATTINY_CRITICAL = [
    {"op": "add_track", "points": ["J1:A5", [110.0, 114.5], [111.5, 113.0], "R4:1"], "locked": True},
    {"op": "add_track", "points": ["J1:B5", [110.0, 115.5], [110.0, 119.32], "R5:1"], "locked": True},
    {"op": "add_track", "net": "+3V3", "points": [[120.15, 108], [120.15, 103.5], "C2:1"], "width": 0.4, "locked": True},
]


def place_usb_attiny(tb, pcb):
    ops = [{"op": "set_board_outline", "width": 48, "height": 30, "x": 100, "y": 100}]
    ops += [{"op": "move_footprint", "reference": ref, "x": x, "y": y, "rotation": rot} for ref, (x, y, rot) in USB_ATTINY_PLACEMENT.items()]
    tb.call("edit_pcb", {"path": pcb, "operations": ops})


@needs_freerouting
@needs_kicad_cli
@needs_symbols
@needs_footprints
def test_usb_attiny85_two_layers_fully_routed(project):
    """The acceptance run: schematic → board → placement → critical nets by hand (locked) → GND pour on both layers →
    autoroute → 0 unrouted, 0 DRC errors, schematic parity 0. The hand-routed tracks and the parts do not move."""
    tb = Toolbox()
    sch = project("usb_attiny")
    pcb = tb.call("update_pcb", {"schematic": sch})["pcb"]
    place_usb_attiny(tb, pcb)
    tb.call("edit_pcb", {"path": pcb, "operations": [
        *USB_ATTINY_CRITICAL,
        {"op": "add_zone", "net": "GND", "layers": ["F.Cu", "B.Cu"], "name": "GND", "connect_pads": "solid"},
    ]})
    locked = sorted((t["net"], t["layer"], t["start"], t["end"], t["width"]) for t in Board(pcb).tracks() if t.get("locked"))
    placed = {fp.reference: fp.at for fp in Board(pcb).footprints()}
    assert len(locked) == 8

    result = tb.call("autoroute", {"pcb": pcb})

    drc = result["drc"]
    assert result["unrouted"] == 0 and drc["counts"] == {"error": 0, "warning": 0, "exclusion": 0, "total": 0}, drc["by_type"]
    assert drc["parity"] == 0 and result["zones_filled"] and result["kept"] == {"tracks": 8, "vias": 0}
    after = Board(pcb)
    assert sorted((t["net"], t["layer"], t["start"], t["end"], t["width"]) for t in after.tracks() if t.get("locked")) == locked
    assert {fp.reference: fp.at for fp in after.footprints()} == placed
    assert after.copper_layers() == ["F.Cu", "B.Cu"] and "filled_polygon" in after.text()


@needs_freerouting
@needs_kicad_cli
def test_reroutes_a_stripped_demo_board(tmp_path):
    """KiCad's ecc83-pp demo (THT, numbered-net KiCad 9 file, GND pour): remove every track, route it again."""
    src = os.path.join(DEMOS, "ecc83", "ecc83-pp.kicad_pcb")
    if not os.path.isfile(src):
        pytest.skip("KiCad demos not installed")
    shutil.copytree(os.path.dirname(src), tmp_path / "ecc83")
    pcb = str(tmp_path / "ecc83" / "ecc83-pp.kicad_pcb")
    b = Board(pcb)
    for item in [i for i in b.root.lists() if i.head in ("segment", "arc", "via")]:
        b.root.remove(item)
    b.save()
    assert KiCadCli().drc(pcb, refill_zones=True)["unrouted"] == 14

    result = Toolbox().call("autoroute", {"pcb": pcb})

    assert result["unrouted"] == 0 and result["drc"]["counts"]["error"] == 0, result["drc"]["by_type"]
    assert result["added"]["segments"] > 0


# ---- placement (#12) and routing together ---------------------------------------------------

def auto_placed_usb_attiny(tb, project, **gaps):
    """The usb-attiny85 schematic drawn in functional blocks → board → auto_place → GND pour on both layers."""
    pcb = tb.call("update_pcb", {"schematic": project("usb_attiny_blocks")})["pcb"]
    tb.call("edit_pcb", {"path": pcb, "operations": [
        {"op": "auto_place", **gaps},
        {"op": "add_zone", "net": "GND", "layers": ["F.Cu", "B.Cu"], "name": "GND", "connect_pads": "solid"},
    ]})
    return pcb


@needs_freerouting
@needs_kicad_cli
@needs_symbols
@needs_footprints
def test_auto_placed_board_routes_completely_and_passes_the_fab_gate(project):
    """Nothing by hand: schematic → board → auto_place (gap 2, group_gap 4) → GND pour → autoroute → JLCPCB fab files."""
    tb = Toolbox()
    pcb = auto_placed_usb_attiny(tb, project, gap=2, group_gap=4)
    placed = {fp.reference: fp.at for fp in Board(pcb).footprints()}

    result = tb.call("autoroute", {"pcb": pcb})

    drc = result["drc"]
    assert result["unrouted"] == 0 and drc["counts"]["error"] == 0 and drc["parity"] == 0, drc["by_type"]
    assert result["zones_filled"] and result["notes"] == [] and {fp.reference: fp.at for fp in Board(pcb).footprints()} == placed
    fab = tb.call("export_fab", {"pcb": pcb, "preset": "jlcpcb", "preview": False})
    assert fab["exported"] and not fab["forced"] and fab["gate"]["passed"] and fab["zip"]


@needs_freerouting
@needs_kicad_cli
@needs_symbols
@needs_footprints
def test_unrouted_after_auto_place_then_more_room(project):
    """The note's advice works: whatever the default gaps leave open, clearing the routes and placing again with
    gap 2 / group_gap 4 (outline fitted again, pour redrawn) routes completely."""
    tb = Toolbox()
    pcb = auto_placed_usb_attiny(tb, project)
    first = tb.call("autoroute", {"pcb": pcb})
    if first["unrouted"]:
        assert 'auto_place{outline: "fit", gap: 2, group_gap: 4}' in first["notes"][-1]
    (zone,) = Board(pcb).zones()
    tb.call("edit_pcb", {"path": pcb, "operations": [
        {"op": "remove_tracks"},
        {"op": "auto_place", "outline": "fit", "gap": 2, "group_gap": 4},
        {"op": "remove_item", "uuid": zone["uuid"]},
        {"op": "add_zone", "net": "GND", "layers": ["F.Cu", "B.Cu"], "name": "GND", "connect_pads": "solid"},
    ]})
    assert Board(pcb).tracks() == []

    again = tb.call("autoroute", {"pcb": pcb})

    assert again["unrouted"] == 0 and again["drc"]["counts"]["error"] == 0 and again["drc"]["parity"] == 0, again["drc"]["by_type"]
