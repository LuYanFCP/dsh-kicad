"""Judge a novice-built design by intent, using only KiCad's ERC and netlist.

    python evals/novice-button-led/verify.py packages/kicad-bridge/sidecar/src /path/to/project_dir

Intent: USB-powered (USB-C needs 5.1k CC pull-downs), a programmable controller with a
programming interface, a button that reaches a controller pin, an LED driven from a
controller pin through a resistor; plus ERC clean, footprints, a written brief, no overlaps.
"""
import glob
import itertools
import os
import sys

sys.path.insert(0, sys.argv[1])
from dsh_kicad_sidecar import geometry  # noqa: E402
from dsh_kicad_sidecar.kicad_cli import KiCadCli  # noqa: E402
from dsh_kicad_sidecar.schematic import Schematic  # noqa: E402

project = sys.argv[2]
sch = [p for p in glob.glob(os.path.join(project, "*.kicad_sch"))]
checks = []
c = lambda name, ok: checks.append((name, bool(ok)))  # noqa: E731
c("exactly one schematic", len(sch) == 1)
path = sch[0]
cli = KiCadCli()
erc = cli.erc(path)
c(f"ERC 0 errors ({erc['counts']})", erc["counts"]["error"] == 0)
net = cli.netlist(path)
comps = {x["reference"]: x for x in net["components"]}
nets = {n["name"]: {(x["ref"], x["pin"], x.get("pin_function", "")) for x in n["nodes"]} for n in net["nets"]}
def fn(f): return f.rsplit("_", 1)[0] if "_" in f else f
def net_of(ref, pin_fn):
    for name, nodes in nets.items():
        for r, p, f in nodes:
            if r == ref and (p == pin_fn or fn(f) == pin_fn or pin_fn in fn(f).replace("~{", "").replace("}", "").split("/")):
                return name
    return None
def others(name, exclude):
    return {r for r, p, f in nets.get(name, set()) if r != exclude}

usb = [r for r, x in comps.items() if "USB_C" in x["lib_id"]]
c("USB-C power input", usb)
if usb:
    for cc in ("CC1", "CC2"):
        n = net_of(usb[0], cc)
        rs = [r for r in others(n, usb[0]) if r.startswith("R")]
        value = comps[rs[0]]["value"].lower().replace("ω", "").replace("ohm", "").replace(" ", "") if rs else ""
        c(f"{cc} 5.1k pull-down", value in ("5.1k", "5k1", "5100") and net_of(rs[0], "1") != net_of(rs[0], "2") and "GND" in (net_of(rs[0], "1"), net_of(rs[0], "2")))
mcu = [r for r, x in comps.items() if x["lib_id"].startswith("MCU_")]
c("a microcontroller", mcu)
prog = [r for r, x in comps.items() if any(k in x["lib_id"] for k in ("AVR-ISP", "SWD", "Conn_ARM", "USB"))]
c("a programming interface", any("ISP" in comps[r]["lib_id"] or "SWD" in comps[r]["lib_id"] for r in prog) or any("USB" in comps[r]["lib_id"] and "PowerOnly" not in comps[r]["lib_id"] for r in prog))
if mcu:
    u = mcu[0]
    mcu_nets = {n for n, nodes in nets.items() if any(r == u for r, _, _ in nodes)}
    sw = [r for r, x in comps.items() if x["lib_id"].startswith("Switch:")]
    c("button between an MCU pin and GND", any(
        net_of(s, "1") in mcu_nets and net_of(s, "2") == "GND" or net_of(s, "2") in mcu_nets and net_of(s, "1") == "GND" for s in sw))
    leds = [r for r, x in comps.items() if "LED" in x["lib_id"]]
    driven = False
    for d in leds:
        for n in (net_of(d, "A"), net_of(d, "K")):
            for r in others(n, d):
                if r.startswith("R") and ({net_of(r, "1"), net_of(r, "2")} & (mcu_nets - {"GND"})):
                    driven = True
    c("LED driven from an MCU pin through a resistor", driven)
c("every board part has a footprint", all(x["footprint"] for x in comps.values() if not x["lib_id"].startswith("power:")))
c("design-brief.md written", os.path.isfile(os.path.join(project, "design-brief.md")))
s = Schematic(path)
boxes = {}
for sym in s.symbols():
    lib = s.lib_symbol(sym.lib_id)
    bb = geometry.body_bbox(lib, sym.at, sym.mirror, sym.unit, sym.body_style)
    pins = geometry.placed_pins(lib, sym.at, sym.mirror, sym.unit)
    xs = [q["x"] for q in pins] + ([bb[0], bb[2]] if bb else [])
    ys = [q["y"] for q in pins] + ([bb[1], bb[3]] if bb else [])
    if xs:
        boxes[sym.reference] = (min(xs), min(ys), max(xs), max(ys))
over = [(a, b) for a, b in itertools.combinations(boxes, 2) if not (boxes[a][2] < boxes[b][0] or boxes[b][2] < boxes[a][0] or boxes[a][3] < boxes[b][1] or boxes[b][3] < boxes[a][1])]
c(f"no overlapping symbols {over or ''}", not over)
# Drawn like a schematic, not a sheet of labels: most signal nets join at least two part pins by wire.
key = lambda x, y: (round(x, 2), round(y, 2))  # noqa: E731
group = {}
def find(k):
    while group.setdefault(k, k) != k:
        k = group[k]
    return k
wiring = s.wiring()
for w in wiring["wires"]:
    group[find(key(*w["from"]))] = find(key(*w["to"]))
for j in wiring["junctions"]:  # a junction on a wire's middle joins it
    for w in wiring["wires"]:
        (x0, y0), (x1, y1), (jx, jy) = w["from"], w["to"], j["at"]
        if min(x0, x1) <= jx <= max(x0, x1) and min(y0, y1) <= jy <= max(y0, y1) and (x0 == x1 == jx or y0 == y1 == jy):
            group[find(key(jx, jy))] = find(key(x0, y0))
pin_at = {}
for sym in s.symbols():
    if not sym.reference.startswith("#"):
        for q in geometry.placed_pins(s.lib_symbol(sym.lib_id), sym.at, sym.mirror, sym.unit):
            pin_at[(sym.reference, q["number"])] = key(q["x"], q["y"])
signal = [nodes for name, nodes in nets.items() if not name.startswith("unconnected") and "GND" not in name.upper()
          and not name.startswith("+") and len({r for r, _, _ in nodes}) >= 2]
wired = [nodes for nodes in signal if len({find(pin_at[(r, p)]) for r, p, _ in nodes if (r, p) in pin_at}) < len(nodes)]
c(f"parts wired together ({len(wired)} of {len(signal)} signal nets drawn with wires)", signal and 2 * len(wired) >= len(signal))
for name, ok in checks:
    print(("OK   " if ok else "FAIL ") + name)
print(f"{sum(ok for _, ok in checks)}/{len(checks)} checks passed")
sys.exit(0 if all(ok for _, ok in checks) else 1)
