"""PCB-0 option A: the sidecar writes ``.kicad_pcb`` S-expressions itself (stdlib only).

    python3 spike/pcb/option_a.py <project>.kicad_sch <out>.kicad_pcb [--zone] [--kicad9]

1. The board shell comes from KiCad: a one-line stub ``(kicad_pcb (version 20240108))`` run through
   ``kicad-cli pcb upgrade --force`` is the installed KiCad's empty board in its native format (layer
   table, setup, plot params), byte-identical to ``pcbnew.CreateEmptyBoard()`` saved.
2. Footprints are copied from the ``.kicad_mod`` that the fp-lib-table chain resolves, renamed to
   ``Lib:Name``, linked to their symbol by ``(path "/<sheet uuids>/<symbol uuid>")``, given uuids, and
   their pads get the netlist's nets: ``(net "name")`` on KiCad 10, ``(net <code> "name")`` plus the
   board-level net table when the shell has one (KiCad 8/9).
3. A default 2-layer stackup goes into ``(setup)``; an Edge.Cuts rectangle surrounds the parts, which are
   packed in rows (placement proper is #12). ``--zone`` adds a GND pour on B.Cu (unfilled).
"""

from __future__ import annotations

import argparse
import os
import tempfile
import uuid

from common import Component, footprint_table, kicad_cli, read_netlist

from dsh_kicad_sidecar.sexpr import A, Atom, L, S, SList, dumps, parse

NAMESPACE = uuid.UUID("5b0e2a4c-6f0a-4d8e-9c55-6b2c1e0d9a71")  # deterministic uuids → reproducible output


class Uuids:
    def __init__(self, seed: str):
        self.seed, self.n = seed, 0

    def __call__(self) -> SList:
        self.n += 1
        return L("uuid", S(str(uuid.uuid5(NAMESPACE, f"{self.seed}#{self.n}"))))


def clone(node):
    """Deep copy, re-laid-out for its new depth (whitespace dropped). Library uuids are dropped: every
    placed instance gets its own (some .kicad_mod files carry uuids, e.g. the GCT USB-C receptacle)."""
    if isinstance(node, Atom):
        return Atom(node.value, node.quoted, node.raw)
    out = SList()
    for item in node.items:
        if not (isinstance(item, SList) and item.head in ("uuid", "tstamp")):
            out.append(clone(item))
    return out


def board_shell(work: str) -> SList:
    stub = os.path.join(work, "shell.kicad_pcb")
    with open(stub, "w", encoding="utf-8") as fh:
        fh.write('(kicad_pcb (version 20240108) (generator "dsh-kicad"))\n')
    kicad_cli("pcb", "upgrade", "--force", stub)
    with open(stub, encoding="utf-8") as fh:
        return parse(fh.read()).root


def stackup() -> SList:
    def layer(name, kind, *extra):
        return L("layer", S(name), L("type", S(kind)), *extra)
    return L(
        "stackup",
        layer("F.SilkS", "Top Silk Screen"),
        layer("F.Paste", "Top Solder Paste"),
        layer("F.Mask", "Top Solder Mask", L("thickness", 0.01)),
        layer("F.Cu", "copper", L("thickness", 0.035)),
        layer("dielectric 1", "core", L("thickness", 1.51), L("material", S("FR4")), L("epsilon_r", 4.5),
              L("loss_tangent", 0.02)),
        layer("B.Cu", "copper", L("thickness", 0.035)),
        layer("B.Mask", "Bottom Solder Mask", L("thickness", 0.01)),
        layer("B.Paste", "Bottom Solder Paste"),
        layer("B.SilkS", "Bottom Silk Screen"),
        L("copper_finish", S("None")),
        L("dielectric_constraints", A("no")),
    )


def courtyard(fp: SList) -> tuple[float, float, float, float]:
    xs, ys = [], []
    for g in fp.items:
        if not isinstance(g, SList) or g.child_value("layer") not in ("F.CrtYd", "F.Fab"):
            continue
        for key in ("start", "end", "center", "mid"):
            p = g.find(key)
            if p is not None:
                xs.append(float(p.value(0)))
                ys.append(float(p.value(1)))
        if g.head == "fp_circle" and g.find("center") is not None:
            c, e = g.find("center"), g.find("end")
            r = ((float(e.value(0)) - float(c.value(0))) ** 2 + (float(e.value(1)) - float(c.value(1))) ** 2) ** 0.5
            xs += [float(c.value(0)) - r, float(c.value(0)) + r]
            ys += [float(c.value(1)) - r, float(c.value(1)) + r]
        pts = g.find("pts")
        for xy in pts.lists("xy") if pts is not None else []:
            xs.append(float(xy.value(0)))
            ys.append(float(xy.value(1)))
    return (min(xs), min(ys), max(xs), max(ys)) if xs else (-1, -1, 1, 1)


def instantiate(lib_fp: SList, comp: Component, x: float, y: float, net_codes: dict[str, int] | None) -> SList:
    """Library footprint → board footprint linked to ``comp`` (what KiCad's netlist updater does)."""
    ids = Uuids(comp.path)
    fp = SList()
    fp.append(A("footprint"))
    fp.append(S(comp.footprint))
    rest = [clone(i) for i in lib_fp.items[2:] if not (isinstance(i, SList) and i.head in ("version", "generator", "generator_version"))]
    props_done = False
    for item in rest:
        if not isinstance(item, SList):
            fp.append(item)
            continue
        if item.head == "property":
            name = item.value(0)
            if name == "Reference":
                item.items[2] = S(comp.reference)
            elif name == "Value":
                item.items[2] = S(comp.value)
            elif name in comp.fields:  # the symbol's field wins over the library's (parity checks it)
                item.items[2] = S(comp.fields[name])
            _uuid_before_effects(item, ids)
        elif item.head in ("attr", "duplicate_pad_numbers_are_jumpers") or item.head.startswith("fp_") or item.head == "pad":
            if not props_done:
                _link(fp, comp, ids)
                props_done = True
            if item.head == "pad":
                _pad_net(item, comp, net_codes)
                item.append(ids())
            elif item.head.startswith("fp_"):
                if item.head == "fp_text":
                    _uuid_before_effects(item, ids)
                else:
                    item.append(ids())
        fp.append(item)
        if item.head == "layer":
            fp.append(ids())
            fp.append(L("at", x, y))
    if not props_done:
        _link(fp, comp, ids)
    _order_properties(fp)
    return fp


def _order_properties(fp: SList) -> None:
    """KiCad writes Reference, Value, Datasheet, Description, then the other fields in their order."""
    props = list(fp.lists("property"))
    first = fp.index_of(props[0])
    rank = {"Reference": 0, "Value": 1, "Datasheet": 2, "Description": 3}
    for p in props:
        fp.remove(p)
    for i, p in enumerate(sorted(props, key=lambda p: rank.get(p.value(0), 4))):
        fp.insert(first + i, p)


def _uuid_before_effects(item: SList, ids: Uuids) -> None:
    effects = item.find("effects")
    if effects is not None:
        item.insert(item.index_of(effects), ids())
    else:
        item.append(ids())


def _link(fp: SList, comp: Component, ids: Uuids) -> None:
    """Symbol fields, the symbol link and the unit/pin map, right after the library's properties."""
    have = {p.value(0) for p in fp.lists("property")}
    for name in ("Datasheet", "Description", *sorted(comp.fields)):
        if name in have or name in ("Reference", "Value"):
            continue
        # KiCad gives copied user fields a 0.15 pen; Datasheet and Description keep the default (none written).
        font = L("font", L("size", 1.27, 1.27), L("thickness", 0.15) if name not in ("Datasheet", "Description") else None)
        fp.append(L("property", S(name), S(comp.fields.get(name, "")), L("at", 0, 0, 0), L("layer", S("F.Fab")),
                    L("hide", A("yes")), ids(), L("effects", font)))
        have.add(name)
    if comp.fp_filters:
        fp.append(L("property", A("ki_fp_filters"), S(comp.fp_filters)))
    fp.append(L("path", S(comp.path)))
    fp.append(L("sheetname", S(comp.sheet_name)))
    fp.append(L("sheetfile", S(comp.sheet_file)))
    if comp.units:
        units = L("units")
        for name, pins in comp.units:
            units.append(L("unit", L("name", S(name)), L("pins", *[S(p) for p in pins])))
        fp.append(units)


def _pad_net(pad: SList, comp: Component, net_codes: dict[str, int] | None) -> None:
    number = pad.value(0)
    pin = comp.pins.get(number) if number else None
    for old in [i for i in pad.lists() if i.head in ("net", "pinfunction", "pintype")]:
        pad.remove(old)
    if pin is None:
        return
    if net_codes is None:
        pad.append(L("net", S(pin.net)))
    else:
        pad.append(L("net", net_codes[pin.net], S(pin.net)))
    if pin.function:
        pad.append(L("pinfunction", S(pin.function)))
    if pin.type:
        pad.append(L("pintype", S(pin.type)))


def zone(net: str, net_codes: dict[str, int] | None, box: tuple[float, float, float, float]) -> SList:
    x1, y1, x2, y2 = box
    net_items = [L("net", S(net))] if net_codes is None else [L("net", net_codes[net]), L("net_name", S(net))]
    pts = L("pts", L("xy", x1, y1), L("xy", x2, y1), L("xy", x2, y2), L("xy", x1, y2))
    return L("zone", *net_items, L("layer", S("B.Cu")), Uuids(f"zone:{net}")(), L("hatch", A("edge"), 0.5),
             L("connect_pads", L("clearance", 0.5)), L("min_thickness", 0.25), L("filled_areas_thickness", A("no")),
             L("fill", L("thermal_gap", 0.5), L("thermal_bridge_width", 0.5)), L("polygon", pts))


def as_kicad9(board: SList) -> None:
    """Test hook: turn the KiCad 10 shell into a KiCad 9 one (same layer ids, numbered nets)."""
    board.find("version").set_atoms(20241229)
    board.find("generator_version").set_atoms(S("9.0"))
    board.insert(board.index_of(board.find("setup")) + 1, L("net", 0, S("")))


def build(schematic: str, out: str, with_zone: bool = False, kicad9: bool = False) -> dict:
    comps, nets = read_netlist(schematic)
    resolver = footprint_table(schematic)
    with tempfile.TemporaryDirectory(prefix="pcb-spike-a-") as work:
        board = board_shell(work)
    if kicad9:
        as_kicad9(board)
    numbered = any(n.head == "net" for n in board.lists())  # KiCad 8/9 shells carry (net 0 "")
    net_codes = {name: i for i, name in enumerate(nets, start=1)} if numbered else None

    setup = board.find("setup")
    setup.insert(1, stackup())
    if numbered:
        anchor = board.index_of(board.find("net")) + 1
        for name, code in net_codes.items():
            board.insert(anchor + code - 1, L("net", code, S(name)))

    skipped, placed, footprints = [], [], []
    gap, row_w, x0, y0 = 2.0, 50.0, 100.0, 100.0
    cx, cy, row_h = x0, y0, 0.0
    for comp in sorted(comps, key=lambda c: (c.reference.rstrip("0123456789"), int("0" + c.reference[len(c.reference.rstrip("0123456789")):]))):
        if "exclude_from_board" in comp.flags:
            skipped.append((comp.reference, "excluded from board"))
            continue
        if not comp.footprint:
            skipped.append((comp.reference, "no footprint"))
            continue
        with open(resolver.resolve(comp.footprint), encoding="utf-8") as fh:
            lib_fp = parse(fh.read()).root
        bx1, by1, bx2, by2 = courtyard(lib_fp)
        w, h = bx2 - bx1, by2 - by1
        if cx > x0 and cx + w > x0 + row_w:
            cx, cy, row_h = x0, cy + row_h + gap, 0.0
        x, y = round(cx - bx1, 3), round(cy - by1, 3)
        cx += w + gap
        row_h = max(row_h, h)
        placed.append((x + bx1, y + by1, x + bx2, y + by2))
        footprints.append(instantiate(lib_fp, comp, x, y, net_codes))

    # KiCad saves footprints sorted by uuid; emitting that order keeps a later KiCad save from reshuffling the file.
    for fp in sorted(footprints, key=lambda f: f.child_value("uuid")):
        board.insert(len(board.items) - 1, fp)  # before (embedded_fonts)

    m = 3.0
    box = (min(p[0] for p in placed) - m, min(p[1] for p in placed) - m, max(p[2] for p in placed) + m,
           max(p[3] for p in placed) + m)
    box = tuple(round(v, 2) for v in box)
    board.insert(len(board.items) - 1, L(
        "gr_rect", L("start", box[0], box[1]), L("end", box[2], box[3]),
        L("stroke", L("width", 0.05), L("type", A("solid"))), L("fill", A("no")), L("layer", S("Edge.Cuts")),
        Uuids("outline")()))
    if with_zone:
        board.insert(len(board.items) - 1, zone("GND", net_codes, box))
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(dumps(board) + "\n")
    return {"footprints": len(placed), "nets": len(nets), "skipped": skipped, "numbered_nets": numbered,
            "outline": box}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("schematic")
    ap.add_argument("out")
    ap.add_argument("--zone", action="store_true", help="add an unfilled GND pour on B.Cu")
    ap.add_argument("--kicad9", action="store_true", help="write the KiCad 9 format (numbered nets) to test that path")
    args = ap.parse_args()
    result = build(args.schematic, args.out, with_zone=args.zone, kicad9=args.kicad9)
    print(result)


if __name__ == "__main__":
    main()
