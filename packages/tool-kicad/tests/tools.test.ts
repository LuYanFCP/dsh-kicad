import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as toolKiCad from '../src/index.ts'
import { bootKiCad, demoProject, disposeAll, fixtureBoard, fixtureProject, hasKiCadCli, runTool, text, unrouteOneTrack } from '../../../test/harness.ts'

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

  it.runIf(hasKiCadCli())('creates a board from its schematic, then finds it in sync', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const schematic = fixtureProject('usb_attiny')
    const board = schematic.replace(/\.kicad_sch$/, '.kicad_pcb')
    const dry = await runTool(ctx, 'kicad_update_pcb', { schematic, dry_run: true })
    expect(text(dry)).toMatch(/^Dry run, nothing written: creating .*usb_attiny\.kicad_pcb from .*usb_attiny\.kicad_sch would make 17 change\(s\) \(created 1, added 15, outline 1\)\./)
    expect(existsSync(board)).toBe(false)
    const created = await runTool(ctx, 'kicad_update_pcb', { schematic })
    expect(created.isError).toBeFalsy()
    const out = text(created)
    expect(out).toMatch(/^Created .*usb_attiny\.kicad_pcb from .*usb_attiny\.kicad_sch: 17 change\(s\) \(created 1, added 15, outline 1\)\./)
    expect(out).toContain('- added U1 (Package_SO:SOIC-8_5.3x5.3mm_P1.27mm) at (')
    expect(out).toMatch(/Board: 15 footprint\(s\), 2 copper layers, format \d+, outline/)
    expect(out).toContain('Schematic parity (KiCad DRC): 0 issues.')
    const before = readFileSync(board, 'utf8')
    const again = await runTool(ctx, 'kicad_update_pcb', { schematic })
    expect(text(again)).toMatch(/is in sync with .*usb_attiny\.kicad_sch: nothing to change, nothing written\.\n/)
    expect(readFileSync(board, 'utf8')).toBe(before)
  })

  it.runIf(hasKiCadCli())('refuses with the REF:PINs to fix and writes nothing', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const schematic = fixtureProject('usb_attiny')
    await runTool(ctx, 'kicad_edit_schematic', { path: schematic, operations: [{ op: 'set_footprint', reference: 'U1', footprint: 'Package_TO_SOT_SMD:SOT-23' }] })
    const refused = await runTool(ctx, 'kicad_update_pcb', { schematic })
    expect(refused.isError).toBe(true)
    expect(text(refused)).toMatch(/refused, nothing was written[\s\S]*U1:4, U1:5, U1:6, U1:7, U1:8: no pad with that number on Package_TO_SOT_SMD:SOT-23/)
    expect(existsSync(schematic.replace(/\.kicad_sch$/, '.kicad_pcb'))).toBe(false)
  })

  it('searches symbol libraries', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const result = await runTool(ctx, 'kicad_search_symbols', { query: 'resistor', library: 'Device', limit: 5 })
    expect(text(result)).toContain('Device:R')
  })
})

describe('kicad_export_fab and kicad_fab_preset', () => {
  const demo = hasKiCadCli() ? demoProject('pic_programmer') : undefined

  it('ships the presets the sidecar has', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const listed = await ctx.kicad.run<{ presets: Array<{ name: string }> }>('fab_preset', {})
    expect(listed.presets.map(p => p.name)).toEqual([...toolKiCad.FAB_PRESETS])
  })

  it.runIf(demo)('exports a routed board and refuses one with an unrouted connection', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const pcb = join(demo!, 'pic_programmer.kicad_pcb')
    const done = await runTool(ctx, 'kicad_export_fab', { pcb, preset: 'jlcpcb', preview: false })
    expect(done.isError).toBeFalsy()
    const out = text(done)
    expect(out).toMatch(/^Fab files exported for .*pic_programmer\.kicad_pcb \(JLCPCB standard 1-2 layer, 1 oz\)\./)
    expect(out).toMatch(/Gate: PASSED by KiCad .* — 0 DRC errors .*0 unrouted, schematic parity clean, within JLCPCB/)
    for (const layer of ['F.Cu', 'B.Cu', 'F.Mask', 'B.Mask', 'F.SilkS', 'B.SilkS', 'F.Paste', 'B.Paste', 'Edge.Cuts']) expect(out).toContain(` — ${layer}\n`)
    expect(out).toMatch(/pic_programmer-PTH\.drl — drill, 244 hole\(s\)/)
    expect(out).toContain('assembly/pic_programmer-cpl-jlc.csv — cpl')
    const meta = done.meta as { kind: string, exported: boolean, zip: string, gate: { passed: boolean }, layers: string[] }
    expect(meta).toMatchObject({ kind: 'fab', exported: true, gate: { passed: true } })
    expect(existsSync(meta.zip)).toBe(true)
    expect(meta.layers).toHaveLength(9)

    unrouteOneTrack(pcb)
    const refused = await runTool(ctx, 'kicad_export_fab', { pcb, output_dir: join(demo!, 'fab-refused') })
    expect(refused.isError).toBeFalsy()
    expect(text(refused)).toMatch(/^Fab export REFUSED for .*nothing was written\.\n- 1 unrouted connection\(s\)\nDetails:\n- \[error\] unconnected_items: Missing connection/)
    expect(text(refused)).toContain('pass force: true')
    expect(refused.meta).toMatchObject({ kind: 'fab', exported: false, refused: true, gate: { passed: false, unrouted: 1 } })
    expect(existsSync(join(demo!, 'fab-refused'))).toBe(false)
  })

  it.runIf(demo)('previews a preset as a dry run, then applies it', async () => {
    const ctx = await bootKiCad([toolKiCad])
    const pro = join(demo!, 'pic_programmer.kicad_pro')
    const before = readFileSync(pro, 'utf8')
    const dry = await runTool(ctx, 'kicad_fab_preset', { path: join(demo!, 'pic_programmer.kicad_pcb'), preset: 'pcbway', dry_run: true })
    expect(text(dry)).toMatch(/^Dry run: applying PCBWay standard PCB, 1 oz to .*pic_programmer\.kicad_pro would change:\n- board rule min_clearance: 0\.0 -> 0\.1/)
    expect(readFileSync(pro, 'utf8')).toBe(before)
    const applied = await runTool(ctx, 'kicad_fab_preset', { path: pro, preset: 'pcbway' })
    expect(text(applied)).toMatch(/^Applied PCBWay/)
    expect(JSON.parse(readFileSync(pro, 'utf8')).board.design_settings.rules.min_via_annular_width).toBe(0.15)
    expect(readFileSync(join(demo!, 'pic_programmer.kicad_dru'), 'utf8')).toContain('PCBWay: pad hole to pad hole')
    expect(text(await runTool(ctx, 'kicad_fab_preset', { path: pro, preset: 'pcbway' }))).toMatch(/already uses the PCBWay standard PCB, 1 oz rules/)
  })
})

describe('formatFab', () => {
  const gate = { passed: true, blocking: [], kicad_version: '10.0.7', drc: { errors: 0, warnings: 2, by_type: {} }, unrouted: 0, parity: { checked: false, issues: 0, note: 'no schematic next to the board, so parity was not checked' }, violations: [] }
  it('says when the gate was overridden', () => {
    const out = toolKiCad.formatFab({
      pcb: '/p/b.kicad_pcb', preset: null, output_dir: '/p/fab/kicad', exported: true, refused: false, forced: true, zip: '/p/fab/kicad/b-fab.zip',
      gate: { ...gate, passed: false, blocking: ['2 DRC error(s): clearance x2'] },
      board: { width_mm: 50, height_mm: 30, copper_layers: 2, thickness_mm: 1.6 },
      files: [{ path: 'b-F_Cu.gtl', kind: 'gerber', bytes: 1, layer: 'F.Cu' }, { path: 'b.drl', kind: 'drill', bytes: 1, holes: 12, tools: 3 }],
      warnings: ['FORCED: exported although the fab gate failed (2 DRC error(s): clearance x2).'],
    })
    expect(out).toBe([
      'Fab files exported WITH force for /p/b.kicad_pcb (generic KiCad output). The gate failed: this board is not ready to order.',
      'Gate: FAILED — 2 DRC error(s): clearance x2',
      'Zip: /p/fab/kicad/b-fab.zip',
      'Board: 50 × 30 mm, 2 copper layer(s), 1.6 mm thick',
      'Files in /p/fab/kicad:',
      '- b-F_Cu.gtl — F.Cu',
      '- b.drl — drill, 12 hole(s), 3 tool(s)',
      'Warnings:',
      '- FORCED: exported although the fab gate failed (2 DRC error(s): clearance x2).',
    ].join('\n'))
    expect(toolKiCad.formatFabGate(gate)).toBe('PASSED by KiCad 10.0.7 — 0 DRC errors (2 warning(s)), 0 unrouted, schematic parity not checked (no schematic next to the board, so parity was not checked)')
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

describe('formatSync', () => {
  const base = {
    schematic: '/p/a.kicad_sch', pcb: '/p/a.kicad_pcb', created: false, dry_run: false, written: true,
    board: { format: 20260206, copper_layers: ['F.Cu', 'B.Cu'], footprints: 4, outline: [100, 100, 150, 130] as [number, number, number, number] },
  }

  it('reports changes, staged and flagged footprints, and the parity count', () => {
    const out = toolKiCad.formatSync({
      ...base,
      changes: ['R2: Value \'330\' → \'470\'', 'added R6 (Resistor_SMD:R_0603_1608Metric) at (156.48, 100.73), staged right of the board for placement'],
      counts: { field: 1, added: 1 },
      flagged: ['R5 (Resistor_SMD:R_0603_1608Metric): no symbol at /x; kept (delete_removed: true deletes it)'],
      staged: [{ reference: 'R6', footprint: 'Resistor_SMD:R_0603_1608Metric', at: [156.48, 100.73] }],
      parity: { total: 1, by_type: { extra_footprint: 1 } },
    })
    expect(out.split('\n')).toEqual([
      'Updated /p/a.kicad_pcb from /p/a.kicad_sch: 2 change(s) (field 1, added 1).',
      '- R2: Value \'330\' → \'470\'',
      '- added R6 (Resistor_SMD:R_0603_1608Metric) at (156.48, 100.73), staged right of the board for placement',
      'Footprints without a symbol, kept (1):',
      '- R5 (Resistor_SMD:R_0603_1608Metric): no symbol at /x; kept (delete_removed: true deletes it)',
      'Staged right of the board outline, to be placed: R6 @ (156.48, 100.73)',
      'Board: 4 footprint(s), 2 copper layers, format 20260206, outline (100, 100)–(150, 130)',
      'Schematic parity (KiCad DRC): 1 issue(s) (extra_footprint×1). Footprints without a symbol go with delete_removed: true. Details: kicad_drc with schematic_parity.',
    ])
  })

  it('caps long change lists', () => {
    const changes = Array.from({ length: 100 }, (_, i) => `added R${i + 1}`)
    const out = toolKiCad.formatSync({ ...base, created: true, changes, counts: { added: 100 }, flagged: [], staged: [] })
    expect(out).toContain('- added R80\n… 20 more\n')
    expect(out).not.toContain('R81')
  })
})
