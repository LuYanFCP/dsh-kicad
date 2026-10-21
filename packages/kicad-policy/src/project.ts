/** Project discovery and the dynamic prompt context. Synchronous and cheap by design. */
import { readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { CheckReport } from 'dsh-tool-kicad'

interface Remembered {
  passed: boolean
  errors: number
  warnings: number
  unrouted?: number
  types: string[]
}

/** Latest ERC verdict per schematic and DRC verdict per board, for the prompt context. */
export class ErcMemory {
  private readonly byPath = new Map<string, Remembered>()

  remember(path: string, report: Pick<CheckReport, 'passed' | 'counts' | 'by_type' | 'unrouted'>): void {
    this.byPath.set(resolve(path), {
      passed: report.passed,
      errors: report.counts.error,
      warnings: report.counts.warning,
      ...(report.unrouted !== undefined ? { unrouted: report.unrouted } : {}),
      types: Object.keys(report.by_type ?? {}).slice(0, 5),
    })
  }

  get(path: string): Remembered | undefined {
    return this.byPath.get(resolve(path))
  }
}

const KICAD_EXT = /\.(kicad_pro|kicad_sch|kicad_pcb)$/
const MAX_FILES = 30

function scan(cwd: string): string[] {
  const found: string[] = []
  const visit = (dir: string, depth: number): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return
      if (entry.startsWith('.') || entry === 'node_modules') continue
      const full = join(dir, entry)
      if (KICAD_EXT.test(entry)) {
        found.push(full)
      } else if (depth < 1) {
        try {
          if (statSync(full).isDirectory()) visit(full, depth + 1)
        } catch {
          // unreadable entry
        }
      }
    }
  }
  visit(cwd, 0)
  return found
}

/** The KiCad project(s) in `cwd` (top level and one directory down), or '' when there are none. */
export function projectContext(cwd: string, memory?: ErcMemory): string {
  const files = scan(cwd)
  if (files.length === 0) return ''
  const rel = (p: string): string => relative(cwd, p) || p
  const group = (ext: string): string[] => files.filter(f => f.endsWith(ext))
  const lines = ['KiCad design files in the working directory:']
  const pro = group('.kicad_pro')
  if (pro.length) lines.push(`- projects: ${pro.map(rel).join(', ')}`)
  const sch = group('.kicad_sch')
  if (sch.length) lines.push(`- schematics: ${sch.map(rel).join(', ')}`)
  const pcb = group('.kicad_pcb')
  if (pcb.length) lines.push(`- boards: ${pcb.map(rel).join(', ')}`)
  for (const file of [...sch, ...pcb]) {
    const last = memory?.get(file)
    if (last) {
      const kind = file.endsWith('.kicad_pcb') ? 'DRC' : 'ERC'
      const unrouted = last.unrouted !== undefined ? `, ${last.unrouted} unrouted` : ''
      lines.push(`- last ${kind} of ${rel(file)}: ${last.passed ? 'passed' : 'FAILED'} (${last.errors} errors, ${last.warnings} warnings${unrouted}${last.types.length ? `: ${last.types.join(', ')}` : ''})`)
    }
  }
  if (files.length >= MAX_FILES) lines.push('- (listing truncated)')
  return lines.join('\n')
}
