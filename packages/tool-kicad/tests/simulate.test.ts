import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as toolKiCad from '../src/index.ts'
import { eng, formatSimulate, type SimulateValue } from '../src/index.ts'
import { bootKiCad, disposeAll, hasKiCadCli, runTool, text } from '../../../test/harness.ts'

afterEach(disposeAll)

function hasNgspice(): boolean {
  if (process.env.NGSPICE) return existsSync(process.env.NGSPICE)
  try {
    execFileSync('ngspice', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const value = (over: Partial<SimulateValue> = {}): SimulateValue => ({
  path: '/p/led.kicad_sch', ngspice: '47', netlist: '/p/.dsh-kicad/sim/led/led.cir', log: '/p/.dsh-kicad/sim/led/led.log',
  analyses: [{ type: 'op', values: { 'V(VCC)': 5, 'I(V1)': -0.0092 } }],
  assertions: [
    { name: 'I(D1)', probe: 'I(D1)', analysis: 'op', measure: 'value', value: 0.0092, unit: 'A', min: 0.005, max: 0.015, passed: true },
    { name: 'V(VCC)', probe: 'V(VCC)', analysis: 'op', measure: 'value', value: 5, unit: 'V', min: 3.2, max: 3.4, passed: false },
  ],
  passed: false, ignored: ['J1'], notes: [], ...over,
})

describe('formatSimulate', () => {
  it('states the verdict per assertion, the operating point and what was left out', () => {
    const out = formatSimulate(value())
    expect(out).toContain('FAILED — 1/2 assertion(s) hold')
    expect(out).toContain('✓ I(D1): 9.2mA (required ≥ 5mA and ≤ 15mA)')
    expect(out).toContain('✗ V(VCC): 5V (required ≥ 3.2V and ≤ 3.4V)')
    expect(out).toContain('Operating point: V(VCC) = 5V, I(V1) = -9.2mA')
    expect(out).toContain('Not simulated (no SPICE model, left out of the circuit): J1')
  })

  it('says so when no assertion was given', () => {
    expect(formatSimulate(value({ assertions: [], passed: null }))).toContain('no assertions given, results only')
  })

  it('writes engineering notation', () => {
    expect([eng(0.0025), eng(1000), eng(3.3), eng(2.2e-7), eng(1e6), eng(0)]).toEqual(['2.5m', '1k', '3.3', '220n', '1M', '0'])
  })
})

describe('kicad_simulate', () => {
  it.runIf(hasKiCadCli() && hasNgspice())('verifies an LED circuit against its requirements through the tool pipeline', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const path = join(mkdtempSync(join(tmpdir(), 'dsh-kicad-sim-')), 'led.kicad_sch')
    await ctx.kicad.run('create_schematic', { path })
    await ctx.kicad.run('edit_schematic', {
      path,
      operations: [
        { op: 'add_symbol', lib_id: 'Simulation_SPICE:VDC', x: 50.8, y: 50.8, reference: 'V1', value: '5', properties: { 'Sim.Params': 'dc=5' } },
        { op: 'add_symbol', lib_id: 'Device:R', x: 76.2, y: 38.1, reference: 'R1', value: '330' },
        { op: 'add_symbol', lib_id: 'Device:LED', x: 76.2, y: 63.5, reference: 'D1', value: 'LED', properties: { 'Sim.Device': 'D', 'Sim.Params': 'is=1e-18 n=2 rs=3' } },
        { op: 'connect_pin_to_net', pin: 'V1:1', net: 'VCC', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'V1:2', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'R1:1', net: 'VCC', kind: 'label' },
        { op: 'connect_pins', a: 'R1:2', b: 'D1:2' },
        { op: 'connect_pin_to_net', pin: 'D1:1', net: 'GND', kind: 'power' },
      ],
    })
    const result = await runTool(ctx, 'kicad_simulate', {
      path,
      assertions: [
        { probe: 'I(D1)', min: '5m', max: '15m', abs: true },
        { probe: 'V(VCC)', equals: 5, tol: 0.01 },
        { probe: 'I(D1)', max: '1m', abs: true, name: 'LED stays dark (wrong)' },
      ],
    })
    expect(result.isError).toBeFalsy()
    const out = text(result)
    expect(out).toContain('FAILED — 2/3 assertion(s) hold')
    expect(out).toContain('✗ LED stays dark (wrong)')
  })
})
