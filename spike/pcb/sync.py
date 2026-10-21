"""PCB-0 spike: incremental schematic → board update on top of option A (what #10 turns into pcb_sync.py).

    python3 spike/pcb/sync.py <project>.kicad_sch <project>.kicad_pcb [--dry-run]

The board is edited through the lossless S-expression tree, so everything the update does not touch
(tracks, zones and their fills, placement, text KiCad wrote) stays byte-identical, and a second run
on unchanged inputs changes nothing. Footprints are matched to symbols by ``(path …)``, as KiCad does.

* existing footprint: Reference, Value, symbol fields, sheet name/file and pad nets are brought in line,
  one atom at a time (a changed footprint id is reported; swapping it in place is left to #10);
* missing footprint: instantiated from the library (option A) in a staging row right of the outline;
* footprint whose symbol is gone: removed (KiCad's "Delete extra footprints");
* renamed net: when every pad of a board net now sits on one new schematic net, tracks, vias and
  zones on the old name follow (KiCad's updater does the same).
"""

from __future__ import annotations

import argparse
import os
import sys

from common import footprint_table, read_netlist
from option_a import courtyard, instantiate

from dsh_kicad_sidecar.sexpr import L, S, SList, dumps, parse

COPPER_ITEMS = ("segment", "arc", "via", "zone")


def ref_of(fp: SList) -> str:
    prop = fp.property("Reference")
    return prop.value(1) if prop is not None else ""


def pad_net(pad: SList) -> str | None:
    net = pad.find("net")
    return net.atoms()[-1].value if net is not None else None  # (net "n") or (net 3 "n")


def set_net(node: SList, name: str, codes: dict[str, int] | None) -> None:
    net = node.find("net")
    if codes is None:
        net.set_atoms(S(name))
    else:
        net.set_atoms(codes[name], S(name))


def sync(schematic: str, board_path: str, dry_run: bool = False) -> dict:
    comps, nets = read_netlist(schematic)
    resolver = footprint_table(schematic)
    with open(board_path, encoding="utf-8") as fh:
        text = fh.read()
    doc = parse(text)
    board = doc.root
    changes: list[str] = []

    table = [n for n in board.lists("net")]  # KiCad 8/9 only
    codes = {n.value(1): int(n.value(0)) for n in table} if table else None
    wanted = {c.path: c for c in comps if c.footprint and c.on_board}
    # Link footprints to symbols as KiCad's updater does: by the path of any unit of the symbol, then (for
    # boards whose symbols were re-created) by reference, rewriting the path. Keyed by the symbol's path.
    owner = {p: c for c in wanted.values() for p in c.unit_paths}
    by_ref = {c.reference: c for c in wanted.values()}
    footprints: dict[str, SList] = {}
    unlinked = []
    for fp in board.lists("footprint"):
        c = owner.get(fp.child_value("path"))
        if c is not None and c.path not in footprints:
            footprints[c.path] = fp
        else:
            unlinked.append(fp)
    for fp in unlinked:
        c = by_ref.get(ref_of(fp))
        if c is not None and c.path not in footprints and fp.find("path") is not None:
            fp.find("path").set_atoms(S(c.path))
            footprints[c.path] = fp
            changes.append(f"{c.reference}: relinked to its symbol by reference")
        else:
            footprints[f"unlinked:{id(fp)}"] = fp

    # 1. Net renames, decided before pads change: old board net → the one schematic net all its pins moved to.
    new_net = {(c.path, num): pin.net for c in comps for num, pin in c.pins.items()}
    old_pads: dict[str, set[str]] = {}
    for path, fp in footprints.items():
        for pad in fp.lists("pad"):
            name = pad_net(pad)
            if name:
                old_pads.setdefault(name, set()).add(new_net.get((path, pad.value(0))))
    renames = {}
    for old, targets in old_pads.items():
        targets.discard(None)
        if old not in nets and len(targets) == 1:
            renames[old] = targets.pop()
    if codes is not None:
        for n in table:
            if n.value(1) in renames:
                n.set_atoms(int(n.value(0)), S(renames[n.value(1)]))
                codes[renames[n.value(1)]] = codes.pop(n.value(1))
        for name in nets:  # new nets get the next free codes, existing ones keep theirs
            if name not in codes:
                codes[name] = max(codes.values()) + 1
                board.insert(board.index_of(list(board.lists("net"))[-1]) + 1, L("net", codes[name], S(name)))
    for item in board.items:
        if not (isinstance(item, SList) and item.head in COPPER_ITEMS):
            continue
        # KiCad 10: (net "name") everywhere; KiCad 8/9: tracks carry only the code, zones add (net_name …).
        node = item.find("net") if codes is None else item.find("net_name")
        name = node.value(len(node.atoms()) - 1) if node is not None else None
        if name in renames:
            node.set_atoms(S(renames[name]))
            changes.append(f"{item.head} {item.child_value('uuid')[:8]}: net {name} → {renames[name]}")
    for old, new in renames.items():
        changes.append(f"net {old} renamed to {new}")

    # 2. Footprints whose symbol is gone.
    for path, fp in list(footprints.items()):
        attr = fp.find("attr")
        if path not in wanted and not (attr is not None and "board_only" in [a.value for a in attr.atoms()]):
            board.remove(fp)
            del footprints[path]
            changes.append(f"removed {ref_of(fp)} (no symbol at {fp.child_value('path')})")

    # 3. Existing footprints: update in place, one atom at a time.
    for path, fp in footprints.items():
        c = wanted[path]
        if fp.value(0) != c.footprint:
            changes.append(f"{c.reference}: footprint {fp.value(0)} → {c.footprint} needs a swap (not in the spike)")
        for name, value in (("Reference", c.reference), ("Value", c.value), *c.fields.items()):
            prop = fp.property(name)
            if prop is not None and prop.value(1) != value:
                changes.append(f"{c.reference}: {name} {prop.value(1)!r} → {value!r}")
                prop.items[2] = S(value)
        for key, value in (("sheetname", c.sheet_name), ("sheetfile", c.sheet_file)):
            node = fp.find(key)
            if node is not None and node.value(0) != value:
                node.set_atoms(S(value))
                changes.append(f"{c.reference}: {key} → {value}")
        for pad in fp.lists("pad"):
            pin = c.pins.get(pad.value(0))
            for key, value in (("pinfunction", pin and pin.function), ("pintype", pin and pin.type)):
                node = pad.find(key)
                if node is not None and node.value(0) != value:
                    if value:
                        node.set_atoms(S(value))
                    else:
                        pad.remove(node)
            want, have = (pin.net if pin else None), pad_net(pad)
            if want == have:
                continue
            if want is None:
                pad.remove(pad.find("net"))
            elif have is None:  # KiCad writes (net) before (pinfunction) (pintype) (uuid)
                after = next((pad.index_of(n) for n in pad.lists() if n.head in ("pinfunction", "pintype", "uuid")), len(pad.items))
                pad.insert(after, L("net", S(want)) if codes is None else L("net", codes[want], S(want)))
            else:
                set_net(pad, want, codes)
            if renames.get(have) != want:
                changes.append(f"{c.reference} pad {pad.value(0)}: net {have} → {want}")

    # 4. New footprints, staged in a row right of the board outline for placement (#12) to pick up.
    edge = [i for i in board.items if isinstance(i, SList) and i.child_value("layer") == "Edge.Cuts"]
    xs = [float(p.value(0)) for g in edge for p in (g.find("start"), g.find("end")) if p is not None]
    ys = [float(p.value(1)) for g in edge for p in (g.find("start"), g.find("end")) if p is not None]
    cx, cy = (max(xs) + 5 if xs else 100.0), (min(ys) if ys else 100.0)
    for path, c in wanted.items():
        if path in footprints:
            continue
        with open(resolver.resolve(c.footprint), encoding="utf-8") as fh:
            lib_fp = parse(fh.read()).root
        x1, y1, x2, y2 = courtyard(lib_fp)
        fp = instantiate(lib_fp, c, round(cx - x1, 3), round(cy - y1, 3), codes)
        cy += y2 - y1 + 2
        existing = list(board.lists("footprint"))
        after = [f for f in existing if f.child_value("uuid") < fp.child_value("uuid")]
        anchor = board.index_of(after[-1]) + 1 if after else (board.index_of(existing[0]) if existing else len(board.items) - 1)
        board.insert(anchor, fp)
        changes.append(f"added {c.reference} ({c.footprint})")

    out = dumps(doc)
    if out != text and not dry_run:
        with open(board_path, "w", encoding="utf-8") as fh:
            fh.write(out)
    return {"changed": out != text, "changes": changes}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("schematic")
    ap.add_argument("board")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    result = sync(args.schematic, args.board, args.dry_run)
    print(f"changed: {result['changed']}")
    for line in result["changes"]:
        print("  " + line)
    sys.exit(0)
