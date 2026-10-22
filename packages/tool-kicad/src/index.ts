/**
 * dsh-tool-kicad: model-callable `kicad_*` tools. Each tool resolves paths
 * against the session's working directory and delegates to `ctx.kicad`.
 * Policy (approval, path guard, auto-ERC) lives in dsh-kicad-policy.
 */
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  attachments, defineTool, imageBlock, imageCapable, resolveIn, sessionCwd,
  type Block, type Context, type ImageRef, type ToolDefinition, type ToolExecution,
} from './dsh.ts'
import type { DoctorReport } from 'dsh-kicad-bridge'
import { formatAutoroute, formatBoard, formatCheck, formatEdit, formatFab, formatFabGate, formatJson, formatPreset, formatSync, type AutorouteValue, type BoardSummary, type CheckReport, type EditValue, type FabResult, type PresetResult, type SyncValue } from './format.ts'

export { formatAutoroute, formatBoard, formatCheck, formatEdit, formatFab, formatFabGate, formatJson, formatPreset, formatSync }
export type { AutorouteValue, BoardSummary, CheckReport, EditValue, FabResult, PresetResult, SyncValue }

export const name = 'dsh-tool-kicad'
export const inject = ['tools', 'kicad']

/** Whether a tool only reads the design (`read`) or writes files (`write`). */
export const TOOL_ACCESS = {
  kicad_doctor: 'read',
  kicad_read_schematic: 'read',
  kicad_list_components: 'read',
  kicad_get_symbol_pins: 'read',
  kicad_list_nets: 'read',
  kicad_search_symbols: 'read',
  kicad_library_symbol: 'read',
  kicad_search_footprints: 'read',
  kicad_erc: 'read',
  kicad_drc: 'read',
  kicad_render: 'read',
  kicad_export: 'write',
  kicad_export_fab: 'write',
  kicad_fab_preset: 'write',
  kicad_create_schematic: 'write',
  kicad_edit_schematic: 'write',
  kicad_read_pcb: 'read',
  kicad_edit_pcb: 'write',
  kicad_update_pcb: 'write',
  kicad_autoroute: 'write',
} as const

export type KiCadToolName = keyof typeof TOOL_ACCESS

/** Tools that change design files and therefore go through approval and ERC. */
export const DESIGN_WRITE_TOOLS: readonly KiCadToolName[] = ['kicad_create_schematic', 'kicad_edit_schematic', 'kicad_edit_pcb', 'kicad_update_pcb', 'kicad_fab_preset', 'kicad_autoroute']

/** Argument names holding file paths, per tool (for the policy's path guard). */
export const PATH_ARGUMENTS: Record<KiCadToolName, readonly string[]> = {
  kicad_doctor: [],
  kicad_read_schematic: ['path'],
  kicad_list_components: ['path'],
  kicad_get_symbol_pins: ['path'],
  kicad_list_nets: ['path'],
  kicad_search_symbols: [],
  kicad_library_symbol: [],
  kicad_search_footprints: [],
  kicad_erc: ['path'],
  kicad_drc: ['path'],
  kicad_render: ['path'],
  kicad_export: ['path', 'output'],
  kicad_export_fab: ['pcb', 'output_dir'],
  kicad_fab_preset: ['path'],
  kicad_create_schematic: ['path'],
  kicad_edit_schematic: ['path'],
  kicad_read_pcb: ['path'],
  kicad_edit_pcb: ['path'],
  kicad_update_pcb: ['schematic', 'pcb'],
  kicad_autoroute: ['pcb'],
}

/** Fab house presets shipped with the sidecar (`presets/<name>.json` + `.kicad_dru`). */
export const FAB_PRESETS = ['jlcpcb', 'pcbway'] as const
/** Optional formats `kicad_export_fab` adds to the zip. */
export const FAB_EXTRAS = ['ipc2581', 'odb', 'step'] as const

const SCH = { type: 'string', required: true, description: 'Path to a .kicad_sch file (relative to the working directory or absolute).' } as const
const PCB = { type: 'string', required: true, description: 'Path to a .kicad_pcb file (relative to the working directory or absolute).' } as const
const JSON_OUT = { schema: { type: 'json' }, render: (_args: unknown, value: unknown): Block[] => [{ type: 'text', text: formatJson(value) }] } as const

/** kicad_autoroute's default time limit for Freerouting, in seconds (the sidecar's limit is 3600). */
export const AUTOROUTE_TIMEOUT = 300
/** Time the sidecar gets beyond the router's limit: writing the design, importing the routes, KiCad's DRC and zone fill. */
const AUTOROUTE_OVERHEAD_MS = 180_000

export interface Config {
  /** Attach PNG renders as images when the model accepts image input. */
  attachRenders?: boolean
}

export function apply(ctx: Context, config: Config = {}): void {
  const attachRenders = config.attachRenders ?? true
  const at = (exec: Pick<ToolExecution, 'agent'>, path: string): string => resolveIn(sessionCwd(ctx, exec), path)

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'kicad_doctor',
      description: 'Check whether this machine can run the KiCad tools: kicad-cli present and KiCad 8+, symbol and footprint libraries, Python 3.10+, optional PNG rasterizer and kicad-python. Each check has a status and a fix; when KiCad is missing or too old the result lists install commands for this platform. Use it when a kicad_* tool fails with a KiCad/Python problem, then tell the user the fix. Do not install software yourself: the user installs KiCad (the KiCad doctor panel has an Install button, or /kicad-install).',
      parameters: {},
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: (value as unknown as DoctorReport).text }],
        presentationMeta: (_args, value) => doctorMeta(value as unknown as DoctorReport) as never,
      },
      isConcurrencySafe: () => true,
      async execute(_args, exec) {
        return await ctx.kicad.doctor(exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_read_schematic',
      description: 'Summarize a KiCad schematic: title block, counts, components (reference, value, lib_id, footprint, position in mm), net labels, power nets, sub-sheets, the page size and drawable area, and functional blocks (titled frames with the parts inside, plus parts outside every block). Start here before editing.',
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
      name: 'kicad_library_symbol',
      description: 'Inspect a library symbol before placing it: every pin (number, name, electrical type, unit), description, default footprint and footprint filters. Use this instead of reading .kicad_sym files.',
      parameters: { lib_id: { type: 'string', required: true, description: 'e.g. MCU_Microchip_ATtiny:ATtiny85-20S' } },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('library_symbol', { ...args, project_dir: sessionCwd(ctx, exec) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_search_footprints',
      description: 'Find footprints in the installed KiCad libraries by name terms ("R 0603", "SOT-223", "USB_C 6P", "PinHeader 2x03"), or confirm an exact Library:Name and list its pads. Use this instead of listing .pretty directories.',
      parameters: {
        query: { type: 'string', required: true, description: 'Name terms (all must match, * allowed) or an exact Library:Name.' },
        library: { type: 'string', description: 'Restrict to one library, e.g. Resistor_SMD.' },
        pads: { type: 'boolean', description: 'Include pad names in every result.' },
        limit: { type: 'integer', description: 'Maximum results (default 20).' },
      },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('search_footprints', { ...args, project_dir: sessionCwd(ctx, exec) }, exec.signal) as never
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
      description: "Run KiCad's Design Rules Check on a .kicad_pcb (optionally with schematic parity). KiCad's verdict is authoritative; unrouted connections count as errors. Zones are refilled first when the board has any.",
      parameters: {
        path: { type: 'string', required: true, description: 'Path to a .kicad_pcb file.' },
        severity: { type: 'string', enum: ['all', 'error', 'warning'] },
        schematic_parity: { type: 'boolean' },
        refill_zones: { type: 'boolean', description: 'Refill zones before checking (in memory only). Default: when the board has zones.' },
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
      description: 'Render a schematic (all sheets) or board with kicad-cli. Returns SVG/PNG paths under <project>/.dsh-kicad/render/ and, when the model accepts images, the first page as an image. For a board, view "3d" renders KiCad\'s 3D view (PNG): use it to check a placement, from any side or angle (side, rotate, zoom), e.g. rotate "-45,0,45" for an isometric view, side "bottom" for the back, zoom 3 on a corner with pivot.',
      parameters: {
        path: { type: 'string', required: true, description: 'A .kicad_sch or .kicad_pcb file.' },
        pages: { type: 'string', description: 'Comma-separated page numbers (schematic only).' },
        width: { type: 'integer', description: 'PNG width in pixels (default 1600).' },
        view: { type: 'string', enum: ['2d', '3d'], description: 'Boards: "3d" renders the 3D view as PNG instead of the 2D plot (default "2d").' },
        side: { type: 'string', enum: ['top', 'bottom', 'left', 'right', 'front', 'back'], description: '3D: the side the camera looks from (default top).' },
        rotate: { type: 'string', description: '3D: rotation "X,Y,Z" in degrees applied after side, e.g. "-45,0,45" (isometric from the front left), "-60,0,0" (tilted from the front).' },
        zoom: { type: 'number', description: '3D: camera zoom; 1 (default) shows the whole board, 2 is twice as close.' },
        pivot: { type: 'string', description: '3D: point to look at, "X,Y,Z" in cm from the board centre (X right, Y up the board, Z out of the top); use with zoom to look at one area.' },
        perspective: { type: 'boolean', description: '3D: perspective instead of orthographic projection (default false).' },
        quality: { type: 'string', enum: ['basic', 'high'], description: '3D: "high" ray-traces (a few seconds; default basic).' },
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
          ...(args.view ? { view: args.view } : {}),
          ...Object.fromEntries((['side', 'rotate', 'zoom', 'pivot', 'perspective', 'quality'] as const).filter(k => args[k] !== undefined).map(k => [k, args[k]])),
        }, exec.signal)
        const value: RenderValue = { path: rendered.path, svg: rendered.svg, ...(rendered.png ? { png: rendered.png } : {}) }
        if (wantImage && rendered.png?.[0]) {
          const data = await readFile(rendered.png[0])
          value.image = await attachments(ctx)!.saveImage({ data: new Uint8Array(data), mediaType: 'image/png', name: basename(rendered.png[0]) })
        } else if (!wantImage) {
          value.note = args.view === '3d'
            ? 'The current model does not accept images (or no attachment store is mounted); the PNG is on disk.'
            : 'The current model does not accept images (or no attachment store is mounted); open the SVG in the KiCad sidebar viewer.'
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
      name: 'kicad_export_fab',
      description: [
        'Produce the files to order a board: Gerbers (copper, mask, paste, silkscreen, Edge.Cuts), Excellon drill + map, position CSV and BOM, zipped,',
        'plus front/back 3D previews; with preset jlcpcb also JLC BOM/CPL. Default output <project>/fab/<preset or kicad>/.',
        'KiCad gates it first: the export is refused (nothing written) while DRC has errors, connections are unrouted, schematic parity disagrees,',
        "or the board breaks the preset fab's limits. Fix what the gate lists and export again. Use force only when the user explicitly asks to export anyway;",
        'the result then says the gate was overridden.',
      ].join(' '),
      parameters: {
        pcb: { type: 'string', required: true, description: 'Path to the .kicad_pcb.' },
        preset: { type: 'string', enum: [...FAB_PRESETS], description: "Fab house: checks the board against its limits and uses its output options." },
        output_dir: { type: 'string', description: 'Output directory (default <project>/fab/<preset or kicad>/).' },
        force: { type: 'boolean', description: 'Export even though the gate fails (recorded in the result).' },
        extras: { type: 'array', items: { type: 'string', enum: [...FAB_EXTRAS] }, description: 'Additional formats for the zip.' },
        preview: { type: 'boolean', description: 'Render front and back 3D PNGs (default true).' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => fabContent(value as unknown as FabValue),
        presentationMeta: (_args, value) => fabMeta(value as unknown as FabValue) as never,
      },
      async execute(args, exec) {
        const value = await ctx.kicad.run<FabValue>('export_fab', {
          ...args, pcb: at(exec, args.pcb), ...(args.output_dir ? { output_dir: at(exec, args.output_dir) } : {}),
        }, exec.signal)
        const top = value.exported ? value.preview?.[0] : undefined
        if (top && attachRenders && attachments(ctx) !== undefined && await imageCapable(ctx, exec)) {
          const file = join(value.output_dir, top)
          value.image = await attachments(ctx)!.saveImage({ data: new Uint8Array(await readFile(file)), mediaType: 'image/png', name: basename(file) })
        }
        return value as never
      },
    }),
    defineTool({
      name: 'kicad_fab_preset',
      description: "Adopt a fab house's limits (JLCPCB or PCBWay: minimum track, clearance, drill, annular ring, hole spacing, copper to edge) as the project's design rules, so kicad_drc checks what that fab can make: board setup minimums in the .kicad_pro, its custom rules in a managed block of the .kicad_dru (other rules are kept), netclass sizes raised to the minimums. dry_run lists the changes without writing.",
      parameters: {
        path: { type: 'string', required: true, description: "The project's .kicad_pcb or .kicad_pro." },
        preset: { type: 'string', required: true, enum: [...FAB_PRESETS] },
        dry_run: { type: 'boolean', description: 'List the changes without writing.' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatPreset(value as unknown as PresetResult) }],
      },
      async execute(args, exec) {
        return await ctx.kicad.run('fab_preset', { ...args, path: at(exec, args.path) }, exec.signal) as never
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
        'connect_pins{a,b} (a wire between two pins, routed around parts, labels and other nets; it may join wiring already on either pin, with a junction); connect_pin_to_net{pin,net,kind?:label|global_label|power} (stub + label, or a power symbol such as GND/+3V3; on a wired pin it branches off that wiring);',
        'no_connect_pin{pin}; add_wire{points:[[x,y],...]}; add_label{text,x,y,kind?,rotation?}; add_junction{x,y}; add_no_connect{x,y}.',
        'Undo/fix: disconnect_pin{pin} removes the wires, labels, power symbols and no-connect flag attached to that pin; remove_item{uuid} removes any item (uuids from kicad_read_schematic include_wiring); remove_label{text,x?,y?}; remove_wire{x,y}.',
        'Layout by function: set_page{paper?,title?,date?,rev?,company?,comments?}; add_block{title, references:[...] (frame encloses those parts with their wiring) | x,y,width,height} draws a dashed frame with a bold title;',
        'move_block{title, dx,dy | x,y} moves the frame with the parts inside and their wiring; move_symbols{references,dx,dy} moves parts with their wires, labels and power symbols (refuses if that would tear a wire to a part left behind);',
        'add_text{text,x,y,size?,bold?}; add_rectangle{x,y,width,height,style?}.',
        'Rotation is counter-clockwise: Device:R/C/L at 0° are vertical with pin 1 on top; at 90° horizontal with pin 1 on the left; add_symbol results list the placed pin positions.',
        'Wire parts that work together with connect_pins (chain a net with several pins: A-B, then B-C); use power symbols for rails and labels between blocks or across the page. A connect_pins result with a note took a detour: move, rotate or mirror a part so the pins face each other, or use labels. Keep one call to at most ~20 operations; split bigger changes. Never rewrite or recreate a .kicad_sch to fix layout — remove and re-add the affected items.',
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
    defineTool({
      name: 'kicad_read_pcb',
      description: 'Summarize a KiCad board: outline size, copper layers and thickness, design rules and net classes (from the .kicad_pro), every footprint (reference, value, footprint, position in mm, rotation, front/back side, locked, courtyard box, pad nets), zones, nets, placement checks (courtyard overlaps, footprints outside the outline, reference text over pads, total ratsnest length) and KiCad DRC\'s count of unrouted connections. Start here before editing a board.',
      parameters: {
        path: PCB,
        include_footprints: { type: 'boolean', description: 'Include the footprint list (default true).' },
        include_pads: { type: 'boolean', description: 'Also list every pad with its absolute position and layers.' },
        include_items: { type: 'boolean', description: 'Also list tracks, vias, texts and outline shapes with their uuids (for remove_item).' },
        drc: { type: 'boolean', description: 'Run KiCad DRC for the unrouted count and verdict (default true).' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatBoard(value as unknown as BoardSummary) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('read_pcb', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_edit_pcb',
      description: [
        'Apply a batch of edits to one .kicad_pcb atomically (all succeed or nothing is written); untouched text stays byte-identical. Design rules and net classes are stored in the board\'s .kicad_pro, which the same batch updates.',
        'Millimetres, Y grows downward, rotation in degrees counter-clockwise; a pad is written "REF:PAD".',
        'Outline: set_board_outline{width,height,corner_radius?,x?,y?} (rectangle; x,y is the top-left corner, default: the old outline\'s corner or centred on the parts) or set_board_outline{points:[[x,y],...]}; it replaces everything on Edge.Cuts. add_mounting_hole{x,y,drill?(3.2),plated?,footprint?,reference?}.',
        'Placement: move_footprint{reference,x?,y?,rotation?,side?:front|back} (flipping to the back mirrors the part as KiCad does); move_footprints{references,dx,dy}; lock_footprint{reference,locked?} (locked parts refuse to move).',
        'Automatic placement: auto_place{} lays out every unlocked footprint from the schematic\'s functional blocks (add_block frames; without them its sheets, else net connectivity): each block stays together, connectors sit on the board edge facing out, decoupling capacitors at their IC\'s power pins, crystals at their IC; the outline is sized to fit unless you drew one, which the parts must then fit (outline: "fit" | "keep" forces either); references:[...] places only those, e.g. parts kicad_update_pcb staged; groups:[{title,references}] overrides the blocks; gap?/group_gap?/margin? in mm. place_block{title | references, x, y, width?, height?, face?:left|right|top|bottom} lays out one block with its top-left corner at x,y or inside that rectangle. Both report the ratsnest length before/after and the placement checks; run them on a new board before routing, then check with kicad_render (view "3d").',
        'Rules: set_design_rules{min_clearance?,min_track_width?,min_via_diameter?,min_via_annular_width?,min_through_hole_diameter?,min_hole_to_hole?,min_hole_clearance?,min_copper_edge_clearance?,min_silk_clearance?,min_text_height?,...}; set_net_class{name,nets?,track_width?,clearance?,via_diameter?,via_drill?} (nets move to that class; tracks and vias on them default to its sizes).',
        'Copper: add_track{points:[[x,y] | "REF:PAD",...],net?,layer?(F.Cu),width?,locked?} (pad endpoints snap to the pad centre; the pad must be on the track\'s net and layer; locked tracks stay as they are when kicad_autoroute runs); add_via{x,y,net,diameter?,drill?,locked?}; lock_tracks{nets? | uuids?,locked?}; remove_tracks{nets?,locked?} (unroute before placing again; locked tracks stay unless locked: true); add_zone{net,layer | layers,outline?("board" | [[x,y],...]),priority?,clearance?,connect_pads?:thermal|solid|none}; add_keepout{outline,layers?,tracks?,vias?,pads?,copperpour?,footprints?} (true = not allowed).',
        'Silkscreen: add_text{text,x,y,layer?(F.SilkS),size?,thickness?,rotation?}; set_reference_text{reference,x?,y?,size?,thickness?,rotation?,hide?} (x,y on the board).',
        'Undo: remove_item{uuid} removes a footprint, track, via, zone, text or outline shape (uuids from kicad_read_pcb include_items).',
        'Keep one call to at most ~30 operations. Never rewrite a .kicad_pcb by hand. DRC runs automatically afterwards when the KiCad policy is enabled.',
      ].join(' '),
      parameters: {
        path: PCB,
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
        return await ctx.kicad.run('edit_pcb', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_update_pcb',
      description: [
        'Update PCB from Schematic, headless: create or update the board so it matches the schematic, as KiCad\'s "Update PCB from Schematic" does. Run it after the schematic passes ERC and every board symbol has a footprint, and again after every schematic change.',
        'A new board (<schematic name>.kicad_pcb, the file KiCad pairs with the schematic) gets KiCad\'s empty board, a default 2-layer stackup (copper_layers: 4 for four), every footprint packed in rows inside a placeholder outline, and KiCad\'s default design rules.',
        'It refuses, writing nothing, with every REF:PIN that cannot go on the board: a symbol without a footprint (power symbols need a "#" reference), a footprint in no library, a pin without a pad of that number. Fix those in the schematic (set_footprint, or a footprint whose pads match the pins) and run it again.',
        'On an existing board, placed footprints keep their position, rotation, side and lock; new ones are staged right of the outline for you to place (kicad_edit_pcb auto_place with their references, or move_footprint); references, values, fields and pad nets follow the schematic; a renamed net keeps its tracks, vias and zones; a changed footprint is swapped in place; footprints whose symbol is gone are listed, and deleted only with delete_removed: true. Untouched text stays byte-identical; a second run changes nothing.',
        'The result ends with KiCad\'s schematic parity count: the board matches the schematic only at 0. Use dry_run to preview.',
      ].join(' '),
      parameters: {
        schematic: SCH,
        pcb: { type: 'string', description: 'The board (default: <schematic name>.kicad_pcb next to the schematic, where KiCad looks for it). Created when missing.' },
        delete_removed: { type: 'boolean', description: 'Delete footprints whose symbol is gone (default false: they are only listed). Locked ones stay.' },
        dry_run: { type: 'boolean', description: 'List the changes without writing.' },
        copper_layers: { type: 'integer', enum: [2, 4], description: 'Copper layers of a new board (default 2).' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatSync(value as unknown as SyncValue) }],
      },
      async execute(args, exec) {
        return await ctx.kicad.run('update_pcb', {
          ...args, schematic: at(exec, args.schematic), ...(args.pcb ? { pcb: at(exec, args.pcb) } : {}),
        }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_autoroute',
      description: [
        'Route a board with the Freerouting autorouter, headless, then let KiCad judge it. Run it after placement (every part inside the outline, nothing overlapping).',
        'Tracks and vias already on the board are kept exactly as they are and the router routes around and onto them: route critical nets by hand first (power, USB/differential pairs, crystals) with kicad_edit_pcb add_track/add_via locked: true, then autoroute the rest.',
        'nets routes only those nets, exclude_nets leaves nets unrouted (names or glob patterns). Only new tracks and vias are added; footprints never move.',
        'Copper zones are refilled and saved afterwards, so add a GND pour (add_zone on both copper layers; connect_pads: solid avoids starved thermal reliefs) before or after routing.',
        'The result gives KiCad\'s unrouted count; the automatic DRC follows. If connections stay unrouted, route those by hand, or give the parts more room (after auto_place: remove_tracks, then auto_place with outline "fit" and a larger gap, e.g. 2 and group_gap 4) and run it again (existing tracks are kept).',
        'Needs Java and Freerouting: when they are missing the error says how to install them; tell the user (/kicad-install freerouting), never install anything yourself.',
        `Long-running: timeout (default ${AUTOROUTE_TIMEOUT} s) stops the router, keeping what it routed.`,
      ].join(' '),
      parameters: {
        pcb: PCB,
        nets: { type: 'array', items: { type: 'string' }, description: 'Route only these nets (names or glob patterns such as "/LED*").' },
        exclude_nets: { type: 'array', items: { type: 'string' }, description: 'Leave these nets unrouted, e.g. nets you route by hand later.' },
        passes: { type: 'integer', description: 'Maximum routing passes (default: Freerouting\'s own; it stops when it no longer improves).' },
        timeout: { type: 'number', description: `Seconds before the router stops and keeps what it has (default ${AUTOROUTE_TIMEOUT}, at most 3600).` },
        fill_zones: { type: 'boolean', description: 'Refill and save copper zones afterwards (default true).' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatAutoroute(value as unknown as AutorouteValue) }],
      },
      async execute(args, exec) {
        const seconds = Math.min(Math.max(args.timeout ?? AUTOROUTE_TIMEOUT, 5), 3600)
        const log = ctx.logger('kicad')
        return await ctx.kicad.run('autoroute', { ...args, pcb: at(exec, args.pcb) }, exec.signal, {
          timeoutMs: seconds * 1000 + AUTOROUTE_OVERHEAD_MS,
          onProgress: p => log.debug('autoroute %s: %s', args.pcb, p.message ?? p.progress),
        }) as never
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

interface FabValue extends FabResult {
  image?: ImageRef
}

function fabContent(value: FabValue): Block[] {
  const blocks: Block[] = [{ type: 'text', text: formatFab(value) }]
  if (value.image) blocks.push(imageBlock(value.image))
  return blocks
}

/** Bounded, replayable data for a fab export card. */
export function fabMeta(r: FabResult): Record<string, unknown> {
  return {
    kind: 'fab',
    exported: r.exported,
    refused: r.refused,
    forced: r.forced,
    preset: r.preset,
    output_dir: r.output_dir,
    zip: r.zip ?? null,
    gate: { passed: r.gate.passed, blocking: r.gate.blocking, drc: r.gate.drc, unrouted: r.gate.unrouted, parity: { checked: r.gate.parity.checked, issues: r.gate.parity.issues } },
    layers: r.layers ?? [],
    files: (r.files ?? []).length,
    preview: r.preview ?? [],
  }
}

function renderContent(value: RenderValue): Block[] {
  const lines = [`Rendered ${value.path}`, ...value.svg.map(p => `svg: ${p}`), ...(value.png ?? []).map(p => `png: ${p}`)]
  if (value.note) lines.push(value.note)
  const blocks: Block[] = [{ type: 'text', text: lines.join('\n') }]
  if (value.image) blocks.push(imageBlock(value.image))
  return blocks
}

/** Replayable data for the doctor card: statuses, fixes and install plans (no paths beyond kicad-cli). */
export function doctorMeta(report: DoctorReport): Record<string, unknown> {
  return {
    kind: 'doctor',
    ok: report.ok,
    status: report.status,
    summary: report.summary,
    kicad: report.kicad,
    checks: report.checks.map(c => ({ id: c.id, label: c.label, status: c.status, required: c.required, summary: c.summary, ...(c.fix ? { fix: c.fix } : {}) })),
    install: report.install.map(o => ({
      id: o.id, label: o.label, command: o.command, needs_root: o.needs_root, runnable: o.runnable,
      available: o.available, recommended: o.recommended, note: o.note, ...(o.url ? { url: o.url } : {}),
    })),
  }
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
