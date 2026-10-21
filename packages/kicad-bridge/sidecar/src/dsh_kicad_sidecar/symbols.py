"""KiCad symbol libraries: discovery, lookup by ``lib_id``, search, and flattening."""

from __future__ import annotations

import glob
import os
import re
import sys
from dataclasses import dataclass
from typing import Iterable

from .sexpr import Atom, SList, parse

__all__ = ["SymbolLibraries", "default_symbol_dirs", "clone", "LibraryError"]


class LibraryError(LookupError):
    pass


def default_symbol_dirs() -> list[str]:
    """Global symbol library directories, most specific first."""
    dirs: list[str] = []
    for var in ("KICAD10_SYMBOL_DIR", "KICAD9_SYMBOL_DIR", "KICAD8_SYMBOL_DIR", "KICAD_SYMBOL_DIR"):
        if os.environ.get(var):
            dirs.append(os.environ[var])
    home = os.path.expanduser("~")
    dirs += [
        "/usr/share/kicad/symbols",
        "/usr/local/share/kicad/symbols",
        "/var/lib/flatpak/app/org.kicad.KiCad/current/active/files/share/kicad/symbols",
        os.path.join(home, ".local/share/flatpak/app/org.kicad.KiCad/current/active/files/share/kicad/symbols"),
        "/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols",
    ]
    if sys.platform == "win32":
        dirs += sorted(glob.glob(r"C:\Program Files\KiCad\*\share\kicad\symbols"), reverse=True)
    seen: list[str] = []
    for d in dirs:
        if os.path.isdir(d) and d not in seen:
            seen.append(d)
    return seen


def clone(node, keep_ws: bool = False):
    """Deep copy. Without ``keep_ws`` the copy is re-laid-out for its new depth."""
    if isinstance(node, Atom):
        return Atom(node.value, node.quoted, node.raw)
    out = SList()
    for item, ws in zip(node.items, node.ws):
        out.items.append(clone(item, keep_ws))
        out.ws.append(ws if keep_ws else None)
    out.tail = node.tail if keep_ws else None
    return out


_SYM_START = re.compile(r'^\t\(symbol "((?:[^"\\]|\\.)*)"', re.M)
_PROP = r'\(property "{}" "((?:[^"\\]|\\.)*)"'
_DESC = re.compile(_PROP.format("Description"))
_KEYW = re.compile(_PROP.format("ki_keywords"))
_FP = re.compile(_PROP.format("Footprint"))
_EXTENDS = re.compile(r'\(extends "((?:[^"\\]|\\.)*)"')
_PIN = re.compile(r"\(pin (?:input|output|bidirectional|tri_state|passive|free|unspecified|power_in|power_out|open_collector|open_emitter|no_connect)\b")
_POWER = re.compile(r"^\t\t\(power(?:\s|\))", re.M)


@dataclass
class IndexEntry:
    lib_id: str
    description: str
    keywords: str
    footprint: str
    pins: int
    power: bool
    extends: str | None


class SymbolLibraries:
    """Resolves ``Lib:Name`` ids against a project's sym-lib-table and global libraries."""

    def __init__(self, project_dir: str | None = None, global_dirs: Iterable[str] | None = None):
        self.project_dir = project_dir
        self.global_dirs = list(global_dirs) if global_dirs is not None else default_symbol_dirs()
        self._libs: dict[str, str] | None = None
        self._parsed: dict[str, dict[str, SList]] = {}
        self._index: list[IndexEntry] | None = None

    # ---- library table -------------------------------------------------------------
    def libraries(self) -> dict[str, str]:
        """Map nickname → .kicad_sym path. Project table entries shadow global ones."""
        if self._libs is not None:
            return self._libs
        libs: dict[str, str] = {}
        for d in reversed(self.global_dirs):
            for path in glob.glob(os.path.join(d, "*.kicad_sym")):
                libs[os.path.splitext(os.path.basename(path))[0]] = path
        if self.project_dir:
            table = os.path.join(self.project_dir, "sym-lib-table")
            if os.path.isfile(table):
                libs.update(self._read_table(table))
        self._libs = libs
        return libs

    def _read_table(self, path: str) -> dict[str, str]:
        out: dict[str, str] = {}
        with open(path, encoding="utf-8") as fh:
            root = parse(fh.read()).root
        for lib in root.lists("lib"):
            name, uri = lib.child_value("name"), lib.child_value("uri")
            if not name or not uri:
                continue
            uri = uri.replace("${KIPRJMOD}", self.project_dir or "")
            uri = re.sub(r"\$\{(\w+)\}", lambda m: os.environ.get(m.group(1), m.group(0)), uri)
            if os.path.isfile(uri):
                out[name] = uri
        return out

    # ---- lookup --------------------------------------------------------------------
    def _symbols_of(self, nickname: str) -> dict[str, SList]:
        if nickname not in self._parsed:
            path = self.libraries().get(nickname)
            if path is None:
                raise LibraryError(f"symbol library '{nickname}' not found (searched project sym-lib-table and {self.global_dirs})")
            with open(path, encoding="utf-8") as fh:
                root = parse(fh.read()).root
            self._parsed[nickname] = {s.value(0): s for s in root.lists("symbol") if s.value(0)}
        return self._parsed[nickname]

    def get(self, lib_id: str) -> SList:
        """The library definition of ``lib_id``, flattened when it ``extends`` a parent."""
        if ":" not in lib_id:
            raise LibraryError(f"lib_id must look like 'Library:Symbol', got '{lib_id}'")
        nickname, name = lib_id.split(":", 1)
        symbols = self._symbols_of(nickname)
        if name not in symbols:
            raise LibraryError(f"symbol '{name}' not found in library '{nickname}'")
        return flatten(symbols, name)

    def for_schematic(self, lib_id: str) -> SList:
        """A copy ready for a schematic's ``lib_symbols`` (renamed to the full lib_id)."""
        node = clone(self.get(lib_id))
        node.items[1] = Atom(lib_id, True)
        return node

    # ---- search --------------------------------------------------------------------
    def index(self) -> list[IndexEntry]:
        if self._index is None:
            entries: list[IndexEntry] = []
            for nickname, path in sorted(self.libraries().items()):
                try:
                    with open(path, encoding="utf-8") as fh:
                        text = fh.read()
                except OSError:
                    continue
                starts = list(_SYM_START.finditer(text))
                for k, m in enumerate(starts):
                    block = text[m.start(): starts[k + 1].start() if k + 1 < len(starts) else len(text)]
                    pick = lambda rx: (rx.search(block).group(1) if rx.search(block) else "")  # noqa: E731
                    ext = _EXTENDS.search(block)
                    entries.append(IndexEntry(
                        lib_id=f"{nickname}:{m.group(1)}", description=pick(_DESC), keywords=pick(_KEYW),
                        footprint=pick(_FP), pins=len(_PIN.findall(block)), power=bool(_POWER.search(block)),
                        extends=ext.group(1) if ext else None,
                    ))
            self._index = entries
        return self._index

    def search(self, query: str, limit: int = 25, library: str | None = None) -> list[dict]:
        terms = [t for t in query.lower().split() if t]
        scored = []
        for e in self.index():
            if library and not e.lib_id.startswith(library + ":"):
                continue
            name = e.lib_id.split(":", 1)[1].lower()
            hay = f"{e.lib_id.lower()} {e.description.lower()} {e.keywords.lower()}"
            if not all(t in hay for t in terms):
                continue
            score = sum(3 if t == name else 2 if t in name else 1 for t in terms)
            scored.append((-score, len(e.lib_id), e))
        scored.sort(key=lambda x: (x[0], x[1], x[2].lib_id))
        return [
            {"lib_id": e.lib_id, "description": e.description, "keywords": e.keywords,
             "footprint": e.footprint, "pins": e.pins, "power": e.power, **({"extends": e.extends} if e.extends else {})}
            for _, _, e in scored[:limit]
        ]


def flatten(symbols: dict[str, SList], name: str, depth: int = 0) -> SList:
    """Resolve ``(extends "Parent")`` the way KiCad does when it caches a symbol in a schematic."""
    node = symbols[name]
    parent_name = node.child_value("extends")
    if parent_name is None:
        return node
    if depth > 8 or parent_name not in symbols:
        raise LibraryError(f"cannot resolve parent '{parent_name}' of '{name}'")
    parent = clone(flatten(symbols, parent_name, depth + 1), keep_ws=False)
    out = SList()
    out.append(Atom("symbol"))
    out.append(Atom(name, True))
    child_props = {p.value(0): p for p in node.lists("property")}
    for item in parent.items[2:]:
        if isinstance(item, SList) and item.head == "property" and item.value(0) in child_props:
            out.append(clone(child_props.pop(item.value(0))))
        elif isinstance(item, SList) and item.head == "symbol":
            sub = clone(item)
            old = sub.value(0) or ""
            if old.startswith(parent_name + "_"):
                sub.items[1] = Atom(name + old[len(parent_name):], True)
            out.append(sub)
        else:
            out.append(item)
    # Child-only properties (new fields) go before the unit sub-symbols.
    first_sub = next((i for i, it in enumerate(out.items) if isinstance(it, SList) and it.head == "symbol"), len(out.items))
    for prop in child_props.values():
        out.insert(first_sub, clone(prop))
        first_sub += 1
    return out
