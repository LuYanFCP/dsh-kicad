import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { afterEach, describe, expect, it } from 'vitest'
import * as skills from '../src/index.ts'
import { bootKiCad, demoProject, disposeAll, fixtureBoard, fixtureProject, hasKiCadCli, unrouteOneTrack } from '../../../test/harness.ts'

afterEach(disposeAll)

const invocation = (rawInput: string) => ({ rawInput, signal: new AbortController().signal, attachments: [], agent: undefined, commandId: 'c1' }) as never

describe('kicad skills', () => {
  it('registers packaged skills with the dsh skill registry', async () => {
    const ctx = await bootKiCad([SkillRegistry], [skills, { commands: false }])
    const names = (await ctx.skills.list()).map(s => s.name).filter(n => n.startsWith('kicad-'))
    expect(names).toEqual(['kicad-agent-workflow', 'kicad-design-brief', 'kicad-drc-triage', 'kicad-erc-triage', 'kicad-schematic-design'])
    const body = await ctx.skills.get('kicad-erc-triage')
    expect(body?.content).toContain('power_pin_not_driven')
    expect(body?.content.startsWith('---')).toBe(false)
  })

  it('ships DRC triage for the violation types kicad-cli reports, with the planned board edits', async () => {
    const ctx = await bootKiCad([SkillRegistry], [skills, { commands: false }])
    const drc = (await ctx.skills.list()).find(s => s.name === 'kicad-drc-triage')
    expect(drc?.description).toMatch(/DRC/)
    const body = (await ctx.skills.get('kicad-drc-triage'))!.content
    for (const type of ['clearance', 'courtyards_overlap', 'unconnected_items', 'track_width', 'hole_clearance', 'silk_over_copper', 'lib_footprint_mismatch', 'missing_footprint', 'extra_footprint', 'net_conflict', 'invalid_outline', 'shorting_items']) {
      expect(body, type).toContain(`\`${type}\``)
    }
    // Every `op{...}` the skill names is a real kicad_edit_pcb operation.
    const pcb = readFileSync(new URL('../../kicad-bridge/sidecar/src/dsh_kicad_sidecar/pcb.py', import.meta.url), 'utf8')
    const operations = new Set([...pcb.slice(pcb.indexOf('OPERATIONS')).matchAll(/^ {4}"([a-z_]+)": lambda/gm)].map(m => m[1]))
    const named = new Set([...body.matchAll(/`([a-z_]+)\{/g)].map(m => m[1]))
    expect([...named].filter(op => !operations.has(op))).toEqual([])
    for (const op of ['move_footprint', 'move_footprints', 'set_design_rules', 'set_net_class', 'add_track', 'add_via', 'add_zone', 'remove_item', 'set_reference_text']) {
      expect(named, op).toContain(op)
    }
    expect(body).toContain('kicad_read_pcb')
    expect(body).toContain('--refill-zones')
    expect(body).toMatch(/schematic_parity[\s\S]*\*\*warnings\*\*/)
    const workflow = (await ctx.skills.get('kicad-agent-workflow'))!.content
    expect(workflow).toMatch(/## Handing over to the board[\s\S]*0 ERC errors[\s\S]*footprint[\s\S]*kicad-drc-triage/)
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

  it('/kicad-render takes the viewer\'s --json marker off the path', async () => {
    const calls: Array<Record<string, unknown>> = []
    const ctx = { get: () => undefined, kicad: { run: async (_tool: string, args: Record<string, unknown>) => (calls.push(args), { svg: ['/p/.dsh-kicad/render/board/board.svg'] }) } }
    const render = skills.createCommands(ctx as never).find(c => c.name === 'kicad-render')!
    const out = await render.handler(invocation('hw/board.kicad_pcb --json'))
    expect(out.kind).toBe('success')
    expect(calls[0]).toMatchObject({ path: resolve('hw/board.kicad_pcb'), format: 'svg' })
    expect(JSON.parse((out as { text: string }).text).svg).toHaveLength(1)
  })

  it('/kicad-render --glb exports the 3D scene and --3d renders a KiCad 3D view with the camera options', async () => {
    const calls: Array<[string, Record<string, unknown>]> = []
    const ctx = { get: () => undefined, kicad: { run: async (tool: string, args: Record<string, unknown>) => (calls.push([tool, args]), tool === 'export_glb' ? { glb: '/p/b.glb', cached: true } : { png: ['/p/b-3d.png'], camera: { rotate: '-45,0,45' } }) } }
    const render = skills.createCommands(ctx as never).find(c => c.name === 'kicad-render')!
    const glb = await render.handler(invocation('hw/board.kicad_pcb --glb --force --json'))
    expect(calls[0]).toEqual(['export_glb', { path: resolve('hw/board.kicad_pcb'), force: true }])
    expect(JSON.parse((glb as { text: string }).text)).toEqual({ path: resolve('hw/board.kicad_pcb'), glb: '/p/b.glb', cached: true })
    const view = await render.handler(invocation('hw/my board.kicad_pcb --3d --side=front --rotate=-45,0,45 --zoom=2 --pivot=-1,0,0.5 --perspective --quality=high --width=640 --height=480 --json'))
    expect(calls[1]).toEqual(['render', { path: resolve('hw/my board.kicad_pcb'), view: '3d', side: 'front', rotate: '-45,0,45', zoom: 2, pivot: '-1,0,0.5', perspective: true, quality: 'high', width: 640, height: 480 }])
    expect(JSON.parse((view as { text: string }).text)).toMatchObject({ svg: [], png: ['/p/b-3d.png'] })
  })

  it('parses /kicad-render options, keeping negative angles as values', () => {
    expect(skills.renderArgs('')).toEqual({ path: '', kind: 'svg', force: false, camera: {} })
    expect(skills.renderArgs('b.kicad_pcb --3d --rotate=-30,-10,5').camera).toEqual({ rotate: '-30,-10,5' })
    expect(() => skills.renderArgs('b.kicad_pcb --3d --rotate')).toThrow(/--rotate needs a value, e.g. --rotate=-45,0,45/)
    expect(() => skills.renderArgs('b.kicad_pcb --3d --zoom=near')).toThrow(/--zoom must be a number/)
    expect(() => skills.renderArgs('b.kicad_pcb --rotate=-45,0,45')).toThrow(/camera options need --3d/)
    expect(() => skills.renderArgs('b.kicad_pcb --glb --3d')).toThrow(/either --glb/)
    expect(() => skills.renderArgs('b.kicad_pcb --3d --force')).toThrow(/--force goes with --glb/)
    expect(() => skills.renderArgs('b.kicad_pcb --fast')).toThrow(/unknown option --fast/)
  })

  it.runIf(hasKiCadCli())('/kicad-render --glb and --3d run kicad-cli through the sidecar', async () => {
    const board = fixtureBoard('rc_board')
    const ctx = await bootKiCad()
    const render = skills.createCommands(ctx).find(c => c.name === 'kicad-render')!
    const first = JSON.parse((await render.handler(invocation(`${board} --glb --json`)) as { text: string }).text)
    expect(first.cached).toBe(false)
    expect(readFileSync(first.glb).subarray(0, 4).toString()).toBe('glTF')
    expect(first.references.sort()).toEqual(['C1', 'J1', 'R1'])
    const again = JSON.parse((await render.handler(invocation(`${board} --glb --json`)) as { text: string }).text)
    expect(again.cached).toBe(true)
    const view = await render.handler(invocation(`${board} --3d --rotate=-45,0,45 --zoom=1.2 --width=320 --height=240 --json`))
    expect(view.kind).toBe('success')
    const png = JSON.parse((view as { text: string }).text).png[0] as string
    expect(png).toMatch(/rc_board-3d-top-r-45_0_45-z1\.2\.png$/)
    expect(existsSync(png)).toBe(true)
  })

  it('formats an empty BOM', () => {
    expect(skills.formatBom(['Refs'], [])).toBe('BOM is empty.')
  })
})

describe('/kicad-fab', () => {
  it('parses the board, preset, force and extra formats', () => {
    expect(skills.fabArgs('')).toEqual({ path: '', force: false, extras: [], json: false })
    expect(skills.fabArgs('hw/b.kicad_pcb --preset jlcpcb --force --step --odb --json'))
      .toEqual({ path: 'hw/b.kicad_pcb', preset: 'jlcpcb', force: true, extras: ['step', 'odb'], json: true })
    expect(skills.fabArgs('--preset=pcbway').preset).toBe('pcbway')
    expect(() => skills.fabArgs('--preset')).toThrow(/needs a fab house/)
    expect(() => skills.fabArgs('--gerber')).toThrow(/unknown option --gerber/)
    expect(() => skills.fabArgs('a.kicad_pcb b.kicad_pcb')).toThrow(/expected one board/)
  })

  const demo = hasKiCadCli() ? demoProject('pic_programmer') : undefined
  it.runIf(demo)('exports the project board, refuses it once a connection is unrouted, and stays in the working directory', async () => {
    const real = await bootKiCad()
    const ctx = { get: (name: string) => (name === 'workingDirectory' ? { get: () => demo } : undefined), kicad: real.kicad } as never
    const command = skills.createCommands(ctx).find(c => c.name === 'kicad-fab')!
    const run = async (raw: string) => await command.handler({ ...invocation(raw), agent: { session: {} } } as never) as { kind: string, text: string }

    const done = await run('--preset jlcpcb')
    expect(done.kind).toBe('success')
    expect(done.text).toMatch(/^Fab files exported for .*pic_programmer\.kicad_pcb \(JLCPCB/)
    const zip = join(demo!, 'fab/jlcpcb/pic_programmer-jlcpcb.zip')
    expect(existsSync(zip)).toBe(true)
    expect(readFileSync(zip).subarray(0, 2).toString()).toBe('PK')

    unrouteOneTrack(join(demo!, 'pic_programmer.kicad_pcb'))
    const refused = await run('')
    expect(refused.kind).toBe('success')
    expect(refused.text).toMatch(/^Fab export REFUSED .*\n- 1 unrouted connection\(s\)/)
    expect(existsSync(join(demo!, 'fab/kicad'))).toBe(false)
    const forced = JSON.parse((await run('--force --json')).text)
    expect(forced).toMatchObject({ exported: true, forced: true, gate: { passed: false } })
    expect(forced.warnings[0]).toMatch(/^FORCED/)

    expect((await run('/etc/board.kicad_pcb')).text).toMatch(/must be inside the working directory/)
    expect((await run('--preset oshpark')).text).toMatch(/unknown fab preset 'oshpark'/)
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

  it('/kicad-install offers Freerouting (an optional component) next to KiCad, and runs it only with --yes', async () => {
    const freerouting = option('freerouting', { label: 'Freerouting 2.5.0 (download the release jar, per user)', command: 'python3 -I freerouting.py download', note: 'Downloads 64.6 MB (GPL-3.0).' })
    const ready = {
      ...missing, ok: true, status: 'ok', summary: 'Ready: KiCad 10.0.7.', install: [],
      checks: [{ id: 'freerouting', label: 'Freerouting (optional, autorouting)', status: 'warn', required: false, summary: 'Freerouting is not installed.', install: [freerouting] }],
    }
    const { ctx } = fakeCtx(ready)
    const plan = await skills.installCommand(ctx, '')
    expect(plan).toMatch(/^\*\*Ready: KiCad 10\.0\.7\.\*\*[\s\S]*Freerouting \(optional, autorouting\):[\s\S]*`\/kicad-install freerouting --yes` runs:[\s\S]*python3 -I freerouting.py download/)
    expect(await skills.installCommand(ctx, 'freerouting')).toMatch(/This will run:[\s\S]*python3 -I freerouting\.py download[\s\S]*\/kicad-install freerouting --yes/)
    expect(skills.formatDoctor(ready as never)).toContain('Optional: `/kicad-install freerouting` (Freerouting 2.5.0 (download the release jar, per user)).')
  })

  it('/kicad-install has nothing to do when KiCad is ready', async () => {
    const { ctx } = fakeCtx({ ...missing, ok: true, status: 'ok', summary: 'Ready: KiCad 10.0.7.', install: [] })
    expect(await skills.installCommand(ctx, '')).toBe('Ready: KiCad 10.0.7.\nNothing to install.')
  })
})
