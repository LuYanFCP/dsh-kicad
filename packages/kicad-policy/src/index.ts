/**
 * dsh-kicad-policy: everything that decides *whether* and *how* the kicad_*
 * tools run, kept out of the tools themselves.
 *
 * - `ctx.tools.guard()`      monotonic denial of writes outside the project
 * - `tools/pre-execute`      design edits return `ask` (approval card)
 * - `tools/post-execute`     a successful edit is followed by KiCad ERC, whose
 *                            verdict is appended to the tool result
 * - `tools/result`           remembers the latest ERC per schematic
 * - `systemPrompt.section`   stable KiCad working rules (cache-friendly)
 * - `systemPrompt.context`   the KiCad project found in the working directory
 */
import { basename } from 'node:path'
import { DESIGN_WRITE_TOOLS, formatCheck, PATH_ARGUMENTS, TOOL_ACCESS, type CheckReport, type KiCadToolName } from 'dsh-tool-kicad'
import { agentCwd, assemblyAgent, z, type Context, type PostToolDecision, type PreToolDecision, type ToolExecution, type Volatile } from './dsh.ts'
import { inside, resolveArg } from './paths.ts'
import { ErcMemory, projectContext } from './project.ts'

export { ErcMemory, projectContext }

export const name = 'dsh-kicad-policy'
export const inject = ['tools', 'kicad']

export interface Config {
  /** `ask` routes design edits through dsh approval; `allow` runs them directly. */
  approval: Volatile<'ask' | 'allow'>
  /** Deny writes outside the session's working directory (plus `extraRoots`). */
  restrictToWorkspace: boolean
  extraRoots: string[]
  /** Run KiCad ERC after every successful schematic edit and append the verdict. */
  autoErc: Volatile<boolean>
  /** Refresh the SVG render used by the sidebar viewer after every edit. */
  autoRender: Volatile<boolean>
  /** Add the KiCad working rules section to the system prompt. */
  guidance: boolean
  /** Add the detected KiCad project to the dynamic prompt context. */
  projectContext: boolean
}

export const Config: z<Config> = z.object({
  approval: z.union(['ask', 'allow'] as const).default('ask').volatile().description('Ask before KiCad design edits, or allow them.'),
  restrictToWorkspace: z.boolean().default(true).description('Only allow KiCad writes inside the working directory.'),
  extraRoots: z.array(z.string()).default([]).description('Additional directories KiCad tools may write to.'),
  autoErc: z.boolean().default(true).volatile().description('Run ERC after every schematic edit.'),
  autoRender: z.boolean().default(true).volatile().description('Re-render the sidebar SVG after every schematic edit.'),
  guidance: z.boolean().default(true).description('Add KiCad working rules to the system prompt.'),
  projectContext: z.boolean().default(true).description('Tell the model which KiCad project is open.'),
}) as unknown as z<Config>

export const GUIDANCE = `# KiCad (EDA) work

- Use the kicad_* tools for KiCad files; never hand-edit .kicad_sch / .kicad_pcb text with generic file tools.
- If the request is vague or the user is new to electronics (no parts, values or connections given), load the kicad-design-brief skill and agree on a written spec before editing anything.
- Read before you change: kicad_read_schematic, kicad_get_symbol_pins, kicad_list_nets. Find parts with kicad_search_symbols.
- Put related changes in one kicad_edit_schematic batch (atomic; at most ~20 operations). Prefer connect_pin_to_net (labels, power symbols) over long wires.
- Fix mistakes with disconnect_pin / remove_item / move_symbol. Never rebuild or rewrite a schematic file to change its layout.
- KiCad decides correctness: after edits read the ERC verdict appended to the result (or run kicad_erc / kicad_drc). Do not declare a design correct while KiCad reports errors.
- Coordinates are millimetres, Y grows downward, on the 1.27 mm grid.`

const isKiCadTool = (name: string): name is KiCadToolName => Object.hasOwn(TOOL_ACCESS, name)

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
      const args = (exec.arguments ?? {}) as { path?: string, operations?: Array<{ op?: string }>, dry_run?: boolean }
      if (args.dry_run || config.approval.get() !== 'ask') return next()
      const decision = await next()
      if (decision.kind !== 'allow') return decision
      return { kind: 'ask', ...describeEdit(exec.name, args) }
    })
  }

  {
    ctx.on('tools/post-execute', async (exec, result, next): Promise<PostToolDecision> => {
      const decision = await next()
      if (exec.name !== 'kicad_edit_schematic' || result.isError || decision.kind !== 'accept') return decision
      const args = exec.arguments as { path?: string, dry_run?: boolean }
      if (args.dry_run || typeof args.path !== 'string') return decision
      const path = resolveArg(cwdOf(exec), args.path)
      if (config.autoRender.get()) {
        // Fire and forget: the sidebar viewer watches the SVG file.
        void ctx.kicad.call('render', { path, format: 'svg' }).catch(() => undefined)
      }
      if (!config.autoErc.get()) return decision
      let note: string
      try {
        const erc = await ctx.kicad.call<CheckReport>('erc', { path }, exec.signal)
        if (erc.ok && erc.value) {
          memory.remember(path, erc.value)
          note = `Automatic ${formatCheck(erc.value)}`
        } else {
          note = `Automatic ERC could not run: ${erc.text}`
        }
      } catch (error) {
        note = `Automatic ERC could not run: ${(error as Error).message}`
      }
      const base = 'content' in decision && decision.content ? decision.content : result.content
      return { ...decision, content: [...base, { type: 'text', text: note }] } as PostToolDecision
    })
  }

  ctx.on('tools/result', (exec, result) => {
    if (exec.name !== 'kicad_erc' || result.isError) return
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
export function describeEdit(tool: string, args: { path?: string, operations?: Array<{ op?: string }> }): Pick<Extract<PreToolDecision, { kind: 'ask' }>, 'reason' | 'displayReason'> {
  const file = args.path ? basename(args.path) : 'a schematic'
  if (tool === 'kicad_create_schematic') {
    return { reason: `create ${args.path}`, displayReason: { en: `Create KiCad schematic ${file}`, zh: `创建 KiCad 原理图 ${file}` } }
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
