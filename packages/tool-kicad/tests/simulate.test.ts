import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as toolKiCad from '../src/index.ts'
import { eng, formatSimModel, formatSimulate, type SimModelValue, type SimulateValue } from '../src/index.ts'
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

describe('formatSimulate with a requirements file', () => {
  it('says where the requirements came from or went', () => {
    expect(formatSimulate(value({ spec: { path: '/p/led.sim.json', loaded: ['assertions', 'monte_carlo'], saved: false } })))
      .toContain('Requirements from /p/led.sim.json (assertions, monte_carlo).')
    expect(formatSimulate(value({ spec: { path: '/p/led.sim.json', loaded: [], saved: true } }))).toContain('Requirements saved to /p/led.sim.json.')
  })
})

describe('formatSimulate with Monte Carlo and formatSimModel', () => {
  it('reports pass counts, the spread and the first failing draw', () => {
    const out = formatSimulate(value({
      monte_carlo: {
        runs: 50, seed: 1, distribution: 'uniform', min_pass_rate: 1, tolerances: { R1: 5, R2: 5 }, varied: ['R1', 'R2'], passed: false,
        assertions: [{
          name: 'V(MID)', probe: 'V(MID)', unit: 'V', min_required: 2.4, max_required: 2.6, passes: 41, runs: 50, pass_rate: 0.82,
          min: 2.37, mean: 2.5, max: 2.63, stdev: 0.05, passed: false, first_failure: { run: 3, value: 2.62, varied: { R1: 950, R2: 1040 } },
        }],
      },
    }))
    expect(out).toContain('Monte Carlo: FAILED — 50 runs (seed 1, uniform; varied R1 ±5%, R2 ±5%)')
    expect(out).toContain('✗ V(MID): holds in 41/50 runs; 2.37V … 2.5V (mean) … 2.63V (required ≥ 2.4V and ≤ 2.6V)')
    expect(out).toContain('first failure: run 3, 2.62V with R1 = 950, R2 = 1.04k')
  })

  it('lists models with their pins', () => {
    const v: SimModelValue = {
      path: '/p', models: 2, truncated: false,
      files: [{ file: '/p/ldo.lib', models: [{ name: 'LDO33', kind: 'subckt', pins: ['IN', 'GND', 'OUT'], comment: 'Pins: IN GND OUT' }, { name: 'D1N4148', kind: 'model', type: 'D' }] }],
    }
    const out = formatSimModel(v)
    expect(out).toContain('.subckt LDO33 IN GND OUT   — Pins: IN GND OUT')
    expect(out).toContain('.model D1N4148 D')
    expect(out).toContain('set_sim_model')
    expect(formatSimModel({ path: '/p', models: 0, truncated: false, files: [] })).toBe('No .subckt or .model found in /p.')
  })
})

describe('kicad_sim_model and set_sim_model', () => {
  it.runIf(hasKiCadCli())('finds a model, binds it to a symbol and refuses a pin mapping it cannot make', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const dir = mkdtempSync(join(tmpdir(), 'dsh-kicad-sim-model-'))
    writeFileSync(join(dir, 'ldo.lib'), '* Pins: IN GND OUT\n.subckt LDO33 IN GND OUT\nB1 n1 GND V=min(V(IN,GND)-0.3,3.3)\nRs n1 OUT 0.1\n.ends LDO33\n')
    const path = join(dir, 'm.kicad_sch')
    await ctx.kicad.run('create_schematic', { path })
    await ctx.kicad.run('edit_schematic', { path, operations: [{ op: 'add_symbol', lib_id: 'Regulator_Linear:AMS1117-3.3', x: 101.6, y: 38.1, reference: 'U1', value: 'AMS1117-3.3' }] })
    const found = await runTool(ctx, 'kicad_sim_model', { path: dir, name: 'ldo' })
    expect(found.isError).toBeFalsy()
    expect(text(found)).toContain('.subckt LDO33 IN GND OUT')
    const refused = await runTool(ctx, 'kicad_edit_schematic', { path, operations: [{ op: 'set_sim_model', reference: 'U1', library: 'ldo.lib', name: 'LDO33' }] })
    expect(refused.isError).toBe(true)
    expect(text(refused)).toMatch(/cannot match model LDO33's pins IN, OUT/)
    await ctx.kicad.run('edit_schematic', { path, operations: [{ op: 'set_sim_model', reference: 'U1', library: 'ldo.lib', name: 'LDO33', pins: { 1: 'GND', 2: 'OUT', 3: 'IN' } }] })
    const comps = await ctx.kicad.run<{ components: Array<{ reference: string, properties?: Record<string, string> }> }>('read_schematic', { path })
    expect(comps.components.find(c => c.reference === 'U1')?.properties).toMatchObject({ 'Sim.Library': 'ldo.lib', 'Sim.Name': 'LDO33', 'Sim.Pins': '1=GND 2=OUT 3=IN', 'Sim.Device': 'SUBCKT' })
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

  it.runIf(hasKiCadCli() && hasNgspice())('runs a tolerance analysis and reports it', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const path = join(mkdtempSync(join(tmpdir(), 'dsh-kicad-sim-mc-')), 'div.kicad_sch')
    await ctx.kicad.run('create_schematic', { path })
    await ctx.kicad.run('edit_schematic', {
      path,
      operations: [
        { op: 'add_symbol', lib_id: 'Simulation_SPICE:VDC', x: 50.8, y: 50.8, reference: 'V1', value: '5', properties: { 'Sim.Params': 'dc=5' } },
        { op: 'add_symbol', lib_id: 'Device:R', x: 76.2, y: 38.1, reference: 'R1', value: '1k' },
        { op: 'add_symbol', lib_id: 'Device:R', x: 76.2, y: 63.5, reference: 'R2', value: '1k' },
        { op: 'connect_pin_to_net', pin: 'V1:1', net: 'VCC', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'V1:2', net: 'GND', kind: 'power' },
        { op: 'connect_pin_to_net', pin: 'R1:1', net: 'VCC', kind: 'label' },
        { op: 'connect_pins', a: 'R1:2', b: 'R2:1' },
        { op: 'connect_pin_to_net', pin: 'R2:1', net: 'MID', kind: 'label' },
        { op: 'connect_pin_to_net', pin: 'R2:2', net: 'GND', kind: 'power' },
      ],
    })
    const result = await runTool(ctx, 'kicad_simulate', {
      path,
      assertions: [{ probe: 'V(MID)', equals: 2.5, tol_pct: 0.5, name: 'mid within 0.5%' }],
      monte_carlo: { runs: 20, seed: 3 },
    })
    expect(result.isError).toBeFalsy()
    const out = text(result)
    expect(out).toContain('FAILED')
    expect(out).toMatch(/Monte Carlo: FAILED — 20 runs \(seed 3, uniform; varied R1 ±5%, R2 ±5%\)/)
    expect(out).toMatch(/✗ mid within 0.5%: holds in \d+\/20 runs/)
    expect(out).toContain('first failure: run')
  })
})
