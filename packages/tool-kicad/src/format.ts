/** Model-facing text for KiCad results. Pure functions. */

export interface CheckViolation {
  severity: string
  type: string
  description: string
  items: Array<{ description?: string, pos?: { x: number, y: number } }>
  sheet?: string
  excluded?: boolean
}

export interface CheckReport {
  kind: 'erc' | 'drc'
  path?: string
  passed: boolean
  kicad_version?: string
  counts: { error: number, warning: number, exclusion: number, total: number }
  by_type: Record<string, number>
  violations: CheckViolation[]
}

const MAX_LISTED = 60

export function formatCheck(report: CheckReport): string {
  const label = report.kind.toUpperCase()
  const verdict = report.passed ? 'PASSED' : 'FAILED'
  const head = `${label} by KiCad ${report.kicad_version ?? ''}`.trim()
    + `${report.path ? ` on ${report.path}` : ''}: ${verdict} — ${report.counts.error} error(s), ${report.counts.warning} warning(s)`
    + (report.counts.exclusion ? `, ${report.counts.exclusion} excluded` : '')
  const active = report.violations.filter(v => !v.excluded)
  if (active.length === 0) return head
  const lines = active.slice(0, MAX_LISTED).map((v) => {
    const where = v.items.map(i => `${i.description ?? ''}${i.pos ? ` @ (${round(i.pos.x)}, ${round(i.pos.y)})` : ''}`).filter(Boolean).join('; ')
    return `- [${v.severity}] ${v.type}: ${v.description}${where ? ` — ${where}` : ''}${v.sheet && v.sheet !== '/' ? ` [sheet ${v.sheet}]` : ''}`
  })
  if (active.length > MAX_LISTED) lines.push(`… ${active.length - MAX_LISTED} more`)
  return `${head}\n${lines.join('\n')}`
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 1)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
