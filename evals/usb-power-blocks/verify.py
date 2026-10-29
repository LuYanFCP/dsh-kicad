"""Check an agent-drawn usb_power schematic (prompt.md) with KiCad's own ERC and netlist, and its layout: the prompt never
mentions blocks, yet the working rules have the agent draw a design that does more than one job in titled functional
blocks (evals/block_check.py).

    python evals/usb-power-blocks/verify.py packages/kicad-bridge/sidecar/src /path/to/usb_power.kicad_sch

Exit code 0 only when ERC has no errors and every requirement holds.
"""
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dsh_kicad_sidecar.kicad_cli import KiCadCli
import block_check
path = os.path.abspath(sys.argv[2])  # kicad-cli runs in the schematic's folder
cli = KiCadCli()
erc = cli.erc(path); print('ERC:', 'PASSED' if erc['passed'] else 'FAILED', erc['counts'], erc['by_type'])
net = cli.netlist(path)
comps = {c['reference']: c for c in net['components']}
print('\nCOMPONENTS:'); [print(f"  {r:5} {c['value']:12} {c['lib_id']:40} {c['footprint']}") for r, c in sorted(comps.items())]
nets = {n['name']: {(x['ref'], x['pin'], x.get('pin_function', '')) for x in n['nodes']} for n in net['nets']}
def ref_of(lib): return [r for r, c in comps.items() if c['lib_id'].endswith(lib)]
def net_of(ref, pin_fn):
    for name, nodes in nets.items():
        for r, p, f in nodes:
            fn = f.rsplit('_', 1)[0] if '_' in f else f
            if r == ref and (p == pin_fn or fn == pin_fn or pin_fn in fn.replace('~{', '').replace('}', '').split('/')): return name
    return None
def on(n, prefix): return sorted({r for r, p, f in nets.get(n, set()) if r.startswith(prefix)})
def far(r, n):  # the net on a two-pin part's other pin
    a, b = net_of(r, '1'), net_of(r, '2')
    return b if a == n else a
value = lambda r: comps[r]['value'].lower().replace(' ', '')
checks = []
c = lambda name, ok: checks.append((name, bool(ok)))
usb, ldo = ref_of('USB_C_Receptacle_PowerOnly_6P'), ref_of('AMS1117-3.3')
leds = [r for r, x in comps.items() if x['lib_id'].split(':')[-1].startswith('LED')]
c('USB-C power-only receptacle, AMS1117-3.3 and an LED placed', usb and ldo and leds)
j, u = (usb or [None])[0], (ldo or [None])[0]
c('USB VBUS -> +5V', '+5V' in (net_of(j, 'VBUS') or ''))
for cc in ('CC1', 'CC2'):
    n = net_of(j, cc)
    c(f'{cc}: 5.1k pull-down to GND', n and any(value(r).startswith(('5.1k', '5k1')) and far(r, n) == 'GND' for r in on(n, 'R')))
vi, vo = net_of(u, 'VI'), net_of(u, 'VO')
c('LDO in = +5V', '+5V' in (vi or ''))
c('LDO out = +3V3', '+3V3' in (vo or ''))
c('LDO GND = GND', net_of(u, 'GND') == 'GND')
c('10uF from +5V to GND', vi and any(value(r).startswith('10u') and far(r, vi) == 'GND' for r in on(vi, 'C')))
c('10uF from +3V3 to GND', vo and any(value(r).startswith('10u') and far(r, vo) == 'GND' for r in on(vo, 'C')))
def power_led(d):  # +3V3 -> 1k -> LED -> GND, the resistor on either side of the LED
    a, k = net_of(d, 'A'), net_of(d, 'K')
    one_k = lambda n, end: n and any(value(r).startswith('1k') and end in (far(r, n) or '') for r in on(n, 'R'))
    return (k == 'GND' and one_k(a, '+3V3')) or ('+3V3' in (a or '') and one_k(k, 'GND'))
c('power LED: +3V3 -> 1k -> LED -> GND', any(power_led(d) for d in leds))
c('every board part has a footprint', all(x['footprint'] for x in comps.values() if not x['lib_id'].startswith('power:')))
framed, lines = block_check.check_blocks(path)
print('\nBLOCKS:'); [print('  ' + line) for line in lines]
c(block_check.REQUIREMENT, framed)

print('\nREQUIREMENTS:'); [print(('  OK  ' if ok else '  FAIL'), name) for name, ok in checks]
print(f'\n{sum(ok for _, ok in checks)}/{len(checks)} requirements satisfied')
sys.exit(0 if erc['counts']['error'] == 0 and all(ok for _, ok in checks) else 1)
