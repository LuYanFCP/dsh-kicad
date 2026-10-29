"""Check an agent-drawn usb_power schematic (prompt.md) with KiCad's own ERC and netlist. The prompt leaves the
regulator's capacitors to its datasheet, and the AMS1117's asks for 22 µF on the output for stability, which an agent
working from habit (10 µF) misses. The checker re-runs the agent's own design checks (design-checks.json, without
downloading anything) and wants the regulator's backed by its datasheet; and, as the working rules ask, the layout in
titled functional blocks (evals/block_check.py).

    python evals/usb-power-datasheet/verify.py packages/kicad-bridge/sidecar/src /path/to/usb_power.kicad_sch

Exit code 0 only when ERC has no errors and every requirement holds.
"""
import os, sys
sys.path.insert(0, sys.argv[1])
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dsh_kicad_sidecar.kicad_cli import KiCadCli
from dsh_kicad_sidecar import design_checks
import block_check
path = os.path.abspath(sys.argv[2])  # kicad-cli runs in the schematic's folder
cli = KiCadCli()
erc = cli.erc(path); print('ERC:', 'PASSED' if erc['passed'] else 'FAILED', erc['counts'], erc['by_type'])
net = cli.netlist(path)
design = design_checks.Design(net, {})
comps = design.components
print('\nCOMPONENTS:'); [print(f"  {r:5} {c['value']:12} {c['lib_id']:40} {c['footprint']}") for r, c in sorted(comps.items())]
checks = []
c = lambda name, ok: checks.append((name, bool(ok)))


def net_of(spec):
    try:
        return design.net_of(spec)
    except design_checks.CheckError:
        return None


def judge(check):  # the sidecar's rules with this eval's own bounds
    try:
        return design_checks.evaluate(design, check)
    except design_checks.CheckError as exc:
        return 'fail', str(exc)


usb = [r for r, x in comps.items() if x['lib_id'].endswith('USB_C_Receptacle_PowerOnly_6P')]
ldo = [r for r, x in comps.items() if x['lib_id'].endswith('AMS1117-3.3')]
leds = [r for r, x in comps.items() if x['lib_id'].split(':')[-1].startswith('LED')]
c('USB-C power-only receptacle, AMS1117-3.3 and an LED placed', usb and ldo and leds)
j, u = (usb or ['?'])[0], (ldo or ['?'])[0]
c('USB VBUS -> +5V', net_of(f'{j}:VBUS') == '+5V')
for cc in ('CC1', 'CC2'):
    c(f'{cc}: 5.1k pull-down to GND', judge({'rule': 'resistance', 'pin': f'{j}:{cc}', 'to': 'GND', 'value': '5.1k', 'tolerance': 0.02})[0] == 'pass')
c('LDO in = +5V', net_of(f'{u}:VI') == '+5V')
c('LDO out = +3V3', net_of(f'{u}:VO') == '+3V3')
c('LDO GND = GND', net_of(f'{u}:GND') == 'GND')
print('\nVALUES:')
for name, pin, least in (('input capacitance ≥ 10 µF', 'VI', '10u'), ('output capacitance ≥ 22 µF (AMS1117 datasheet: stability)', 'VO', '22u')):
    status, detail = judge({'rule': 'capacitance', 'pin': f'{u}:{pin}', 'min': least})
    print(f'  {name}: {detail}')
    c(name, status == 'pass')
led = [judge({'rule': 'led_current', 'led': d, 'vf': 2.0, 'min': '1m', 'max': '3m'}) for d in leds]
[print(f'  LED: {detail}') for _, detail in led]
c('power LED current 1-3 mA with Vf 2.0 V', any(status == 'pass' for status, _ in led))
c('every board part has a footprint', all(x['footprint'] for x in comps.values() if not x['lib_id'].startswith('power:')))
framed, lines = block_check.check_blocks(path)
print('\nBLOCKS:'); [print('  ' + line) for line in lines]
c(block_check.REQUIREMENT, framed)

# The agent's own unit tests, judged again here.
data = design_checks.load_checks(design_checks.checks_path(path))
run = design_checks.run(os.path.dirname(path), net, data, download=False) if data['checks'] else {'results': []}
print(f"\nDESIGN CHECKS ({len(data['checks'])}):")
[print(f"  {r['status']:13} {r['id']}: {r['detail']}" + (f" [{r['source']}]" if r.get('source') else '')) for r in run['results']]
on_u = {x['id'] for x in data['checks'] if x.get('part') == u or any(str(x.get(k, '')).startswith(f'{u}:') for k in ('pin', 'minus'))}
backed = [r for r in run['results'] if r['id'] in on_u and r['status'] == 'pass' and ' p.' in r.get('source', '')]
c('design checks: 2+ on the regulator pass, quoting its datasheet', len(backed) >= 2)
c('design checks: none fails', data['checks'] and not any(r['status'] == 'fail' for r in run['results']))

print('\nREQUIREMENTS:'); [print(('  OK  ' if ok else '  FAIL'), name) for name, ok in checks]
print(f'\n{sum(ok for _, ok in checks)}/{len(checks)} requirements satisfied')
sys.exit(0 if erc['counts']['error'] == 0 and all(ok for _, ok in checks) else 1)
