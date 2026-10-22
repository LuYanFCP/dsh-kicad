"""3D views: kicad-cli pcb render arguments (negative angles), the cached GLB scene and the 3D model library."""

import json
import os
import shutil
import struct

import pytest

from dsh_kicad_sidecar import board3d, models3d
from dsh_kicad_sidecar.board3d import cli_vector, export_glb, missing_models, render_args, render_name
from dsh_kicad_sidecar.kicad_cli import KiCadCli
from dsh_kicad_sidecar.tools import SPEC_BY_NAME, ToolError, Toolbox

from conftest import FIXTURES, needs_kicad_cli


# ---- arguments ------------------------------------------------------------------------------

def test_cli_vector_keeps_negative_values_from_looking_like_options():
    assert cli_vector("-45,0,45") == " -45,0,45"
    assert cli_vector(" -45, 0 ,45 ") == " -45,0,45"
    assert cli_vector([10, -5.5, 0]) == "10,-5.5,0"
    assert cli_vector((0.1234, 0, -0.0)) == "0.123,0,0"
    for bad in ("1,2", "a,b,c", [1, 2, 3, 4], "nan,0,0", 45):
        with pytest.raises(ValueError):
            cli_vector(bad)


def test_render_args():
    args = render_args("b.kicad_pcb", "o.png", width=800, rotate="-45,0,45", zoom=1.5, pivot=[-1, 0.5, 0], perspective=True, quality="high")
    assert args == ["pcb", "render", "-o", "o.png", "--side", "top", "--width", "800", "--height", "600", "--quality", "high",
                    "--perspective", "--zoom", "1.5", "--pivot", " -1,0.5,0", "--rotate", " -45,0,45", "b.kicad_pcb"]
    # `-h` is also kicad-cli's help flag: the height is always spelled out.
    assert "-h" not in render_args("b.kicad_pcb", "o.png", side="bottom", width=400, height=300)
    assert render_args("b.kicad_pcb", "o.png", side="left", width=400, height=300)[4:10] == ["--side", "left", "--width", "400", "--height", "300"]
    with pytest.raises(ValueError, match="side must be one of"):
        render_args("b.kicad_pcb", "o.png", side="above")
    with pytest.raises(ValueError, match="quality"):
        render_args("b.kicad_pcb", "o.png", quality="ultra")
    with pytest.raises(ValueError, match="zoom must be between"):
        render_args("b.kicad_pcb", "o.png", zoom=0)
    with pytest.raises(ValueError, match="between 16 and 8192"):
        render_args("b.kicad_pcb", "o.png", width=10)


def test_render_name_keeps_the_plain_side_names():
    assert render_name("b") == "b-3d-top.png"
    assert render_name("b", side="bottom") == "b-3d-bottom.png"
    assert render_name("b", rotate="-45,0,45", zoom=2, perspective=True, quality="high") == "b-3d-top-r-45_0_45-z2-persp-high.png"
    assert render_name("b", zoom=1) == "b-3d-top.png"
    assert render_name("b", rotate="-45,0,45", name="view") == "b-3d-view.png"
    with pytest.raises(ValueError, match="name must be"):
        render_name("b", name="../x")


def test_missing_models_from_the_export_log():
    log = ("Build board outline\nCould not add 3D model for J1.\nFile not found: ${KICAD10_3DMODEL_DIR}/Connector_USB.3dshapes/USB_C.step\n"
           "Could not add 3D model for R1.\r\nFile not found: /proj/models/r.step\nBinary GLTF file 'x.glb' created.\n")
    assert missing_models(log) == [
        {"reference": "J1", "model": "${KICAD10_3DMODEL_DIR}/Connector_USB.3dshapes/USB_C.step", "reason": "File not found"},
        {"reference": "R1", "model": "/proj/models/r.step", "reason": "File not found"},
    ]
    assert missing_models("Binary GLTF file 'x.glb' created.") == []


def test_tool_schemas():
    render = SPEC_BY_NAME["render"].schema["properties"]
    assert set(render["side"]["enum"]) == {"top", "bottom", "left", "right", "front", "back"}
    assert {"rotate", "zoom", "pivot", "perspective", "quality", "height"} <= set(render)
    assert SPEC_BY_NAME["export_glb"].writes and SPEC_BY_NAME["export_glb"].schema["required"] == ["path"]


# ---- the 3D model library -------------------------------------------------------------------

def shapes(root, *libs):
    for lib in libs:
        (root / f"{lib}.3dshapes").mkdir(parents=True)
    return str(root)


def test_model_library_resolves_like_kicad(tmp_path):
    env_dir = shapes(tmp_path / "env", "Resistor_SMD", "Capacitor_SMD")
    conf_dir = shapes(tmp_path / "conf", "Package_SO")
    stock = shapes(tmp_path / "stock", "LED_SMD")
    config = tmp_path / "config"
    config.mkdir()
    (config / "kicad_common.json").write_text(json.dumps({"environment": {"vars": {"KICAD10_3DMODEL_DIR": conf_dir}}}))
    env = {"KICAD10_3DMODEL_DIR": env_dir}
    # The environment wins over Preferences → Configure Paths, which wins over the built-in default.
    lib = models3d.model_library(major=10, environ=env, config_dir=str(config), defaults=[stock])
    assert lib == {"var": "KICAD10_3DMODEL_DIR", "dir": env_dir, "source": "environment", "installed": True, "libraries": 2}
    lib = models3d.model_library(major=10, environ={"KICAD10_3DMODEL_DIR": ""}, config_dir=str(config), defaults=[stock])
    assert (lib["dir"], lib["source"]) == (conf_dir, "kicad_common.json")
    lib = models3d.model_library(major=10, environ={}, config_dir=str(tmp_path / "none"), defaults=[str(tmp_path / "empty"), stock])
    assert (lib["dir"], lib["source"], lib["installed"]) == (stock, "default", True)
    # An empty stock directory (Fedora without kicad-packages3d) is found but not installed.
    (tmp_path / "share" / "3dmodels").mkdir(parents=True)
    lib = models3d.model_library(major=9, environ={}, config_dir=None, defaults=[str(tmp_path / "share" / "3dmodels")])
    assert lib["var"] == "KICAD9_3DMODEL_DIR" and lib["dir"].endswith("3dmodels") and lib["installed"] is False and lib["libraries"] == 0


def test_model_library_for_the_flatpak(tmp_path, monkeypatch):
    class FlatpakCli:
        argv = ["flatpak", "run", "--command=kicad-cli", "org.kicad.KiCad"]
        source = "flatpak"

        def version_or_none(self):
            return "10.0.7"

    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))
    monkeypatch.delenv("KICAD10_3DMODEL_DIR", raising=False)
    lib = models3d.model_library(FlatpakCli(), config_dir=str(tmp_path / "none"))
    assert lib["installed"] is False and lib["flatpak_extension"] == "org.kicad.KiCad.Library.Packages3D"
    ext = tmp_path / "flatpak" / "runtime" / "org.kicad.KiCad.Library.Packages3D" / "x86_64" / "stable" / "active" / "files" / "3dmodels"
    shapes(ext, "Resistor_SMD")
    lib = models3d.model_library(FlatpakCli(), config_dir=str(tmp_path / "none"))
    assert (lib["dir"], lib["source"], lib["installed"]) == (str(ext), "flatpak", True)


def test_default_model_dirs_follow_the_kicad_cli_in_use(tmp_path):
    exe = tmp_path / "opt" / "kicad" / "bin" / "kicad-cli"
    exe.parent.mkdir(parents=True)
    exe.write_text("")
    assert models3d.default_model_dirs([str(exe)])[0] == str(tmp_path / "opt" / "kicad" / "share" / "kicad" / "3dmodels")
    app = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"
    assert models3d.default_model_dirs([app])[0] == "/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels"
    assert "/usr/share/kicad/3dmodels" in models3d.default_model_dirs(None)


# ---- with kicad-cli -------------------------------------------------------------------------

def read_glb(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2 and length == len(data)
    size, kind = struct.unpack_from("<I4s", data, 12)
    assert kind == b"JSON"
    return json.loads(data[20:20 + size])


@pytest.fixture
def rc_board(tmp_path):
    shutil.copytree(os.path.join(FIXTURES, "rc_board"), tmp_path / "rc_board")
    return str(tmp_path / "rc_board" / "rc_board.kicad_pcb")


@pytest.fixture
def no_models(tmp_path, monkeypatch):
    """KiCad's 3D model directory points at an empty directory (like Fedora without kicad-packages3d)."""
    empty = tmp_path / "3dmodels"
    empty.mkdir()
    monkeypatch.setenv("KICAD10_3DMODEL_DIR", str(empty))
    return empty


@needs_kicad_cli
def test_export_glb_is_cached_by_board_content(rc_board, no_models, monkeypatch):
    cli = KiCadCli()
    out_dir = os.path.join(os.path.dirname(rc_board), ".dsh-kicad", "render", "rc_board")
    first = export_glb(cli, rc_board, out_dir)
    assert first["cached"] is False and first["glb"] == os.path.join(out_dir, "rc_board.glb")
    gltf = read_glb(first["glb"])
    assert gltf["asset"]["version"] == "2.0" and gltf["meshes"]
    assert first["bytes"] == os.path.getsize(first["glb"]) and first["units"] == "m"
    board = first["board"]
    assert board["thickness"] == 1.6 and board["width"] > 0 and board["height"] > 0
    assert board["center"] == [round((board["bbox"][0] + board["bbox"][2]) / 2, 4), round((board["bbox"][1] + board["bbox"][3]) / 2, 4)]
    assert sorted(first["references"]) == ["C1", "J1", "R1"]
    models = first["models"]
    assert models["footprints_with_models"] == 3 and models["missing_count"] == 3 and models["library"]["installed"] is False
    assert sorted(m["reference"] for m in models["missing"]) == ["C1", "J1", "R1"]
    assert all(m["model"].startswith("${KICAD10_3DMODEL_DIR}/") for m in models["missing"])
    with open(first["meta"], encoding="utf-8") as fh:
        assert json.load(fh)["key"] == first["key"]
    # Same board: the cached scene comes back without running kicad-cli.
    monkeypatch.setattr(cli, "run", lambda *a, **k: pytest.fail("kicad-cli ran for a cached scene"))
    again = export_glb(cli, rc_board, out_dir)
    assert again["cached"] is True and again["key"] == first["key"] and again["models"] == first["models"]
    monkeypatch.undo()
    monkeypatch.setenv("KICAD10_3DMODEL_DIR", str(no_models))
    # force, or a changed board, exports again.
    assert export_glb(cli, rc_board, out_dir, force=True)["cached"] is False
    with open(rc_board, encoding="utf-8") as fh:
        text = fh.read()
    with open(rc_board, "w", encoding="utf-8") as fh:
        fh.write(text + "\n")
    changed = export_glb(cli, rc_board, out_dir)
    assert changed["cached"] is False and changed["key"] != first["key"]
    assert not [f for f in os.listdir(out_dir) if f.startswith(".")]  # no temporary files left behind
    assert os.stat(changed["glb"]).st_mode & 0o044  # readable like any other render (not a private temp file)


@needs_kicad_cli
def test_export_glb_names_component_nodes_after_their_references(rc_board, tmp_path, monkeypatch):
    # A real STEP file stands in for the resistor's library model: kicad-cli's own STEP export of the board.
    models = tmp_path / "models"
    (models / "Resistor_SMD.3dshapes").mkdir(parents=True)
    KiCadCli().run("pcb", "export", "step", "--board-only", "-f", "-o", str(models / "Resistor_SMD.3dshapes" / "R_0603_1608Metric.step"), rc_board)
    monkeypatch.setenv("KICAD10_3DMODEL_DIR", str(models))
    box = Toolbox(roots=[str(tmp_path)])
    out = box.call("export_glb", {"path": rc_board})
    assert out["models"]["library"]["installed"] is True and out["models"]["library"]["source"] == "environment"
    assert sorted(m["reference"] for m in out["models"]["missing"]) == ["C1", "J1"]
    names = [n.get("name") for n in read_glb(out["glb"])["nodes"]]
    assert "R1" in names and "C1" not in names
    with pytest.raises(ToolError, match="expected a .kicad_pcb"):
        box.call("export_glb", {"path": rc_board.replace(".kicad_pcb", ".kicad_pro")})


def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    assert head[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", head[16:24])


@needs_kicad_cli
def test_render_3d_from_any_angle(rc_board, tmp_path):
    box = Toolbox(roots=[str(tmp_path)])
    plain = box.call("render", {"path": rc_board, "view": "3d", "width": 320})
    assert plain["png"][0].endswith("rc_board-3d-top.png") and "camera" not in plain  # unchanged result for the old arguments
    iso = box.call("render", {"path": rc_board, "view": "3d", "width": 320, "rotate": "-45,0,45"})
    assert iso["png"][0].endswith("rc_board-3d-top-r-45_0_45.png") and iso["camera"] == {"rotate": "-45,0,45"}
    # The negative angle reached kicad-cli as an angle: the image differs from the plain top view.
    with open(plain["png"][0], "rb") as a, open(iso["png"][0], "rb") as b:
        assert a.read() != b.read()
    view = box.call("render", {"path": rc_board, "view": "3d", "side": "front", "rotate": [-20, 10, -30], "zoom": 2,
                               "pivot": "-1,0,0", "perspective": True, "quality": "high", "width": 320, "height": 200})
    assert os.path.getsize(view["png"][0]) > 1000
    width, height = png_size(view["png"][0])
    assert abs(width - 320) <= 40 and abs(height - 200) <= 40  # kicad-cli trims a few pixels
    with pytest.raises(ToolError, match="rotate must be three numbers"):
        box.call("render", {"path": rc_board, "view": "3d", "rotate": "-45,0"})
    with pytest.raises(ToolError, match="side must be one of"):
        box.call("render", {"path": rc_board, "view": "3d", "side": "under"})


def test_glb_options_ask_for_copper_mask_and_silkscreen():
    assert set(board3d.GLB_OPTIONS) == {"--include-tracks", "--include-pads", "--include-zones", "--include-silkscreen", "--include-soldermask"}
