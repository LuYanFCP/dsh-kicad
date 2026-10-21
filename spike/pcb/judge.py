"""Run ``kicad-cli pcb drc --schematic-parity`` on a board and summarize the report.

    python3 spike/pcb/judge.py <board>.kicad_pcb [extra kicad-cli drc flags, e.g. --refill-zones --save-board]

Parity findings are warnings by default in KiCad 10, so "0 errors" alone does not mean parity holds:
the schematic_parity list has to be empty.
"""

import json
import os
import subprocess
import sys
from collections import Counter

board = os.path.abspath(sys.argv[1])
out = board + ".drc.json"
args = ["kicad-cli", "pcb", "drc", "--schematic-parity", "--severity-all", "--format", "json", "-o", out, *sys.argv[2:], board]
proc = subprocess.run(args, capture_output=True, text=True, cwd=os.path.dirname(board))
print(f"$ kicad-cli pcb drc --schematic-parity {' '.join(sys.argv[2:])} {os.path.basename(board)}  → exit {proc.returncode}")
print("  " + " / ".join(ln for ln in proc.stdout.splitlines() if "assert" not in ln))
with open(out, encoding="utf-8") as fh:
    report = json.load(fh)
for key in ("violations", "unconnected_items", "schematic_parity"):
    print(f"  {key}: {len(report[key])}", dict(Counter(f"{v['severity']}:{v['type']}" for v in report[key])))
for v in report["schematic_parity"] + report["violations"]:
    print("    ", v["type"], "|", v["description"], "|", "; ".join(i["description"] for i in v["items"]))
