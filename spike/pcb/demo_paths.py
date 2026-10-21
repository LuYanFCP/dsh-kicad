"""Check the footprint ↔ symbol link rule against KiCad's demo projects.

    python3 spike/pcb/demo_paths.py [demos dir, default /usr/share/kicad/demos]

For every demo with a schematic and a board, compare ``NetlistComponent.path`` (sheet uuids + first unit's
symbol uuid) with the ``(path …)`` KiCad stored in the board's footprint of the same reference.
"""

from __future__ import annotations

import glob
import os
import shutil
import sys
import tempfile

from common import CLI

from dsh_kicad_sidecar.netlist import read_netlist
from dsh_kicad_sidecar.sexpr import parse

demos = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/kicad/demos"
total = same = 0
for pcb in sorted(glob.glob(os.path.join(demos, "*", "*.kicad_pcb"))):
    sch = pcb[:-len(".kicad_pcb")] + ".kicad_sch"
    if not os.path.isfile(sch):
        continue
    with tempfile.TemporaryDirectory() as tmp:  # demos may be read-only; kicad-cli writes a .kicad_prl
        work = os.path.join(tmp, "p")
        shutil.copytree(os.path.dirname(pcb), work)
        netlist = read_netlist(CLI, os.path.join(work, os.path.basename(sch)))
    with open(pcb, encoding="utf-8") as fh:
        board = parse(fh.read()).root
    paths = {fp.property("Reference").value(1): fp.child_value("path") for fp in board.lists("footprint") if fp.property("Reference")}
    comps = [c for c in netlist.components if c.footprint and c.on_board and c.reference in paths]
    ok = [c for c in comps if paths[c.reference] == c.path]
    total, same = total + len(comps), same + len(ok)
    print(f"{os.path.basename(pcb):40} {len(ok):5}/{len(comps):<5} (multi-unit {sum(len(c.units) > 1 for c in comps)}, "
          f"in sub-sheets {sum(c.sheet_name != '/' for c in comps)})")
    for c in comps:
        if paths[c.reference] != c.path:
            other = "another unit's uuid" if paths[c.reference] in c.unit_paths else "no current unit (stale board)"
            print(f"    {c.reference}: board links {paths[c.reference]} → {other}")
print(f"total: {same}/{total}")
