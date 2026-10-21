"""Lossless S-expression reader/writer for KiCad files.

Parsing keeps every atom's original spelling and the whitespace in front of every
list member, so ``dumps(parse(text)) == text`` byte for byte. Edits only change the
nodes they touch: an untouched subtree is re-emitted exactly as it was read, and a
node created in code (whitespace ``None``) is formatted the way KiCad 8+ writes files
(tab indentation, one sub-list per line, atom-only lists on one line).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator, Union

__all__ = [
    "Atom", "SList", "Node", "ParseError", "parse", "dumps", "prettify", "kicad_layout", "L", "S", "A", "num", "fmt_num",
]


@dataclass(eq=False)
class Atom:
    """A bare token (``yes``, ``1.27``) or a quoted string (``"R1"``)."""

    value: str
    quoted: bool = False
    raw: str | None = None  # original spelling; None once created or edited in code

    def text(self) -> str:
        if self.raw is not None:
            return self.raw
        if not self.quoted:
            return self.value
        escaped = self.value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
        return f'"{escaped}"'

    def set(self, value: str) -> None:
        self.value = value
        self.raw = None

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"Atom({self.text()})"


@dataclass(eq=False)
class SList:
    """A parenthesised list. ``ws[i]`` is the whitespace before ``items[i]``."""

    items: list["Node"] = field(default_factory=list)
    ws: list[str | None] = field(default_factory=list)
    tail: str | None = None  # whitespace before ")"

    # ---- structure -----------------------------------------------------------------
    @property
    def head(self) -> str | None:
        first = self.items[0] if self.items else None
        return first.value if isinstance(first, Atom) else None

    def lists(self, name: str | None = None) -> Iterator["SList"]:
        for item in self.items:
            if isinstance(item, SList) and (name is None or item.head == name):
                yield item

    def find(self, name: str) -> "SList | None":
        return next(self.lists(name), None)

    def atoms(self) -> list[Atom]:
        """Atoms after the head, in order."""
        return [i for i in self.items[1:] if isinstance(i, Atom)]

    def value(self, index: int = 0) -> str | None:
        atoms = self.atoms()
        return atoms[index].value if index < len(atoms) else None

    def child_value(self, name: str, index: int = 0) -> str | None:
        child = self.find(name)
        return child.value(index) if child is not None else None

    def property(self, name: str) -> "SList | None":
        for prop in self.lists("property"):
            if prop.value(0) == name:
                return prop
        return None

    # ---- mutation ------------------------------------------------------------------
    def append(self, node: "Node") -> "Node":
        self.items.append(node)
        self.ws.append(None)
        return node

    def insert(self, index: int, node: "Node") -> "Node":
        self.items.insert(index, node)
        self.ws.insert(index, None)
        return node

    def remove(self, node: "Node") -> None:
        for i, item in enumerate(self.items):
            if item is node:
                del self.items[i]
                del self.ws[i]
                return
        raise ValueError("node is not a member of this list")

    def index_of(self, node: "Node") -> int:
        for i, item in enumerate(self.items):
            if item is node:
                return i
        raise ValueError("node is not a member of this list")

    def set_atoms(self, *values: object) -> None:
        """Replace the atoms after the head, keeping sub-lists (e.g. ``(at x y r)``)."""
        lists = [(i, w) for i, w in zip(self.items[1:], self.ws[1:]) if isinstance(i, SList)]
        head, head_ws = self.items[0], self.ws[0]
        self.items = [head] + [_atom(v) for v in values] + [i for i, _ in lists]
        self.ws = [head_ws] + [None] * len(values) + [w for _, w in lists]
        # Re-flow atoms onto the head line even when the original list was multi-line.
        for k in range(1, 1 + len(values)):
            self.ws[k] = " "

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"SList({self.head!r}, {len(self.items)} items)"


Node = Union[Atom, SList]


class ParseError(ValueError):
    pass


@dataclass
class Document:
    """A parsed file: the root list plus the bytes around it."""

    root: SList
    prefix: str = ""
    suffix: str = ""


# ---- parsing -------------------------------------------------------------------------

_WS = " \t\r\n"
_DELIM = _WS + '()"'


def parse(text: str) -> Document:
    """Parse one top-level list, keeping surrounding whitespace."""
    i = 0
    n = len(text)
    while i < n and text[i] in _WS:
        i += 1
    prefix = text[:i]
    if i >= n or text[i] != "(":
        raise ParseError("expected '(' at start of document")
    root, i = _parse_list(text, i)
    suffix = text[i:]
    if suffix.strip():
        raise ParseError(f"unexpected content after the root list at offset {i}")
    return Document(root, prefix, suffix)


def _parse_list(text: str, i: int) -> tuple[SList, int]:
    assert text[i] == "("
    i += 1
    node = SList()
    n = len(text)
    while True:
        start = i
        while i < n and text[i] in _WS:
            i += 1
        ws = text[start:i]
        if i >= n:
            raise ParseError("unterminated list")
        ch = text[i]
        if ch == ")":
            node.tail = ws
            return node, i + 1
        if ch == "(":
            child, i = _parse_list(text, i)
        elif ch == '"':
            child, i = _parse_string(text, i)
        else:
            j = i
            while j < n and text[j] not in _DELIM:
                j += 1
            token = text[i:j]
            child = Atom(token, False, token)
            i = j
        node.items.append(child)
        node.ws.append(ws)


def _parse_string(text: str, i: int) -> tuple[Atom, int]:
    j = i + 1
    out: list[str] = []
    n = len(text)
    while j < n:
        ch = text[j]
        if ch == "\\" and j + 1 < n:
            nxt = text[j + 1]
            out.append({"n": "\n", "t": "\t", "r": "\r"}.get(nxt, nxt))
            j += 2
            continue
        if ch == '"':
            return Atom("".join(out), True, text[i:j + 1]), j + 1
        out.append(ch)
        j += 1
    raise ParseError("unterminated string")


# ---- writing -------------------------------------------------------------------------

def dumps(node: Node | Document, depth: int = 0) -> str:
    if isinstance(node, Document):
        return node.prefix + _dump(node.root, 0) + node.suffix
    return _dump(node, depth)


def _dump(node: Node, depth: int) -> str:
    if isinstance(node, Atom):
        return node.text()
    has_lists = any(isinstance(i, SList) for i in node.items)
    compact_pts = node.head == "pts"
    parts = ["("]
    first_list_seen = False
    for idx, (item, ws) in enumerate(zip(node.items, node.ws)):
        if ws is None:
            if idx == 0:
                ws = ""
            elif compact_pts and isinstance(item, SList):
                ws = "\n" + "\t" * (depth + 1) if not first_list_seen else " "
            elif isinstance(item, SList) or (has_lists and first_list_seen):
                ws = "\n" + "\t" * (depth + 1)
            else:
                ws = " "
        if isinstance(item, SList):
            first_list_seen = True
        parts.append(ws)
        parts.append(_dump(item, depth + 1))
    tail = node.tail
    if tail is None:
        tail = "\n" + "\t" * depth if has_lists else ""
    parts.append(tail)
    parts.append(")")
    return "".join(parts)


_XY_COLUMN_LIMIT = 99   # runs of (xy …) stay on one line up to this column
_TOKEN_WRAP_COLUMN = 72  # a space between tokens past this column becomes a newline


def prettify(text: str, depth: int = 0) -> str:
    """Lay out S-expression text exactly as KiCad's writer does (``Prettify`` in KiCad's
    ``common/io/kicad/kicad_io_utils.cpp``, normal saves): every sub-list on its own line, tab-indented,
    runs of ``(xy …)`` sharing a line up to column 99, and a token list wrapped at its first space past
    column 72 (its ``)`` then gets a line of its own). Tabs count as one column.

    ``depth`` is the nesting level the text's first list will sit at, so a node built for insertion is laid
    out the way KiCad writes it when it saves the whole file. :func:`dumps` alone keeps long token lists on
    one line, which KiCad would rewrap on its next save.
    """
    out: list[str] = []
    n = len(text)
    list_depth, column = depth, depth
    last = ""
    first = True
    in_quote = in_xy = multi_line = inserted_space = False
    backslashes = 0
    i = 0
    while i < n:
        ch = text[i]
        if ch in _WS and not in_quote:
            j = i
            while j < n and text[j] in _WS:
                j += 1
            nxt = text[j] if j < n else ""
            if not inserted_space and list_depth > 0 and last != "(" and nxt not in (")", "("):
                if in_xy or column < _TOKEN_WRAP_COLUMN:
                    out.append(" ")
                    column += 1
                else:
                    out.append("\n" + "\t" * list_depth)
                    column = list_depth
                    multi_line = True
                inserted_space = True
            i += 1
            continue
        inserted_space = False
        if ch == "(" and not in_quote:
            is_xy = text.startswith("(xy ", i)
            if first:
                out.append("(")
                column += 1
            elif in_xy and is_xy and column < _XY_COLUMN_LIMIT:
                out.append(" (")
                column += 2
            else:
                out.append("\n" + "\t" * list_depth + "(")
                column = list_depth + 1
            first = False
            in_xy = is_xy
            list_depth += 1
        elif ch == ")" and not in_quote:
            list_depth = max(list_depth - 1, 0)
            if last == ")" or multi_line:
                out.append("\n" + "\t" * list_depth + ")")
                column = list_depth + 1
                multi_line = False
            else:
                out.append(")")
                column += 1
        else:
            # KiCad escapes quotes as \" ; an odd run of backslashes before a quote escapes it.
            if ch == "\\":
                backslashes += 1
            elif ch == '"' and backslashes % 2 == 0:
                in_quote = not in_quote
            if ch != "\\":
                backslashes = 0
            out.append(ch)
            column += 1
        last = ch
        i += 1
    return "".join(out)


def kicad_layout(node: SList, depth: int) -> SList:
    """A copy of ``node`` whose whitespace is what KiCad writes for a list at nesting ``depth`` (see
    :func:`prettify`). Insert it where KiCad would keep it; the copy carries its layout, so :func:`dumps`
    reproduces KiCad's text byte for byte."""
    return parse(prettify(_dump(node, depth), depth)).root


# ---- construction helpers ------------------------------------------------------------

def fmt_num(value: float | int) -> str:
    """KiCad-style number: at most 4 decimals, no trailing zeros, no ``-0``."""
    if isinstance(value, bool):
        raise TypeError("booleans are not numbers here")
    if isinstance(value, int):
        return str(value)
    text = f"{value:.4f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def num(value: float | int) -> Atom:
    return Atom(fmt_num(value))


def S(value: str) -> Atom:
    """A quoted string atom."""
    return Atom(value, True)


def A(token: str) -> Atom:
    """A bare token atom."""
    return Atom(token)


def _atom(value: object) -> Atom:
    if isinstance(value, Atom):
        return value
    if isinstance(value, bool):
        return A("yes" if value else "no")
    if isinstance(value, (int, float)):
        return num(value)
    if isinstance(value, str):
        return A(value)
    raise TypeError(f"cannot make an atom from {value!r}")


def L(head: str, *children: object) -> SList:
    """Build a new list. Strings become bare tokens; use :func:`S` for quoted strings."""
    node = SList()
    node.append(A(head))
    for child in children:
        if child is None:
            continue
        node.append(child if isinstance(child, SList) else _atom(child))
    return node
