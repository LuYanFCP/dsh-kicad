import json
import os
import re
import shutil
import zipfile

import pytest

from dsh_kicad_sidecar import fab
from dsh_kicad_sidecar.kicad_cli import KiCadCli, has_zones, parity_failure
from dsh_kicad_sidecar.tools import Toolbox

from conftest import needs_kicad_cli

# A DRC-clean, fully routed KiCad demo whose schematic matches the board (parity 0).
DEMO = os.path.join(os.environ.get("KICAD_DEMOS", "/usr/share/kicad/demos"), "pic_programmer")
needs_demo = pytest.mark.skipif(not os.path.isfile(os.path.join(DEMO, "pic_programmer.kicad_pcb")), reason="KiCad demo pic_programmer not installed")


@pytest.fixture
def board(tmp_path):
    shutil.copytree(DEMO, tmp_path / "pic")
    return str(tmp_path / "pic" / "pic_programmer.kicad_pcb")


def edit_board(pcb, pattern, replace=""):
    """Rewrite the first S-expression block (or text) matching ``pattern`` in the board file."""
    text = open(pcb, encoding="utf-8").read()
    match = re.search(pattern, text)
    assert match, pattern
    open(pcb, "w", encoding="utf-8").write(text[:match.start()] + replace + text[match.end():])


UNROUTED_SEGMENT = r'\n\t\(segment\n(?:\t\t.*\n)*?\t\t\(net "Net-\(D1-K\)"\)\n(?:\t\t.*\n)*?\t\)'


# ---- presets (no KiCad needed) ---------------------------------------------------------------

def test_presets_cover_the_fab_limits():
    assert {"jlcpcb", "pcbway"} <= set(fab.preset_names())
    for p in fab.list_presets():
        assert {"min_track_width", "min_clearance", "min_through_hole_diameter", "min_via_annular_width",
                "min_via_diameter", "min_copper_edge_clearance"} <= set(p["rules"]), p["name"]
        assert p["source"].startswith("https://")
        dru = fab.load_preset(p["name"])["dru"]
        assert dru.startswith("(version 1)") and "(rule " in dru
        body = "\n".join(line for line in dru.splitlines() if not line.lstrip().startswith("#"))
        assert body.count("(") == body.count(")")
    with pytest.raises(fab.FabError, match="available: jlcpcb"):
        fab.load_preset("oshpark")


def test_apply_preset_sets_rules_raises_netclasses_and_keeps_user_rules(tmp_path):
    pro = tmp_path / "board.kicad_pro"
    pro.write_text(json.dumps({
        "board": {"design_settings": {"rules": {"min_clearance": 0.0, "min_track_width": 0.2}}},
        "net_settings": {"classes": [{"name": "Default", "clearance": 0.05, "track_width": 0.25, "via_diameter": 0.4, "via_drill": 0.2}]},
        "meta": {"filename": "board.kicad_pro", "version": 3},
    }, indent=2))
    dru = tmp_path / "board.kicad_dru"
    user_rule = '(rule "keep me"\n\t(constraint clearance (min 0.5mm))\n\t(condition "A.NetClass == \'HV\'"))\n'
    dru.write_text("(version 1)\n" + user_rule)

    dry = fab.apply_preset(str(tmp_path / "board.kicad_pcb"), "jlcpcb", dry_run=True)
    assert dry["changes"] and not dry["written"]
    assert json.loads(pro.read_text())["board"]["design_settings"]["rules"]["min_clearance"] == 0.0

    out = fab.apply_preset(str(pro), "jlcpcb")
    assert out["written"] and out["project"] == str(pro)
    assert "board rule min_clearance: 0.0 -> 0.1" in out["changes"]
    data = json.loads(pro.read_text())
    assert data["board"]["design_settings"]["rules"]["min_through_hole_diameter"] == 0.3
    cls = data["net_settings"]["classes"][0]
    assert (cls["clearance"], cls["track_width"], cls["via_drill"]) == (0.1, 0.25, 0.3)  # raised, never lowered
    assert cls["via_diameter"] == 0.45  # 0.3 drill + 2 x 0.075 ring
    text = dru.read_text()
    assert text.startswith("(version 1)") and user_rule in text and text.count("(version") == 1
    assert 'JLCPCB: pad hole to pad hole' in text

    assert fab.apply_preset(str(pro), "jlcpcb")["changes"] == []  # idempotent

    fab.apply_preset(str(pro), "pcbway")
    text = dru.read_text()
    assert user_rule in text and "JLCPCB" not in text and text.count(fab.DRU_BEGIN) == 1
    assert "PCBWay: pad hole to pad hole" in text
    assert json.loads(pro.read_text())["board"]["design_settings"]["rules"]["min_via_annular_width"] == 0.15


def test_apply_preset_creates_a_minimal_project(tmp_path):
    out = fab.apply_preset(str(tmp_path / "solo.kicad_pcb"), "pcbway")
    data = json.loads((tmp_path / "solo.kicad_pro").read_text())
    assert data["meta"]["filename"] == "solo.kicad_pro"
    assert data["board"]["design_settings"]["rules"]["min_via_diameter"] == 0.6
    assert (tmp_path / "solo.kicad_dru").read_text().startswith("(version 1)\n\n" + fab.DRU_BEGIN)
    assert out["written"]


def test_fab_preset_tool_lists_and_validates(tmp_path):
    box = Toolbox(roots=[str(tmp_path)], cwd=str(tmp_path))
    listed = box.call("fab_preset", {})
    assert [p["name"] for p in listed["presets"]] == fab.preset_names()
    with pytest.raises(Exception, match="path"):
        box.call("fab_preset", {"preset": "jlcpcb"})


# ---- structural readers ---------------------------------------------------------------------

def test_inspect_gerber_and_excellon(tmp_path):
    gbr = tmp_path / "x-F_Cu.gtl"
    gbr.write_text("%TF.FileFunction,Copper,L1,Top*%\n%FSLAX46Y46*%\n%MOMM*%\n%ADD10C,0.250000*%\nD10*\n"
                   "X0Y0D02*\nX1000000Y0D01*\nX5Y5D03*\nM02*\n")
    info = fab.inspect_gerber(str(gbr))
    assert info == {"format": "4.6", "units": "mm", "function": "Copper,L1,Top", "layer": "F.Cu", "apertures": 1,
                    "draws": 1, "moves": 1, "flashes": 1, "complete": True, "valid": True}
    gbr.write_text("%FSLAX46Y46*%\n%MOMM*%\nX0Y0D02*\n")  # truncated: no M02
    assert fab.inspect_gerber(str(gbr))["valid"] is False
    assert [fab.layer_of(f) for f in ("Copper,L2,Inr", "Copper,L4,Bot", "Soldermask,Bot", "Legend,Top", "Paste,Top", "Profile,NP")] == \
        ["In1.Cu", "B.Cu", "B.Mask", "F.SilkS", "F.Paste", "Edge.Cuts"]
    drl = tmp_path / "x.drl"
    drl.write_text("M48\n; #@! TF.FileFunction,Plated,1,2,PTH\nFMAT,2\nMETRIC\nT1C0.300\nT2C1.000\n%\nG90\nG05\nT1\nX1.0Y-2.0\nX3Y-4\nT2\nX5.5Y-6\nM30\n")
    assert fab.inspect_excellon(str(drl)) == {"function": "Plated,1,2,PTH", "units": "mm", "tools": 2, "diameters": [0.3, 1.0],
                                              "holes": 3, "complete": True, "valid": True}


# ---- export and gate against KiCad ----------------------------------------------------------

FAB_LAYERS = ["F.Paste", "F.SilkS", "F.Mask", "F.Cu", "B.Cu", "B.Mask", "B.SilkS", "B.Paste", "Edge.Cuts"]


@needs_kicad_cli
@needs_demo
def test_export_fab_writes_every_layer_and_one_zip(board):
    out = fab.export_fab(KiCadCli(), board, preset="jlcpcb")
    assert out["exported"] and not out["forced"] and out["gate"]["passed"], out["gate"]
    gate = out["gate"]
    assert gate["parity"]["checked"] and gate["parity"]["issues"] == 0 and gate["unrouted"] == 0 and gate["drc"]["errors"] == 0
    assert gate["preset"] == {"name": "jlcpcb", "label": "JLCPCB standard 1-2 layer, 1 oz", "errors": 0, "by_type": {}}
    root = os.path.join(os.path.dirname(board), "fab", "jlcpcb")
    assert out["output_dir"] == root and out["zip"] == os.path.join(root, "pic_programmer-jlcpcb.zip")
    assert out["layers"] == FAB_LAYERS
    assert out["board"] == {"width_mm": 160.12, "height_mm": 99.16, "copper_layers": 2, "thickness_mm": 1.6}

    gerbers = {f["layer"]: f for f in out["files"] if f["kind"] == "gerber"}
    for layer, f in gerbers.items():
        info = fab.inspect_gerber(os.path.join(root, f["path"]))
        assert info["valid"] and info["units"] == "mm" and info["format"] == "4.6", f
        if layer.endswith(("Cu", "Mask", "SilkS")) or layer == "Edge.Cuts":
            assert info["draws"] + info["flashes"] > 0, f  # this THT-only board has empty paste layers
    assert gerbers["F.Cu"]["flashes"] > 200 and gerbers["Edge.Cuts"]["draws"] >= 4
    drills = [f for f in out["files"] if f["kind"] == "drill"]
    assert sorted(f["path"] for f in drills) == ["pic_programmer-NPTH.drl", "pic_programmer-PTH.drl"]  # jlcpcb: separate files
    assert all(f["valid"] for f in drills) and sum(f["holes"] for f in drills) == 251
    assert {f["kind"] for f in out["files"]} >= {"gerber", "drill", "drill_map", "job", "position", "bom", "cpl"}

    with zipfile.ZipFile(out["zip"]) as zf:
        names = set(zf.namelist())
        assert zf.testzip() is None
    assert names == {f["path"] for f in out["files"]}
    with open(os.path.join(root, "assembly", "pic_programmer-cpl-jlc.csv")) as fh:
        assert fh.readline().strip() == "Designator,Mid X,Mid Y,Layer,Rotation"
        assert re.match(r"^\w+,-?\d+\.\d{4}mm,-?\d+\.\d{4}mm,(Top|Bottom),-?[\d.]+$", fh.readline().strip())
    with open(os.path.join(root, "assembly", "pic_programmer-bom-jlc.csv")) as fh:
        assert fh.readline().strip() == "Comment,Designator,Footprint,LCSC Part #"

    if not any("3D preview" in w for w in out["warnings"]):
        assert out["preview"] == ["preview/pic_programmer-top.png", "preview/pic_programmer-bottom.png"]
        for png in out["preview"]:
            with open(os.path.join(root, png), "rb") as fh:
                assert fh.read(8) == b"\x89PNG\r\n\x1a\n"
    assert out["warnings"] == [] or all("3D preview" in w for w in out["warnings"])
    assert not [d for d in os.listdir(os.path.dirname(root)) if d.startswith(".fab-stage-")]

    # Exporting again replaces the previous files; a directory the export did not write is refused.
    again = fab.export_fab(KiCadCli(), board, preset="jlcpcb", preview=False)
    assert again["exported"] and not os.path.exists(os.path.join(root, "preview"))
    foreign = os.path.join(os.path.dirname(board), "mine")
    os.makedirs(foreign)
    open(os.path.join(foreign, "notes.txt"), "w").write("keep")
    with pytest.raises(fab.FabError, match="not written by the fab export"):
        fab.export_fab(KiCadCli(), board, output_dir=foreign, preview=False)
    assert os.listdir(foreign) == ["notes.txt"]


@needs_kicad_cli
@needs_demo
def test_gate_refuses_an_unrouted_connection_unless_forced(board):
    edit_board(board, UNROUTED_SEGMENT)  # one track of net D1-K removed: KiCad reports it unrouted
    box = Toolbox(roots=[os.path.dirname(board)], cwd=os.path.dirname(board))
    refused = box.call("export_fab", {"pcb": board, "preview": False})
    assert refused["exported"] is False and refused["refused"] is True
    assert refused["gate"]["blocking"] == ["1 unrouted connection(s)"]
    # The gate runs the DRC kicad_drc runs (zones refilled once, since the board has zones): same unrouted count.
    assert has_zones(board)
    assert box.call("drc", {"path": board})["unrouted"] == refused["gate"]["unrouted"] == 1
    assert refused["gate"]["violations"][0]["type"] == "unconnected_items"
    assert not os.path.exists(os.path.join(os.path.dirname(board), "fab"))  # nothing written

    forced = box.call("export_fab", {"pcb": board, "force": True, "preview": False})
    assert forced["exported"] is True and forced["forced"] is True
    assert forced["warnings"][0].startswith("FORCED: exported although the fab gate failed (1 unrouted connection(s))")
    with open(os.path.join(forced["output_dir"], fab.MANIFEST)) as fh:
        assert json.load(fh)["forced"] is True


@needs_kicad_cli
@needs_demo
def test_gate_blocks_on_parity_and_on_the_fab_limits(board):
    cli = KiCadCli()
    # The board's C1 no longer uses the footprint its symbol names: schematic parity disagrees.
    edit_board(board, r'\(footprint "Capacitor_THT:CP_Axial_L18\.0mm_D6\.5mm_P25\.00mm_Horizontal"',
               '(footprint "Capacitor_THT:CP_Axial_L18.0mm_D6.5mm_P25.00mm_Horizontal_Mod"')
    gate = fab.fab_gate(cli, board)
    assert not gate["passed"] and gate["parity"]["checked"]
    assert any(b.startswith("1 schematic parity issue(s): footprint_symbol_mismatch") for b in gate["blocking"])

    # A 0.09 mm track passes the project's rules (lowered here) but not JLCPCB's 0.1 mm minimum.
    os.remove(os.path.splitext(board)[0] + ".kicad_sch")
    pro = os.path.splitext(board)[0] + ".kicad_pro"
    data = json.load(open(pro))
    data["board"]["design_settings"]["rules"]["min_track_width"] = 0.05
    json.dump(data, open(pro, "w"), indent=2)
    text = open(board).read()
    seg = re.search(r"(\(segment\n\t\t\(start [^)]*\)\n\t\t\(end [^)]*\)\n\t\t\(width )([\d.]+)(\))", text)
    open(board, "w").write(text[:seg.start(2)] + "0.09" + text[seg.end(2):])
    assert fab.fab_gate(cli, board)["passed"]  # no schematic now, so parity is not checked
    gate = fab.fab_gate(cli, board, preset="jlcpcb")
    assert not gate["passed"] and gate["preset"]["errors"] == 1 and gate["preset"]["by_type"] == {"track_width": 1}
    assert "against JLCPCB standard 1-2 layer, 1 oz limits: track_width" in gate["blocking"][0]
    assert gate["parity"] == {"checked": False, "schematic": None, "issues": 0, "by_type": {},
                              "note": "no schematic next to the board, so parity was not checked"}
    # The check ran on a copy: the user's project is untouched.
    assert json.load(open(pro))["board"]["design_settings"]["rules"]["min_track_width"] == 0.05
    assert not os.path.exists(os.path.splitext(board)[0] + ".kicad_dru")

    # Neither a custom rule nor a lowered severity in the project hides the fab's limit.
    with open(os.path.splitext(board)[0] + ".kicad_dru", "w") as fh:
        fh.write('(version 1)\n(rule "thin"\n\t(constraint track_width (min 0.05mm)))\n')
    data["board"]["design_settings"]["rule_severities"]["track_width"] = "ignore"
    json.dump(data, open(pro, "w"), indent=2)
    assert fab.fab_gate(cli, board)["passed"]
    assert fab.fab_gate(cli, board, preset="jlcpcb")["preset"]["by_type"] == {"track_width": 1}


@needs_kicad_cli
@needs_demo
def test_extras_and_a_failed_export_leaves_nothing_behind(board):
    out = fab.export_fab(KiCadCli(), board, preset="pcbway", extras=["ipc2581", "odb", "step"], preview=False)
    kinds = {f["kind"]: f["path"] for f in out["files"]}
    assert kinds["ipc2581"] == "pic_programmer-ipc2581.xml" and kinds["odb"] == "pic_programmer-odb.zip" and kinds["step"] == "pic_programmer.step"
    assert [f["path"] for f in out["files"] if f["kind"] == "drill"] == ["pic_programmer.drl"]  # pcbway: one drill file
    # Without KiCad's 3D libraries kicad-cli still writes the STEP board but exits non-zero: a warning, not a failure.
    assert all(w.startswith("the STEP model lacks") for w in out["warnings"])
    with pytest.raises(fab.FabError, match="unknown extra"):
        fab.export_fab(KiCadCli(), board, extras=["dxf"])

    class FailingDrill(KiCadCli):
        def run(self, *args, **kwargs):
            if args[:3] == ("pcb", "export", "drill"):
                raise fab.KiCadCliError("kicad-cli pcb export drill failed (1): boom")
            return super().run(*args, **kwargs)

    target = os.path.join(os.path.dirname(board), "orders", "rev-a")
    with pytest.raises(fab.KiCadCliError, match="boom"):
        fab.export_fab(FailingDrill(), board, output_dir=target)
    assert not os.path.exists(os.path.dirname(target))  # no stage, no empty orders/


def test_layer_table_with_parentheses_in_user_names(tmp_path):
    pcb = tmp_path / "b.kicad_pcb"
    pcb.write_text('(kicad_pcb\n\t(version 20250114)\n\t(layers\n\t\t(0 "F.Cu" signal "top (sig)")\n\t\t(4 "In1.Cu" power "GND (plane)")\n'
                   '\t\t(6 "In2.Cu" signal)\n\t\t(2 "B.Cu" signal)\n\t\t(1 "F.Mask" user)\n\t\t(25 "Edge.Cuts" user)\n\t)\n'
                   '\t(footprint "x" (layers "F.Cu" "F.Mask"))\n)\n')
    assert fab.fab_layers(str(pcb)) == ["F.Cu", "In1.Cu", "In2.Cu", "B.Cu", "F.Mask", "Edge.Cuts"]
    pcb.write_text("(kicad_pcb (version 1))\n")
    with pytest.raises(fab.FabError, match="no readable layer table"):
        fab.fab_layers(str(pcb))


def test_output_dir_manifest_must_be_ours_and_for_this_board(tmp_path):
    out = tmp_path / "fab"
    out.mkdir()
    (out / fab.MANIFEST).write_text('{"files": ["../../precious"]}')
    with pytest.raises(fab.FabError, match="not written by the fab export"):
        fab._check_output_dir(str(out), str(tmp_path / "a.kicad_pcb"))
    (out / fab.MANIFEST).write_text(json.dumps({"generator": fab.GENERATOR, "pcb": "/x/b.kicad_pcb", "files": [None, 3, "../escape", "a.gtl"]}))
    with pytest.raises(fab.FabError, match="holds the fab files of b.kicad_pcb"):
        fab._check_output_dir(str(out), str(tmp_path / "a.kicad_pcb"))
    (tmp_path / "escape").write_text("keep")
    (out / "a.gtl").write_text("old")
    fab._check_output_dir(str(out), "/elsewhere/b.kicad_pcb")
    fab._clear_previous(str(out))
    assert sorted(os.listdir(out)) == [] and (tmp_path / "escape").read_text() == "keep"


def test_parity_failure_is_not_a_clean_comparison():
    log = "Failed to fetch schematic netlist for parity tests.\nSchematic parity tests require a fully annotated schematic.\nFound 0 schematic parity issues\n"
    assert parity_failure(log).startswith("Failed to fetch schematic netlist for parity tests. Schematic parity tests require")
    assert parity_failure("Found 0 unconnected items\nFound 0 schematic parity issues\n") is None


@needs_kicad_cli
@needs_demo
def test_drc_says_when_parity_could_not_run(board, tmp_path):
    alone = tmp_path / "alone" / "pic_programmer.kicad_pcb"  # parity requested, but no schematic next to the board
    alone.parent.mkdir()
    shutil.copyfile(board, alone)
    report = KiCadCli().drc(str(alone), schematic_parity=True)
    assert "schematic netlist" in report["schematic_parity_error"]
    assert "schematic_parity_error" not in KiCadCli().drc(board, schematic_parity=True)
