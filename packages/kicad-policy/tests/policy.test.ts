import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { type Context, Service } from '@deepseek-ai/cordis'
import * as toolKiCad from 'dsh-tool-kicad'
import * as policy from '../src/index.ts'
import { bootKiCad, disposeAll, fixtureProject, hasKiCadCli, runTool, text } from '../../../test/harness.ts'

afterEach(disposeAll)

const config = (over: Record<string, unknown> = {}) => ({
  approval: 'allow', restrictToWorkspace: true, extraRoots: [], autoErc: true, autoRender: false, guidance: true, projectContext: true, ...over,
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

  it('describes edits for the approval card', () => {
    const d = policy.describeEdit('kicad_edit_schematic', { path: '/p/a.kicad_sch', operations: [{ op: 'add_symbol' }, { op: 'add_symbol' }, { op: 'connect_pins' }] })
    expect(d.displayReason).toEqual({ en: 'Edit a.kicad_sch: 3 operation(s) — add_symbol×2, connect_pins', zh: '修改 a.kicad_sch：3 项操作 — add_symbol×2, connect_pins' })
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
