/** /erc, /drc, /bom and /kicad-render: direct UI commands that never involve the model. */
import { readdirSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { formatCheck, type CheckReport } from 'dsh-tool-kicad'
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

/** The follow-up message /kicad-design sends: the user's idea plus the brief-first workflow. */
export function designRequest(idea: string): string {
  if (/[\u3400-\u9fff]/.test(idea)) {
    return `我想设计：${idea}\n\n我不是硬件专家。请先使用 kicad-design-brief 技能：把需求补全成完整的编号设计规格（元件、数值、封装和每一条连接），只问我真正需要我决定的 3–4 个问题并给出推荐选项，把规格保存为 design-brief.md 给我确认；我确认后再画原理图，并确保 KiCad ERC 0 error。`
  }
  return `I want to design: ${idea}\n\nI am not a hardware expert. First use the kicad-design-brief skill: complete this into a numbered design spec (parts, values, footprints and every connection), ask me only the 3–4 questions I really need to decide, with recommended options, save the spec as design-brief.md for my confirmation, and draw the schematic only after I confirm, with KiCad ERC at 0 errors.`
}
