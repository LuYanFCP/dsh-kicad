"""PCB-0 option B: build the board with KiCad's pcbnew SWIG module.

    python3 spike/pcb/option_b.py <project>.kicad_sch <out>.kicad_pcb

Needs a Python that can ``import pcbnew`` (the distro's python3 on Fedora/Debian; KiCad's bundled
interpreter on Flatpak, macOS and Windows). SWIG exposes no netlist updater (``BOARD_NETLIST_UPDATER`` is
not wrapped), so the netlist → board mapping is hand-written here too: the same netlist reading and
fp-lib-table resolution as option A, then FootprintLoad + SetPath + per-pad SetNet, and KiCad's writer.
"""

from __future__ import annotations

import os
import sys

from common import footprint_table, read_netlist

import pcbnew  # noqa: E402  (prints wx asserts on stderr on some builds)

from option_a import courtyard  # same row packing as option A so the boards are comparable
from dsh_kicad_sidecar.sexpr import parse


def mm(v: float) -> int:
    return pcbnew.FromMM(v)


def build(schematic: str, out: str) -> dict:
    comps, nets = read_netlist(schematic)
    resolver = footprint_table(schematic)
    board = pcbnew.CreateEmptyBoard()
    infos = {}
    for name in nets:
        info = pcbnew.NETINFO_ITEM(board, name)
        board.Add(info)
        infos[name] = info

    gap, row_w, x0, y0 = 2.0, 50.0, 100.0, 100.0
    cx, cy, row_h = x0, y0, 0.0
    placed = []
    for comp in sorted(comps, key=lambda c: (c.reference.rstrip("0123456789"), int("0" + c.reference[len(c.reference.rstrip("0123456789")):]))):
        if not comp.footprint or "exclude_from_board" in comp.flags:
            continue
        path = resolver.resolve(comp.footprint)
        with open(path, encoding="utf-8") as fh:
            bx1, by1, bx2, by2 = courtyard(parse(fh.read()).root)
        w, h = bx2 - bx1, by2 - by1
        if cx > x0 and cx + w > x0 + row_w:
            cx, cy, row_h = x0, cy + row_h + gap, 0.0
        x, y = round(cx - bx1, 3), round(cy - by1, 3)
        cx += w + gap
        row_h = max(row_h, h)
        placed.append((x + bx1, y + by1, x + bx2, y + by2))

        nick, name = comp.footprint.split(":", 1)
        fp = pcbnew.FootprintLoad(os.path.dirname(path), name)
        fp.SetFPID(pcbnew.LIB_ID(nick, name))
        fp.SetReference(comp.reference)
        fp.SetValue(comp.value)
        fp.SetPath(pcbnew.KIID_PATH(comp.path))
        fp.SetSheetname(comp.sheet_name)
        fp.SetSheetfile(comp.sheet_file)
        for field, value in comp.fields.items():
            if fp.HasField(field):
                fp.GetField(field).SetText(value)
            else:  # SetField creates it; KiCad 8/9 spelled this AddField
                fp.SetField(field, value)
                fp.GetField(field).SetVisible(False)
                fp.GetField(field).SetLayer(pcbnew.F_Fab)
        for pad in fp.Pads():
            pin = comp.pins.get(pad.GetNumber())
            if pin is not None:
                pad.SetNet(infos[pin.net])
                pad.SetPinFunction(pin.function or "")
                pad.SetPinType(pin.type or "")
        fp.SetPosition(pcbnew.VECTOR2I(mm(x), mm(y)))
        board.Add(fp)

    m = 3.0
    box = [round(v, 2) for v in (min(p[0] for p in placed) - m, min(p[1] for p in placed) - m,
                                 max(p[2] for p in placed) + m, max(p[3] for p in placed) + m)]
    rect = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_RECT)
    rect.SetStart(pcbnew.VECTOR2I(mm(box[0]), mm(box[1])))
    rect.SetEnd(pcbnew.VECTOR2I(mm(box[2]), mm(box[3])))
    rect.SetLayer(pcbnew.Edge_Cuts)
    rect.SetWidth(mm(0.05))
    board.Add(rect)
    pcbnew.SaveBoard(out, board)
    return {"footprints": len(placed), "nets": len(nets), "outline": box}


if __name__ == "__main__":
    print(build(sys.argv[1], sys.argv[2]))
