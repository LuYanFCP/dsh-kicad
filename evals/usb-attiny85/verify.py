"""Check an agent-built usb_attiny schematic against the spec in prompt.md using KiCad's own ERC and netlist.

    python evals/usb-attiny85/verify.py packages/kicad-bridge/sidecar/src /path/to/usb_attiny.kicad_sch

Exit code 0 only when ERC has no errors and every requirement holds.
"""
import json, os, sys
sys.path.insert(0, sys.argv[1])
from dsh_kicad_sidecar.kicad_cli import KiCadCli
from dsh_kicad_sidecar.schematic import Schematic
from dsh_kicad_sidecar import mcu
path = sys.argv[2]
cli = KiCadCli()
erc = cli.erc(path); print('ERC:', 'PASSED' if erc['passed'] else 'FAILED', erc['counts'], erc['by_type'])
net = cli.netlist(path)
comps = {c['reference']: c for c in net['components']}
print('\nCOMPONENTS:'); [print(f"  {r:5} {c['value']:12} {c['lib_id']:40} {c['footprint']}") for r, c in sorted(comps.items())]
nets = {n['name']: {(x['ref'], x['pin'], x.get('pin_function', '')) for x in n['nodes']} for n in net['nets']}
print('\nNETS:'); [print(f"  {k}: {sorted((r,p,f) for r,p,f in v)}") for k, v in sorted(nets.items())]
def ref_of(lib): return [r for r, c in comps.items() if c['lib_id'].endswith(lib)]
def net_of(ref, pin_fn):
    for name, nodes in nets.items():
        for r, p, f in nodes:
            fn = f.rsplit('_', 1)[0] if '_' in f else f
            if r == ref and (p == pin_fn or fn == pin_fn or pin_fn in fn.replace('~{', '').replace('}', '').split('/')): return name
    return None
checks = []
u1 = ref_of('ATtiny85-20S')[0]; u2 = ref_of('AMS1117-3.3')[0]; j_usb = ref_of('USB_C_Receptacle_PowerOnly_6P')[0]; j_isp = ref_of('AVR-ISP-6')[0]
c = lambda name, ok: checks.append((name, bool(ok)))
c('USB VBUS -> +5V', net_of(j_usb, 'VBUS') and '+5V' in net_of(j_usb, 'VBUS'))
for cc in ('CC1', 'CC2'):
    n = net_of(j_usb, cc); rs = [r for r, p, f in nets.get(n, set()) if r.startswith('R')]
    other = [net_of(r, '2' if net_of(r, '1') == n else '1') for r in rs]
    c(f'{cc} 5.1k pulldown', rs and comps[rs[0]]['value'].lower().startswith('5.1k') and other and other[0] == 'GND')
c('LDO in = +5V', '+5V' in (net_of(u2, 'VI') or ''))
c('LDO out = +3V3', '+3V3' in (net_of(u2, 'VO') or ''))
c('MCU VCC = +3V3', '+3V3' in (net_of(u1, 'VCC') or ''))
c('MCU GND = GND', net_of(u1, 'GND') == 'GND')
def caps_on(n): return [r for r, p, f in nets.get(n, set()) if r.startswith('C')]
c('10uF on +5V', any(comps[x]['value'].lower().startswith('10u') for x in caps_on(net_of(u2, 'VI'))))
c('10uF on +3V3', any(comps[x]['value'].lower().startswith('10u') for x in caps_on(net_of(u2, 'VO'))))
c('100nF on +3V3', any(comps[x]['value'].lower().startswith('100n') for x in caps_on(net_of(u1, 'VCC'))))
rst = net_of(u1, 'PB5') or net_of(u1, 'RESET')
c('RESET 10k pull-up', any(comps[r]['value'].lower().startswith('10k') for r, p, f in nets.get(rst, set()) if r.startswith('R')))
c('ISP RESET', any(r == j_isp for r, p, f in nets.get(rst, set())))
d1 = [r for r, p, f in nets.get('+3V3', set()) if r.startswith('R') and comps[r]['value'] == '1k']
c('power LED: +3V3 -> 1k -> LED -> GND', d1 and any(x[0].startswith('D') for n, v in nets.items() if (d1[0], '2', '') in v for x in v) and net_of('D1', 'K') == 'GND')
for fn, pin in (('MISO', 'PB1'), ('MOSI', 'PB0'), ('SCK', 'PB2')):
    c(f'ISP {fn} -> {pin}', net_of(j_isp, fn) and net_of(j_isp, fn) == net_of(u1, pin))
c('ISP VCC = +3V3', '+3V3' in (net_of(j_isp, 'VCC') or ''))
c('ISP GND', net_of(j_isp, 'GND') == 'GND')
pb3 = net_of(u1, 'PB3'); sw = [r for r, p, f in nets.get(pb3, set()) if r.startswith('SW')]
c('PB3 -> button -> GND, no external pull-up', sw and net_of(sw[0], '2') == 'GND' and not any(r.startswith('R') for r, p, f in nets.get(pb3, set())))
pb4 = net_of(u1, 'PB4'); r4 = [r for r, p, f in nets.get(pb4, set()) if r.startswith('R')]
c('PB4 -> 330R -> LED -> GND', r4 and comps[r4[0]]['value'].startswith('330') and net_of('D2', 'K') == 'GND')
c('every board part has a footprint', all(cmp['footprint'] for r, cmp in comps.items() if not cmp['lib_id'].startswith('power:')))
mcu_report = mcu.check_schematic(net, os.path.dirname(os.path.abspath(path)))
for m in mcu_report['mcus']:
    for f in m.get('findings', []): print(f"  MCU {f['severity']}: {f['pin']} {f['message']}")
c('MCU wiring (kicad_check_mcu, attiny85 provider): checked, no errors', mcu_report['passed'] is True)

print('\nREQUIREMENTS:'); [print(('  OK  ' if ok else '  FAIL'), name) for name, ok in checks]
print(f'\n{sum(ok for _, ok in checks)}/{len(checks)} requirements satisfied')
sys.exit(0 if erc['counts']['error'] == 0 and all(ok for _, ok in checks) else 1)
