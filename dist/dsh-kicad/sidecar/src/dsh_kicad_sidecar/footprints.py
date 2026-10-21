"""KiCad footprint libraries: discovery and search (names, description, tags, pads)."""

from __future__ import annotations

import glob
import os
import re
import sys

from .sexpr import parse

__all__ = ["FootprintLibraries", "default_footprint_dirs"]

_DESCR = re.compile(r'\(descr "((?:[^"\\]|\\.)*)"')
_TAGS = re.compile(r'\(tags "((?:[^"\\]|\\.)*)"')
_PAD = re.compile(r'\(pad "((?:[^"\\]|\\.)*)"')


def default_footprint_dirs() -> list[str]:
    dirs: list[str] = []
    for var in ("KICAD10_FOOTPRINT_DIR", "KICAD9_FOOTPRINT_DIR", "KICAD8_FOOTPRINT_DIR", "KICAD_FOOTPRINT_DIR"):
        if os.environ.get(var):
            dirs.append(os.environ[var])
    home = os.path.expanduser("~")
    dirs += [
        "/usr/share/kicad/footprints",
        "/usr/local/share/kicad/footprints",
        "/var/lib/flatpak/app/org.kicad.KiCad/current/active/files/share/kicad/footprints",
        os.path.join(home, ".local/share/flatpak/app/org.kicad.KiCad/current/active/files/share/kicad/footprints"),
        "/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints",
    ]
    if sys.platform == "win32":
        dirs += sorted(glob.glob(r"C:\Program Files\KiCad\*\share\kicad\footprints"), reverse=True)
    return [d for i, d in enumerate(dirs) if os.path.isdir(d) and d not in dirs[:i]]


class FootprintLibraries:
    def __init__(self, project_dir: str | None = None, global_dirs: list[str] | None = None):
        self.project_dir = project_dir
        self.global_dirs = global_dirs if global_dirs is not None else default_footprint_dirs()
        self._libs: dict[str, str] | None = None
        self._index: list[dict] | None = None

    def libraries(self) -> dict[str, str]:
        """Nickname → .pretty directory, resolved like KiCad (and schematic → board sync): the project
        fp-lib-table, the user's global table, the stock table, then stock libraries no table lists."""
        if self._libs is None:
            from .lib_tables import LibTable  # deferred: lib_tables imports this module

            self._libs = dict(LibTable("fp", self.project_dir, stock_dirs=self.global_dirs).libraries())
        return self._libs

    def index(self) -> list[dict]:
        if self._index is None:
            self._index = [
                {"lib_id": f"{nick}:{os.path.basename(f)[:-len('.kicad_mod')]}", "path": f}
                for nick, d in sorted(self.libraries().items())
                for f in sorted(glob.glob(os.path.join(d, "*.kicad_mod")))
            ]
        return self._index

    @staticmethod
    def details(path: str, pads: bool) -> dict:
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            return {}
        out = {
            "description": (_DESCR.search(text).group(1) if _DESCR.search(text) else "")[:200],
            "tags": _TAGS.search(text).group(1) if _TAGS.search(text) else "",
        }
        names = list(dict.fromkeys(p for p in _PAD.findall(text) if p))  # unnamed pads are mechanical
        out["pad_count"] = len(names)
        if pads:
            out["pads"] = names
        return out

    def path(self, lib_id: str) -> str:
        if ":" not in lib_id:
            raise LookupError(f"footprint id must look like 'Library:Name', got '{lib_id}'")
        nick, name = lib_id.split(":", 1)
        d = self.libraries().get(nick)
        path = os.path.join(d, f"{name}.kicad_mod") if d else None
        if not path or not os.path.isfile(path):
            raise LookupError(f"footprint '{lib_id}' not found")
        return path

    def get(self, lib_id: str) -> dict:
        return {"lib_id": lib_id, "exists": True, **self.details(self.path(lib_id), pads=True)}

    def load(self, lib_id: str):
        """The parsed ``(footprint ...)`` node of a library footprint, e.g. for ``Board.add_footprint``."""
        with open(self.path(lib_id), encoding="utf-8") as fh:
            return parse(fh.read()).root

    def search(self, query: str, library: str | None = None, limit: int = 20, pads: bool = False) -> list[dict]:
        """Match all whitespace-separated terms against the footprint id (case-insensitive, '*' wildcards allowed)."""
        terms = [t.lower() for t in query.split() if t]
        hits = []
        for entry in self.index():
            lid = entry["lib_id"]
            if library and not lid.startswith(library + ":"):
                continue
            low = lid.lower()
            if all(re.search(re.escape(t).replace(r"\*", ".*"), low) for t in terms):
                hits.append(entry)
        hits.sort(key=lambda e: (len(e["lib_id"]), e["lib_id"]))
        return [{"lib_id": e["lib_id"], **self.details(e["path"], pads)} for e in hits[:limit]]
