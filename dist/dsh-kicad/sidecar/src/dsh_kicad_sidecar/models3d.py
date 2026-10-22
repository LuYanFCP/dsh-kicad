"""Where KiCad's 3D model library is, resolved the way KiCad resolves ``${KICADn_3DMODEL_DIR}``.

Footprints from KiCad's libraries name their bodies as ``${KICAD10_3DMODEL_DIR}/<Lib>.3dshapes/<name>.step``.
KiCad (``COMMON_SETTINGS::InitializeEnvironment``, ``PGM_BASE::loadCommonSettings``) takes the variable from the
process environment when it is set and not empty, then from Preferences → Configure Paths (``kicad_common.json``
→ ``environment.vars``), then its built-in default ``PATHS::GetStock3dmodelsPath()``: the ``3dmodels`` directory
of its stock library data (``<prefix>/share/kicad`` on Linux and Windows, ``KiCad.app/Contents/SharedSupport`` on
macOS, ``/app/extensions/Library`` in the Flatpak). Distributions ship the models as a separate package (Fedora,
Debian and Ubuntu ``kicad-packages3d``, Arch ``kicad-library-3d``, openSUSE ``kicad-packages3D``) and the Flatpak
as the ``org.kicad.KiCad.Library.Packages3D`` extension, so they are often missing: then 3D renders and the GLB
scene show the bare board.
"""

from __future__ import annotations

import glob
import json
import os
import sys
from typing import Any

from .footprints import default_footprint_dirs
from .kicad_cli import FLATPAK_APP, parse_version
from .lib_tables import kicad_config_dirs

__all__ = ["FLATPAK_EXTENSION", "model_library", "default_model_dirs", "flatpak_model_dirs"]

FLATPAK_EXTENSION = f"{FLATPAK_APP}.Library.Packages3D"


def flatpak_model_dirs() -> list[str]:
    """Installed copies of the Flatpak 3D model extension (per user, then system-wide)."""
    home = os.path.expanduser("~")
    roots = [os.path.join(os.environ.get("XDG_DATA_HOME") or os.path.join(home, ".local", "share"), "flatpak"),
             "/var/lib/flatpak"]
    found = []
    for root in roots:
        for files in sorted(glob.glob(os.path.join(root, "runtime", FLATPAK_EXTENSION, "*", "*", "active", "files"))):
            # The extension holds the <Lib>.3dshapes directories, either directly or under a 3dmodels directory.
            nested = os.path.join(files, "3dmodels")
            found.append(nested if os.path.isdir(nested) else files)
    return found


def default_model_dirs(cli_argv: list[str] | None = None) -> list[str]:
    """KiCad's built-in default for ``KICADn_3DMODEL_DIR``, best guess first: next to the kicad-cli in use, then the
    stock locations of every platform, then beside the installed footprint libraries."""
    dirs: list[str] = []
    exe = cli_argv[0] if cli_argv and len(cli_argv) == 1 else None
    if exe:
        exe = os.path.realpath(exe)
        if "/Contents/MacOS/" in exe:
            dirs.append(os.path.join(exe.split("/Contents/MacOS/")[0], "Contents", "SharedSupport", "3dmodels"))
        else:  # <prefix>/bin/kicad-cli → <prefix>/share/kicad/3dmodels (Linux, Windows)
            dirs.append(os.path.join(os.path.dirname(os.path.dirname(exe)), "share", "kicad", "3dmodels"))
    if os.environ.get("APPDIR") and exe and exe.startswith(os.environ["APPDIR"]):  # the AppImage
        dirs.append(os.path.join(os.environ["APPDIR"], "share", "kicad", "3dmodels"))
    dirs += ["/usr/share/kicad/3dmodels", "/usr/local/share/kicad/3dmodels",
             "/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels"]
    if sys.platform == "win32":
        dirs += sorted(glob.glob(r"C:\Program Files\KiCad\*\share\kicad\3dmodels"), reverse=True)
    dirs += [os.path.join(os.path.dirname(d), "3dmodels") for d in default_footprint_dirs()]
    return [d for i, d in enumerate(dirs) if d not in dirs[:i]]


def _configured(var: str, config_dir: str | None) -> str | None:
    if not config_dir:
        return None
    try:
        with open(os.path.join(config_dir, "kicad_common.json"), encoding="utf-8") as fh:
            value = ((json.load(fh).get("environment") or {}).get("vars") or {}).get(var)
    except (OSError, ValueError, AttributeError):
        return None
    return value if isinstance(value, str) and value else None


def _libraries(path: str | None) -> int:
    """Number of ``*.3dshapes`` libraries (or, for a custom layout, entries) in a model directory."""
    if not path or not os.path.isdir(path):
        return 0
    try:
        entries = [e for e in os.scandir(path) if not e.name.startswith(".")]
    except OSError:
        return 0
    shapes = [e for e in entries if e.name.endswith(".3dshapes")]
    return len(shapes) or len(entries)


def model_library(cli: Any = None, *, major: int | None = None, environ: dict[str, str] | None = None,
                  config_dir: str | None = None, defaults: list[str] | None = None) -> dict[str, Any]:
    """Resolve ``KICAD<major>_3DMODEL_DIR`` and say whether a library is installed there.

    ``{"var", "dir", "source": environment | kicad_common.json | default | flatpak | None, "installed", "libraries"}``.
    ``cli`` (a ``KiCadCli``) supplies the KiCad version and where KiCad is installed; tests pass the rest."""
    environ = os.environ if environ is None else environ
    argv = getattr(cli, "argv", None)
    if major is None:
        version = parse_version(cli.version_or_none()) if cli is not None and argv else None
        major = version[0] if version else 10
    var = f"KICAD{major}_3DMODEL_DIR"
    flatpak = getattr(cli, "source", None) == "flatpak"
    if config_dir is None:
        dirs = kicad_config_dirs(major)
        config_dir = dirs[0] if dirs else None
    path, source = environ.get(var) or None, "environment"
    if path is None:
        path, source = _configured(var, config_dir), "kicad_common.json"
    if path is None and flatpak and defaults is None:
        # kicad-cli runs inside the sandbox, which mounts the extension; look for it on the host.
        found = flatpak_model_dirs()
        path, source = (found[0] if found else None), "flatpak"
    if path is None:
        candidates = defaults if defaults is not None else default_model_dirs(argv)
        installed = next((d for d in candidates if _libraries(d)), None)
        path = installed or next((d for d in candidates if os.path.isdir(os.path.dirname(d))), candidates[0] if candidates else None)
        source = "default" if path else None
    count = _libraries(path)
    return {"var": var, "dir": path, "source": source, "installed": count > 0, "libraries": count,
            **({"flatpak_extension": FLATPAK_EXTENSION} if flatpak else {})}
