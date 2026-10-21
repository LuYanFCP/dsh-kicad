import { dirname } from 'node:path'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { afterEach, describe, expect, it } from 'vitest'
import * as skills from '../src/index.ts'
import { bootKiCad, disposeAll, fixtureProject, hasKiCadCli } from '../../../test/harness.ts'

afterEach(disposeAll)

const invocation = (rawInput: string) => ({ rawInput, signal: new AbortController().signal, attachments: [], agent: undefined, commandId: 'c1' }) as never

describe('kicad skills', () => {
  it('registers packaged skills with the dsh skill registry', async () => {
    const ctx = await bootKiCad([SkillRegistry], [skills, { commands: false }])
    const names = (await ctx.skills.list()).map(s => s.name).filter(n => n.startsWith('kicad-'))
    expect(names).toEqual(['kicad-agent-workflow', 'kicad-design-brief', 'kicad-erc-triage', 'kicad-schematic-design'])
    const body = await ctx.skills.get('kicad-erc-triage')
    expect(body?.content).toContain('power_pin_not_driven')
    expect(body?.content.startsWith('---')).toBe(false)
  })

  it('keeps every SKILL.md under the 8192-character pruning threshold', async () => {
    const provider = skills.createSkillProvider()
    for (const c of await provider.list({}) as Array<{ name: string }>) {
      const def = await provider.get(c as never, {})
      expect(def?.content.length, c.name).toBeLessThan(8192)
    }
  })
})

describe('kicad commands', () => {
  it('finds the root schematic next to the .kicad_pro', () => {
    const path = fixtureProject('rc_filter')
    expect(skills.targetFile(dirname(path), '', '.kicad_sch')).toBe(path)
    expect(() => skills.targetFile(dirname(path), '', '.kicad_pcb')).toThrow(/no .kicad_pcb file/)
  })

  it.runIf(hasKiCadCli())('/erc and /bom report KiCad results; /drc fails cleanly without a board', async () => {
    const ctx = await bootKiCad()
    const commands = Object.fromEntries(skills.createCommands(ctx).map(c => [c.name, c]))
    const path = fixtureProject('erc_errors')
    const erc = await commands.erc!.handler(invocation(path))
    expect(erc).toMatchObject({ kind: 'success' })
    expect((erc as { text: string }).text).toMatch(/ERC by KiCad .*FAILED — 2 error/)
    const bom = await commands.bom!.handler(invocation(fixtureProject('rc_filter')))
    expect((bom as { text: string }).text).toMatch(/\| R1 \| 10k \|/)
    const drc = await commands.drc!.handler(invocation(`${dirname(path)}/missing.kicad_pcb`))
    expect(drc.kind).toBe('error')
  })

  it('formats an empty BOM', () => {
    expect(skills.formatBom(['Refs'], [])).toBe('BOM is empty.')
  })
})

describe('/kicad-design', () => {
  it('queues the idea with the brief-first workflow, in the user language', async () => {
    const ctx = await bootKiCad()
    const command = skills.createCommands(ctx).find(c => c.name === 'kicad-design')!
    const sent: Array<{ content: Array<{ text: string }>, source: { kind: string } }> = []
    const agent = { followup: (m: never) => sent.push(m), session: undefined }
    const zh = await command.handler({ ...invocation('一个按键控制 LED 的 USB 小板'), agent } as never)
    expect(zh.kind).toBe('success')
    expect(sent[0]!.source.kind).toBe('user')
    expect(sent[0]!.content[0]!.text).toMatch(/^我想设计：一个按键控制 LED 的 USB 小板[\s\S]*kicad-design-brief[\s\S]*design-brief\.md/)
    await command.handler({ ...invocation('a USB board with a button and an LED'), agent } as never)
    expect(sent[1]!.content[0]!.text).toMatch(/^I want to design: a USB board/)
    const empty = await command.handler({ ...invocation('  '), agent } as never)
    expect(empty.kind).toBe('error')
  })

  it('ships the design-brief skill under the pruning threshold', async () => {
    const provider = skills.createSkillProvider()
    const names = (await provider.list({}) as Array<{ name: string }>).map(c => c.name)
    expect(names).toContain('kicad-design-brief')
  })
})

describe('/kicad-doctor and /kicad-install', () => {
  const option = (id: string, extra: Record<string, unknown> = {}) => ({
    id, label: id, steps: [[id]], command: `${id} install kicad`, needs_root: false, runnable: true, available: true, recommended: false, note: '', ...extra,
  })
  const missing = {
    ok: false, status: 'missing', summary: 'KiCad (kicad-cli) is not installed or was not found.', text: 'x',
    kicad: { cli: null, source: null, version: null, minimum: '8.0' },
    checks: [{ id: 'kicad_cli', label: 'kicad-cli', status: 'error', required: true, summary: 'kicad-cli was not found.', fix: 'Install it.' }],
    install: [option('dnf', { needs_root: true, runnable: false, command: 'sudo dnf install -y kicad' }), option('flatpak', { recommended: true })],
  }
  function fakeCtx(report: Record<string, unknown>) {
    const started: string[] = []
    let job: Record<string, unknown> | undefined
    const ctx = {
      get: () => undefined,
      kicad: {
        doctor: async () => report,
        install: async (id: string) => {
          const o = (report.install as Array<{ id: string, needs_root: boolean, command: string }>).find(x => x.id === id)
          if (!o) throw new Error('unknown install option')
          if (o.needs_root) throw new Error(`needs administrator rights:\n${o.command}`)
          started.push(id)
          job = { id: 1, option: id, label: id, command: o.command, state: 'running', phase: 'installing', step: 1, steps: 1, startedAt: 0, log: ['$ x'] }
          return job
        },
        installer: { get job() { return job }, cancel: () => job?.state === 'running' },
      },
    }
    return { ctx: ctx as never, started }
  }

  it('/kicad-doctor prints each check with its fix, or JSON for the UI', async () => {
    const { ctx } = fakeCtx(missing)
    const command = skills.createCommands(ctx).find(c => c.name === 'kicad-doctor')!
    const text = (await command.handler(invocation('')) as { text: string }).text
    expect(text).toContain('✗ **kicad-cli**: kicad-cli was not found.')
    expect(text).toContain('fix: Install it.')
    expect(text).toContain('/kicad-install')
    const json = JSON.parse((await command.handler(invocation('--json')) as { text: string }).text)
    expect(json.status).toBe('missing')
  })

  it('/kicad-install lists the options and needs --yes to run one', async () => {
    const { ctx, started } = fakeCtx(missing)
    const plan = await skills.installCommand(ctx, '')
    expect(plan).toContain('sudo dnf install -y kicad')
    expect(plan).toContain('needs administrator rights: run it yourself')
    expect(plan).toContain('`/kicad-install flatpak --yes` runs:')
    expect(await skills.installCommand(ctx, 'flatpak')).toMatch(/This will run:[\s\S]*flatpak install kicad[\s\S]*--yes/)
    expect(started).toEqual([])
    await expect(skills.installCommand(ctx, 'dnf --yes')).rejects.toThrow(/administrator rights/)
    expect(JSON.parse(await skills.installCommand(ctx, 'status --json'))).toEqual({ job: null })
    const run = JSON.parse(await skills.installCommand(ctx, 'start flatpak --yes --json'))
    expect(run.job.option).toBe('flatpak')
    expect(started).toEqual(['flatpak'])
    expect(await skills.installCommand(ctx, 'status')).toMatch(/^flatpak: running — step 1\/1/)
    expect(JSON.parse(await skills.installCommand(ctx, 'cancel --json')).cancelled).toBe(true)
  })

  it('/kicad-install has nothing to do when KiCad is ready', async () => {
    const { ctx } = fakeCtx({ ...missing, ok: true, status: 'ok', summary: 'Ready: KiCad 10.0.7.', install: [] })
    expect(await skills.installCommand(ctx, '')).toBe('Ready: KiCad 10.0.7.\nNothing to install.')
  })
})
