"""Check an agent-built led.kicad_sch: KiCad's ERC must pass and an independent SPICE run must meet the requirements in prompt.md.

    python evals/led-resistor-sim/verify.py packages/kicad-bridge/sidecar/src /path/to/led.kicad_sch

Needs ngspice. Exit code 0 only when ERC has no errors and every assertion holds.
"""
import os, sys
sys.path.insert(0, sys.argv[1])
from dsh_kicad_sidecar import spice
from dsh_kicad_sidecar.kicad_cli import KiCadCli

path = os.path.realpath(sys.argv[2])
cli = KiCadCli()
erc = cli.erc(path)
print('ERC:', 'PASSED' if erc['passed'] else 'FAILED', erc['counts'], erc['by_type'])
ngspice = spice.locate_ngspice()
if not ngspice:
    sys.exit('ngspice not found (install it or set $NGSPICE)')
result = spice.simulate(cli, path, os.path.join(os.path.dirname(path), '.dsh-kicad', 'sim', 'verify'), None, [
    {'probe': 'V(VCC)', 'equals': 5, 'tol': 0.01, 'name': 'supply is 5 V on VCC'},
    {'probe': 'I(D1)', 'min': '8m', 'max': '12m', 'abs': True, 'name': 'LED current 8-12 mA'},
], ngspice)
print('\nSIMULATION by ngspice', result['ngspice'])
for a in result['assertions']:
    print(('  OK  ' if a['passed'] else '  FAIL'), f"{a['name']}: {a['value']:.4g} {a['unit']}")
print('  not simulated:', result['ignored'] or 'nothing')
sys.exit(0 if erc['counts']['error'] == 0 and result['passed'] else 1)
