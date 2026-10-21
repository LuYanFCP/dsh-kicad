"""Schematic → board sync: KiCad's "Update PCB from Schematic", headless (#10; docs/pcb-architecture.md).

The board is edited through the lossless tree of :class:`~.pcb.Board`: text the sync does not touch stays
byte-identical, a second run on unchanged inputs changes nothing, and what it adds is laid out the way KiCad
writes it, so opening and saving the board in KiCad changes no byte.

* :func:`create_board` — the installed KiCad's empty board (a format-8 stub run through ``kicad-cli pcb
  upgrade``) with the default stackup. Design rules stay KiCad's defaults in the ``.kicad_pro`` until a fab
  preset sets them; the sync never writes the project file.
* :func:`plan_sync` — what an update changes. It only reads the board, netlist and libraries, so it is also the
  dry run, and it refuses (:class:`SyncRefused`) with every ``REF:PIN`` KiCad's parity check would report.
* :func:`apply_sync` — makes the planned edits.
* :func:`instantiate_footprint` — a library footprint placed the way KiCad's netlist updater places it.
* :func:`update_pcb` — all of it for the ``kicad_update_pcb`` tool, then KiCad's parity check as the verdict.

Footprints are linked to symbols as KiCad does: by ``(path …)`` (any unit of the symbol), then by reference
(rewriting the path). New footprints get uuids derived from the symbol path, so the same input gives the same
file.
"""

from __future__ import annotations

import math
import os
import re
import shutil
import tempfile
import uuid as uuidlib
from dataclasses import dataclass, field
from typing import Any, Callable

from .kicad_cli import KiCadCli, parse_version
from .lib_tables import LibTable
from .netlist import Netlist, NetlistComponent, read_netlist
from .pcb import (Board, Footprint, PcbError, _ABSOLUTE_CHILDREN, _each_point, _layers_of, _mm, _net_name_of, _ref_key,
                  attr_flags, set_attr_flags)
from .sexpr import A, Atom, L, S, SList, kicad_layout, parse

__all__ = ["Change", "SyncPlan", "SyncRefused", "apply_sync", "create_board", "instantiate_footprint", "native_version",
           "plan_sync", "stackup", "update_pcb"]

# Deterministic uuids: uuid5(NAMESPACE, "<symbol path>#<n>") — the same schematic gives the same board.
NAMESPACE = uuidlib.UUID("5b0e2a4c-6f0a-4d8e-9c55-6b2c1e0d9a71")
# KiCad 8's own format: every supported KiCad (8+) upgrades it to its native empty board.
STUB = '(kicad_pcb (version 20240108) (generator "dsh-kicad"))\n'
# The same stub with four copper layers. Layer ids are those of format 20240108 (KiCad converts them).
STUB_4_LAYERS = """(kicad_pcb (version 20240108) (generator "dsh-kicad")
	(general (thickness 1.6))
	(layers
		(0 "F.Cu" signal) (1 "In1.Cu" signal) (2 "In2.Cu" signal) (31 "B.Cu" signal)
		(32 "B.Adhes" user "B.Adhesive") (33 "F.Adhes" user "F.Adhesive") (34 "B.Paste" user) (35 "F.Paste" user)
		(36 "B.SilkS" user "B.Silkscreen") (37 "F.SilkS" user "F.Silkscreen") (38 "B.Mask" user) (39 "F.Mask" user)
		(40 "Dwgs.User" user "User.Drawings") (41 "Cmts.User" user "User.Comments") (42 "Eco1.User" user "User.Eco1")
		(43 "Eco2.User" user "User.Eco2") (44 "Edge.Cuts" user) (45 "Margin" user) (46 "B.CrtYd" user "B.Courtyard")
		(47 "F.CrtYd" user "F.Courtyard") (48 "B.Fab" user) (49 "F.Fab" user) (50 "User.1" user) (51 "User.2" user)
		(52 "User.3" user) (53 "User.4" user)))
"""
LAST_KICAD9_FORMAT = 20241229  # footprints gain (units …) after this
MANDATORY_FIELDS = ("Reference", "Value", "Datasheet", "Description")
SYMBOL_FLAGS = ("dnp", "exclude_from_bom", "exclude_from_pos_files")  # symbol attributes mirrored on (attr …)
# What KiCad writes after a pad's (net …) (pinfunction …) (pintype …): new net nodes go before the first of these.
_AFTER_PAD_NET = ("die_length", "solder_mask_margin", "solder_paste_margin", "solder_paste_margin_ratio", "clearance",
                  "zone_connect", "thermal_width", "thermal_bridge_width", "thermal_bridge_angle", "thermal_gap",
                  "options", "primitives", "teardrops", "tenting", "padstack", "uuid", "tstamp")
# Footprint children KiCad writes before the fields (the rest follows the symbol link).
_HEADER = ("locked", "placed", "layer", "descr", "tags")
GAP = 2.0          # mm between packed or staged parts
MARGIN = 3.0       # mm between the parts and the placeholder outline
STAGE_OFFSET = 5.0  # mm between the outline (or the rightmost part) and the staging column

_native_cache: dict[tuple, int] = {}


class SyncRefused(PcbError):
    """The schematic cannot be put on the board yet; nothing was written."""

    def __init__(self, issues: list[dict[str, Any]]):
        self.issues = issues
        lines = [f"- {i['text']}" for i in issues]
        super().__init__("kicad_update_pcb refused, nothing was written. Fix these in the schematic first "
                         "(KiCad's parity check would report them):\n" + "\n".join(lines))


@dataclass
class Change:
    kind: str       # created upgraded relinked net_renamed removed swapped field attr pad added outline
    reference: str  # "" for board-level changes
    text: str
    run: Callable[[], None] | None = field(default=None, repr=False, compare=False)


@dataclass
class SyncPlan:
    board: Board
    changes: list[Change] = field(default_factory=list)
    flagged: list[str] = field(default_factory=list)          # footprints without a symbol that stay
    staged: list[dict[str, Any]] = field(default_factory=list)  # new footprints waiting for placement
    applied: bool = False

    def lines(self) -> list[str]:
        return [c.text for c in self.changes]


class Uuids:
    def __init__(self, seed: str):
        self.seed, self.n = seed, 0

    def __call__(self) -> SList:
        self.n += 1
        return L("uuid", S(str(uuidlib.uuid5(NAMESPACE, f"{self.seed}#{self.n}"))))


# ---- creating a board -------------------------------------------------------------------

def _upgrade_stub(cli: KiCadCli, text: str) -> str:
    with tempfile.TemporaryDirectory(prefix="dsh-kicad-board-") as tmp:
        path = os.path.join(tmp, "shell.kicad_pcb")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        cli.upgrade(path)
        with open(path, encoding="utf-8") as fh:
            return fh.read()


def native_version(cli: KiCadCli) -> int:
    """The board format the installed KiCad writes (its empty board's version), cached per kicad-cli."""
    key = (tuple(cli.argv or ()), cli.version())
    if key not in _native_cache:
        _native_cache[key] = int(parse(_upgrade_stub(cli, STUB)).root.child_value("version") or 0)
    return _native_cache[key]


def stackup(copper_layers: int = 2, thickness: float = 1.6) -> SList:
    """KiCad's default stackup (``BOARD_STACKUP::BuildDefaultStackupList``): 35 µm copper, 10 µm mask, and FR4
    dielectrics (core, prepreg, core, …) splitting the rest of the board thickness evenly."""
    if copper_layers < 2 or copper_layers % 2:
        raise PcbError("copper_layers must be an even number ≥ 2")
    copper, mask = 0.035, 0.01
    dielectric = (thickness - copper * copper_layers - 2 * mask) / (copper_layers - 1)

    def layer(name: str, kind: str, *extra: SList) -> SList:
        return L("layer", S(name), L("type", S(kind)), *extra)

    items = [layer("F.SilkS", "Top Silk Screen"), layer("F.Paste", "Top Solder Paste"),
             layer("F.Mask", "Top Solder Mask", L("thickness", mask))]
    names = ["F.Cu", *(f"In{i}.Cu" for i in range(1, copper_layers - 1)), "B.Cu"]
    for i, name in enumerate(names):
        items.append(layer(name, "copper", L("thickness", copper)))
        if i < len(names) - 1:
            items.append(layer(f"dielectric {i + 1}", "core" if i % 2 == 0 else "prepreg",
                               L("thickness", Atom(_mm(round(dielectric, 6)))), L("material", S("FR4")),
                               L("epsilon_r", 4.5), L("loss_tangent", 0.02)))
    items += [layer("B.Mask", "Bottom Solder Mask", L("thickness", mask)), layer("B.Paste", "Bottom Solder Paste"),
              layer("B.SilkS", "Bottom Silk Screen")]
    return L("stackup", *items, L("copper_finish", S("None")), L("dielectric_constraints", A("no")))


def create_board(cli: KiCadCli, path: str, copper_layers: int = 2) -> Board:
    """A new, empty board for ``path`` (in memory; :meth:`Board.save` writes it): the installed KiCad's empty
    board in its native format plus the default stackup. Footprints and the outline come from the sync."""
    if copper_layers not in (2, 4):
        raise PcbError("copper_layers must be 2 or 4")
    text = _upgrade_stub(cli, STUB if copper_layers == 2 else STUB_4_LAYERS)
    board = Board(path, text=text)
    setup = board.root.find("setup")
    if setup is None:
        raise PcbError("kicad-cli wrote an empty board without (setup)")
    if setup.find("stackup") is None:
        setup.insert(1, kicad_layout(stackup(copper_layers), 2))
    return board


def load_board(cli: KiCadCli, path: str) -> tuple[Board, int | None]:
    """The board at ``path`` in the installed KiCad's format. An older board is upgraded on a copy (KiCad would
    upgrade it on its next save anyway); returns the old format too. A newer board is refused."""
    board = Board(path)
    native = native_version(cli)
    if board.version > native:
        raise PcbError(f"{os.path.basename(path)} was saved by a newer KiCad (format {board.version}) than the "
                       f"installed one (format {native}); update KiCad before syncing it")
    if board.version == native:
        return board, None
    with tempfile.TemporaryDirectory(prefix="dsh-kicad-upgrade-") as tmp:
        copy = os.path.join(tmp, os.path.basename(path))
        shutil.copyfile(path, copy)
        cli.upgrade(copy)
        with open(copy, encoding="utf-8") as fh:
            text = fh.read()
    return Board(path, text=text), board.version


# ---- footprints -------------------------------------------------------------------------

def _clone(node):
    """Deep copy without whitespace and without library uuids (every placed instance gets its own)."""
    if isinstance(node, Atom):
        return Atom(node.value, node.quoted, node.raw)
    out = SList()
    for item in node.items:
        if not (isinstance(item, SList) and item.head in ("uuid", "tstamp")):
            out.append(_clone(item))
    return out


def extent(library_node: SList) -> tuple[float, float, float, float]:
    """Local bounding box of a library footprint's courtyard and fab drawing (for packing and staging)."""
    xs: list[float] = []
    ys: list[float] = []
    for g in library_node.lists():
        if g.child_value("layer") not in ("F.CrtYd", "F.Fab"):
            continue
        for key in ("start", "end", "center", "mid"):
            p = g.find(key)
            if p is not None:
                xs.append(float(p.value(0)))
                ys.append(float(p.value(1)))
        if g.head == "fp_circle" and g.find("center") is not None and g.find("end") is not None:
            c, e = g.find("center"), g.find("end")
            r = math.hypot(float(e.value(0)) - float(c.value(0)), float(e.value(1)) - float(c.value(1)))
            xs += [float(c.value(0)) - r, float(c.value(0)) + r]
            ys += [float(c.value(1)) - r, float(c.value(1)) + r]
        pts = g.find("pts")
        for xy in pts.lists("xy") if pts is not None else []:
            xs.append(float(xy.value(0)))
            ys.append(float(xy.value(1)))
    if not xs:
        for pad in library_node.lists("pad"):
            at, size = pad.find("at"), pad.find("size")
            if at is not None and size is not None:
                x, y, w, h = float(at.value(0)), float(at.value(1)), float(size.value(0)), float(size.value(1))
                xs += [x - w / 2, x + w / 2]
                ys += [y - h / 2, y + h / 2]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else (-1.0, -1.0, 1.0, 1.0)


def _pad_numbers(node: SList) -> list[str]:
    return list(dict.fromkeys(p.value(0) for p in node.lists("pad") if p.value(0)))


def _net_node(board: Board, name: str) -> SList:
    board.ensure_net(name)
    return board.net_nodes(name, "pad")[0]


def _set_pad(board: Board, pad: SList, net: str, function: str | None, kind: str | None) -> None:
    """Give a pad its net, pin function and pin type (KiCad writes them together, in that order)."""
    current = {n.head: n for n in pad.lists() if n.head in ("net", "pinfunction", "pintype")}
    wanted = {"net": _net_node(board, net) if net else None,
              "pinfunction": L("pinfunction", S(function)) if net and function else None,
              "pintype": L("pintype", S(kind)) if net and kind else None}
    anchor = None
    for head in ("net", "pinfunction", "pintype"):
        old, new = current.get(head), wanted[head]
        if old is not None and new is None:
            pad.remove(old)
        elif old is not None:
            if [a.value for a in old.atoms()] != [a.value for a in new.atoms()]:
                old.set_atoms(*new.atoms())
            anchor = old
        elif new is not None:
            if anchor is not None:
                index = pad.index_of(anchor) + 1
            else:
                index = next((i for i, item in enumerate(pad.items) if isinstance(item, SList) and item.head in
                              ("pinfunction", "pintype", *_AFTER_PAD_NET)), len(pad.items))
            anchor = pad.insert(index, new)


def instantiate_footprint(library_node: SList, comp: NetlistComponent, board: Board, x: float, y: float,
                          lib_id: str | None = None, seed: str | None = None) -> SList:
    """A library footprint as KiCad's netlist updater puts it on ``board`` for ``comp`` (not inserted yet).

    Library header dropped and the root renamed to ``Lib:Name``; ``(uuid)`` and ``(at x y)`` after ``(layer)``;
    the symbol's Reference, Value and fields over the library's (missing ones become hidden F.Fab properties,
    library fields the symbol lacks are dropped);
    the symbol link (``ki_fp_filters``, ``path``, ``sheetname``, ``sheetfile``, ``units``); the symbol's
    dnp/BOM/position-file flags on ``(attr)``; fresh uuids derived from ``seed`` (default: the symbol path);
    pad nets, pin functions and pin types from the netlist. Laid out as KiCad writes it.
    """
    ids = Uuids(seed or comp.path)
    fp = L("footprint", S(lib_id or comp.footprint))
    header: list = []
    props: list[SList] = []
    rest: list = []
    library_uuid: dict[int, str] = {}  # id(clone) → the library item's uuid (group members name them)
    for item in library_node.items[2:]:
        if isinstance(item, SList) and item.head in ("version", "generator", "generator_version", "uuid", "tstamp", "at"):
            continue
        old = item.child_value("uuid") if isinstance(item, SList) else None
        item = _clone(item)
        if old:
            library_uuid[id(item)] = old
        head = item.head if isinstance(item, SList) else None
        (props if head == "property" else header if head in _HEADER or head is None else rest).append(item)
    # KiCad's order: the header (layer, then the instance's uuid and position), the fields, the symbol link,
    # then everything else as the library has it.
    for item in header:
        fp.append(item)
        if isinstance(item, SList) and item.head == "layer":
            fp.append(ids())
            fp.append(L("at", Atom(_mm(x)), Atom(_mm(y))))
    if fp.find("layer") is None:
        fp.append(L("layer", S("F.Cu")))
        fp.append(ids())
        fp.append(L("at", Atom(_mm(x)), Atom(_mm(y))))
    values = {"Reference": comp.reference, "Value": comp.value, **{k: v for k, v in comp.fields.items() if k != "Footprint"}}
    # Like KiCad's updater, keep only the symbol's fields (library extras such as KiLib_Generator go).
    props = [p for p in props if (p.value(0) or "") in values or (p.value(0) or "") in MANDATORY_FIELDS]
    for prop in props:
        name = prop.value(0) or ""
        if name in values:
            prop.items[2] = S(values[name])
        _uuid_before_effects(prop, ids)
        fp.append(prop)
    have = {p.value(0) for p in props}
    for name, value in {"Datasheet": "", "Description": "", **values}.items():
        if name not in have:
            fp.append(_new_field(name, value, ids))
    _order_properties(fp)
    if comp.fp_filters:
        fp.append(L("property", A("ki_fp_filters"), S(comp.fp_filters)))
    fp.append(L("path", S(comp.path)))
    fp.append(L("sheetname", S(comp.sheet_name)))
    fp.append(L("sheetfile", S(comp.sheet_file)))
    if comp.units and board.version > LAST_KICAD9_FORMAT:
        fp.append(_units(comp))
    copper = set(board.copper_layers())
    renamed: dict[str, str] = {}
    # A zone only on inner layers this board lacks (card-edge keepouts) has no layer left here. KiCad would write
    # it as (layer "UNDEFINED") and then crash reading its own file, so such a zone is left out.
    body = [i for i in sorted(rest, key=_body_rank) if i.head != "zone" or _trim_copper(i, copper)]
    for item in body:
        head = item.head or ""
        if head == "pad":
            _pad_from_netlist(board, item, comp)
            _trim_copper(item, copper)
            _zone_layer_connections(item)
            item.append(ids())
        elif head in ("fp_text", "fp_text_box"):
            _uuid_before_effects(item, ids)
        elif head.startswith("fp_"):
            item.append(ids())
        elif head == "group":
            item.insert(2 if len(item.atoms()) else 1, ids())
        elif head in ("zone", "dimension", "barcode", "point"):
            _uuid_after_layers(item, ids)
            text = item.find("gr_text") if head == "dimension" else None
            if text is not None:  # a dimension's text carries the dimension's uuid
                text.insert(text.index_of(text.find("effects")) if text.find("effects") is not None else len(text.items),
                            L("uuid", S(item.child_value("uuid") or "")))
        if id(item) in library_uuid and item.child_value("uuid"):
            renamed[library_uuid[id(item)]] = item.child_value("uuid") or ""
    for group in (i for i in body if i.head == "group"):
        members = group.find("members")
        if members is not None:  # KiCad lists members by uuid
            members.set_atoms(*(S(u) for u in sorted(renamed[a.value] for a in members.atoms() if a.value in renamed)))
    for item in _sort_zones(_uuid_ties(body, _group_layers(body)), {l["name"]: int(l["id"]) for l in board.layer_table()}):
        fp.append(item)
    set_attr_flags(fp, {flag: flag in comp.flags for flag in SYMBOL_FLAGS})
    if board.version > LAST_KICAD9_FORMAT and fp.find("duplicate_pad_numbers_are_jumpers") is None:
        # KiCad 10 always writes it; older library footprints lack it.
        before = [i for i, item in enumerate(fp.items) if isinstance(item, SList) and item.head in (
            "path", "sheetname", "sheetfile", "units", "solder_mask_margin", "solder_paste_margin", "solder_paste_ratio",
            "solder_paste_margin_ratio", "clearance", "zone_connect", "thermal_width", "thermal_gap", "attr",
            "private_layers", "net_tie_pad_groups")]
        fp.insert(max(before) + 1, L("duplicate_pad_numbers_are_jumpers", A("no")))
    for child in fp.lists():
        if child.head in _ABSOLUTE_CHILDREN:  # stored in board coordinates
            _each_point(child, lambda px, py: (round(px + x, 6), round(py + y, 6)))
    return kicad_layout(fp, 1)


def _trim_copper(item: SList, copper: set[str]) -> bool:
    """Drop inner copper layers the board does not have from a pad's or zone's layers (KiCad does so on load).
    Returns whether any layer is left."""
    layers = item.find("layers")
    if layers is None:
        return True
    names = [a.value for a in layers.atoms()]
    keep = [n for n in names if not re.fullmatch(r"In\d+\.Cu", n) or n in copper]
    if keep == names:
        return bool(keep)
    if item.head == "zone" and len(keep) == 1:  # KiCad writes a one-layer zone with (layer …)
        item.items[item.index_of(layers)] = L("layer", S(keep[0]))
    elif keep:
        layers.set_atoms(*(S(n) for n in keep))
    return bool(keep)


def _zone_layer_connections(pad: SList) -> None:
    """On a board KiCad writes (zone_layer_connections …) after a pad's (remove_unused_layers yes); libraries lack it."""
    remove = pad.find("remove_unused_layers")
    if remove is None or remove.value(0) != "yes" or pad.find("zone_layer_connections") is not None:
        return
    anchor = pad.find("keep_end_layers") or remove
    pad.insert(pad.index_of(anchor) + 1, L("zone_layer_connections"))


def _uuid_ties(items: list, group_layers: dict[int, frozenset]) -> list:
    """KiCad sorts a footprint's items when it saves and breaks ties by uuid: identical items; text boxes,
    barcodes, tables and dimensions of one type on one layer; groups over the same layers (it compares nothing
    else of those). The library is in KiCad's order already, so only such runs are re-sorted by the new uuids."""
    out: list = []
    run: list = []

    def key(item: SList) -> Any:
        if item.head == "group":
            return item.head, group_layers.get(id(item))
        if item.head in ("fp_text_box", "dimension", "barcode", "table"):
            return item.head, item.child_value("type"), item.child_value("layer")  # each dimension type is a type
        return _plain_without_uuid(item)

    def flush() -> None:
        out.extend(sorted(run, key=lambda i: i.child_value("uuid") or "") if len(run) > 1 else run)
        run.clear()

    for item in items:
        if run and key(item) != key(run[0]):
            flush()
        run.append(item)
    flush()
    return out


def _sort_zones(items: list, layer_ids: dict[str, int]) -> list:
    """A footprint's zones in KiCad's save order (``FOOTPRINT::cmp_zones``: priority, then layer ids, then
    geometry). The library is in that order already; trimming inner layers can move a zone, so the zones are
    stably re-sorted by priority and layer ids, which keeps the library's order for the rest."""
    zones = [i for i in items if i.head == "zone"]
    if len(zones) < 2:
        return items

    def key(zone: SList):
        return int(zone.child_value("priority") or 0), sorted(layer_ids.get(n, 1 << 16) for n in _layers_of(zone))

    ordered = iter(sorted(zones, key=key))
    return [next(ordered) if i.head == "zone" else i for i in items]


def _group_layers(items: list) -> dict[int, frozenset]:
    """The layers each group's members sit on (nested groups included), by id() of the group node."""
    by_uuid = {i.child_value("uuid"): i for i in items if i.child_value("uuid")}
    out: dict[int, frozenset] = {}

    def layers(item: SList, seen: frozenset) -> frozenset:
        if item.head != "group":
            return frozenset(_layers_of(item))
        if id(item) not in out:
            members = item.find("members")
            names: set = set()
            for atom in members.atoms() if members is not None else []:
                member = by_uuid.get(atom.value)
                if member is not None and atom.value not in seen:
                    names |= layers(member, seen | {atom.value})
            out[id(item)] = frozenset(names)
        return out[id(item)]

    for item in items:
        if item.head == "group":
            layers(item, frozenset())
    return out


def _plain_without_uuid(node) -> Any:
    if isinstance(node, Atom):
        return node.value
    return tuple(_plain_without_uuid(i) for i in node.items if not (isinstance(i, SList) and i.head in ("uuid", "tstamp")))


_BODY_RANK = {"point": 2, "pad": 3, "zone": 4, "group": 5, "embedded_fonts": 6, "embedded_files": 6, "model": 7}


def _body_rank(item: SList) -> int:
    """KiCad's order for a footprint's body: settings and attributes, graphics, points, pads, zones, groups,
    embedded fonts and files, 3D models (libraries put points after the pads)."""
    head = item.head or ""
    if head.startswith("fp_") or head in ("dimension", "barcode", "table"):
        return 1
    return _BODY_RANK.get(head, 0)


def _new_field(name: str, value: str, ids: Uuids, angle: float = 0, back: bool = False) -> SList:
    """A symbol field the library footprint lacks: hidden on the Fab layer at the footprint origin. KiCad gives
    copied user fields a 0.15 mm pen; Datasheet and Description keep the default."""
    font = L("font", L("size", 1.27, 1.27), L("thickness", 0.15) if name not in ("Datasheet", "Description") else None)
    effects = L("effects", font, L("justify", A("mirror")) if back else None)
    return L("property", S(name), S(value), L("at", 0, 0, Atom(_mm(angle))), L("layer", S("B.Fab" if back else "F.Fab")),
             L("hide", A("yes")), ids(), effects)


def _units(comp: NetlistComponent) -> SList:
    return L("units", *(L("unit", L("name", S(name)), L("pins", *(S(p) for p in pins))) for name, pins in comp.units))


def _pad_from_netlist(board: Board, pad: SList, comp: NetlistComponent) -> None:
    number = pad.value(0)
    pin = comp.pins.get(number) if number else None
    _set_pad(board, pad, pin.net if pin else "", pin.function if pin else None, pin.type if pin else None)


def _uuid_before_effects(item: SList, ids: Uuids) -> None:
    effects = item.find("effects")
    if effects is not None:
        item.insert(item.index_of(effects), ids())
    else:
        item.append(ids())


def _uuid_after_layers(item: SList, ids: Uuids) -> None:
    layer = item.find("layer") or item.find("layers")
    if layer is not None:
        item.insert(item.index_of(layer) + 1, ids())
    else:
        item.append(ids())


def _order_properties(fp: SList) -> None:
    """KiCad writes Reference, Value, Datasheet, Description, then the other fields in their order."""
    props = list(fp.lists("property"))
    if not props:
        return
    first = fp.index_of(props[0])
    rank = {"Reference": 0, "Value": 1, "Datasheet": 2, "Description": 3}
    for p in props:
        fp.remove(p)
    for i, p in enumerate(sorted(props, key=lambda p: rank.get(p.value(0) or "", 4))):
        fp.insert(first + i, p)


# ---- planning -----------------------------------------------------------------------------

class _Libraries:
    """Library footprints by id, parsed once. :meth:`prepare` has KiCad itself re-save the ones a sync places
    (``kicad-cli fp upgrade --force`` in a scratch directory): what KiCad loads from a library is what it writes
    to the board, so normalisations of older or generated library files (point order, defaults, retired tokens)
    match KiCad's next save of the board."""

    def __init__(self, table: LibTable, cli: KiCadCli | None = None):
        self.table = table
        self.cli = cli
        self._cache: dict[str, SList] = {}
        self._normalized: dict[str, SList] = {}

    def load(self, lib_id: str) -> SList:
        if lib_id not in self._cache:
            with open(self.table.resolve(lib_id), encoding="utf-8") as fh:
                node = parse(fh.read()).root
            if node.head != "footprint":
                raise LookupError(f"{lib_id} is not a footprint file")
            self._cache[lib_id] = node
        return self._cache[lib_id]

    def prepare(self, lib_ids) -> None:
        if self.cli is None:
            return
        todo = []
        for lib_id in sorted(set(lib_ids) - set(self._normalized)):
            try:
                todo.append((lib_id, self.table.resolve(lib_id)))
            except LookupError:
                continue
        if not todo:
            return
        try:
            with tempfile.TemporaryDirectory(prefix="dsh-kicad-fp-") as tmp:
                src, out = os.path.join(tmp, "in.pretty"), os.path.join(tmp, "out.pretty")
                os.makedirs(src)
                for n, (_, path) in enumerate(todo):
                    shutil.copyfile(path, os.path.join(src, f"fp{n}.kicad_mod"))
                self.cli.run("fp", "upgrade", "--force", "-o", out, src, cwd=tmp)
                for n, (lib_id, _) in enumerate(todo):
                    with open(os.path.join(out, f"fp{n}.kicad_mod"), encoding="utf-8") as fh:
                        node = parse(fh.read()).root
                    if node.head == "footprint":
                        self._normalized[lib_id] = node
        except (OSError, ValueError, LookupError, RuntimeError):
            pass  # no usable kicad-cli fp upgrade: place the library text as it is

    def placed(self, lib_id: str) -> SList:
        """The footprint as KiCad loads it (normalised when :meth:`prepare` could), for instantiation."""
        return self._normalized.get(lib_id) or self.load(lib_id)


def _natural(items):
    return sorted(items, key=lambda s: [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", s)])


def _link(board: Board, wanted: list[NetlistComponent]):
    """Footprints linked to symbols the way KiCad's updater does. Returns (linked by symbol path, relinked
    (footprint, component) pairs, footprints without a symbol). Board-only footprints take no part."""
    owner = {p: c for c in wanted for p in c.unit_paths}
    by_ref = {c.reference: c for c in wanted}
    linked: dict[str, Footprint] = {}
    leftovers = []
    for fp in board.footprints():
        if "board_only" in attr_flags(fp.node):
            continue
        c = owner.get(fp.node.child_value("path") or "")
        if c is not None and c.path not in linked:
            linked[c.path] = fp
        else:
            leftovers.append(fp)
    relinked, extra = [], []
    for fp in leftovers:
        c = by_ref.get(fp.reference)
        if c is not None and c.path not in linked:
            linked[c.path] = fp
            relinked.append((fp, c))
        else:
            extra.append(fp)
    return linked, relinked, extra


def _check(wanted: list[NetlistComponent], linked: dict[str, Footprint], libs: _Libraries) -> list[dict[str, Any]]:
    """Every symbol that cannot be put on the board, reported together (docs: pre-sync check)."""
    issues = []
    for c in sorted(wanted, key=lambda c: _ref_key(c.reference)):
        if c.reference.endswith("?"):
            issues.append({"reference": c.reference, "problem": "not_annotated",
                           "text": f"{c.reference}: not annotated; give it a reference number"})
            continue
        if not c.footprint:
            hint = ""
            if c.lib_id.startswith("power:") or re.match(r"(PWR|FLG)\d", c.reference):
                hint = (f"; {c.lib_id or 'it'} is a power symbol, and a power symbol's reference must start with '#' "
                        f"(e.g. #{re.sub(r'[0-9]+$', '', c.reference)}01) so KiCad keeps it off the board")
            issues.append({"reference": c.reference, "problem": "no_footprint",
                           "text": f"{c.reference}: the symbol has no footprint{hint}"})
            continue
        fp = linked.get(c.path)
        if fp is not None and fp.lib_id == c.footprint:
            pads = _pad_numbers(fp.node)  # KiCad keeps a placed footprint as it is; its pads count
        else:
            try:
                pads = _pad_numbers(libs.load(c.footprint))
            except (LookupError, OSError, ValueError) as exc:
                issues.append({"reference": c.reference, "problem": "footprint_not_found",
                               "text": f"{c.reference}: footprint {c.footprint} not found ({exc})"})
                continue
        missing = [n for n in _natural(c.pins) if n not in pads]
        if missing:
            shown = ", ".join(_natural(pads)[:40]) + (" …" if len(pads) > 40 else "")
            issues.append({"reference": c.reference, "problem": "pins_without_pads", "pins": missing,
                           "text": f"{', '.join(f'{c.reference}:{n}' for n in missing)}: no pad with that number on "
                                   f"{c.footprint} (its pads: {shown or 'none'}); pick a footprint whose pads match "
                                   f"the symbol's pins"})
    return issues


def plan_sync(board: Board, netlist: Netlist, libraries: LibTable, delete_removed: bool = False,
              cli: KiCadCli | None = None) -> SyncPlan:
    """What bringing ``board`` in line with ``netlist`` changes. Reads only; :func:`apply_sync` edits.

    A board with neither footprints nor an outline is filled from scratch: parts packed in rows inside a
    placeholder outline. Otherwise new parts are staged in a column right of the outline for placement.
    With ``cli``, the footprints it places are first normalised by KiCad (see :class:`_Libraries`)."""
    libs = _Libraries(libraries, cli)
    plan = SyncPlan(board)
    wanted = [c for c in netlist.components if c.on_board]
    linked, relinked, extra = _link(board, wanted)
    issues = _check(wanted, linked, libs)
    if issues:
        raise SyncRefused(issues)
    by_path = {c.path: c for c in wanted}
    libs.prepare(c.footprint for c in wanted if c.path not in linked or linked[c.path].lib_id != c.footprint)
    fresh = not board.footprints() and board.outline() is None
    add = plan.changes.append

    for fp, c in relinked:
        add(Change("relinked", c.reference, f"{c.reference}: relinked to its symbol by reference ({c.path})",
                   lambda fp=fp, c=c: _set_child(fp.node, "path", c.path, after=("property",))))

    # Net renames, decided on the pads before they change: an old net whose pads all moved to one new net.
    codes = {int(n.value(0) or 0): n.value(1) or "" for n in board.root.lists("net")}
    schematic_nets = {n.name for n in netlist.nets}
    moved: dict[str, set[str | None]] = {}
    for path, fp in linked.items():
        c = by_path[path]
        for pad in fp.node.lists("pad"):
            old = _net_name_of(pad, codes)
            if old:
                pin = c.pins.get(pad.value(0) or "")
                moved.setdefault(old, set()).add(pin.net if pin else None)
    renames: dict[str, str] = {}
    for old, targets in sorted(moved.items()):
        targets.discard(None)
        if old not in schematic_nets and len(targets) == 1:
            renames[old] = targets.pop()
    for old, new in renames.items():
        add(Change("net_renamed", "", f"net {old} renamed to {new} (its tracks, vias and zones follow)",
                   lambda old=old, new=new: board.rename_net(old, new)))

    for fp in sorted(extra, key=lambda f: _ref_key(f.reference)):
        where = f"no symbol at {fp.node.child_value('path')}" if fp.node.child_value("path") else "not linked to a symbol"
        if not delete_removed:
            plan.flagged.append(f"{fp.reference} ({fp.lib_id}): {where}; kept (delete_removed: true deletes it)")
        elif fp.locked:
            plan.flagged.append(f"{fp.reference} ({fp.lib_id}): {where}; kept because it is locked")
        else:
            add(Change("removed", fp.reference, f"removed {fp.reference} ({fp.lib_id}): {where}",
                       lambda fp=fp: board.remove_item(fp.uuid or "")))

    for path, fp in sorted(linked.items(), key=lambda kv: _ref_key(by_path[kv[0]].reference)):
        c = by_path[path]
        if fp.lib_id != c.footprint:
            x, y, rot = fp.at
            add(Change("swapped", c.reference, f"{c.reference}: footprint {fp.lib_id} → {c.footprint} "
                       f"(kept at ({_mm(x)}, {_mm(y)}) {_mm(rot)}° {fp.side})",
                       lambda fp=fp, c=c: _swap(board, fp, c, libs.placed(c.footprint))))
            continue
        for change in _field_changes(board, fp, c):
            add(change)
        for change in _pad_changes(board, fp, c, renames, codes):
            add(change)

    new = [c for c in sorted(wanted, key=lambda c: _ref_key(c.reference)) if c.path not in linked]
    if fresh:
        _plan_rows(plan, new, libs)
    else:
        _plan_staging(plan, new, libs)
    return plan


def _set_child(node: SList, head: str, value: str, after: tuple[str, ...]) -> None:
    """Set ``(head "value")`` in ``node``, adding it after the last child named in ``after`` when missing."""
    child = node.find(head)
    if child is not None:
        child.set_atoms(S(value))
        return
    index = max((i for i, item in enumerate(node.items) if isinstance(item, SList) and item.head in after), default=1)
    node.insert(index + 1, L(head, S(value)))


def _field_changes(board: Board, fp: Footprint, c: NetlistComponent) -> list[Change]:
    out = []
    node = fp.node
    back = fp.side == "back"
    wanted = {"Reference": c.reference, "Value": c.value, **{k: v for k, v in c.fields.items() if k != "Footprint"}}
    for name, value in wanted.items():
        prop = node.property(name)
        if prop is None:
            out.append(Change("field", c.reference, f"{c.reference}: new field {name} = {value!r}",
                              lambda name=name, value=value: _add_field(node, name, value, fp.at[2], back, c)))
        elif (prop.value(1) or "") != value:
            out.append(Change("field", c.reference, f"{c.reference}: {name} {prop.value(1)!r} → {value!r}",
                              lambda prop=prop, value=value: prop.items.__setitem__(2, S(value))))
    # Fields the symbol lacks stay: parity ignores them and they may be the user's (BOM data on the board).
    filters = node.property("ki_fp_filters")
    if (filters.value(1) if filters is not None else None) != (c.fp_filters or None):
        out.append(Change("field", c.reference, f"{c.reference}: footprint filters → {c.fp_filters or '(none)'}",
                          lambda: _set_filters(node, c.fp_filters)))
    for head, value in (("sheetname", c.sheet_name), ("sheetfile", c.sheet_file)):
        if node.child_value(head) != value:
            out.append(Change("field", c.reference, f"{c.reference}: {head} → {value}",
                              lambda head=head, value=value: _set_child(node, head, value, after=("property", "path", "sheetname"))))
    if c.units and board.version > LAST_KICAD9_FORMAT:
        units = node.find("units")
        if units is None or _plain(units) != _plain(_units(c)):
            out.append(Change("field", c.reference, f"{c.reference}: unit/pin map updated",
                              lambda: _set_units(node, c)))
    flags = {flag: flag in c.flags for flag in SYMBOL_FLAGS}
    have = attr_flags(node)
    diff = [f"{'+' if on else '-'}{flag}" for flag, on in flags.items() if on != (flag in have)]
    if diff:
        out.append(Change("attr", c.reference, f"{c.reference}: attributes {' '.join(diff)} (from the symbol)",
                          lambda: set_attr_flags(node, flags)))
    return out


def _plain(node) -> Any:
    """Structure without layout, for comparing nodes."""
    if isinstance(node, Atom):
        return node.value
    return tuple(_plain(i) for i in node.items)


def _add_field(node: SList, name: str, value: str, angle: float, back: bool, c: NetlistComponent) -> None:
    ids = Uuids(f"{c.path}/field/{name}")
    prop = kicad_layout(_new_field(name, value, ids, angle, back), 2)
    props = [p for p in node.lists("property") if p.value(0) != "ki_fp_filters"]
    node.insert(node.index_of(props[-1]) + 1 if props else 2, prop)


def _set_filters(node: SList, filters: str | None) -> None:
    prop = node.property("ki_fp_filters")
    if not filters:
        if prop is not None:
            node.remove(prop)
    elif prop is not None:
        prop.items[2] = S(filters)
    else:
        props = list(node.lists("property"))
        node.insert(node.index_of(props[-1]) + 1 if props else 2, L("property", A("ki_fp_filters"), S(filters)))


def _set_units(node: SList, c: NetlistComponent) -> None:
    new = kicad_layout(_units(c), 2)
    old = node.find("units")
    if old is not None:
        node.items[node.index_of(old)] = new
    else:
        anchor = node.find("sheetfile") or node.find("sheetname") or node.find("path")
        node.insert(node.index_of(anchor) + 1 if anchor is not None else len(node.items), new)


def _pad_changes(board: Board, fp: Footprint, c: NetlistComponent, renames: dict[str, str],
                 codes: dict[int, str]) -> list[Change]:
    out = []
    for pad in fp.node.lists("pad"):
        number = pad.value(0) or ""
        pin = c.pins.get(number) if number else None
        current = _net_name_of(pad, codes)
        have = (renames.get(current, current), pad.child_value("pinfunction"), pad.child_value("pintype"))
        want = (pin.net, pin.function or None, pin.type or None) if pin else ("", None, None)
        if have == want:
            continue
        if have[0] != want[0]:
            text = f"{c.reference}:{number} net {have[0] or '(none)'} → {want[0] or '(none)'}"
        else:
            text = f"{c.reference}:{number} pin {have[1] or '-'}/{have[2] or '-'} → {want[1] or '-'}/{want[2] or '-'}"
        out.append(Change("pad", c.reference, text,
                          lambda pad=pad, want=want: _set_pad(board, pad, want[0], want[1], want[2])))
    return out


def _swap(board: Board, fp: Footprint, c: NetlistComponent, library_node: SList) -> None:
    """Replace a footprint with the symbol's new one, keeping position, rotation, side, lock, uuid and link."""
    x, y, rot = fp.at
    node = instantiate_footprint(library_node, c, board, x, y, seed=f"{c.path}@{c.footprint}")
    path = fp.node.child_value("path")
    if path:
        node.find("path").set_atoms(S(path))
    node.find("uuid").set_atoms(S(fp.uuid or ""))
    new = Footprint(node)
    if rot or fp.side == "back":
        board._place(new, x, y, rot, flip=fp.side == "back")
    if fp.locked:
        node.insert(2, L("locked", A("yes")))
    board.root.items[board.root.index_of(fp.node)] = node


def _sized(c: NetlistComponent, libs: _Libraries) -> tuple[SList, tuple[float, float, float, float]]:
    node = libs.placed(c.footprint)
    return node, extent(node)


def _add(plan: SyncPlan, c: NetlistComponent, node: SList, x: float, y: float, note: str) -> None:
    board = plan.board

    def run() -> None:
        board.insert_item(instantiate_footprint(node, c, board, x, y))

    plan.changes.append(Change("added", c.reference, f"added {c.reference} ({c.footprint}) at ({_mm(x)}, {_mm(y)}){note}", run))


def _plan_rows(plan: SyncPlan, new: list[NetlistComponent], libs: _Libraries) -> None:
    """A new board: parts packed in rows (by reference) inside a placeholder outline; #12 places them."""
    if not new:
        return
    sized = [(c, *_sized(c, libs)) for c in new]
    area = sum((b[2] - b[0] + GAP) * (b[3] - b[1] + GAP) for _, _, b in sized)
    row_width = max(50.0, round(1.5 * math.sqrt(area)))
    x0 = y0 = 100.0
    cx, cy, row_h = x0, y0, 0.0
    boxes = []
    for c, node, (bx1, by1, bx2, by2) in sized:
        w, h = bx2 - bx1, by2 - by1
        if cx > x0 and cx + w > x0 + row_width:
            cx, cy, row_h = x0, cy + row_h + GAP, 0.0
        x, y = round(cx - bx1, 3), round(cy - by1, 3)
        cx += w + GAP
        row_h = max(row_h, h)
        boxes.append((x + bx1, y + by1, x + bx2, y + by2))
        _add(plan, c, node, x, y, "")
    box = (min(b[0] for b in boxes) - MARGIN, min(b[1] for b in boxes) - MARGIN,
           max(b[2] for b in boxes) + MARGIN, max(b[3] for b in boxes) + MARGIN)
    box = tuple(round(v, 2) for v in box)
    board = plan.board
    plan.changes.append(Change(
        "outline", "", f"placeholder outline {_mm(box[2] - box[0])} × {_mm(box[3] - box[1])} mm around the parts "
                       f"(replace it with set_board_outline)",
        lambda: board.insert_item(kicad_layout(L(
            "gr_rect", L("start", Atom(_mm(box[0])), Atom(_mm(box[1]))), L("end", Atom(_mm(box[2])), Atom(_mm(box[3]))),
            L("stroke", L("width", 0.05), L("type", A("solid"))), L("fill", A(board._fill_no())), L("layer", S("Edge.Cuts")),
            Uuids("outline")()), 1))))


def _plan_staging(plan: SyncPlan, new: list[NetlistComponent], libs: _Libraries) -> None:
    """New parts on an existing board: a column right of the outline and of every part, for #12 to place."""
    if not new:
        return
    board = plan.board
    outline = board.outline()
    rights = [b[2] for b in (fp.courtyard() for fp in board.footprints()) if b] + [fp.at[0] for fp in board.footprints()]
    if outline is not None:
        rights.append(outline["bbox"][2])
    top = outline["bbox"][1] if outline is not None else min((fp.at[1] for fp in board.footprints()), default=100.0)
    height = max(outline["height"] if outline is not None else 0.0, 50.0)
    cx = round(max(rights, default=100.0) + STAGE_OFFSET, 2)
    cy, column_w = top, 0.0
    for c in new:
        node, (bx1, by1, bx2, by2) = _sized(c, libs)
        w, h = bx2 - bx1, by2 - by1
        if cy > top and cy + h > top + height:
            cx, cy, column_w = round(cx + column_w + GAP, 2), top, 0.0
        x, y = round(cx - bx1, 3), round(cy - by1, 3)
        cy += h + GAP
        column_w = max(column_w, w)
        plan.staged.append({"reference": c.reference, "footprint": c.footprint, "at": [x, y]})
        _add(plan, c, node, x, y, ", staged right of the board for placement")


def apply_sync(plan: SyncPlan) -> list[str]:
    """Make the planned edits on ``plan.board`` (once). Returns the change lines."""
    if plan.applied:
        raise PcbError("this sync plan was already applied")
    for change in plan.changes:
        if change.run is not None:
            change.run()
    plan.applied = True
    return plan.lines()


# ---- the tool ---------------------------------------------------------------------------

def _has_zones(board: Board) -> bool:
    return any(True for _ in board.root.lists("zone"))


def update_pcb(cli: KiCadCli, schematic: str, pcb: str | None = None, delete_removed: bool = False, dry_run: bool = False,
               copper_layers: int = 2, drc: bool = True, on_created: Callable[[str], list[str]] | None = None) -> dict[str, Any]:
    """Create or update ``pcb`` from ``schematic`` (``kicad_update_pcb``), then let KiCad judge schematic parity.

    ``pcb`` defaults to ``<schematic name>.kicad_pcb`` next to the schematic: KiCad links a board to its
    schematic by project name, so the board must sit there. ``on_created`` runs after a new board is written
    (the fab-preset step plugs in here) and returns change lines."""
    schematic = os.path.abspath(schematic)
    stem = os.path.splitext(schematic)[0]
    pcb = os.path.abspath(pcb) if pcb else stem + ".kicad_pcb"
    if os.path.splitext(pcb)[0] != stem:
        raise PcbError(f"the board must be {os.path.basename(stem)}.kicad_pcb next to {os.path.basename(schematic)}: "
                       f"KiCad finds a board's schematic by project name, so {pcb} could not be checked for parity")
    netlist = read_netlist(cli, schematic)
    major = (parse_version(cli.version()) or (10,))[0]
    libraries = LibTable("fp", os.path.dirname(schematic), major)
    created = not os.path.exists(pcb)
    upgraded_from = None
    if created:
        board = create_board(cli, pcb, copper_layers)
    else:
        board, upgraded_from = load_board(cli, pcb)
    plan = plan_sync(board, netlist, libraries, delete_removed=delete_removed, cli=cli)
    if created:
        plan.changes.insert(0, Change("created", "", f"created {os.path.basename(pcb)} (KiCad format {board.version}, "
                                                      f"{len(board.copper_layers())} copper layers, default stackup)"))
    elif upgraded_from and plan.changes:
        plan.changes.insert(0, Change("upgraded", "", f"upgraded the board from format {upgraded_from} to {board.version} "
                                                       f"first (KiCad does the same when it saves it)"))
    notes: list[str] = []
    written = False
    files: list[str] = []
    if not dry_run and plan.changes:
        apply_sync(plan)
        files = board.save()
        written = True
        if created and on_created is not None:
            notes += on_created(pcb)
    if created:
        notes.append("Design rules: KiCad's defaults (clearance 0.2, track 0.2, via 0.6/0.3, copper to edge 0.5 mm) "
                     "until a fab preset or set_design_rules sets them.")
    if not created and upgraded_from and not plan.changes:
        notes.append(f"The board is in format {upgraded_from}; KiCad upgrades it to {board.version} on its next save.")
    outline = board.outline()
    result: dict[str, Any] = {
        "schematic": schematic, "pcb": pcb, "created": created, "dry_run": dry_run, "written": written, "files": files,
        "changes": plan.lines(), "flagged": plan.flagged, "staged": plan.staged,
        "counts": {kind: sum(1 for c in plan.changes if c.kind == kind) for kind in dict.fromkeys(c.kind for c in plan.changes)},
        "board": {"format": board.version, "copper_layers": board.copper_layers(), "footprints": len(board.footprints()),
                  "outline": outline["bbox"] if outline else None},
        "notes": notes,
    }
    if drc and not dry_run and os.path.exists(pcb):
        report = cli.drc(pcb, "all", schematic_parity=True, refill_zones=_has_zones(board))
        parity = [v for v in report["violations"] if v.get("category") == "schematic_parity" and not v.get("excluded")]
        by_type: dict[str, int] = {}
        for v in parity:
            by_type[v["type"]] = by_type.get(v["type"], 0) + 1
        result["parity"] = {"total": len(parity), "by_type": by_type}
        result["drc"] = {"path": pcb, **report}
    return result
