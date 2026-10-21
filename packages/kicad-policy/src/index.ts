/**
 * dsh-kicad-policy: everything that decides *whether* and *how* the kicad_*
 * tools run, kept out of the tools themselves.
 *
 * - `ctx.tools.guard()`      monotonic denial of writes outside the project
 * - `tools/pre-execute`      design edits follow the session's dsh permissions
 *                            (read-only denies; `approval: ask` adds an approval card)
 * - `tools/post-execute`     a successful edit is followed by KiCad ERC (schematic)
 *                            or DRC (board), whose verdict is appended to the tool result
 * - `tools/result`           remembers the latest ERC/DRC per design file
 * - `systemPrompt.section`   stable KiCad working rules (cache-friendly)
 * - `systemPrompt.context`   the KiCad project found in the working directory
 */
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { DESIGN_WRITE_TOOLS, formatCheck, PATH_ARGUMENTS, TOOL_ACCESS, type CheckReport, type KiCadToolName } from 'dsh-tool-kicad'
import { agentCwd, assemblyAgent, sessionPermissions, z, type Context, type PostToolDecision, type PreToolDecision, type ToolExecution, type Volatile } from './dsh.ts'
import { inside, resolveArg } from './paths.ts'
import { ErcMemory, projectContext } from './project.ts'

export { ErcMemory, projectContext }

export const name = 'dsh-kicad-policy'
export const inject = ['tools', 'kicad']

export interface Config {
  /**
   * `follow` (default): design edits behave like dsh's own file writes — denied in a
   * read-only session, run without a prompt in workspace-write / full access.
   * `ask`: additionally ask before every edit, unless the session never asks.
   * `allow`: never add a prompt (read-only sessions still deny).
   */
  approval: Volatile<'follow' | 'ask' | 'allow'>
  /** Deny writes outside the session's working directory (plus `extraRoots`). */
  restrictToWorkspace: boolean
  extraRoots: string[]
  /** Run KiCad ERC after every successful schematic edit and append the verdict. */
  autoErc: Volatile<boolean>
  /** Run KiCad DRC (zones refilled) after every successful board edit and append the verdict. */
  autoDrc: Volatile<boolean>
  /** Refresh the SVG render used by the sidebar viewer after every edit. */
  autoRender: Volatile<boolean>
  /** Add the KiCad working rules section to the system prompt. */
  guidance: boolean
  /** Add the detected KiCad project to the dynamic prompt context. */
  projectContext: boolean
}

export const Config: z<Config> = z.object({
  approval: z.union(['follow', 'ask', 'allow'] as const).default('follow').volatile().description('follow: like dsh file writes (no extra prompt); ask: approve every edit; allow: never ask.'),
  restrictToWorkspace: z.boolean().default(true).description('Only allow KiCad writes inside the working directory.'),
  extraRoots: z.array(z.string()).default([]).description('Additional directories KiCad tools may write to.'),
  autoErc: z.boolean().default(true).volatile().description('Run ERC after every schematic edit.'),
  autoDrc: z.boolean().default(true).volatile().description('Run DRC after every board edit.'),
  autoRender: z.boolean().default(true).volatile().description('Re-render the sidebar SVG after every schematic edit.'),
  guidance: z.boolean().default(true).description('Add KiCad working rules to the system prompt.'),
  projectContext: z.boolean().default(true).description('Tell the model which KiCad project is open.'),
}) as unknown as z<Config>

export const GUIDANCE = `# KiCad (EDA) work

- Use the kicad_* tools for KiCad files; never hand-edit .kicad_sch / .kicad_pcb text with generic file tools.
- If the request is vague or the user is new to electronics (no parts, values or connections given), load the kicad-design-brief skill and agree on a written spec before editing anything.
- Read before you change: kicad_read_schematic, kicad_get_symbol_pins, kicad_list_nets. Find parts with kicad_search_symbols.
- Put related changes in one kicad_edit_schematic batch (atomic; at most ~20 operations).
- Draw the circuit with wires: connect parts that work together with connect_pins (it routes around parts and other nets). Use power symbols for supply rails and net labels only between blocks or across the page, not for two parts side by side. Place parts so the pins you will wire face each other.
- Fix mistakes with disconnect_pin / remove_item / move_symbol. Never rebuild or rewrite a schematic file to change its layout.
- Organise a schematic by function: one titled frame per block (add_block / move_block), parts inside a block wired together, blocks connected only through net labels and power symbols, never through wires that cross a frame.
- Boards: create or refresh the board from the schematic with kicad_update_pcb (after ERC passes, and after every schematic change; it lists the REF:PINs to fix when it refuses), read with kicad_read_pcb (outline, footprints with courtyards and pad nets, rules, unrouted count), then change them with one kicad_edit_pcb batch: outline and mounting holes, placement, rules and net classes, tracks (route pad to pad with "REF:PAD" endpoints), vias, zones, keepouts, silkscreen.
- Place a new board with one kicad_edit_pcb auto_place (it follows the schematic's functional blocks: draw them with add_block first), look at it with kicad_render (view "3d"), then fine-tune with move_footprint / place_block; kicad_read_pcb's placement line must show no overlaps and nothing outside the outline.
- To order a board: kicad_export_fab writes Gerber, drill, position and BOM files in one zip, and refuses while KiCad reports DRC errors, unrouted connections or schematic parity issues; pass force only when the user explicitly asks. kicad_fab_preset makes a fab house's limits (JLCPCB, PCBWay) the project's design rules.
- KiCad decides correctness: after edits read the ERC/DRC verdict appended to the result (or run kicad_erc / kicad_drc). Do not declare a design correct while KiCad reports errors or unrouted connections.
- Coordinates are millimetres, Y grows downward, on the 1.27 mm grid.
- If a kicad_* tool fails because KiCad or Python is missing or too old, run kicad_doctor and give the user its fix. Do not install software yourself; the user installs KiCad (the doctor panel's Install button or /kicad-install).`

const isKiCadTool = (name: string): name is KiCadToolName => Object.hasOwn(TOOL_ACCESS, name)

/** The KiCad check that follows a successful edit of each kind of design file (new fab rules change what DRC reports). */
const AUTO_CHECK: Readonly<Record<string, 'erc' | 'drc'>> = { kicad_edit_schematic: 'erc', kicad_edit_pcb: 'drc', kicad_update_pcb: 'drc', kicad_fab_preset: 'drc' }

/** Tools whose path arguments must stay inside the workspace. */
const GUARDED: ReadonlySet<string> = new Set(
  (Object.keys(TOOL_ACCESS) as KiCadToolName[]).filter(n => TOOL_ACCESS[n] === 'write' || n === 'kicad_render'),
)

export function apply(ctx: Context, config: Config): void {
  const memory = new ErcMemory()
  const cwdOf = (exec: Pick<ToolExecution, 'agent'>): string => agentCwd(ctx, exec.agent) ?? process.cwd()

  /** Why a call may not run (path outside the workspace), or undefined. */
  const outsideWorkspace = (exec: Pick<ToolExecution, 'name' | 'arguments' | 'agent'>): string | undefined => {
    if (!config.restrictToWorkspace || !GUARDED.has(exec.name)) return undefined
    const cwd = cwdOf(exec)
    const roots = [cwd, ...config.extraRoots]
    for (const key of PATH_ARGUMENTS[exec.name as KiCadToolName]) {
      const value = (exec.arguments as Record<string, unknown> | null)?.[key]
      if (typeof value !== 'string' || value === '') continue
      const target = resolveArg(cwd, value)
      if (!roots.some(root => inside(target, root))) {
        return `${exec.name} may only write inside the project directory (${cwd}); "${value}" resolves to ${target}. Copy the design into the project first, or add a root to the KiCad policy's extraRoots.`
      }
    }
    return undefined
  }

  // The guard is the monotonic backstop; pre-execute denies the same calls early so
  // the user is never asked to approve an edit the guard would refuse anyway.
  if (config.restrictToWorkspace) ctx.effect(() => ctx.tools.guard(outsideWorkspace), 'kicad workspace guard')

  {
    ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
      if (!(DESIGN_WRITE_TOOLS as readonly string[]).includes(exec.name)) return next()
      const denied = outsideWorkspace(exec)
      if (denied) return { kind: 'deny', reason: denied }
      const args = (exec.arguments ?? {}) as Parameters<typeof describeEdit>[1] & { dry_run?: boolean }
      if (args.dry_run) return next()
      const permissions = sessionPermissions(ctx, exec.agent)
      if (permissions.sandbox === 'read-only') {
        return { kind: 'deny', reason: `${exec.name} writes a design file, but this session is read-only. Ask the user to switch permissions to workspace write (or full access) and try again.` }
      }
      // Under the session's "never ask" policy an approval card would be rejected outright,
      // so the extra prompt only applies while the session still asks.
      if (config.approval.get() !== 'ask' || permissions.approval === 'never') return next()
      const decision = await next()
      if (decision.kind !== 'allow') return decision
      return { kind: 'ask', ...describeEdit(exec.name, args) }
    })
  }

  {
    ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
      const decision = await next()
      const check = AUTO_CHECK[exec.name]
      if (!check || result.isError || decision.kind !== 'accept') return decision
      const args = exec.arguments as { path?: string, dry_run?: boolean }
      if (args.dry_run) return decision
      // kicad_update_pcb names its board in the result (by default the schematic's name) and has already run
      // KiCad's DRC with schematic parity: that verdict is appended instead of a second run.
      const synced = exec.name === 'kicad_update_pcb' ? (result as { value?: { pcb?: string, drc?: CheckReport } }).value : undefined
      let path = synced ? synced.pcb : typeof args.path === 'string' ? resolveArg(cwdOf(exec), args.path) : undefined
      if (!path) return decision
      if (exec.name === 'kicad_fab_preset') {
        // The preset may be applied through the .kicad_pro: check the project's board, when there is one and rules changed.
        path = path.replace(/\.kicad_pro$/, '.kicad_pcb')
        if ((result as { value?: { written?: boolean } }).value?.written === false || !existsSync(path)) return decision
      }
      if (check === 'erc' && config.autoRender.get()) {
        // Fire and forget: the sidebar viewer watches the SVG file.
        void ctx.kicad.call('render', { path, format: 'svg' }).catch(() => undefined)
      }
      if (!(check === 'erc' ? config.autoErc : config.autoDrc).get()) return decision
      const label = check.toUpperCase()
      let note: string
      try {
        // DRC refills zones itself when the board has any (the file is not changed).
        const report = synced?.drc
          ? { ok: true, value: synced.drc, text: '' }
          : await ctx.kicad.call<CheckReport>(check, { path, ...(synced ? { schematic_parity: true } : {}) }, exec.signal)
        if (report.ok && report.value) {
          memory.remember(path, report.value)
          note = `Automatic ${formatCheck(report.value)}`
        } else {
          note = `Automatic ${label} could not run: ${report.text}`
        }
      } catch (error) {
        note = `Automatic ${label} could not run: ${(error as Error).message}`
      }
      const base = 'content' in decision && decision.content ? decision.content : result.content
      return { ...decision, content: [...base, { type: 'text', text: note }] } as PostToolDecision
    })
  }

  ctx.on('tools/result', (exec, result) => {
    if ((exec.name !== 'kicad_erc' && exec.name !== 'kicad_drc') || result.isError) return
    const value = (result as { value?: unknown }).value as CheckReport & { path?: string } | undefined
    if (value?.path) memory.remember(value.path, value)
  })

  ctx.inject(['systemPrompt'], (ctx) => {
    if (config.guidance) {
      ctx.effect(() => ctx.systemPrompt.section({ name: 'kicad:guidance', order: 3200, text: GUIDANCE, interpolate: false }), 'kicad guidance')
    }
    if (config.projectContext) {
      ctx.effect(() => ctx.systemPrompt.context({
        name: 'kicad:project',
        order: 130,
        interpolate: false,
        text: (assembly) => {
          const cwd = agentCwd(ctx, assemblyAgent(assembly))
          return cwd ? projectContext(cwd, memory) : ''
        },
      }), 'kicad project context')
    }
  })
}

/** The audited approval reason plus localized prompt text for one design write. */
export function describeEdit(tool: string, args: { path?: string, operations?: Array<{ op?: string }>, preset?: string, schematic?: string, pcb?: string, delete_removed?: boolean }): Pick<Extract<PreToolDecision, { kind: 'ask' }>, 'reason' | 'displayReason'> {
  const file = args.path ? basename(args.path) : 'a design file'
  if (tool === 'kicad_create_schematic') {
    return { reason: `create ${args.path}`, displayReason: { en: `Create KiCad schematic ${file}`, zh: `创建 KiCad 原理图 ${file}` } }
  }
  if (tool === 'kicad_fab_preset') {
    return { reason: `apply ${args.preset} design rules to ${args.path}`, displayReason: { en: `Apply ${args.preset} design rules to ${file}`, zh: `将 ${args.preset} 设计规则应用到 ${file}` } }
  }
  if (tool === 'kicad_update_pcb') {
    const sch = args.schematic ? basename(args.schematic) : 'the schematic'
    const board = args.pcb ? basename(args.pcb) : sch.replace(/\.kicad_sch$/, '.kicad_pcb')
    const removed = args.delete_removed ? { en: ', deleting footprints whose symbol is gone', zh: '，并删除原理图中已不存在的封装' } : { en: '', zh: '' }
    return {
      reason: `update ${args.pcb ?? board} from ${args.schematic}${args.delete_removed ? ' (delete_removed)' : ''}`,
      displayReason: { en: `Update board ${board} from ${sch}${removed.en}`, zh: `根据 ${sch} 更新电路板 ${board}${removed.zh}` },
    }
  }
  const ops = args.operations ?? []
  const counts = new Map<string, number>()
  for (const op of ops) counts.set(op.op ?? '?', (counts.get(op.op ?? '?') ?? 0) + 1)
  const summary = [...counts].map(([op, n]) => (n > 1 ? `${op}×${n}` : op)).join(', ')
  return {
    reason: `edit ${args.path}: ${summary}`,
    displayReason: {
      en: `Edit ${file}: ${ops.length} operation(s) — ${summary}`,
      zh: `修改 ${file}：${ops.length} 项操作 — ${summary}`,
    },
  }
}

export { isKiCadTool }
