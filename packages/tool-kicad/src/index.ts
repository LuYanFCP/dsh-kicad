/**
 * dsh-tool-kicad: model-callable `kicad_*` tools. Each tool resolves paths
 * against the session's working directory and delegates to `ctx.kicad`.
 * Policy (approval, path guard, auto-ERC) lives in dsh-kicad-policy.
 */
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  attachments, defineTool, imageBlock, imageCapable, resolveIn, sessionCwd,
  type Block, type Context, type ImageRef, type ToolDefinition, type ToolExecution,
} from './dsh.ts'
import { formatCheck, formatJson, type CheckReport } from './format.ts'

export { formatCheck, formatJson }
export type { CheckReport }

export const name = 'dsh-tool-kicad'
export const inject = ['tools', 'kicad']

/** Whether a tool only reads the design (`read`) or writes files (`write`). */
export const TOOL_ACCESS = {
  kicad_read_schematic: 'read',
  kicad_list_components: 'read',
  kicad_get_symbol_pins: 'read',
  kicad_list_nets: 'read',
  kicad_search_symbols: 'read',
  kicad_erc: 'read',
  kicad_drc: 'read',
  kicad_render: 'read',
  kicad_export: 'write',
  kicad_create_schematic: 'write',
  kicad_edit_schematic: 'write',
} as const

export type KiCadToolName = keyof typeof TOOL_ACCESS

/** Tools that change design files and therefore go through approval and ERC. */
export const DESIGN_WRITE_TOOLS: readonly KiCadToolName[] = ['kicad_create_schematic', 'kicad_edit_schematic']

/** Argument names holding file paths, per tool (for the policy's path guard). */
export const PATH_ARGUMENTS: Record<KiCadToolName, readonly string[]> = {
  kicad_read_schematic: ['path'],
  kicad_list_components: ['path'],
  kicad_get_symbol_pins: ['path'],
  kicad_list_nets: ['path'],
  kicad_search_symbols: [],
  kicad_erc: ['path'],
  kicad_drc: ['path'],
  kicad_render: ['path'],
  kicad_export: ['path', 'output'],
  kicad_create_schematic: ['path'],
  kicad_edit_schematic: ['path'],
}

const SCH = { type: 'string', required: true, description: 'Path to a .kicad_sch file (relative to the working directory or absolute).' } as const
const JSON_OUT = { schema: { type: 'json' }, render: (_args: unknown, value: unknown): Block[] => [{ type: 'text', text: formatJson(value) }] } as const

export interface Config {
  /** Attach PNG renders as images when the model accepts image input. */
  attachRenders?: boolean
}

export function apply(ctx: Context, config: Config = {}): void {
  const attachRenders = config.attachRenders ?? true
  const at = (exec: Pick<ToolExecution, 'agent'>, path: string): string => resolveIn(sessionCwd(ctx, exec), path)

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'kicad_read_schematic',
      description: 'Summarize a KiCad schematic: title block, counts, components (reference, value, lib_id, footprint, position in mm), net labels, power nets and sub-sheets. Start here before editing.',
      parameters: {
        path: SCH,
        include_components: { type: 'boolean', description: 'Include the component list (default true).' },
        include_subsheets: { type: 'boolean', description: 'Also summarize every sub-sheet.' },
        include_wiring: { type: 'boolean', description: 'Also list wires, junctions and no-connect flags with their uuids (for remove_item).' },
      },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('read_schematic', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_list_components',
      description: 'List placed components, optionally filtered by a substring of reference, value, lib_id or footprint.',
      parameters: { path: SCH, filter: { type: 'string' } },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('list_components', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_get_symbol_pins',
      description: 'Pins of one placed symbol: number, name, electrical type, absolute position (mm) and outward direction. Use before wiring.',
      parameters: { path: SCH, reference: { type: 'string', required: true, description: 'Reference designator, e.g. U1.' } },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('get_symbol_pins', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_list_nets',
      description: 'Connectivity as KiCad computes it (netlist export): each net with its member pins. Use to verify what is actually connected.',
      parameters: { path: SCH, net: { type: 'string', description: 'Only nets whose name contains this text.' } },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('list_nets', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_search_symbols',
      description: 'Search the installed KiCad symbol libraries (plus the project sym-lib-table) by keywords. Returns lib_ids such as "Device:R" for kicad_edit_schematic add_symbol.',
      parameters: {
        query: { type: 'string', required: true, description: 'Keywords, e.g. "ldo 3.3" or "usb c receptacle".' },
        library: { type: 'string', description: 'Restrict to one library nickname, e.g. Device.' },
        limit: { type: 'integer', description: 'Maximum results (default 20).' },
      },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('search_symbols', { ...args, project_dir: sessionCwd(ctx, exec) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_erc',
      description: "Run KiCad's Electrical Rules Check. KiCad's verdict is authoritative: do not judge electrical correctness yourself. Fix errors, then run again.",
      parameters: { path: SCH, severity: { type: 'string', enum: ['all', 'error', 'warning'] } },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatCheck(value as unknown as CheckReport) }],
        presentationMeta: (_args, value) => checkMeta(value as unknown as CheckReport) as never,
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('erc', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_drc',
      description: "Run KiCad's Design Rules Check on a .kicad_pcb (optionally with schematic parity). KiCad's verdict is authoritative.",
      parameters: {
        path: { type: 'string', required: true, description: 'Path to a .kicad_pcb file.' },
        severity: { type: 'string', enum: ['all', 'error', 'warning'] },
        schematic_parity: { type: 'boolean' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatCheck(value as unknown as CheckReport) }],
        presentationMeta: (_args, value) => checkMeta(value as unknown as CheckReport) as never,
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('drc', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_render',
      description: 'Render a schematic (all sheets) or board with kicad-cli. Returns SVG/PNG paths under <project>/.dsh-kicad/render/ and, when the model accepts images, the first page as an image.',
      parameters: {
        path: { type: 'string', required: true, description: 'A .kicad_sch or .kicad_pcb file.' },
        pages: { type: 'string', description: 'Comma-separated page numbers (schematic only).' },
        width: { type: 'integer', description: 'PNG width in pixels (default 1600).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: true,
          properties: {
            path: { type: 'string', required: true },
            svg: { type: 'array', items: { type: 'string' }, required: true },
            png: { type: 'array', items: { type: 'string' } },
            image: { type: 'json' },
            note: { type: 'string' },
          },
        },
        render: (_args, value) => renderContent(value as unknown as RenderValue),
        presentationMeta: (_args, value) => ({ svg: value.svg, png: value.png ?? [] }),
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const path = at(exec, args.path)
        const wantImage = attachRenders && attachments(ctx) !== undefined && await imageCapable(ctx, exec)
        const rendered = await ctx.kicad.run<RenderValue>('render', {
          path, format: wantImage ? 'png' : 'svg', pages: args.pages, width: args.width ?? 1600,
        }, exec.signal)
        const value: RenderValue = { path: rendered.path, svg: rendered.svg, ...(rendered.png ? { png: rendered.png } : {}) }
        if (wantImage && rendered.png?.[0]) {
          const data = await readFile(rendered.png[0])
          value.image = await attachments(ctx)!.saveImage({ data: new Uint8Array(data), mediaType: 'image/png', name: basename(rendered.png[0]) })
        } else if (!wantImage) {
          value.note = 'The current model does not accept images (or no attachment store is mounted); open the SVG in the KiCad sidebar viewer.'
        }
        return value as never
      },
    }),
    defineTool({
      name: 'kicad_export',
      description: 'Export a netlist or a bill of materials with kicad-cli. Without output, the BOM is returned inline.',
      parameters: {
        path: SCH,
        kind: { type: 'string', enum: ['netlist', 'bom'], required: true },
        output: { type: 'string', description: 'Destination file; required for netlist.' },
        format: { type: 'string', description: 'Netlist format (kicadsexpr, kicadxml, spice, ...).' },
        group_by: { type: 'string', description: 'BOM grouping fields (default "Value,Footprint").' },
      },
      output: JSON_OUT,
      async execute(args, exec) {
        const path = at(exec, args.path)
        if (args.kind === 'netlist') {
          if (!args.output) throw new Error('output is required for a netlist export')
          return await ctx.kicad.run('export_netlist', { path, output: at(exec, args.output), ...(args.format ? { format: args.format } : {}) }, exec.signal) as never
        }
        return await ctx.kicad.run('export_bom', {
          path, ...(args.output ? { output: at(exec, args.output) } : {}), ...(args.group_by ? { group_by: args.group_by } : {}),
        }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_create_schematic',
      description: 'Create a blank KiCad 10 schematic (plus a minimal .kicad_pro when the directory has none).',
      parameters: { path: SCH, paper: { type: 'string', description: 'Paper size (default A4).' } },
      output: JSON_OUT,
      async execute(args, exec) {
        return await ctx.kicad.run('create_schematic', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_edit_schematic',
      description: [
        'Apply a batch of edits to one .kicad_sch atomically (all succeed or nothing is written); untouched text stays byte-identical.',
        'Coordinates are millimetres, Y grows downward, everything snaps to the 1.27 mm grid. Pins are written "REF:PIN" (pin number or name).',
        'Operations: add_symbol{lib_id,x,y,reference?("R?" auto-numbers),value?,rotation?(0/90/180/270),mirror?(x|y),unit?,footprint?,properties?,dnp?};',
        'set_value{reference,value}; set_footprint{reference,footprint}; set_property{reference,name,value,hide?}; move_symbol{reference,x,y,rotation?}; remove_symbol{reference};',
        'connect_pins{a,b} (orthogonal wire between two pins); connect_pin_to_net{pin,net,kind?:label|global_label|power} (stub + label, or a power symbol such as GND/+3V3);',
        'no_connect_pin{pin}; add_wire{points:[[x,y],...]}; add_label{text,x,y,kind?,rotation?}; add_junction{x,y}; add_no_connect{x,y}.',
        'Undo/fix: disconnect_pin{pin} removes the wires, labels, power symbols and no-connect flag attached to that pin; remove_item{uuid} removes any item (uuids from kicad_read_schematic include_wiring); remove_label{text,x?,y?}; remove_wire{x,y}.',
        'Rotation is counter-clockwise: Device:R/C/L at 0° are vertical with pin 1 on top; at 90° horizontal with pin 1 on the left; add_symbol results list the placed pin positions.',
        'Prefer connect_pin_to_net with labels over long wires. Keep one call to at most ~20 operations; split bigger changes. Never rewrite or recreate a .kicad_sch to fix layout — remove and re-add the affected items.',
        'ERC runs automatically afterwards when the KiCad policy is enabled.',
      ].join(' '),
      parameters: {
        path: SCH,
        operations: {
          type: 'array',
          required: true,
          items: { type: 'object', additionalProperties: true, properties: { op: { type: 'string', required: true } } },
          description: 'Ordered edit operations.',
        },
        dry_run: { type: 'boolean', description: 'Validate without writing.' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatEdit(value as unknown as EditValue) }],
        presentationMeta: (_args, value) => ({ changes: (value as unknown as EditValue).changes ?? [], written: (value as unknown as EditValue).written }),
      },
      async execute(args, exec) {
        if (args.operations.length === 0) throw new Error('operations must not be empty')
        return await ctx.kicad.run('edit_schematic', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
  ]
  for (const tool of tools) ctx.effect(() => ctx.tools.register(tool), `kicad tool ${tool.name}`)
}

interface RenderValue {
  path: string
  svg: string[]
  png?: string[]
  image?: ImageRef
  note?: string
}

interface EditValue {
  path: string
  written: boolean
  applied: number
  changes: string[]
  results?: unknown[]
}

function renderContent(value: RenderValue): Block[] {
  const lines = [`Rendered ${value.path}`, ...value.svg.map(p => `svg: ${p}`), ...(value.png ?? []).map(p => `png: ${p}`)]
  if (value.note) lines.push(value.note)
  const blocks: Block[] = [{ type: 'text', text: lines.join('\n') }]
  if (value.image) blocks.push(imageBlock(value.image))
  return blocks
}

function formatEdit(value: EditValue): string {
  const head = value.written ? `Wrote ${value.path} (${value.applied} operations).` : `Dry run on ${value.path}: ${value.applied} operations valid, nothing written.`
  const results = value.results?.length ? `\nResults:\n${formatJson(value.results)}` : ''
  return `${head}\n${value.changes.map(c => `- ${c}`).join('\n')}${results}`
}

/** Bounded, replayable data for the conversation card. */
export function checkMeta(report: CheckReport): Record<string, unknown> {
  return {
    kind: report.kind,
    passed: report.passed,
    counts: report.counts,
    by_type: report.by_type,
    kicad_version: report.kicad_version ?? null,
    violations: report.violations.slice(0, 50).map(v => ({
      severity: v.severity, type: v.type, description: v.description,
      items: v.items.slice(0, 4).map(i => ({ description: i.description ?? '', ...(i.pos ? { pos: i.pos } : {}) })),
    })),
  }
}
