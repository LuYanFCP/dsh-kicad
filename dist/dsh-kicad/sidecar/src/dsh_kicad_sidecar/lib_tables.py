"""KiCad library tables (``fp-lib-table``, ``sym-lib-table``) resolved the way KiCad resolves them.

A nickname is looked up in the project's table (``${KIPRJMOD}``), then the user's global table, then the
stock template table that KiCad copies on first start, then ``<share>/footprints|symbols`` itself. KiCad 10's
global tables nest the stock libraries through a ``(type "Table")`` row, which is followed; ``(disabled)``
rows are skipped. ``${VAR}`` comes from the environment, ``kicad_common.json`` and KiCad's built-in defaults
(``KICADn_FOOTPRINT_DIR``, ``KICADn_SYMBOL_DIR``, ``KICADn_3DMODEL_DIR`` → the installed libraries).
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys

from .footprints import default_footprint_dirs
from .sexpr import parse
from .symbols import default_symbol_dirs

__all__ = ["LibTable", "kicad_config_dirs"]

_KINDS = {
    # kind: (table file, stock directory name, env var stem, library suffix, library is a directory)
    "fp": ("fp-lib-table", "footprints", "FOOTPRINT_DIR", ".pretty", True),
    "sym": ("sym-lib-table", "symbols", "SYMBOL_DIR", ".kicad_sym", False),
}


def kicad_config_dirs(major: int | None = None) -> list[str]:
    """KiCad's per-version user config directories, newest first (only those that exist)."""
    home = os.path.expanduser("~")
    if sys.platform == "darwin":
        bases = [os.path.join(home, "Library", "Preferences", "kicad")]
    elif sys.platform == "win32":
        bases = [os.path.join(os.environ.get("APPDATA", os.path.join(home, "AppData", "Roaming")), "kicad")]
    else:
        bases = [os.path.join(os.environ.get("XDG_CONFIG_HOME") or os.path.join(home, ".config"), "kicad"),
                 os.path.join(home, ".var", "app", "org.kicad.KiCad", "config", "kicad")]  # Flatpak
    found = []
    for base in bases:
        for d in glob.glob(os.path.join(base, "[0-9]*.[0-9]*")):
            ver = re.match(r"(\d+)\.\d+$", os.path.basename(d))
            if ver and os.path.isdir(d) and (major is None or int(ver.group(1)) == major):
                found.append((int(ver.group(1)), d))
    return [d for _, d in sorted(found, key=lambda v: -v[0])]


class LibTable:
    """Nickname → library path for one kind of table (``"fp"`` or ``"sym"``).

    ``stock_dirs`` (the installed libraries, e.g. ``/usr/share/kicad/footprints``) and ``config_dir``
    default to what is found on this machine; tests pass their own.
    """

    def __init__(self, kind: str, project_dir: str | None = None, major: int | None = None,
                 stock_dirs: list[str] | None = None, config_dir: str | None = None):
        if kind not in _KINDS:
            raise ValueError(f"kind must be one of {sorted(_KINDS)}")
        self.kind = kind
        self.project_dir = os.path.abspath(project_dir) if project_dir else None
        self.stock_dirs = stock_dirs if stock_dirs is not None else (
            default_footprint_dirs() if kind == "fp" else default_symbol_dirs())
        if config_dir is None:
            dirs = kicad_config_dirs(major)
            config_dir = dirs[0] if dirs else None
        self.config_dir = config_dir
        if major is None and config_dir:
            ver = re.match(r"(\d+)\.", os.path.basename(config_dir))
            major = int(ver.group(1)) if ver else None
        self.major = major
        self.vars = self._vars()
        self._libs: dict[str, str] | None = None
        self.problems: list[str] = []

    # ---- variables -------------------------------------------------------------------
    def _vars(self) -> dict[str, str]:
        out: dict[str, str] = {}
        stock = self.stock_dirs[0] if self.stock_dirs else None
        share = os.path.dirname(stock) if stock else None
        for v in range(6, max(self.major or 10, 10) + 1):
            if share:
                out[f"KICAD{v}_FOOTPRINT_DIR"] = os.path.join(share, "footprints")
                out[f"KICAD{v}_SYMBOL_DIR"] = os.path.join(share, "symbols")
                out[f"KICAD{v}_3DMODEL_DIR"] = os.path.join(share, "3dmodels")
                out[f"KICAD{v}_TEMPLATE_DIR"] = os.path.join(share, "template")
        if self.config_dir:
            try:
                with open(os.path.join(self.config_dir, "kicad_common.json"), encoding="utf-8") as fh:
                    configured = (json.load(fh).get("environment") or {}).get("vars") or {}
                out.update({k: v for k, v in configured.items() if isinstance(v, str)})
            except (OSError, ValueError, AttributeError):
                pass
        out.update({k: v for k, v in os.environ.items() if k.startswith("KICAD")})
        if self.project_dir:
            out["KIPRJMOD"] = self.project_dir
        return out

    def expand(self, uri: str) -> str:
        return os.path.normpath(re.sub(r"\$\{(\w+)\}", lambda m: self.vars.get(m.group(1), m.group(0)), uri))

    # ---- tables ----------------------------------------------------------------------
    def tables(self) -> list[str]:
        """Tables in lookup order: project, user global, stock template."""
        name = _KINDS[self.kind][0]
        out = []
        if self.project_dir:
            out.append(os.path.join(self.project_dir, name))
        if self.config_dir:
            out.append(os.path.join(self.config_dir, name))
        out += [os.path.join(os.path.dirname(d), "template", name) for d in self.stock_dirs]
        return [t for i, t in enumerate(out) if os.path.isfile(t) and t not in out[:i]]

    def libraries(self) -> dict[str, str]:
        """Nickname → ``.pretty`` directory / ``.kicad_sym`` file. The first table that names a library wins."""
        if self._libs is None:
            libs: dict[str, str] = {}
            seen: set[str] = set()
            for table in self.tables():
                self._read(table, libs, seen)
            _, _, _, suffix, _ = _KINDS[self.kind]
            for d in self.stock_dirs:  # libraries no table lists, as the footprint/symbol search does
                for path in sorted(glob.glob(os.path.join(d, "*" + suffix))):
                    libs.setdefault(os.path.basename(path)[:-len(suffix)], path)
            self._libs = libs
        return self._libs

    def _read(self, table: str, libs: dict[str, str], seen: set[str]) -> None:
        if table in seen:
            return
        seen.add(table)
        try:
            with open(table, encoding="utf-8") as fh:
                root = parse(fh.read()).root
        except (OSError, ValueError) as exc:
            self.problems.append(f"cannot read {table}: {exc}")
            return
        is_dir = _KINDS[self.kind][4]
        for lib in root.lists("lib"):
            if lib.find("disabled") is not None:
                continue
            name, kind, uri = lib.child_value("name"), lib.child_value("type"), lib.child_value("uri")
            if not name or not uri:
                continue
            path = self.expand(uri)
            if kind == "Table":
                if os.path.isfile(path):
                    self._read(path, libs, seen)
                else:
                    self.problems.append(f"{table}: nested table {name!r} not found at {path}")
            elif kind == "KiCad":
                if name in libs:
                    continue
                if os.path.isdir(path) if is_dir else os.path.isfile(path):
                    libs[name] = path
                else:
                    self.problems.append(f"{table}: library {name!r} not found at {path}")

    def resolve(self, lib_id: str) -> str:
        """``Lib:Name`` → the ``.kicad_mod`` file (footprints) or the ``.kicad_sym`` library file (symbols)."""
        nick, sep, name = lib_id.partition(":")
        if not sep or not nick or not name:
            raise LookupError(f"library id must look like 'Library:Name', got {lib_id!r}")
        lib = self.libraries().get(nick)
        if lib is None:
            raise LookupError(f"library {nick!r} of {lib_id!r} is in no {_KINDS[self.kind][0]} "
                              f"(searched {', '.join(self.tables()) or 'no tables'} and {', '.join(self.stock_dirs) or 'no stock libraries'})")
        if self.kind == "sym":
            return lib
        path = os.path.join(lib, name + ".kicad_mod")
        if not os.path.isfile(path):
            raise LookupError(f"footprint {name!r} not found in library {nick!r} ({lib})")
        return path
