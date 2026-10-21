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
  /** DRC only: missing connections (each also counts as an error). */
  unrouted?: number
  /** DRC with schematic parity only: why the comparison could not run (no parity issues are reported then). */
  schematic_parity_error?: string
  violations: CheckViolation[]
}

export interface EditValue {
  path: string
  written: boolean
  applied: number
  changes: string[]
  /** Every file written (a board edit may also write the .kicad_pro). */
  files?: string[]
  results?: unknown[]
}

type Box = [number, number, number, number]

export interface BoardFootprint {
  reference: string
  value: string
  footprint: string
  at: [number, number]
  rotation: number
  side: 'front' | 'back'
  locked?: boolean
  courtyard?: Box
  pad_nets: Record<string, string>
  pads?: Array<{ number: string, net: string, at: [number, number], layers: string[] }>
}

export interface BoardSummary {
  path: string
  format: { version: number, generator_version?: string | null, nets: 'named' | 'numbered' }
  board: {
    outline: { bbox: Box, width: number, height: number, items: number, shape: string, corner_radius?: number, points?: Array<[number, number]> } | null
    thickness: number
    copper_layers: string[]
  }
  counts: { footprints: number, nets: number, segments: number, vias: number, zones: number }
  project_file: string | null
  design_rules: Record<string, number | boolean>
  net_classes: Array<{ name: string, track_width?: number, clearance?: number, via_diameter?: number, via_drill?: number, nets?: string[] }>
  zones?: Array<{ uuid: string, layers: string[], bbox: Box | null, net?: string, name?: string, priority?: string, keepout?: string[] }>
  nets: string[]
  footprints?: BoardFootprint[]
  items?: {
    tracks: Array<{ kind: string, uuid: string, net: string, layer?: string, layers?: string[], start?: [number, number], end?: [number, number], at?: [number, number], width?: number, size?: number, drill?: number }>
    texts: Array<{ text: string, at: [number, number], layer: string, uuid: string }>
    outline: Array<{ kind: string, uuid: string }>
  }
  drc?: { passed: boolean, kicad_version?: string, errors: number, warnings: number, unrouted: number, by_type: Record<string, number> } | { error: string }
}

const MAX_LISTED = 60

export function formatCheck(report: CheckReport): string {
  const label = report.kind.toUpperCase()
  const verdict = report.passed ? 'PASSED' : 'FAILED'
  const head = `${label} by KiCad ${report.kicad_version ?? ''}`.trim()
    + `${report.path ? ` on ${report.path}` : ''}: ${verdict} — ${report.counts.error} error(s), ${report.counts.warning} warning(s)`
    + (report.unrouted !== undefined ? `, ${report.unrouted} unrouted` : '')
    + (report.counts.exclusion ? `, ${report.counts.exclusion} excluded` : '')
    + (report.schematic_parity_error ? `\nSchematic parity was NOT checked: ${report.schematic_parity_error}` : '')
  const active = report.violations.filter(v => !v.excluded)
  if (active.length === 0) return head
  const lines = active.slice(0, MAX_LISTED).map(violationLine)
  if (active.length > MAX_LISTED) lines.push(`… ${active.length - MAX_LISTED} more`)
  return `${head}\n${lines.join('\n')}`
}

export function formatEdit(value: EditValue): string {
  const also = (value.files ?? []).filter(f => f !== value.path)
  const head = value.written
    ? `Wrote ${value.path}${also.length ? ` and ${also.join(', ')}` : ''} (${value.applied} operations).`
    : `Dry run on ${value.path}: ${value.applied} operations valid, nothing written.`
  const results = value.results?.length ? `\nResults:\n${formatJson(value.results)}` : ''
  return `${head}\n${value.changes.map(c => `- ${c}`).join('\n')}${results}`
}

const KEY_RULES = [
  'min_clearance', 'min_track_width', 'min_via_diameter', 'min_via_annular_width', 'min_through_hole_diameter', 'min_hole_to_hole',
  'min_hole_clearance', 'min_copper_edge_clearance', 'min_silk_clearance', 'min_text_height', 'min_text_thickness',
]

/** The board as compact text: what the model needs to place, route and check (mm, degrees). */
export function formatBoard(b: BoardSummary): string {
  const mm = (n: number): number => Math.round(n * 1000) / 1000
  const pt = (p: readonly number[]): string => `(${mm(p[0])}, ${mm(p[1])})`
  const lines = [`Board ${b.path} — KiCad ${b.format.generator_version ?? '?'} file (format ${b.format.version})`]
  const o = b.board.outline
  lines.push(o
    ? `Outline: ${o.shape === 'polygon' ? `polygon of ${o.points?.length ?? '?'} points` : o.shape === 'rectangle' ? 'rectangle' : `${o.items} Edge.Cuts shapes`}, ${mm(o.width)} × ${mm(o.height)} mm, ${pt(o.bbox)}–${pt(o.bbox.slice(2))}${o.corner_radius ? `, corner radius ${o.corner_radius}` : ''}`
    : 'Outline: none (add one with set_board_outline)')
  lines.push(`Layers: ${b.board.copper_layers.length} copper (${b.board.copper_layers.join(', ')}), ${b.board.thickness} mm thick`)
  const rules = KEY_RULES.filter(k => b.design_rules[k] !== undefined).map(k => `${k} ${b.design_rules[k]}`)
  lines.push(`Design rules${b.project_file ? '' : ' (no .kicad_pro: KiCad defaults)'}: ${rules.length ? rules.join(', ') : 'KiCad defaults'}`)
  lines.push(`Net classes: ${b.net_classes.map(c => `${c.name} (track ${c.track_width ?? '?'}, clearance ${c.clearance ?? '?'}, via ${c.via_diameter ?? '?'}/${c.via_drill ?? '?'})${c.nets?.length ? `: ${c.nets.join(', ')}` : ''}`).join('; ')}`)
  if (b.drc && 'error' in b.drc) {
    lines.push(`DRC could not run: ${b.drc.error}`)
  } else if (b.drc) {
    const types = Object.entries(b.drc.by_type).filter(([t]) => t !== 'unconnected_items').map(([t, n]) => `${t}×${n}`)
    lines.push(`DRC by KiCad ${b.drc.kicad_version ?? ''}: ${b.drc.unrouted} unrouted connection(s), ${b.drc.errors - b.drc.unrouted} other error(s), ${b.drc.warnings} warning(s)${types.length ? ` (${types.join(', ')})` : ''}`)
  }
  if (b.footprints) {
    lines.push(`Footprints (${b.footprints.length}): reference value footprint @ position rotation side`)
    for (const f of b.footprints) {
      const pads = Object.entries(f.pad_nets).map(([n, net]) => `${n}=${net}`).join(' ')
      lines.push(`- ${f.reference} ${f.value} ${f.footprint} @ ${pt(f.at)} ${f.rotation}° ${f.side}${f.locked ? ' LOCKED' : ''}`
        + (f.courtyard ? `, courtyard ${pt(f.courtyard)}–${pt(f.courtyard.slice(2))}` : '') + (pads ? `; pads ${pads}` : ''))
      for (const p of f.pads ?? []) lines.push(`    pad ${p.number} ${p.net || '(no net)'} @ ${pt(p.at)} ${p.layers[0] ?? ''}`)
    }
  }
  if (b.zones?.length) {
    lines.push(`Zones (${b.zones.length}):`)
    for (const z of b.zones) {
      const what = z.keepout ? `keepout (no ${z.keepout.join(', ')})` : `${z.net ?? '(no net)'} pour`
      lines.push(`- ${what} on ${z.layers.join(', ')}${z.name ? ` "${z.name}"` : ''}${z.priority ? ` priority ${z.priority}` : ''}${z.bbox ? `, ${pt(z.bbox)}–${pt(z.bbox.slice(2))}` : ''} [${z.uuid}]`)
    }
  }
  lines.push(`Copper: ${b.counts.segments} track segment(s), ${b.counts.vias} via(s)`)
  if (b.items) {
    for (const t of b.items.tracks) {
      lines.push(t.kind === 'via'
        ? `- via ${t.net} @ ${pt(t.at ?? [0, 0])} ${t.size}/${t.drill} [${t.uuid}]`
        : `- ${t.kind} ${t.net} ${t.layer} ${pt(t.start ?? [0, 0])}→${pt(t.end ?? [0, 0])} width ${t.width} [${t.uuid}]`)
    }
    for (const t of b.items.texts) lines.push(`- text "${t.text}" ${t.layer} @ ${pt(t.at)} [${t.uuid}]`)
    for (const s of b.items.outline) lines.push(`- outline ${s.kind} [${s.uuid}]`)
  }
  lines.push(`Nets (${b.counts.nets}): ${b.nets.join(', ')}`)
  return lines.join('\n')
}

function violationLine(v: CheckViolation): string {
  const where = v.items.map(i => `${i.description ?? ''}${i.pos ? ` @ (${round(i.pos.x)}, ${round(i.pos.y)})` : ''}`).filter(Boolean).join('; ')
  return `- [${v.severity}] ${v.type}: ${v.description}${where ? ` — ${where}` : ''}${v.sheet && v.sheet !== '/' ? ` [sheet ${v.sheet}]` : ''}`
}

export interface FabGate {
  passed: boolean
  blocking: string[]
  kicad_version?: string
  drc: { errors: number, warnings: number, by_type: Record<string, number> }
  unrouted: number
  parity: { checked: boolean, issues: number, schematic?: string | null, note?: string }
  preset?: { name: string, label: string, errors: number, by_type: Record<string, number> }
  violations: CheckViolation[]
}

export interface FabFile {
  path: string
  kind: string
  bytes: number
  layer?: string | null
  function?: string | null
  holes?: number
  tools?: number
}

/** The `export_fab` result: refused (nothing written) or exported (possibly forced past a failed gate). */
export interface FabResult {
  pcb: string
  preset: string | null
  preset_label?: string
  output_dir: string
  exported: boolean
  refused: boolean
  forced: boolean
  gate: FabGate
  zip?: string
  board?: { width_mm?: number, height_mm?: number, copper_layers?: number, thickness_mm?: number } | null
  layers?: string[]
  files?: FabFile[]
  preview?: string[]
  warnings?: string[]
  notes?: string[]
}

export function formatFabGate(gate: FabGate): string {
  if (!gate.passed) return `FAILED — ${gate.blocking.join('; ')}`
  const parity = gate.parity.checked ? 'schematic parity clean' : `schematic parity not checked (${gate.parity.note ?? 'no schematic'})`
  const preset = gate.preset ? `, within ${gate.preset.label} limits` : ''
  return `PASSED by KiCad ${gate.kicad_version ?? ''}`.trimEnd() + ` — 0 DRC errors (${gate.drc.warnings} warning(s)), 0 unrouted, ${parity}${preset}`
}

export function formatFab(r: FabResult): string {
  const fab = r.preset_label ?? 'generic KiCad output'
  if (!r.exported) {
    const listed = r.gate.violations.slice(0, MAX_LISTED).map(violationLine)
    return [
      `Fab export REFUSED for ${r.pcb} (${fab}): the board is not ready to order, so nothing was written.`,
      ...r.gate.blocking.map(b => `- ${b}`),
      ...(listed.length ? ['Details:', ...listed] : []),
      'Fix these and export again (kicad_drc shows the full report), or pass force: true to export anyway; the result will record the override.',
    ].join('\n')
  }
  const head = r.forced
    ? `Fab files exported WITH force for ${r.pcb} (${fab}). The gate failed: this board is not ready to order.`
    : `Fab files exported for ${r.pcb} (${fab}).`
  const lines = [head, `Gate: ${formatFabGate(r.gate)}`, `Zip: ${r.zip}`]
  const b = r.board
  if (b?.width_mm) lines.push(`Board: ${b.width_mm} × ${b.height_mm} mm, ${b.copper_layers} copper layer(s), ${b.thickness_mm} mm thick`)
  lines.push(`Files in ${r.output_dir}:`)
  for (const f of r.files ?? []) {
    const what = f.layer ? f.layer : f.kind === 'drill' ? `drill, ${f.holes} hole(s), ${f.tools} tool(s)` : f.kind
    lines.push(`- ${f.path} — ${what}`)
  }
  if (r.preview?.length) lines.push(`3D preview: ${r.preview.join(', ')}`)
  if (r.warnings?.length) lines.push('Warnings:', ...r.warnings.map(w => `- ${w}`))
  if (r.notes?.length) lines.push(`Notes (${fab}):`, ...r.notes.map(n => `- ${n}`))
  return lines.join('\n')
}

export interface PresetResult {
  preset: string
  label: string
  project: string
  dru: string
  written: boolean
  dry_run: boolean
  changes: string[]
  notes: string[]
}

export function formatPreset(r: PresetResult): string {
  if (r.changes.length === 0) return `${r.project} already uses the ${r.label} rules; nothing changed.`
  const head = r.dry_run ? `Dry run: applying ${r.label} to ${r.project} would change:` : `Applied ${r.label} to ${r.project}:`
  return [head, ...r.changes.map(c => `- ${c}`), ...(r.written ? ['kicad_drc now checks the board against these rules.'] : [])].join('\n')
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 1)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
