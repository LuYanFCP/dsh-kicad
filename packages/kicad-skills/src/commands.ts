/** /erc, /drc, /bom and /kicad-render: direct UI commands that never involve the model. */
import { readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { formatCheck, type CheckReport } from 'dsh-tool-kicad'
import { agentCwd, type CommandDefinition, type CommandInvocation, type CommandResult, type Context } from './dsh.ts'

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
      name: 'kicad-render',
      description: 'Re-render a KiCad schematic or board to SVG for the sidebar viewer',
      input: { hint: 'path/to/file.kicad_sch' },
      handler: wrap(async (inv, cwd) => {
        const arg = inv.rawInput.trim()
        const path = arg ? (isAbsolute(arg) ? arg : resolve(cwd, arg)) : targetFile(cwd, '', '.kicad_sch')
        const out = await ctx.kicad.run<{ svg: string[] }>('render', { path, format: 'svg' }, inv.signal)
        return JSON.stringify({ path, svg: out.svg })
      }),
    },
  ]
}

export function formatBom(columns: string[], rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return 'BOM is empty.'
  const header = `| ${columns.join(' | ')} |`
  const rule = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map(r => `| ${columns.map(c => (r[c] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`)
  return [header, rule, ...body].join('\n')
}
