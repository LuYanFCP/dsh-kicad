"""The schematic's netlist as the board sees it: ``kicad-cli sch export netlist --format kicadsexpr``.

This is the input of schematic → PCB sync (docs/pcb-architecture.md). Unlike ``parse_netlist_xml``
(names and nodes for ``list_nets``) it keeps what a board needs to stay linked to its symbols: the
KIID path KiCad stores in a footprint's ``(path …)``, sheet name and file, the symbol's fields and
board flags, the unit → pin map, and each pin's net, pin function and pin type.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field

from .sexpr import SList, parse

__all__ = ["Netlist", "NetlistComponent", "NetlistPin", "NetlistNet", "parse_netlist", "read_netlist"]


@dataclass
class NetlistPin:
    number: str
    net: str
    function: str | None = None
    type: str | None = None


@dataclass
class NetlistNet:
    name: str
    code: int
    net_class: str | None
    nodes: list[tuple[str, str]]  # (reference, pin number)


@dataclass
class NetlistComponent:
    reference: str
    value: str
    footprint: str                 # "Lib:Name"; "" when the symbol has none
    lib_id: str
    path: str                      # KIID path a new footprint gets in (path …): "/<sheet uuids>/<first unit's uuid>"
    sheet_name: str                # e.g. "/" or "/Power/"
    sheet_file: str
    fields: dict[str, str] = field(default_factory=dict)   # Datasheet, Description and user fields; not Footprint
    flags: set[str] = field(default_factory=set)           # dnp, exclude_from_bom, exclude_from_board, exclude_from_pos_files, …
    fp_filters: str | None = None
    units: list[tuple[str, list[str]]] = field(default_factory=list)  # (unit name, pin numbers)
    pins: dict[str, NetlistPin] = field(default_factory=dict)          # pin number → net
    unit_paths: list[str] = field(default_factory=list)                # one per placed unit; path is the first

    @property
    def on_board(self) -> bool:
        return "exclude_from_board" not in self.flags


@dataclass
class Netlist:
    components: list[NetlistComponent]
    nets: list[NetlistNet]

    def component(self, reference: str) -> NetlistComponent | None:
        return next((c for c in self.components if c.reference == reference), None)


def _children(node: SList | None, name: str):
    return node.lists(name) if node is not None else iter(())


def parse_netlist(text: str) -> Netlist:
    root = parse(text).root
    if root.head != "export":
        raise ValueError(f"not a KiCad S-expression netlist (root is '{root.head}')")
    components: dict[str, NetlistComponent] = {}
    for comp in _children(root.find("components"), "comp"):
        sheet = comp.find("sheetpath")
        stamps = [a.value for a in comp.find("tstamps").atoms()] if comp.find("tstamps") is not None else []
        sheet_stamps = (sheet.child_value("tstamps") if sheet is not None else None) or "/"
        props = {p.child_value("name"): p.child_value("value") for p in comp.lists("property")}
        fields = {}
        for f in _children(comp.find("fields"), "field"):
            name = f.child_value("name")
            if name and name != "Footprint":
                fields[name] = f.value(0) or ""
        libsource = comp.find("libsource")
        c = NetlistComponent(
            reference=comp.child_value("ref") or "",
            value=comp.child_value("value") or "",
            footprint=comp.child_value("footprint") or "",
            lib_id=f"{libsource.child_value('lib')}:{libsource.child_value('part')}" if libsource is not None else "",
            # KiCad's netlist reader gives a new footprint the sheet path plus the first unit's symbol uuid, and
            # its updater accepts an existing footprint linked to any unit.
            path=sheet_stamps.rstrip("/") + "/" + stamps[0] if stamps else "",
            unit_paths=[sheet_stamps.rstrip("/") + "/" + s for s in stamps],
            sheet_name=(sheet.child_value("names") if sheet is not None else None) or "/",
            sheet_file=props.get("Sheetfile") or "",
            fields=fields,
            flags={k for k, v in props.items() if k and v is None},
            fp_filters=props.get("ki_fp_filters"),
            units=[(u.child_value("name") or "", [p.child_value("num") or "" for p in _children(u.find("pins"), "pin")])
                   for u in _children(comp.find("units"), "unit")],
        )
        components[c.reference] = c
    nets = []
    for net in _children(root.find("nets"), "net"):
        name = net.child_value("name") or ""
        nodes = []
        for node in net.lists("node"):
            ref, pin = node.child_value("ref") or "", node.child_value("pin") or ""
            nodes.append((ref, pin))
            if ref in components:
                components[ref].pins[pin] = NetlistPin(pin, name, node.child_value("pinfunction"), node.child_value("pintype"))
        nets.append(NetlistNet(name, int(net.child_value("code") or 0), net.child_value("class"), nodes))
    return Netlist(list(components.values()), nets)


def read_netlist(cli, schematic: str) -> Netlist:
    """Export and parse the netlist of ``schematic`` with ``cli`` (a :class:`~.kicad_cli.KiCadCli`)."""
    with tempfile.TemporaryDirectory(prefix="dsh-kicad-netlist-") as tmp:
        out = os.path.join(tmp, "netlist.net")
        cli.export_netlist_file(schematic, out, fmt="kicadsexpr")
        with open(out, encoding="utf-8") as fh:
            return parse_netlist(fh.read())
