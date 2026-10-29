import { existsSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type Context, Service } from '@deepseek-ai/cordis'
import * as toolKiCad from 'dsh-tool-kicad'
import * as policy from '../src/index.ts'
import { bootKiCad, disposeAll, fixtureBoard, fixtureProject, hasKiCadCli, runTool, text } from '../../../test/harness.ts'

afterEach(disposeAll)

const config = (over: Record<string, unknown> = {}) => ({
  approval: 'allow', restrictToWorkspace: true, extraRoots: [], autoErc: true, autoDrc: true, autoRender: false, guidance: true, projectContext: true, ...over,
})

const fix = [{ op: 'connect_pin_to_net', pin: 'R1:1', net: 'VIN', kind: 'global_label' }, { op: 'no_connect_pin', pin: 'R1:2' }]

describe('dsh-kicad-policy', () => {
  it('guard: denies writes outside the project but allows reads', async () => {
    // Without an agent the policy falls back to the process cwd (the repository), so /tmp is outside.
    const ctx = await bootKiCad([toolKiCad], [policy, config()])
    const path = fixtureProject('rc_filter')
    const before = readFileSync(path, 'utf8')
    const edit = await runTool(ctx, 'kicad_edit_schematic', { path, operations: [{ op: 'set_value', reference: 'R1', value: '1k' }] })
    expect(edit.isError).toBe(true)
    expect(text(edit)).toMatch(/may only write inside the project directory/)
    expect(readFileSync(path, 'utf8')).toBe(before)
    const read = await runTool(ctx, 'kicad_read_schematic', { path })
    expect(read.isError).toBeFalsy()
  })

  it('ask: a design edit without an approval channel is denied, not executed', async () => {
    const path = fixtureProject('rc_filter')
    const ctx = await bootKiCad([toolKiCad], [policy, config({ approval: 'ask', extraRoots: [dirname(path)] })])
    const before = readFileSync(path, 'utf8')
    const edit = await runTool(ctx, 'kicad_edit_schematic', { path, operations: [{ op: 'set_value', reference: 'R1', value: '1k' }] })
    expect(edit.isError).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe(before)
    // Outside the workspace the edit is denied before any approval prompt.
    const outside = await runTool(ctx, 'kicad_edit_schematic', { path: '/etc/x.kicad_sch', operations: [{ op: 'set_value', reference: 'R1', value: '1k' }] })
    expect(text(outside)).toMatch(/may only write inside the project directory/)
    // Dry runs need no approval.
    const dry = await runTool(ctx, 'kicad_edit_schematic', { path, dry_run: true, operations: [{ op: 'set_value', reference: 'R1', value: '1k' }] })
    expect(dry.isError).toBeFalsy()
  })

  it.runIf(hasKiCadCli())('appends KiCad ERC after an edit', async () => {
    const path = fixtureProject('erc_errors')
    const ctx = await bootKiCad([toolKiCad], [policy, config({ extraRoots: [dirname(path)] })])
    const edit = await runTool(ctx, 'kicad_edit_schematic', { path, operations: [fix[0]] })
    expect(edit.isError).toBeFalsy()
    // One pin is still open: KiCad must say so in the same result.
    expect(text(edit)).toMatch(/Automatic ERC by KiCad .*FAILED — 1 error\(s\)[\s\S]*pin_not_connected/)
    const done = await runTool(ctx, 'kicad_edit_schematic', { path, operations: [fix[1]] })
    expect(text(done)).toMatch(/Automatic ERC by KiCad .*PASSED/)
  })

  it('board edits are design writes: guarded, and asked for under approval: ask', async () => {
    const path = fixtureBoard('rc_board')
    const before = readFileSync(path, 'utf8')
    const op = [{ op: 'move_footprint', reference: 'R1', x: 121, y: 110 }]
    const guarded = await bootKiCad([toolKiCad], [policy, config()])
    const outside = await runTool(guarded, 'kicad_edit_pcb', { path, operations: op })
    expect(text(outside)).toMatch(/kicad_edit_pcb may only write inside the project directory/)
    const asking = await bootKiCad([toolKiCad], [policy, config({ approval: 'ask', extraRoots: [dirname(path)] })])
    const asked = await runTool(asking, 'kicad_edit_pcb', { path, operations: op })
    expect(asked.isError).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe(before)
    const read = await runTool(guarded, 'kicad_read_pcb', { path, drc: false })
    expect(read.isError).toBeFalsy()
  })

  it.runIf(hasKiCadCli())('appends KiCad DRC after a board edit (autoDrc)', async () => {
    const path = fixtureBoard('rc_board')
    const ctx = await bootKiCad([toolKiCad], [policy, config({ extraRoots: [dirname(path)] })])
    const route = await runTool(ctx, 'kicad_edit_pcb', { path, operations: [{ op: 'add_track', points: ['J1:1', [110, 110], 'R1:1'] }] })
    expect(route.isError).toBeFalsy()
    expect(text(route)).toMatch(/Automatic DRC by KiCad .*FAILED — 3 error\(s\), 0 warning\(s\), 3 unrouted[\s\S]*unconnected_items/)
    // A GND pour (refilled for the check) plus a via from C1:2 joins GND without a track.
    const pour = await runTool(ctx, 'kicad_edit_pcb', {
      path,
      operations: [
        { op: 'add_track', points: ['C1:2', [134, 117.225]] },
        { op: 'add_via', x: 134, y: 117.225, net: 'GND' },
        { op: 'add_zone', net: 'GND', layer: 'B.Cu' },
      ],
    })
    expect(text(pour)).toMatch(/Automatic DRC by KiCad .*FAILED — 2 error\(s\), 0 warning\(s\), 2 unrouted/)
    expect(policy.projectContext(dirname(path), undefined)).toContain('- boards: rc_board.kicad_pcb')
    const off = await bootKiCad([toolKiCad], [policy, config({ autoDrc: false, extraRoots: [dirname(path)] })])
    const quiet = await runTool(off, 'kicad_edit_pcb', { path, operations: [{ op: 'add_text', text: 'v1', x: 140, y: 104 }] })
    expect(text(quiet)).not.toMatch(/Automatic DRC/)
  })

  it.runIf(hasKiCadCli())('appends KiCad DRC after a fab preset changes the rules (autoDrc)', async () => {
    const path = fixtureBoard('rc_board')
    const ctx = await bootKiCad([toolKiCad], [policy, config({ extraRoots: [dirname(path)] })])
    const dry = await runTool(ctx, 'kicad_fab_preset', { path, preset: 'jlcpcb', dry_run: true })
    expect(text(dry)).toMatch(/^Dry run: applying JLCPCB/)
    expect(text(dry)).not.toMatch(/Automatic DRC/)
    const pro = path.replace(/\.kicad_pcb$/, '.kicad_pro')
    const applied = await runTool(ctx, 'kicad_fab_preset', { path: pro, preset: 'jlcpcb' })
    expect(applied.isError).toBeFalsy()
    expect(text(applied)).toMatch(/^Applied JLCPCB[\s\S]*Automatic DRC by KiCad .* on .*rc_board\.kicad_pcb: (PASSED|FAILED) — \d+ error\(s\), \d+ warning\(s\), \d+ unrouted/)
    expect(policy.projectContext(dirname(path), undefined)).toContain('- boards: rc_board.kicad_pcb')
    const again = await runTool(ctx, 'kicad_fab_preset', { path, preset: 'jlcpcb' })
    expect(text(again)).toMatch(/already uses the JLCPCB/)
    expect(text(again)).not.toMatch(/Automatic DRC/)
  })

  it('board sync is a design write: guarded, and asked for under approval: ask', async () => {
    const schematic = fixtureProject('usb_attiny')
    const board = schematic.replace(/\.kicad_sch$/, '.kicad_pcb')
    const guarded = await bootKiCad([toolKiCad], [policy, config()])
    const outside = await runTool(guarded, 'kicad_update_pcb', { schematic })
    expect(text(outside)).toMatch(/kicad_update_pcb may only write inside the project directory/)
    const elsewhere = await runTool(guarded, 'kicad_update_pcb', { schematic: '/etc/x.kicad_sch', pcb: '/etc/x.kicad_pcb' })
    expect(text(elsewhere)).toMatch(/may only write inside the project directory/)
    const asking = await bootKiCad([toolKiCad], [policy, config({ approval: 'ask', extraRoots: [dirname(schematic)] })])
    const asked = await runTool(asking, 'kicad_update_pcb', { schematic })
    expect(asked.isError).toBe(true)
    expect(existsSync(board)).toBe(false)
  })

  it.runIf(hasKiCadCli())('appends KiCad DRC with the schematic parity count after a board sync (autoDrc)', async () => {
    const schematic = fixtureProject('usb_attiny')
    const ctx = await bootKiCad([toolKiCad], [policy, config({ extraRoots: [dirname(schematic)] })])
    const synced = await runTool(ctx, 'kicad_update_pcb', { schematic })
    expect(synced.isError).toBeFalsy()
    // KiCad 10 files parity findings as warnings: the verdict counts them on their own.
    expect(text(synced)).toMatch(/Automatic DRC by KiCad .*FAILED — 39 error\(s\), 0 warning\(s\), 39 unrouted, 0 schematic parity issue\(s\)/)
    expect(policy.projectContext(dirname(schematic), undefined)).toContain('- boards: usb_attiny.kicad_pcb')
    // A flagged footprint (its symbol removed) shows up in the parity count.
    await runTool(ctx, 'kicad_edit_schematic', { path: schematic, operations: [{ op: 'remove_symbol', reference: 'R5' }] })
    const flagged = await runTool(ctx, 'kicad_update_pcb', { schematic })
    expect(text(flagged)).toMatch(/1 schematic parity issue\(s\)[\s\S]*extra_footprint/)
    const off = await bootKiCad([toolKiCad], [policy, config({ autoDrc: false, extraRoots: [dirname(schematic)] })])
    const quiet = await runTool(off, 'kicad_update_pcb', { schematic, delete_removed: true })
    expect(text(quiet)).toContain('- removed R5')
    expect(text(quiet)).not.toMatch(/Automatic DRC/)
  })

  it('describes edits for the approval card', () => {
    const d = policy.describeEdit('kicad_edit_schematic', { path: '/p/a.kicad_sch', operations: [{ op: 'add_symbol' }, { op: 'add_symbol' }, { op: 'connect_pins' }] })
    expect(d.displayReason).toEqual({ en: 'Edit a.kicad_sch: 3 operation(s) — add_symbol×2, connect_pins', zh: '修改 a.kicad_sch：3 项操作 — add_symbol×2, connect_pins' })
    const preset = policy.describeEdit('kicad_fab_preset', { path: '/p/board.kicad_pcb', preset: 'jlcpcb' })
    expect(preset).toEqual({ reason: 'apply jlcpcb design rules to /p/board.kicad_pcb', displayReason: { en: 'Apply jlcpcb design rules to board.kicad_pcb', zh: '将 jlcpcb 设计规则应用到 board.kicad_pcb' } })
    const sync = policy.describeEdit('kicad_update_pcb', { schematic: '/p/a.kicad_sch', delete_removed: true })
    expect(sync.displayReason).toEqual({ en: 'Update board a.kicad_pcb from a.kicad_sch, deleting footprints whose symbol is gone', zh: '根据 a.kicad_sch 更新电路板 a.kicad_pcb，并删除原理图中已不存在的封装' })
    expect(sync.reason).toBe('update a.kicad_pcb from /p/a.kicad_sch (delete_removed)')
    const route = policy.describeEdit('kicad_autoroute', { pcb: '/p/b.kicad_pcb', exclude_nets: ['GND'] })
    expect(route).toEqual({ reason: 'autoroute /p/b.kicad_pcb exclude_nets=GND', displayReason: { en: 'Autoroute board b.kicad_pcb with Freerouting, except GND', zh: '用 Freerouting 自动布线 b.kicad_pcb，跳过 GND' } })
    expect(policy.describeEdit('kicad_autoroute', { pcb: '/p/b.kicad_pcb', nets: ['/SCK', '/MOSI'] }).displayReason.en).toBe('Autoroute board b.kicad_pcb with Freerouting, only /SCK, /MOSI')
  })

  it('autorouting is a design write: asked for under approval: ask, and in the working rules', async () => {
    const pcb = fixtureBoard('rc_board')
    const before = readFileSync(pcb, 'utf8')
    const asking = await bootKiCad([toolKiCad], [policy, config({ approval: 'ask', extraRoots: [dirname(pcb)] })])
    const asked = await runTool(asking, 'kicad_autoroute', { pcb })
    expect(asked.isError).toBe(true)
    expect(readFileSync(pcb, 'utf8')).toBe(before)
    expect(policy.GUIDANCE).toMatch(/kicad_autoroute routes the rest[\s\S]*\/kicad-install freerouting/)
    expect(policy.GUIDANCE).toMatch(/Boards \(load the kicad-pcb-layout skill/)
  })

  it('the working rules make a drawn schematic block by block, finished only with every part in a titled block', () => {
    expect(policy.GUIDANCE).toMatch(/Draw a schematic block by block[\s\S]*plan the blocks before editing/)
    expect(policy.GUIDANCE).toMatch(/one block per kicad_edit_schematic call[\s\S]*explicit references[\s\S]*finish the call with add_block\{title, references\}/)
    expect(policy.GUIDANCE).toMatch(/title each block with its job and main part[\s\S]*add_text/)
    expect(policy.GUIDANCE).toMatch(/names the parts outside every block: a design you draw is finished only when there are none/)
    expect(policy.GUIDANCE).toMatch(/reorganise an unframed sheet into blocks only when the user asks/)
  })

  it('project context lists KiCad files and the last ERC', () => {
    const path = fixtureProject('rc_filter')
    const memory = new policy.ErcMemory()
    memory.remember(path, { passed: false, counts: { error: 2, warning: 0, exclusion: 0, total: 2 }, by_type: { pin_not_connected: 2 } })
    const text = policy.projectContext(dirname(path), memory)
    expect(text).toContain('- projects: rc_filter.kicad_pro')
    expect(text).toContain('- last ERC of rc_filter.kicad_sch: FAILED (2 errors, 0 warnings: pin_not_connected)')
    expect(policy.projectContext('/proc/self/fdinfo')).toBe('')
  })

  it('project context lists the board and its last DRC', () => {
    const path = fixtureBoard('rc_board')
    const memory = new policy.ErcMemory()
    memory.remember(path, { passed: false, counts: { error: 4, warning: 1, exclusion: 0, total: 5 }, by_type: { unconnected_items: 4, silk_overlap: 1 }, unrouted: 4 })
    const text = policy.projectContext(dirname(path), memory)
    expect(text).toContain('- boards: rc_board.kicad_pcb')
    expect(text).toContain('- last DRC of rc_board.kicad_pcb: FAILED (4 errors, 1 warnings, 4 unrouted: unconnected_items, silk_overlap)')
  })
})

describe('session permissions', () => {
  const stubs = (approval: 'ask' | 'never', sandbox: string) => {
    class Approval extends Service { constructor(ctx: Context) { super(ctx, 'approval') } effectivePolicy() { return approval } }
    class Sandbox extends Service { constructor(ctx: Context) { super(ctx, 'sandboxPolicy') } resolve() { return { mode: sandbox, root: '/' } } }
    return [[Approval], [Sandbox]] as Array<[unknown]>
  }
  const agent = { session: {}, options: {} }
  const op = [{ op: 'set_value', reference: 'R1', value: '22k' }]

  it('denies design edits in a read-only session', async () => {
    const path = fixtureProject('rc_filter')
    const ctx = await bootKiCad(...stubs('ask', 'read-only'), [toolKiCad], [policy, config({ approval: 'follow', extraRoots: [dirname(path)] })])
    const r = await runTool(ctx, 'kicad_edit_schematic', { path, operations: op }, { agent })
    expect(r.isError).toBe(true)
    expect(text(r)).toMatch(/read-only/)
  })

  it('follow (default): writes without an extra prompt in workspace-write', async () => {
    const path = fixtureProject('rc_filter')
    const ctx = await bootKiCad(...stubs('ask', 'workspace-write'), [toolKiCad], [policy, config({ approval: 'follow', autoErc: false, extraRoots: [dirname(path)] })])
    const r = await runTool(ctx, 'kicad_edit_schematic', { path, operations: op }, { agent })
    expect(r.isError).toBeFalsy()
    expect(readFileSync(path, 'utf8')).toContain('"22k"')
  })

  it('ask: no prompt (so no rejection) when the session never asks', async () => {
    const path = fixtureProject('rc_filter')
    const ctx = await bootKiCad(...stubs('never', 'danger-full-access'), [toolKiCad], [policy, config({ approval: 'ask', autoErc: false, extraRoots: [dirname(path)] })])
    const r = await runTool(ctx, 'kicad_edit_schematic', { path, operations: op }, { agent })
    expect(r.isError).toBeFalsy()
    expect(readFileSync(path, 'utf8')).toContain('"22k"')
  })
})
