"""3D views of a board: KiCad's own 3D renderer (``kicad-cli pcb render``) and a GLB scene for the Web UI's
interactive 3D view (``kicad-cli pcb export glb``).

Two kicad-cli quirks are handled here. A value that starts with ``-`` (``--rotate -45,0,45``) can be taken
for an option, and ``--rotate=-45,0,45`` fails outright ("Unknown argument"), so such values are passed as
a separate argument with a leading space (``" -45,0,45"``), which KiCad's number parser skips. In ``pcb render``,
``-h`` is listed both as help and as the height, so the height is always ``--height``.

The GLB is cached next to the 2D renders (``<project>/.dsh-kicad/render/<board>/<board>.glb``) with a
``.glb.json`` sidecar file: the same board content, KiCad version and 3D model library give the cached
file back without running kicad-cli.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import threading
import time
from typing import Any

from .kicad_cli import KiCadCli, KiCadCliError
from .models3d import model_library
from .pcb import Board, PcbError

__all__ = ["SIDES", "QUALITIES", "GLB_OPTIONS", "cli_vector", "render_args", "render_name", "export_glb", "missing_models"]

SIDES = ("top", "bottom", "left", "right", "front", "back")
QUALITIES = ("basic", "high")
# Copper, mask and silkscreen as flat faces, so the scene looks like KiCad's 3D viewer and not a bare substrate.
GLB_OPTIONS = ("--include-tracks", "--include-pads", "--include-zones", "--include-silkscreen", "--include-soldermask")
# kicad-cli's camera zoom is clamped to this range (CAMERA min/max zoom).
MIN_ZOOM, MAX_ZOOM = 0.05, 50.0
CACHE_VERSION = 1
MAX_LISTED = 100  # missing models listed in the result (all are counted)


def _number(value: Any, name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be a number, got {value!r}") from None
    if not math.isfinite(number):
        raise ValueError(f"{name} must be a finite number, got {value!r}")
    return number


def _fmt(number: float) -> str:
    text = f"{number:.3f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def cli_vector(value: Any, name: str = "rotate") -> str:
    """``"-45,0,45"`` or ``[-45, 0, 45]`` → the kicad-cli argument for ``--rotate`` / ``--pivot`` / ``--pan``.

    A leading minus gets a space in front, so kicad-cli does not read the value as an option."""
    parts = value.split(",") if isinstance(value, str) else list(value) if isinstance(value, (list, tuple)) else None
    if parts is None or len(parts) != 3:
        raise ValueError(f"{name} must be three numbers 'X,Y,Z' (degrees for rotate), e.g. '-45,0,45'; got {value!r}")
    text = ",".join(_fmt(_number(p.strip() if isinstance(p, str) else p, name)) for p in parts)
    return f" {text}" if text.startswith("-") else text


def render_args(board: str, png: str, *, side: str = "top", width: int = 1600, height: int | None = None,
                quality: str = "basic", rotate: Any = None, zoom: Any = None, perspective: bool = False,
                pivot: Any = None) -> list[str]:
    """Arguments of ``kicad-cli pcb render`` for one view (validated)."""
    if side not in SIDES:
        raise ValueError(f"side must be one of {', '.join(SIDES)}; got {side!r}")
    if quality not in QUALITIES:
        raise ValueError(f"quality must be one of {', '.join(QUALITIES)}; got {quality!r}")
    width = int(_number(width, "width"))
    height = int(_number(height, "height")) if height is not None else max(1, width * 3 // 4)
    if not (16 <= width <= 8192 and 16 <= height <= 8192):
        raise ValueError(f"width and height must be between 16 and 8192 pixels; got {width} × {height}")
    args = ["pcb", "render", "-o", png, "--side", side, "--width", str(width), "--height", str(height)]
    if quality != "basic":
        args += ["--quality", quality]
    if perspective:
        args.append("--perspective")
    if zoom is not None:
        z = _number(zoom, "zoom")
        if not MIN_ZOOM <= z <= MAX_ZOOM:
            raise ValueError(f"zoom must be between {MIN_ZOOM} and {MAX_ZOOM} (1 shows the whole board); got {zoom!r}")
        args += ["--zoom", _fmt(z)]
    if pivot is not None:
        args += ["--pivot", cli_vector(pivot, "pivot")]
    if rotate is not None:
        args += ["--rotate", cli_vector(rotate, "rotate")]
    args.append(board)
    return args


_NAME = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


def render_name(stem: str, side: str = "top", rotate: Any = None, zoom: Any = None, quality: str = "basic",
                perspective: bool = False, pivot: Any = None, name: str | None = None) -> str:
    """PNG file name of a view: ``<stem>-3d-<side>.png`` for the plain side views (as before), with the camera
    in the name otherwise, so different angles do not overwrite each other; ``name`` picks a fixed one
    (``<stem>-3d-<name>.png``, e.g. the Web UI's current view, which replaces itself)."""
    if name is not None:
        if not isinstance(name, str) or not _NAME.match(name):
            raise ValueError(f"name must be 1-40 letters, digits, '-' or '_'; got {name!r}")
        return f"{stem}-3d-{name}.png"
    parts = [f"{stem}-3d-{side}"]
    if rotate is not None:
        parts.append("r" + "_".join(cli_vector(rotate).strip().split(",")))
    if zoom is not None and _number(zoom, "zoom") != 1:
        parts.append("z" + _fmt(_number(zoom, "zoom")))
    if pivot is not None:
        parts.append("p" + "_".join(cli_vector(pivot, "pivot").strip().split(",")))
    if perspective:
        parts.append("persp")
    if quality != "basic":
        parts.append(quality)
    return "-".join(parts) + ".png"


_MISSING = re.compile(r"Could not add 3D model for (?P<ref>.+?)\.\s*\n\s*(?P<why>File not found|[^\n:]+):\s*(?P<model>[^\n]+)")


def missing_models(output: str) -> list[dict[str, str]]:
    """``[{reference, model, reason}]`` from kicad-cli's export log ("Could not add 3D model for J1.\\nFile not found: …")."""
    out = []
    for m in _MISSING.finditer(output.replace("\r\n", "\n")):
        out.append({"reference": m.group("ref").strip(), "model": m.group("model").strip(), "reason": m.group("why").strip()})
    return out


def _shown(model) -> bool:
    """A footprint's ``(model …)`` is drawn unless hidden: ``(hide yes)`` (KiCad 8+) or a bare ``hide`` atom (older)."""
    hide = model.find("hide")
    if hide is not None:
        return hide.value(0) == "no"
    return not any(a.value == "hide" for a in model.atoms()[1:])


def _model_refs(board: Board) -> tuple[list[str], int]:
    """Footprint references, and how many footprints have a visible 3D model."""
    refs, with_model = [], 0
    for fp in board.footprints():
        refs.append(fp.reference)
        if any(_shown(m) for m in fp.node.lists("model")):
            with_model += 1
    return refs, with_model


def _board_info(board: Board) -> dict[str, Any] | None:
    outline = board.outline()
    general = board.root.find("general")
    thickness = 1.6
    if general is not None and general.child_value("thickness") is not None:
        try:
            thickness = float(general.child_value("thickness"))
        except ValueError:
            pass
    if outline is None:
        return {"bbox": None, "width": None, "height": None, "center": None, "thickness": thickness}
    x0, y0, x1, y1 = outline["bbox"]
    return {"bbox": [x0, y0, x1, y1], "width": outline["width"], "height": outline["height"],
            "center": [round((x0 + x1) / 2, 4), round((y0 + y1) / 2, 4)], "thickness": thickness}


def _cache_key(text: bytes, version: str | None, library: dict[str, Any]) -> str:
    h = hashlib.sha256()
    h.update(text)
    h.update(json.dumps([CACHE_VERSION, version, GLB_OPTIONS, library.get("dir"), library.get("installed"),
                         library.get("libraries")]).encode())
    return h.hexdigest()[:32]


def export_glb(cli: KiCadCli, board_path: str, out_dir: str, *, force: bool = False) -> dict[str, Any]:
    """Export the board as a GLB scene for the interactive 3D view; cached by board content.

    Returns the GLB and metadata paths, the board's outline box and thickness (mm, board coordinates; the GLB uses
    the same origin in metres, Y up, Z = board Y), the footprint references (GLB node names of their 3D models)
    and which footprints' 3D models KiCad could not find."""
    with open(board_path, "rb") as fh:
        raw = fh.read()
    stem = os.path.splitext(os.path.basename(board_path))[0]
    glb = os.path.join(out_dir, f"{stem}.glb")
    meta_path = glb + ".json"
    library = model_library(cli)
    key = _cache_key(raw, cli.version_or_none(), library)
    if not force and os.path.isfile(glb):
        try:
            with open(meta_path, encoding="utf-8") as fh:
                meta = json.load(fh)
            if meta.get("key") == key and meta.get("bytes") == os.path.getsize(glb):
                return {**meta, "glb": glb, "meta": meta_path, "cached": True}
        except (OSError, ValueError):
            pass
    try:
        board = Board(board_path, text=raw.decode("utf-8"))
    except (UnicodeDecodeError, PcbError) as exc:
        raise KiCadCliError(f"cannot read {board_path}: {exc}") from exc
    os.makedirs(out_dir, exist_ok=True)
    started = time.monotonic()
    # kicad-cli creates the file (normal permissions); a hidden name per caller keeps exports apart.
    tmp = os.path.join(out_dir, f".{stem}-{os.getpid()}-{threading.get_ident()}.glb")
    try:
        proc = cli.run("pcb", "export", "glb", *GLB_OPTIONS, "-f", "-o", tmp, board_path, cwd=os.path.dirname(board_path))
        if not os.path.isfile(tmp) or os.path.getsize(tmp) == 0:
            raise KiCadCliError(f"kicad-cli pcb export glb wrote no file: {(proc.stdout + proc.stderr).strip()[-400:]}")
        os.replace(tmp, glb)  # atomic: a viewer watching the file never reads half of it
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    refs, with_model = _model_refs(board)
    missing = missing_models(proc.stdout + "\n" + proc.stderr)
    meta = {
        "key": key,
        "board": _board_info(board),
        "references": refs,
        "models": {
            "footprints_with_models": with_model,
            "missing": missing[:MAX_LISTED],
            "missing_count": len(missing),
            "library": library,
        },
        "kicad_version": cli.version_or_none(),
        "bytes": os.path.getsize(glb),
        "seconds": round(time.monotonic() - started, 3),
        "units": "m",
    }
    tmp_meta = meta_path + ".tmp"
    with open(tmp_meta, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
    os.replace(tmp_meta, meta_path)
    return {**meta, "glb": glb, "meta": meta_path, "cached": False}
