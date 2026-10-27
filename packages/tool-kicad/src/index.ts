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
import { eng, formatAutoroute, formatBoard, formatCheck, formatEdit, formatFab, formatFabGate, formatJson, formatFirmware, formatMcu, formatPreset, formatSimModel, formatSimulate, formatSync, type AutorouteValue, type BoardSummary, type CheckReport, type EditValue, type FabResult, type FirmwareAssertion, type FirmwareHazard, type FirmwareRun, type McuCheckValue, type McuFinding, type MonteCarlo, type PresetResult, type SimAssertion, type SimModelValue, type SimulateValue, type SyncValue } from './format.ts'

export { eng, formatAutoroute, formatBoard, formatCheck, formatEdit, formatFab, formatFabGate, formatJson, formatFirmware, formatMcu, formatPreset, formatSimModel, formatSimulate, formatSync }
export type { AutorouteValue, BoardSummary, CheckReport, EditValue, FabResult, FirmwareAssertion, FirmwareHazard, FirmwareRun, McuCheckValue, McuFinding, MonteCarlo, PresetResult, SimAssertion, SimModelValue, SimulateValue, SyncValue }

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
  kicad_simulate: 'read',
  kicad_sim_model: 'read',
  kicad_check_mcu: 'read',
  kicad_simulate_firmware: 'read',
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
  kicad_simulate: ['path', 'output_dir', 'spec'],
  kicad_sim_model: ['path'],
  kicad_check_mcu: ['path'],
  kicad_simulate_firmware: ['path', 'firmware', 'scenario'],
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
      name: 'kicad_simulate',
      description: [
        'Verify what a schematic does with SPICE, then let the tool judge it: KiCad exports the netlist (symbols\' Sim.* properties; sources from Simulation_SPICE such as VDC, VSIN, VPULSE), ngspice runs it headless, and every assertion is checked against the numbers (never decide by eye).',
        'Analyses: op (DC operating point, the default), tran {stop, step?} (transient), ac {start, stop, points?} (frequency sweep; needs a source with an ac magnitude). Probes: V(net), V(netA,netB), I(R1|C1|L1|D1|V1); ngspice sign: a source that supplies current reads negative, so use abs: true.',
        'assertions: [{probe, min?, max?, equals? with tol or tol_pct, name?, analysis?, measure?, at?, from?, to?, ref?, abs?}]. Numbers take SPICE suffixes (10k, 100n, 3.3, 20m). Measures: op value; tran final|initial|max|min|mean|rms|pp|at (at = time, from/to a window); ac gain_db|phase_deg (at = frequency)|peak_gain_db|lowpass_cutoff_hz|highpass_cutoff_hz (ref: e.g. V(IN) for gain relative to the input).',
        'Turn each requirement into an assertion (e.g. 3V3 rail: {probe: "V(3V3)", min: 3.2, max: 3.4}; LED current: {probe: "I(D1)", min: "5m", max: "15m", abs: true}); on a failure change the circuit and run again. Report the tool\'s verdict, not your own.',
        'Keep the requirements with the project: save_spec: true writes this call\'s analyses, assertions and monte_carlo to <schematic name>.sim.json; later calls (and the /simulate command) use that file when it exists, so a change can be re-verified against every requirement without retyping them. Arguments you pass replace the same key of the file.',
        'Tolerance: add monte_carlo to learn whether the requirements still hold when parts vary (e.g. 5% resistors); it reports pass counts and the spread per assertion, with the first failing draw.',
        'Every simulated part needs a SPICE model: R, C, L work from the value; a diode or LED needs set_sim_model {reference, device: "D", params: "is=1e-18 n=2 rs=3" for an LED}, otherwise the tool refuses; ICs, regulators and transistors need a vendor model: find it with kicad_sim_model and bind it with kicad_edit_schematic set_sim_model (it maps the pins and checks them); parts without a model are left out and listed. The circuit needs a ground net (a power:GND symbol) and, for tran/ac, a source.',
        'Needs ngspice: when it is missing the error says how to install it; tell the user (kicad_doctor lists the commands), never install anything yourself.',
      ].join(' '),
      parameters: {
        path: SCH,
        analyses: {
          type: 'array',
          description: 'Default: one operating point. At most one of each type: {type: "op"} · {type: "tran", stop (s, e.g. "10m"), step?} · {type: "ac", start, stop (Hz, e.g. 10 and "1Meg"), points? per decade, sweep?: dec|oct|lin}.',
          items: { type: 'object', additionalProperties: true, properties: { type: { type: 'string', enum: ['op', 'tran', 'ac'], required: true } } },
        },
        assertions: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { probe: { type: 'string', required: true } } }, description: 'The requirements to verify, as described above.' },
        probes: { type: 'array', items: { type: 'string' }, description: 'Extra currents to record, e.g. I(R1); node voltages are always recorded.' },
        monte_carlo: {
          type: 'object',
          additionalProperties: true,
          description: 'Tolerance analysis (needs assertions): {runs? 2-500 (default 50), seed? (default 1, repeatable), tolerances? {R: 5, C: 10, L: 10, R1: "1%", V1: 2} in percent (a part letter or a reference; defaults R 5, C 10, L 10), distribution? uniform | gaussian (3σ = tolerance), min_pass_rate? 0-1 (default 1: every run must pass)}. Repeats the run with those values drawn at random and reports how often each assertion holds.',
        },
        timeout: { type: 'number', description: 'Seconds ngspice may run (default 60, at most 600).' },
        spec: { type: 'string', description: 'Requirements file (JSON: analyses, assertions, probes, monte_carlo, timeout). Default: <schematic name>.sim.json next to the schematic, used when it exists; what this call names replaces the same key of the file.' },
        save_spec: { type: 'boolean', description: 'Write the analyses, assertions and monte_carlo this call used to the spec file: the requirements then stay with the project and /simulate checks them again.' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatSimulate(value as unknown as SimulateValue) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const seconds = Math.min(Math.max(Number(args.timeout ?? 60), 1), 600)
        return await ctx.kicad.run('simulate', { ...args, path: at(exec, args.path), ...(args.spec ? { spec: at(exec, args.spec) } : {}) }, exec.signal, { timeoutMs: seconds * 1000 + 60_000 }) as never
      },
    }),
    defineTool({
      name: 'kicad_sim_model',
      description: 'List the SPICE models in a model file (.lib .mod .sub .cir .sp .spi .ckt .cmp .mdl .inc) or in every model file below a folder, optionally filtered by part of the model name: each .subckt with its pin names and the comment above it, each .model with its device type. Use it to find the model for a part and to see its pins before binding it with kicad_edit_schematic set_sim_model {reference, library, name, pins?}. Models come from files the user has (vendor downloads); do not invent them.',
      parameters: {
        path: { type: 'string', required: true, description: 'A model file, or a folder to search (e.g. the project folder).' },
        name: { type: 'string', description: 'Only models whose name contains this text (case-insensitive).' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatSimModel(value as unknown as SimModelValue) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('sim_model', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_check_mcu',
      description: [
        'Check how each microcontroller is wired, from KiCad\'s netlist and a per-family pin table (MCU providers), and let the tool judge it: strapping pins held at the wrong level at reset (ESP32 GPIO0, GPIO2, GPIO12), reserved flash/PSRAM pins in use, input-only GPIOs left floating or used to drive, an EN pin without pull-up, thin supply decoupling.',
        'requirements states what the firmware needs from the board, one per signal: [{net: "VBAT_SENSE", needs: "adc1"}, {pin: "U1:IO25", needs: ["output", "dac"]}]; needs is output (not input-only), input, adc, adc1 (ESP32: usable with WiFi), adc2, dac, touch, boot_free (not a strapping pin) or, per MCU, a fixed peripheral such as pwm, i2c_sda, i2c_scl, spi_mosi, spi_miso, spi_sck. Derive them from what the user says the board must do, then choose GPIOs that satisfy them before checking.',
        'Covered now: classic ESP32 modules and PICO, and the 8-pin ATtiny25/45/85 (a project can add its own provider as <family>.mcu.json next to the schematic). An MCU no provider covers comes back as CANNOT VERIFY: say so to the user, do not call that design checked.',
        'This is a static wiring check, not a firmware simulation: it cannot tell what the firmware does with a pin. Report the tool\'s verdict and fixes; run it after placing or changing an MCU, and fix every error before calling the design done.',
      ].join(' '),
      parameters: {
        path: SCH,
        reference: { type: 'string', description: 'Only this MCU, e.g. U1.' },
        requirements: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { needs: { type: 'string' } } }, description: 'What the firmware needs from the board, as described above.' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatMcu(value as unknown as McuCheckValue) }],
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run('check_mcu', { ...args, path: at(exec, args.path) }, exec.signal) as never
      },
    }),
    defineTool({
      name: 'kicad_simulate_firmware',
      description: [
        'Run a firmware image on the simulated MCU against the schematic and judge what the board does, so "press the button, the LED lights" is checked rather than assumed. The tool decides; report its verdict.',
        'Covered: the 8-pin ATtiny25/45/85, a Python AVR core that follows the datasheet: GPIO, external and pin-change interrupts, Timer0 and Timer1 (normal, CTC, phase-correct and fast PWM; their OC pins are a duty cycle and a frequency, an LED on one is lit that fraction of the time; Timer1 also with the PLL clock and the complementary outputs), the ADC (single-ended and differential channels, the bandgap, the temperature sensor, Vcc / 1.1 V / 2.56 V / AREF references), the analog comparator, EEPROM (3.4 ms writes, persisting across resets), the watchdog (reset and interrupt mode), resets (the RESET pin, the watchdog, the 64 ms start-up delay), the USI in three-wire mode (SPI) and sleep. Anything else the firmware uses (USI two-wire/I²C, dead-time generators, forced output compares, Timer0 mode 5) stops the run with the reason, and assertions about later times come back CANNOT VERIFY, never passed.',
        'Also covered: the classic ESP32 (WROOM/WROVER modules, PICO). Its flash image runs on Espressif\'s QEMU (ROM, bootloader, FreeRTOS, both cores); the tool watches the pin registers: outputs, open drain, internal pull-ups/downs, inputs (they read the board), the GPIO matrix, the LEDC: a pad on an LEDC channel is a PWM wave (duty, frequency, hardware fades), and the ADCs: a conversion (analogRead, adc_oneshot_read, ADC.read_uv) reads the voltage the board puts on the pad as a typical chip with ESP-IDF\'s calibration would (the result lists the conversions). The strapping pins are read from the board at power-on (GPIO0 held low really starts the serial bootloader; GPIO12 high is an error), EN low holds the chip in reset, resets are logged with their cause, and the UART0 output is captured. GPIO interrupts reach the firmware (its handlers run: attachInterrupt, gpio_isr_handler_add, Pin.irq; the result lists them). A pad on the board driven by another peripheral (I2C, SPI, RMT), an LEDC timer paused or held in reset while it drives one, an ADC reading a pad a PWM wave switches without a capacitor to filter it, a firmware crash or a firmware waiting for hardware QEMU lacks stops the run: CANNOT VERIFY after that point. Hardware the simulation does not emulate (WiFi, Bluetooth, touch pads, the temperature sensor, ...) is listed under not_emulated. Needs Espressif\'s QEMU: when it is missing the error says how to install it; tell the user (/kicad-install qemu-esp32, or ESP-IDF\'s idf_tools.py install qemu-xtensa), never install anything yourself. Other MCUs: this tool refuses; kicad_check_mcu still checks their wiring.',
        'The firmware is what the user built; this tool never builds, writes or invents one. ATtiny: a .hex or .elf (avr-gcc, PlatformIO, Arduino; an ELF also carries the initial EEPROM). ESP32: the merged flash image (.bin with the bootloader at 0x1000: ESP-IDF `esptool.py merge_bin`, Arduino\'s .merged.bin) or the ESP-IDF build folder\'s flasher_args.json. Without one, say that firmware behaviour could not be verified.',
        'The board is a DC network: resistors, closed switches, the chip\'s pin drivers and internal pull-ups, rails and ground. LEDs report whether they would light (forward voltage 1.8 V); transistors, ICs and anything else on those nets are open circuits and are listed in the result. ATtiny: PB5 is the RESET pin (pulled up inside, a switch to ground resets the chip) unless rstdisbl says the fuse is programmed. ESP32: EN is the reset (a switch to ground holds the chip in reset until released).',
        'stimuli: [{at: "30ms", press: "SW1", name: "press"}, {at: "70ms", release: "SW1"}, {at, toggle: "SW1"}, {at, drive: "NET", level: "high"|"low"|"release"|a voltage such as 7.4 (an ideal source that also overrides a rail: a battery that sags)}, {at, temperature: 85} (ATtiny)]. assertions: subject {led: "D2", is: "on"|"off"} | {led, min?, max?} (brightness 0-1: the fraction of time lit, for a PWM-dimmed LED) | {pin: "PB4" (ESP32: "GPIO2"), level: "high"|"low"} | {pin: "PB0", duty: 0.25, tol?: 0.02} | {pin, freq: 490, tol_pct?: 2} (a PWM pin: ATtiny timers, ESP32 LEDC) | {net: "NAME", level: ...} | {net, min?, max?} in volts (the average on a PWM net); when {at: "40ms"} | {after: "press", within: "20ms"} (it becomes true in the window) | {from: "35ms", to: "69ms"} (true throughout). Logged events: {reset: "any"|"external"|"watchdog" (ESP32 also "power-on"|"software"|"deep-sleep"|"brownout"), after, within} | {resets: N | {min, max}, at} | {eeprom: 0, is: 42, at} | {usi: "tx"|"rx", nth: 1, is: 165, by} (ATtiny) | {uart: "text", is?: "present"|"absent", by?: "2s"} (ESP32 UART0). Use the user\'s timing requirements as the windows; an ESP32 boots first (about 0.2 s, MicroPython about 2 s).',
        'Other inputs: eeprom {address: value} (initial bytes), usi_input [bytes] (what a slave shifts into the USI on DI, one per transfer), temperature (°C for the ADC sensor), startup_ms (the restart delay after a reset, default 64), clock_hz (default 1000000: the factory 8 MHz RC with CKDIV8; set it to the clock the firmware was built for): all ATtiny only. initial, vcc, led_vf, duration (ATtiny: default 100 ms, at most 5 s; ESP32: default 2 s, at most 30 s).',
        'Keep the scenario with the project: save_scenario: true writes this call\'s arguments to <schematic name>.fw.json; later calls (and the /mcu-sim command) use that file when it exists, so a change is re-verified against every saved requirement without retyping them. Arguments you pass replace the same key of the file.',
        'Also reports hazards without being asked: a floating input the firmware reads (a button without a pull-up), an output fighting a switch (overcurrent), a level stuck between the thresholds, and every reset.',
        'ATtiny: a sleeping chip costs nothing to simulate; a busy loop costs wall-clock time. ESP32: idle time passes in real time, so a run takes at least its duration of wall-clock time; timings inside the application vary by under a millisecond between runs, the boot by tens of milliseconds: start the stimuli after the timeline shows the firmware set its pins up.',
      ].join(' '),
      parameters: {
        path: SCH,
        firmware: { type: 'string', description: 'Path to the firmware: ATtiny Intel HEX or ELF; ESP32 merged flash image (.bin) or flasher_args.json (optional when the scenario file names it).' },
        reference: { type: 'string', description: 'The MCU, e.g. U1 (default: the simulable one).' },
        duration: { type: 'string', description: 'Simulated time, e.g. "200ms".' },
        clock_hz: { type: 'number', description: 'CPU clock in Hz after any fuse divider (default 1000000).' },
        stimuli: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { at: { type: 'string', required: true } } }, description: 'What happens to the board and when.' },
        assertions: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'What must hold.' },
        initial: { type: 'object', additionalProperties: true, description: 'Switch states at the start, e.g. {"SW1": "closed"} (default all open).' },
        eeprom: { type: 'object', additionalProperties: true, description: 'Initial EEPROM bytes as {"0": 42, "1": 7}.' },
        usi_input: { type: 'array', items: { type: 'integer' }, description: 'Bytes a slave shifts into the USI on DI, one per transfer.' },
        temperature: { type: 'number', description: 'Chip temperature for the ADC temperature sensor, °C (default 25).' },
        rstdisbl: { type: 'boolean', description: 'The RSTDISBL fuse is programmed: PB5 is a GPIO (ADC0), not the RESET pin.' },
        startup_ms: { type: 'number', description: 'Milliseconds before the program restarts after a reset (default 64).' },
        vcc: { type: 'number', description: 'Supply voltage (default: from the supply net name, else 5).' },
        led_vf: { type: 'number', description: 'Forward voltage at which an LED counts as lit (default 1.8).' },
        scenario: { type: 'string', description: 'Scenario file (JSON). Default: <schematic name>.fw.json next to the schematic, used when it exists; what this call names replaces the same key of the file.' },
        save_scenario: { type: 'boolean', description: 'Write the arguments this call used to the scenario file (needs assertions).' },
        timeout: { type: 'number', description: 'Wall-clock seconds (default 60).' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: formatFirmware(value as unknown as FirmwareRun) }],
      },
      async execute(args, exec) {
        const seconds = Math.min(Math.max(Number(args.timeout ?? 60), 1), 600)
        return await ctx.kicad.run('simulate_firmware', {
          ...args, path: at(exec, args.path),
          ...(args.firmware ? { firmware: at(exec, args.firmware) } : {}), ...(args.scenario ? { scenario: at(exec, args.scenario) } : {}),
        }, exec.signal, { timeoutMs: seconds * 1000 + 30_000 }) as never
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
        'SPICE models for kicad_simulate: set_sim_model{reference, library, name, pins?} binds a .subckt or .model from a model file (library relative to the project; find them with kicad_sim_model), matching symbol pins to model pins by name and refusing when it cannot, so give pins {"1":"GND","2":"OUT"} (symbol pin → model pin) when the names differ; set_sim_model{reference, device:"D", params:"is=1e-18 n=2 rs=3"} sets a built-in device (diode, LED) without a file.',
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
        presentationMeta: (_args, value) => syncMeta(value as unknown as SyncValue) as never,
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
        presentationMeta: (_args, value) => autorouteMeta(value as unknown as AutorouteValue) as never,
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
    pcb: r.pcb,
    exported: r.exported,
    refused: r.refused,
    forced: r.forced,
    preset: r.preset,
    preset_label: r.preset_label ?? null,
    output_dir: r.output_dir,
    zip: r.zip ?? null,
    gate: { passed: r.gate.passed, blocking: r.gate.blocking, drc: r.gate.drc, unrouted: r.gate.unrouted, parity: { checked: r.gate.parity.checked, issues: r.gate.parity.issues } },
    layers: r.layers ?? [],
    files: (r.files ?? []).length,
    file_list: (r.files ?? []).slice(0, MAX_META_ITEMS).map(f => ({ path: f.path, kind: f.kind, layer: f.layer ?? null })),
    preview: r.preview ?? [],
  }
}

const MAX_META_ITEMS = 80

/** Bounded, replayable data for the board-sync card (kicad_update_pcb). */
export function syncMeta(v: SyncValue): Record<string, unknown> {
  return {
    kind: 'sync',
    schematic: v.schematic,
    pcb: v.pcb,
    created: v.created,
    dry_run: v.dry_run,
    written: v.written,
    counts: v.counts,
    changes: v.changes.slice(0, MAX_META_ITEMS),
    more_changes: Math.max(0, v.changes.length - MAX_META_ITEMS),
    staged: v.staged.slice(0, MAX_META_ITEMS).map(s => s.reference),
    flagged: v.flagged.slice(0, MAX_META_ITEMS),
    footprints: v.board.footprints,
    copper_layers: v.board.copper_layers.length,
    parity: v.parity ? { total: v.parity.total, by_type: v.parity.by_type } : null,
  }
}

/** Bounded, replayable data for the autoroute card: what the router added and KiCad's verdict on the result. */
export function autorouteMeta(v: AutorouteValue): Record<string, unknown> {
  const fr = v.freerouting
  return {
    kind: 'autoroute',
    pcb: v.pcb,
    written: v.written,
    nets: { routed: v.nets.routed, left_out: v.nets.left_out.slice(0, MAX_META_ITEMS) },
    added: v.added,
    kept: v.kept,
    zones_filled: v.zones_filled,
    unrouted: v.unrouted,
    unrouted_before: fr.unrouted_before,
    freerouting: { version: fr.version, state: fr.state, passes: fr.passes, seconds: fr.seconds, timed_out: fr.timed_out },
    drc: { passed: v.drc.passed, errors: v.drc.counts.error, warnings: v.drc.counts.warning, parity: v.drc.parity ?? null },
    notes: v.notes.slice(0, 8),
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
