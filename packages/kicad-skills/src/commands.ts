/** /erc, /drc, /bom, /simulate, /mcu-check, /mcu-sim, /kicad-fab and /kicad-render: direct UI commands that never involve the model. */
import { readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { DoctorReport, InstallJob, InstallOption } from 'dsh-kicad-bridge'
import { FAB_EXTRAS, formatCheck, formatFab, formatFirmware, formatMcu, formatSimulate, type CheckReport, type FabResult, type FirmwareRun, type McuCheckValue, type SimulateValue } from 'dsh-tool-kicad'
import { agentCwd, followup, type CommandDefinition, type CommandInvocation, type CommandResult, type Context } from './dsh.ts'

/** The design file a command targets: the argument, else the project's root schematic / board. */
export function targetFile(cwd: string, rawInput: string, ext: '.kicad_sch' | '.kicad_pcb'): string {
  const arg = rawInput.trim()
  if (arg) return isAbsolute(arg) ? arg : resolve(cwd, arg)
  const entries = readdirSync(cwd)
  const pro = entries.find(e => e.endsWith('.kicad_pro'))
  if (pro) {
    const sibling = pro.replace(/\.kicad_pro$/, ext)
    if (entries.includes(sibling)) return join(cwd, sibling)
  }
  const any = entries.find(e => e.endsWith(ext))
  if (any) return join(cwd, any)
  throw new Error(`no ${ext} file in ${cwd}; pass a path, e.g. /${ext === '.kicad_sch' ? 'erc' : 'drc'} hardware/board${ext}`)
}

export function createCommands(ctx: Context): CommandDefinition[] {
  const wrap = (fn: (inv: CommandInvocation, cwd: string) => Promise<string>) =>
    async (inv: CommandInvocation): Promise<CommandResult> => {
      try {
        return { kind: 'success', text: await fn(inv, agentCwd(ctx, inv.agent)) }
      } catch (error) {
        return { kind: 'error', text: (error as Error).message }
      }
    }
  const check = (tool: 'erc' | 'drc', ext: '.kicad_sch' | '.kicad_pcb') => wrap(async (inv, cwd) => {
    const report = await ctx.kicad.run<CheckReport>(tool, { path: targetFile(cwd, inv.rawInput, ext) }, inv.signal)
    return formatCheck(report)
  })
  return [
    {
      name: 'kicad-doctor',
      description: 'Check whether KiCad (kicad-cli 8+), its libraries and Python are ready, and how to fix what is missing',
      input: { hint: '[--json]' },
      handler: wrap(async (inv) => {
        const report = await ctx.kicad.doctor(inv.signal)
        return flags(inv.rawInput).json ? JSON.stringify(report) : formatDoctor(report)
      }),
    },
    {
      name: 'kicad-install',
      description: 'Install KiCad, or the Freerouting autorouter: list the ways for this machine, or run one you confirm (never with sudo)',
      input: { hint: '[<method> --yes | status | cancel] [--json]' },
      handler: wrap(async (inv) => installCommand(ctx, inv.rawInput, inv.signal)),
    },
    {
      name: 'erc',
      description: 'Run KiCad ERC on the project schematic (or the given .kicad_sch)',
      input: { hint: '[path/to/file.kicad_sch]' },
      handler: check('erc', '.kicad_sch'),
    },
    {
      name: 'drc',
      description: 'Run KiCad DRC on the project board (or the given .kicad_pcb)',
      input: { hint: '[path/to/file.kicad_pcb]' },
      handler: check('drc', '.kicad_pcb'),
    },
    {
      name: 'bom',
      description: 'Show the bill of materials of the project schematic',
      input: { hint: '[path/to/file.kicad_sch]' },
      handler: wrap(async (inv, cwd) => {
        const bom = await ctx.kicad.run<{ rows: Array<Record<string, string>>, columns: string[] }>(
          'export_bom', { path: targetFile(cwd, inv.rawInput, '.kicad_sch') }, inv.signal)
        return formatBom(bom.columns, bom.rows)
      }),
    },
    {
      name: 'simulate',
      description: 'Verify the project schematic with ngspice: the requirements saved in <name>.sim.json, or a DC operating point showing every net voltage when there are none',
      input: { hint: '[path/to/file.kicad_sch]' },
      handler: wrap(async (inv, cwd) => {
        const result = await ctx.kicad.run<SimulateValue>('simulate', { path: targetFile(cwd, inv.rawInput, '.kicad_sch') }, inv.signal, { timeoutMs: 120_000 })
        return formatSimulate(result)
      }),
    },
    {
      name: 'mcu-check',
      description: 'Check how the project schematic wires its microcontroller (strapping pins, reserved pins, EN, decoupling); an MCU no provider covers is reported as cannot verify',
      input: { hint: '[path/to/file.kicad_sch]' },
      handler: wrap(async (inv, cwd) => {
        const result = await ctx.kicad.run<McuCheckValue>('check_mcu', { path: targetFile(cwd, inv.rawInput, '.kicad_sch') }, inv.signal)
        return formatMcu(result)
      }),
    },
    {
      name: 'mcu-sim',
      description: 'Run the project\'s saved firmware scenario (<name>.fw.json: firmware, stimuli, assertions) on the simulated ATtiny against the schematic',
      input: { hint: '[path/to/file.kicad_sch]' },
      handler: wrap(async (inv, cwd) => {
        const path = targetFile(cwd, inv.rawInput, '.kicad_sch')
        const result = await ctx.kicad.run<FirmwareRun>('simulate_firmware', { path }, inv.signal, { timeoutMs: 120_000 })
        return formatFirmware(result)
      }),
    },
    {
      name: 'kicad-fab',
      description: 'Export the project board for ordering: Gerber, drill, position and BOM files in one zip, once KiCad finds it ready',
      input: { hint: '[path/to/board.kicad_pcb] [--preset jlcpcb|pcbway] [--force] [--step] [--ipc2581] [--odb]' },
      handler: wrap(async (inv, cwd) => fabCommand(ctx, cwd, inv.rawInput, inv.signal)),
    },
    {
      name: 'kicad-design',
      description: 'Describe the board you want in one sentence; the agent asks a few questions, writes a full spec, then designs it',
      input: { hint: 'e.g. a USB-powered board where a button turns an LED on' },
      handler: wrap(async (inv) => {
        const idea = inv.rawInput.trim()
        if (!idea) throw new Error('Write what you want after the command, e.g. /kicad-design a USB-powered board where a button turns an LED on')
        followup(inv.agent, designRequest(idea))
        return /[\u3400-\u9fff]/.test(idea) ? '已交给 agent：先帮你补全需求、确认后再画原理图。' : 'Sent to the agent: it will complete the requirements with you, then draw the schematic.'
      }),
    },
    {
      name: 'kicad-render',
      description: 'Re-render a KiCad schematic or board for the sidebar viewer: SVG, a board\'s 3D scene (--glb) or KiCad\'s 3D render (--3d)',
      input: { hint: 'path/to/file.kicad_sch [--glb [--force] | --3d [--side=top] [--rotate=X,Y,Z] [--zoom=1] [--pivot=X,Y,Z] [--perspective] [--quality=basic|high] [--width=W] [--height=H] [--name=N]] [--json]' },
      // `--json` marks the viewer's own runs, whose chat rows stay hidden; the output is JSON either way.
      handler: wrap(async (inv, cwd) => renderCommand(ctx, cwd, inv.rawInput, inv.signal)),
    },
  ]
}

export interface RenderArgs {
  path: string
  kind: 'svg' | 'glb' | '3d'
  force: boolean
  /** kicad-cli pcb render camera and image options (`--3d`). */
  camera: Record<string, string | number | boolean>
}

const RENDER_VALUES = ['side', 'rotate', 'zoom', 'pivot', 'quality', 'width', 'height', 'name'] as const
const RENDER_NUMBERS = new Set(['zoom', 'width', 'height'])

/**
 * `/kicad-render [path] [--glb [--force] | --3d [--side=…] [--rotate=X,Y,Z] …] [--json]`. Values go after `=`, so
 * a negative angle (`--rotate=-45,0,45`) is never taken for an option; the rest of the line is the path.
 */
export function renderArgs(raw: string): RenderArgs {
  const out: RenderArgs = { path: '', kind: 'svg', force: false, camera: {} }
  const rest: string[] = []
  for (const word of raw.trim().split(/\s+/).filter(Boolean)) {
    const option = /^--([a-z0-9-]+)(?:=(.*))?$/.exec(word)
    if (!option) {
      rest.push(word)
      continue
    }
    const [, name, value] = option as unknown as [string, string, string | undefined]
    if (name === 'json') continue
    if (name === 'glb' || name === '3d') {
      if (out.kind !== 'svg' && out.kind !== name) throw new Error('use either --glb (3D scene) or --3d (KiCad render)')
      out.kind = name
    } else if (name === 'force') {
      out.force = true
    } else if (name === 'perspective') {
      out.camera.perspective = true
    } else if ((RENDER_VALUES as readonly string[]).includes(name)) {
      if (!value) throw new Error(`--${name} needs a value, e.g. --${name}=${name === 'rotate' || name === 'pivot' ? '-45,0,45' : name === 'side' ? 'top' : name === 'quality' ? 'high' : '1'}`)
      const number = Number(value)
      if (RENDER_NUMBERS.has(name) && !Number.isFinite(number)) throw new Error(`--${name} must be a number, got ${value}`)
      out.camera[name] = RENDER_NUMBERS.has(name) ? number : value
    } else {
      throw new Error(`unknown option --${name}; use --glb [--force], or --3d with --side, --rotate, --zoom, --pivot, --perspective, --quality, --width, --height, --name`)
    }
  }
  if (out.kind !== '3d' && Object.keys(out.camera).length) throw new Error('camera options need --3d')
  if (out.force && out.kind !== 'glb') throw new Error('--force goes with --glb')
  out.path = rest.join(' ')
  return out
}

/** `/kicad-render`: the sidebar viewer's renders (SVG pages, the 3D scene, or one KiCad 3D render). */
export async function renderCommand(ctx: Context, cwd: string, raw: string, signal?: AbortSignal): Promise<string> {
  const args = renderArgs(raw)
  const path = args.path ? (isAbsolute(args.path) ? args.path : resolve(cwd, args.path)) : targetFile(cwd, '', args.kind === 'svg' ? '.kicad_sch' : '.kicad_pcb')
  if (args.kind === 'glb') {
    const out = await ctx.kicad.run<Record<string, unknown>>('export_glb', { path, force: args.force }, signal)
    return JSON.stringify({ path, ...out })
  }
  if (args.kind === '3d') {
    const out = await ctx.kicad.run<{ png: string[], camera?: unknown }>('render', { path, view: '3d', ...args.camera }, signal)
    return JSON.stringify({ path, svg: [], png: out.png, ...(out.camera ? { camera: out.camera } : {}) })
  }
  const out = await ctx.kicad.run<{ svg: string[] }>('render', { path, format: 'svg' }, signal)
  return JSON.stringify({ path, svg: out.svg })
}

export function flags(raw: string): { json: boolean, yes: boolean, words: string[] } {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  return { json: words.includes('--json'), yes: words.includes('--yes') || words.includes('-y'), words: words.filter(w => !w.startsWith('-')) }
}

export interface FabArgs {
  path: string
  preset?: string
  force: boolean
  extras: string[]
  json: boolean
}

/** `/kicad-fab [board] [--preset <name>] [--force] [--step|--ipc2581|--odb] [--json]`. */
export function fabArgs(raw: string): FabArgs {
  const words = raw.trim().split(/\s+/).filter(Boolean)
  const out: FabArgs = { path: '', force: false, extras: [], json: false }
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    const preset = /^--preset(?:=(.*))?$/.exec(word)
    if (preset) {
      out.preset = preset[1] ?? words[++i]
      if (!out.preset) throw new Error('--preset needs a fab house, e.g. --preset jlcpcb')
    } else if (word === '--force') {
      out.force = true
    } else if (word === '--json') {
      out.json = true
    } else if (word.startsWith('--') && (FAB_EXTRAS as readonly string[]).includes(word.slice(2))) {
      out.extras.push(word.slice(2))
    } else if (word.startsWith('-')) {
      throw new Error(`unknown option ${word}; use --preset <name>, --force, ${FAB_EXTRAS.map(e => `--${e}`).join(', ')}`)
    } else if (!out.path) {
      out.path = word
    } else {
      throw new Error(`expected one board, got "${out.path}" and "${word}"`)
    }
  }
  return out
}

/** `/kicad-fab`: KiCad's gate, then the fab zip, for a board inside the working directory. */
export async function fabCommand(ctx: Context, cwd: string, raw: string, signal?: AbortSignal): Promise<string> {
  const args = fabArgs(raw)
  const pcb = targetFile(cwd, args.path, '.kicad_pcb')
  // Real paths, so a symlinked folder cannot point the export outside the working directory.
  const real = (path: string): string => { try { return realpathSync(path) } catch { return resolve(path) } }
  const rel = relative(real(cwd), real(pcb))
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`/kicad-fab writes next to the board, so the board must be inside the working directory (${cwd}); got ${pcb}`)
  }
  const result = await ctx.kicad.run<FabResult>('export_fab', {
    pcb, force: args.force, extras: args.extras, ...(args.preset ? { preset: args.preset } : {}),
  }, signal)
  return args.json ? JSON.stringify(result) : formatFab(result)
}

/** `/kicad-install`: plan (default) · `<method> --yes` · `status` · `cancel`; `--json` for UIs. */
export async function installCommand(ctx: Context, raw: string, signal?: AbortSignal): Promise<string> {
  const { json, yes, words } = flags(raw)
  const [verb = 'plan'] = words
  if (verb === 'status') {
    const job = ctx.kicad.installer.job
    return json ? JSON.stringify({ job: job ?? null }) : job ? formatJob(job) : 'No KiCad installation has run since dsh started.'
  }
  if (verb === 'cancel') {
    const cancelled = ctx.kicad.installer.cancel()
    return json ? JSON.stringify({ cancelled, job: ctx.kicad.installer.job ?? null }) : cancelled ? 'Cancelling the KiCad installation…' : 'No KiCad installation is running.'
  }
  if (verb === 'plan') {
    const report = await ctx.kicad.doctor(signal)
    return json ? JSON.stringify({ report, job: ctx.kicad.installer.job ?? null }) : formatPlan(report)
  }
  const method = verb === 'start' ? words[1] ?? '' : verb
  if (!yes) {
    const report = await ctx.kicad.doctor(signal)
    const option = [...optionalInstalls(report), ...report.install].find(o => o.id === method)
    if (!option) return formatPlan(report)
    return option.runnable
      ? `This will run:\n\n    ${option.command}\n\nRun \`/kicad-install ${option.id} --yes\` to confirm.`
      : formatOption(option)
  }
  const job = await ctx.kicad.install(method, signal)
  return json ? JSON.stringify({ job }) : `Started: ${job.command}\nFollow it with /kicad-install status; KiCad is checked again when it finishes.`
}

const MARK = { ok: '✓', warn: '!', error: '✗' } as const

/** Install plans of optional components (Freerouting, a Java runtime), carried by their doctor checks. */
export function optionalInstalls(report: DoctorReport): InstallOption[] {
  return report.checks.flatMap(c => c.install ?? [])
}

export function formatDoctor(report: DoctorReport): string {
  const lines = [`**${report.summary}**`, '']
  for (const c of report.checks) {
    lines.push(`- ${MARK[c.status]} **${c.label}**: ${c.summary}`)
    if (c.fix) lines.push(`  - fix: ${c.fix}`)
  }
  if (report.install.length) lines.push('', 'Install KiCad: run `/kicad-install` to see the options for this machine.')
  const optional = optionalInstalls(report).filter(o => o.runnable)
  if (optional.length) lines.push('', `Optional: ${optional.map(o => `\`/kicad-install ${o.id}\` (${o.label})`).join(', ')}.`)
  return lines.join('\n')
}

function formatOption(o: InstallOption): string {
  const tags = [o.recommended && 'recommended', o.needs_root && 'needs administrator rights: run it yourself', !o.available && 'not available here'].filter(Boolean)
  const how = o.command
    ? (o.runnable ? `\`/kicad-install ${o.id} --yes\` runs:\n\n    ${o.command}` : `\n\n    ${o.command}`)
    : o.url ?? ''
  return `**${o.label}**${tags.length ? ` (${tags.join('; ')})` : ''}: ${how}${o.note ? `\n${o.note}` : ''}`
}

export function formatPlan(report: DoctorReport): string {
  const optional = optionalInstalls(report)
  // One heading per optional component (Java and Freerouting for kicad_autoroute, KiCad's 3D models).
  const extras = report.checks.filter(c => c.install?.length).flatMap(c => [`**${c.label}:**`, ...c.install!.map(formatOption)])
  if (report.status === 'ok') {
    return optional.length ? [`**${report.summary}**`, ...extras].join('\n\n') : `${report.summary}\nNothing to install.`
  }
  if (!report.install.length) return [formatDoctor(report), ...extras].join('\n\n')
  return [`**${report.summary}**`, '', ...report.install.map(formatOption), ...extras, '', 'After installing, run /kicad-doctor; dsh does not need a restart.'].join('\n\n')
}

export function formatJob(job: InstallJob): string {
  const head = `${job.label}: ${job.state}${job.phase === 'checking' ? ' (checking KiCad again)' : ''} — step ${job.step}/${job.steps}`
  const log = job.log.slice(-20).join('\n')
  return `${head}\n\n\`\`\`\n${log}\n\`\`\`${job.doctor ? `\n\n${job.doctor.summary}` : ''}`
}

export function formatBom(columns: string[], rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return 'BOM is empty.'
  const header = `| ${columns.join(' | ')} |`
  const rule = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map(r => `| ${columns.map(c => (r[c] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)
  return [header, rule, ...body].join('\n')
}

/** The follow-up message /kicad-design sends: the user's idea plus the brief-first workflow. */
export function designRequest(idea: string): string {
  if (/[\u3400-\u9fff]/.test(idea)) {
    return `我想设计：${idea}\n\n我不是硬件专家。请先使用 kicad-design-brief 技能：把需求补全成完整的编号设计规格（元件、数值、封装和每一条连接），只问我真正需要我决定的 3–4 个问题并给出推荐选项，把规格保存为 design-brief.md 给我确认；我确认后再画原理图，并确保 KiCad ERC 0 error。`
  }
  return `I want to design: ${idea}\n\nI am not a hardware expert. First use the kicad-design-brief skill: complete this into a numbered design spec (parts, values, footprints and every connection), ask me only the 3–4 questions I really need to decide, with recommended options, save the spec as design-brief.md for my confirmation, and draw the schematic only after I confirm, with KiCad ERC at 0 errors.`
}
