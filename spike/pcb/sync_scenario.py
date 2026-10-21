"""Exercise sync.py on a KiCad-saved board: no-op re-sync, then a schematic edit round.

    python3 spike/pcb/sync_scenario.py <work dir with usb_attiny.kicad_sch + .kicad_pcb (zone filled)>

Edits: R2 330 → 470, R5 removed, C4 (100n, +3V3/GND) added, label PB4_LED renamed to LED — with a
track on /PB4_LED on the board, which has to follow the rename.
"""

from __future__ import annotations

import difflib
import os
import sys
import uuid

import common  # noqa: F401  (puts the sidecar on sys.path)
from sync import ref_of, sync

from dsh_kicad_sidecar.schematic import Schematic
from dsh_kicad_sidecar.sexpr import L, S, dumps, parse

work = sys.argv[1]
sch = os.path.join(work, "usb_attiny.kicad_sch")
pcb = os.path.join(work, "usb_attiny.kicad_pcb")


def pad_xy(board, ref, number):
    fp = next(f for f in board.lists("footprint") if ref_of(f) == ref)
    fx, fy = (float(v.value) for v in fp.find("at").atoms()[:2])
    pad = next(p for p in fp.lists("pad") if p.value(0) == number)
    px, py = (float(v.value) for v in pad.find("at").atoms()[:2])
    return round(fx + px, 4), round(fy + py, 4)


# A short track on /PB4_LED leaving R2 pad 1 (away from other copper), written the way KiCad writes one.
with open(pcb, encoding="utf-8") as fh:
    doc = parse(fh.read())
a = pad_xy(doc.root, "R2", "1")
b = (round(a[0] - 0.8, 4), a[1])
anchor = next(i for i, n in enumerate(doc.root.items) if getattr(n, "head", None) == "zone")
doc.root.insert(anchor, L("segment", L("start", *a), L("end", *b), L("width", 0.2), L("layer", S("F.Cu")),
                          L("net", S("/PB4_LED")), L("uuid", S(str(uuid.uuid4())))))
with open(pcb, "w", encoding="utf-8") as fh:
    fh.write(dumps(doc))

with open(pcb, encoding="utf-8") as fh:
    before = fh.read()
r1 = next(f for f in doc.root.lists("footprint") if ref_of(f) == "R1")
with open(pcb, "w", encoding="utf-8") as fh:  # a symbol re-created since the last update: R1's link is stale
    fh.write(before.replace(r1.child_value("path"), "/00000000-0000-4000-8000-000000000000"))
r = sync(sch, pcb)
print("0) stale link:", r)
with open(pcb, encoding="utf-8") as fh:
    assert fh.read() == before, "relinking by reference restores exactly the path KiCad would write"

r = sync(sch, pcb)
print("1) unchanged schematic:", r)
with open(pcb, encoding="utf-8") as fh:
    assert fh.read() == before, "a no-op sync must leave the file byte-identical"

s = Schematic(sch)
s.set_property("R2", "Value", "470")
s.remove_symbol("R5")
s.add_symbol("Device:C", 40.64, 140.97, reference="C4", value="100n", footprint="Capacitor_SMD:C_0603_1608Metric")
s.connect_pin_to_net("C4", "1", "+3V3", kind="power")
s.connect_pin_to_net("C4", "2", "GND", kind="power")
s.save()
with open(sch, encoding="utf-8") as fh:
    text = fh.read()
with open(sch, "w", encoding="utf-8") as fh:
    fh.write(text.replace('(label "PB4_LED"', '(label "LED"'))

r = sync(sch, pcb)
print("2) after the schematic edits:")
for line in r["changes"]:
    print("   ", line)
with open(pcb, encoding="utf-8") as fh:
    after = fh.read()


def sections(text):
    out = {}
    for item in parse(text).root.items[1:]:
        key = item.head + (" " + ref_of(item) if item.head == "footprint" else " " + (item.child_value("uuid") or ""))
        out[key] = dumps(item, 1).splitlines()
    return out


old, new = sections(before), sections(after)
print("   sections removed:", sorted(set(old) - set(new)), "added:", sorted(set(new) - set(old)))
for key in old.keys() & new.keys():
    if old[key] != new[key]:
        lines = [l for l in difflib.unified_diff(old[key], new[key], lineterm="", n=0) if l[:1] in "+-" and l[:3] not in ("+++", "---")]
        print(f"   {key}: " + " | ".join(l.strip() for l in lines))

r = sync(sch, pcb)
print("3) second sync:", r)
