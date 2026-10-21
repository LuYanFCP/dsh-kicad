import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import * as toolKiCad from '../src/index.ts'
import { bootKiCad, disposeAll, fixtureBoard, fixtureProject, hasKiCadCli, runTool, text } from '../../../test/harness.ts'

afterEach(disposeAll)

describe('dsh-tool-kicad', () => {
  it('registers every tool with the dsh tool registry', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const names = ctx.tools.schemas().map(s => s.name).filter(n => n.startsWith('kicad_')).sort()
    expect(names).toEqual(Object.keys(toolKiCad.TOOL_ACCESS).sort())
  })

  it('kicad_doctor reports the environment with a replayable card payload', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const result = await runTool(ctx, 'kicad_doctor', {})
    expect(result.isError).toBeFalsy()
    const meta = (result as unknown as { meta?: Record<string, unknown> }).meta ?? (result as unknown as { presentationMeta?: Record<string, unknown> }).presentationMeta
    expect(text(result)).toMatch(/kicad-cli/)
    if (meta) expect(meta).toMatchObject({ kind: 'doctor', status: expect.any(String) })
    const report = await ctx.kicad.doctor()
    const card = toolKiCad.doctorMeta(report)
    expect(card).toMatchObject({ kind: 'doctor', ok: report.ok, status: report.status })
    expect((card.checks as unknown[]).length).toBe(report.checks.length)
  })

  it('reads a schematic through the real tool pipeline', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const result = await runTool(ctx, 'kicad_read_schematic', { path: fixtureProject('rc_filter') })
    expect(result.isError).toBeFalsy()
    expect(text(result)).toContain('"reference": "R1"')
  })

  it('rejects arguments that do not match the schema', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const result = await runTool(ctx, 'kicad_edit_schematic', { path: 'x.kicad_sch' })
    expect(result.isError).toBe(true)
  })

  it('edits atomically: a failing batch writes nothing', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const path = fixtureProject('rc_filter')
    const before = readFileSync(path, 'utf8')
    const result = await runTool(ctx, 'kicad_edit_schematic', {
      path,
      operations: [{ op: 'set_value', reference: 'R1', value: '22k' }, { op: 'set_value', reference: 'R99', value: '1' }],
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/operation 1 .*nothing was written/)
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it.runIf(hasKiCadCli())('read → edit → ERC: KiCad judges the fix', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const path = fixtureProject('erc_errors')
    const failing = await runTool(ctx, 'kicad_erc', { path })
    expect(text(failing)).toMatch(/ERC by KiCad .*FAILED — 2 error/)
    expect((failing.meta as { passed: boolean }).passed).toBe(false)

    const edit = await runTool(ctx, 'kicad_edit_schematic', {
      path,
      operations: [
        { op: 'connect_pin_to_net', pin: 'R1:1', net: 'VIN', kind: 'global_label' },
        { op: 'no_connect_pin', pin: 'R1:2' },
      ],
    })
    expect(edit.isError).toBeFalsy()
    expect(text(edit)).toContain('connected R1:1 to net VIN')

    const passing = await runTool(ctx, 'kicad_erc', { path, severity: 'error' })
    expect(text(passing)).toMatch(/PASSED — 0 error/)
    const nets = await runTool(ctx, 'kicad_list_nets', { path, net: 'VIN' })
    expect(text(nets)).toContain('"ref": "R1"')
  })

  it.runIf(hasKiCadCli())('renders to SVG with a note when images are unavailable', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const result = await runTool(ctx, 'kicad_render', { path: fixtureProject('rc_filter') })
    expect(result.isError).toBeFalsy()
    expect(text(result)).toMatch(/svg: .*\.dsh-kicad\/render\/rc_filter\/.*\.svg/)
    expect(text(result)).toContain('does not accept images')
  })

  it('reads a board as compact text', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const result = await runTool(ctx, 'kicad_read_pcb', { path: fixtureBoard('rc_board'), drc: false })
    expect(result.isError).toBeFalsy()
    const out = text(result)
    expect(out).toContain('Outline: rectangle, 50 × 30 mm, (100, 100)–(150, 130)')
    expect(out).toContain('- C1 100n Capacitor_SMD:C_0603_1608Metric @ (132, 118) 90° front, courtyard (131.27, 116.52)–(132.73, 119.48); pads 1=OUT 2=GND')
    expect(out).toContain('Nets (3): GND, IN, OUT')
  })

  it('edits a board atomically: a failing batch writes nothing', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const path = fixtureBoard('rc_board')
    const before = readFileSync(path, 'utf8')
    const result = await runTool(ctx, 'kicad_edit_pcb', {
      path,
      operations: [{ op: 'move_footprint', reference: 'R1', x: 121, y: 110 }, { op: 'add_track', points: ['J1:1', 'R1:2'] }],
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/operation 1 \(add_track\) failed, nothing was written: R1:2 is on net 'OUT', not 'IN'/)
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  it.runIf(hasKiCadCli())('read → route → DRC: KiCad counts the unrouted connections', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const path = fixtureBoard('rc_board')
    expect(text(await runTool(ctx, 'kicad_read_pcb', { path }))).toContain('DRC by KiCad 10.0')
    const edit = await runTool(ctx, 'kicad_edit_pcb', {
      path,
      operations: [
        { op: 'add_track', points: ['J1:1', [110, 110], 'R1:1'] },
        { op: 'set_net_class', name: 'Power', nets: ['GND'], track_width: 0.5 },
      ],
    })
    expect(edit.isError).toBeFalsy()
    expect(text(edit)).toMatch(/^Wrote .*rc_board\.kicad_pcb and .*rc_board\.kicad_pro \(2 operations\)\.\n- track on IN \(F\.Cu, 0\.2 mm, 2 segment\(s\)/)
    const drc = await runTool(ctx, 'kicad_drc', { path })
    expect(text(drc)).toMatch(/DRC by KiCad .*: FAILED — 3 error\(s\), 0 warning\(s\), 3 unrouted/)
  })

  it('searches symbol libraries', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const result = await runTool(ctx, 'kicad_search_symbols', { query: 'resistor', library: 'Device', limit: 5 })
    expect(text(result)).toContain('Device:R')
  })
})

describe('formatCheck', () => {
  it('lists violations with positions', () => {
    const out = toolKiCad.formatCheck({
      kind: 'erc', passed: false, kicad_version: '10.0.7', counts: { error: 1, warning: 0, exclusion: 0, total: 1 }, by_type: {},
      violations: [{ severity: 'error', type: 'pin_not_connected', description: 'Pin not connected', items: [{ description: 'R1 Pin 1', pos: { x: 1.234, y: 5 } }] }],
    })
    expect(out).toBe('ERC by KiCad 10.0.7: FAILED — 1 error(s), 0 warning(s)\n- [error] pin_not_connected: Pin not connected — R1 Pin 1 @ (1.23, 5)')
  })
})
