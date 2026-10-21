"""Compare two boards.

    python3 spike/pcb/compare.py a.kicad_pcb b.kicad_pcb             footprints, symbol paths, pad → net
    python3 spike/pcb/compare.py --sections a.kicad_pcb b.kicad_pcb  which top-level items differ
"""

from __future__ import annotations

import sys

import common  # noqa: F401  (puts the sidecar on sys.path)

from dsh_kicad_sidecar.sexpr import dumps, parse


def load(path):
    with open(path, encoding="utf-8") as fh:
        return parse(fh.read()).root


def ref_of(fp):
    return fp.property("Reference").value(1)


def pad_map(root):
    out = {}
    for fp in root.lists("footprint"):
        pads = sorted((p.value(0), p.find("net").atoms()[-1].value if p.find("net") is not None else None) for p in fp.lists("pad"))
        out[ref_of(fp)] = {"footprint": fp.value(0), "path": fp.child_value("path"), "pads": pads}
    return out


def key(item):
    if item.head == "footprint":
        return "footprint " + ref_of(item)
    return item.head + (" " + item.child_value("uuid") if item.find("uuid") is not None else "")


if sys.argv[1] == "--sections":
    a, b = load(sys.argv[2]), load(sys.argv[3])
    sa = {key(i): dumps(i) for i in a.items[1:]}
    sb = {key(i): dumps(i) for i in b.items[1:]}
    changed = sorted(k for k in sa.keys() & sb.keys() if sa[k] != sb[k])
    print(f"  sections: {len(sa)} vs {len(sb)}; only in first {sorted(set(sa) - set(sb))}, only in second "
          f"{sorted(set(sb) - set(sa))}, changed {changed}")
else:
    a, b = pad_map(load(sys.argv[1])), pad_map(load(sys.argv[2]))
    print(f"  footprints {len(a)} vs {len(b)}, same references: {a.keys() == b.keys()}")
    diff = [k for k in a if a[k] != b.get(k)]
    print(f"  footprint ids, symbol paths and pad nets differ for: {diff or 'none'}")
    print(f"  pads: {sum(len(v['pads']) for v in a.values())}, with a net: {sum(1 for v in a.values() for p in v['pads'] if p[1])}")
