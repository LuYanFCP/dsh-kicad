// packages/tool-kicad/src/index.ts
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

// packages/tool-kicad/src/dsh.ts
import { isAbsolute, resolve } from "node:path";
import { defineTool } from "@deepseek-ai/dsh-tools";
function imageBlock(ref) {
  return { type: "image", attachment: ref };
}
function sessionCwd(ctx, exec) {
  const wd = ctx.get("workingDirectory");
  const agent = exec.agent;
  if (wd && agent) {
    try {
      return wd.get(agent.session);
    } catch {
    }
  }
  return process.cwd();
}
function resolveIn(cwd, path) {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}
async function imageCapable(ctx, exec) {
  const agent = exec.agent;
  const llm = ctx.get("llm");
  if (!agent || !llm) return false;
  const routed = agent.session.requestHeader?.()?.config;
  const provider = routed?.provider ?? agent.options?.provider;
  const model = routed?.model ?? agent.options?.model;
  if (!provider || !model) return false;
  try {
    const info = await llm.resolveModelInfo(provider, model, exec.signal);
    return info.inputModalities?.includes("image") ?? false;
  } catch {
    return false;
  }
}
function attachments(ctx) {
  return ctx.get("attachments");
}

// packages/tool-kicad/src/format.ts
var MAX_LISTED = 60;
function formatCheck(report) {
  const label = report.kind.toUpperCase();
  const verdict = report.passed ? "PASSED" : "FAILED";
  const head = `${label} by KiCad ${report.kicad_version ?? ""}`.trim() + `${report.path ? ` on ${report.path}` : ""}: ${verdict} \u2014 ${report.counts.error} error(s), ${report.counts.warning} warning(s)` + (report.unrouted !== void 0 ? `, ${report.unrouted} unrouted` : "") + (report.counts.exclusion ? `, ${report.counts.exclusion} excluded` : "") + (report.schematic_parity_error ? `
Schematic parity was NOT checked: ${report.schematic_parity_error}` : "");
  const active = report.violations.filter((v) => !v.excluded);
  if (active.length === 0) return head;
  const lines = active.slice(0, MAX_LISTED).map(violationLine);
  if (active.length > MAX_LISTED) lines.push(`\u2026 ${active.length - MAX_LISTED} more`);
  return `${head}
${lines.join("\n")}`;
}
function formatEdit(value) {
  const also = (value.files ?? []).filter((f) => f !== value.path);
  const head = value.written ? `Wrote ${value.path}${also.length ? ` and ${also.join(", ")}` : ""} (${value.applied} operations).` : `Dry run on ${value.path}: ${value.applied} operations valid, nothing written.`;
  const results = value.results?.length ? `
Results:
${formatJson(value.results)}` : "";
  return `${head}
${value.changes.map((c) => `- ${c}`).join("\n")}${results}`;
}
var KEY_RULES = [
  "min_clearance",
  "min_track_width",
  "min_via_diameter",
  "min_via_annular_width",
  "min_through_hole_diameter",
  "min_hole_to_hole",
  "min_hole_clearance",
  "min_copper_edge_clearance",
  "min_silk_clearance",
  "min_text_height",
  "min_text_thickness"
];
function formatBoard(b) {
  const mm = (n) => Math.round(n * 1e3) / 1e3;
  const pt = (p) => `(${mm(p[0])}, ${mm(p[1])})`;
  const lines = [`Board ${b.path} \u2014 KiCad ${b.format.generator_version ?? "?"} file (format ${b.format.version})`];
  const o = b.board.outline;
  lines.push(o ? `Outline: ${o.shape === "polygon" ? `polygon of ${o.points?.length ?? "?"} points` : o.shape === "rectangle" ? "rectangle" : `${o.items} Edge.Cuts shapes`}, ${mm(o.width)} \xD7 ${mm(o.height)} mm, ${pt(o.bbox)}\u2013${pt(o.bbox.slice(2))}${o.corner_radius ? `, corner radius ${o.corner_radius}` : ""}` : "Outline: none (add one with set_board_outline)");
  lines.push(`Layers: ${b.board.copper_layers.length} copper (${b.board.copper_layers.join(", ")}), ${b.board.thickness} mm thick`);
  const rules = KEY_RULES.filter((k) => b.design_rules[k] !== void 0).map((k) => `${k} ${b.design_rules[k]}`);
  lines.push(`Design rules${b.project_file ? "" : " (no .kicad_pro: KiCad defaults)"}: ${rules.length ? rules.join(", ") : "KiCad defaults"}`);
  lines.push(`Net classes: ${b.net_classes.map((c) => `${c.name} (track ${c.track_width ?? "?"}, clearance ${c.clearance ?? "?"}, via ${c.via_diameter ?? "?"}/${c.via_drill ?? "?"})${c.nets?.length ? `: ${c.nets.join(", ")}` : ""}`).join("; ")}`);
  if (b.drc && "error" in b.drc) {
    lines.push(`DRC could not run: ${b.drc.error}`);
  } else if (b.drc) {
    const types = Object.entries(b.drc.by_type).filter(([t]) => t !== "unconnected_items").map(([t, n]) => `${t}\xD7${n}`);
    lines.push(`DRC by KiCad ${b.drc.kicad_version ?? ""}: ${b.drc.unrouted} unrouted connection(s), ${b.drc.errors - b.drc.unrouted} other error(s), ${b.drc.warnings} warning(s)${types.length ? ` (${types.join(", ")})` : ""}`);
  }
  if (b.footprints) {
    lines.push(`Footprints (${b.footprints.length}): reference value footprint @ position rotation side`);
    for (const f of b.footprints) {
      const pads = Object.entries(f.pad_nets).map(([n, net]) => `${n}=${net}`).join(" ");
      lines.push(`- ${f.reference} ${f.value} ${f.footprint} @ ${pt(f.at)} ${f.rotation}\xB0 ${f.side}${f.locked ? " LOCKED" : ""}` + (f.courtyard ? `, courtyard ${pt(f.courtyard)}\u2013${pt(f.courtyard.slice(2))}` : "") + (pads ? `; pads ${pads}` : ""));
      for (const p of f.pads ?? []) lines.push(`    pad ${p.number} ${p.net || "(no net)"} @ ${pt(p.at)} ${p.layers[0] ?? ""}`);
    }
  }
  if (b.zones?.length) {
    lines.push(`Zones (${b.zones.length}):`);
    for (const z of b.zones) {
      const what = z.keepout ? `keepout (no ${z.keepout.join(", ")})` : `${z.net ?? "(no net)"} pour`;
      lines.push(`- ${what} on ${z.layers.join(", ")}${z.name ? ` "${z.name}"` : ""}${z.priority ? ` priority ${z.priority}` : ""}${z.bbox ? `, ${pt(z.bbox)}\u2013${pt(z.bbox.slice(2))}` : ""} [${z.uuid}]`);
    }
  }
  lines.push(`Copper: ${b.counts.segments} track segment(s), ${b.counts.vias} via(s)`);
  if (b.items) {
    for (const t of b.items.tracks) {
      lines.push(t.kind === "via" ? `- via ${t.net} @ ${pt(t.at ?? [0, 0])} ${t.size}/${t.drill} [${t.uuid}]` : `- ${t.kind} ${t.net} ${t.layer} ${pt(t.start ?? [0, 0])}\u2192${pt(t.end ?? [0, 0])} width ${t.width} [${t.uuid}]`);
    }
    for (const t of b.items.texts) lines.push(`- text "${t.text}" ${t.layer} @ ${pt(t.at)} [${t.uuid}]`);
    for (const s of b.items.outline) lines.push(`- outline ${s.kind} [${s.uuid}]`);
  }
  lines.push(`Nets (${b.counts.nets}): ${b.nets.join(", ")}`);
  return lines.join("\n");
}
function violationLine(v) {
  const where = v.items.map((i) => `${i.description ?? ""}${i.pos ? ` @ (${round(i.pos.x)}, ${round(i.pos.y)})` : ""}`).filter(Boolean).join("; ");
  return `- [${v.severity}] ${v.type}: ${v.description}${where ? ` \u2014 ${where}` : ""}${v.sheet && v.sheet !== "/" ? ` [sheet ${v.sheet}]` : ""}`;
}
function formatFabGate(gate) {
  if (!gate.passed) return `FAILED \u2014 ${gate.blocking.join("; ")}`;
  const parity = gate.parity.checked ? "schematic parity clean" : `schematic parity not checked (${gate.parity.note ?? "no schematic"})`;
  const preset = gate.preset ? `, within ${gate.preset.label} limits` : "";
  return `PASSED by KiCad ${gate.kicad_version ?? ""}`.trimEnd() + ` \u2014 0 DRC errors (${gate.drc.warnings} warning(s)), 0 unrouted, ${parity}${preset}`;
}
function formatFab(r) {
  const fab = r.preset_label ?? "generic KiCad output";
  if (!r.exported) {
    const listed = r.gate.violations.slice(0, MAX_LISTED).map(violationLine);
    return [
      `Fab export REFUSED for ${r.pcb} (${fab}): the board is not ready to order, so nothing was written.`,
      ...r.gate.blocking.map((b2) => `- ${b2}`),
      ...listed.length ? ["Details:", ...listed] : [],
      "Fix these and export again (kicad_drc shows the full report), or pass force: true to export anyway; the result will record the override."
    ].join("\n");
  }
  const head = r.forced ? `Fab files exported WITH force for ${r.pcb} (${fab}). The gate failed: this board is not ready to order.` : `Fab files exported for ${r.pcb} (${fab}).`;
  const lines = [head, `Gate: ${formatFabGate(r.gate)}`, `Zip: ${r.zip}`];
  const b = r.board;
  if (b?.width_mm) lines.push(`Board: ${b.width_mm} \xD7 ${b.height_mm} mm, ${b.copper_layers} copper layer(s), ${b.thickness_mm} mm thick`);
  lines.push(`Files in ${r.output_dir}:`);
  for (const f of r.files ?? []) {
    const what = f.layer ? f.layer : f.kind === "drill" ? `drill, ${f.holes} hole(s), ${f.tools} tool(s)` : f.kind;
    lines.push(`- ${f.path} \u2014 ${what}`);
  }
  if (r.preview?.length) lines.push(`3D preview: ${r.preview.join(", ")}`);
  if (r.warnings?.length) lines.push("Warnings:", ...r.warnings.map((w) => `- ${w}`));
  if (r.notes?.length) lines.push(`Notes (${fab}):`, ...r.notes.map((n) => `- ${n}`));
  return lines.join("\n");
}
function formatPreset(r) {
  if (r.changes.length === 0) return `${r.project} already uses the ${r.label} rules; nothing changed.`;
  const head = r.dry_run ? `Dry run: applying ${r.label} to ${r.project} would change:` : `Applied ${r.label} to ${r.project}:`;
  return [head, ...r.changes.map((c) => `- ${c}`), ...r.written ? ["kicad_drc now checks the board against these rules."] : []].join("\n");
}
function formatJson(value) {
  return JSON.stringify(value, null, 1);
}
function round(n) {
  return Math.round(n * 100) / 100;
}

// packages/tool-kicad/src/index.ts
var name = "dsh-tool-kicad";
var inject = ["tools", "kicad"];
var TOOL_ACCESS = {
  kicad_doctor: "read",
  kicad_read_schematic: "read",
  kicad_list_components: "read",
  kicad_get_symbol_pins: "read",
  kicad_list_nets: "read",
  kicad_search_symbols: "read",
  kicad_library_symbol: "read",
  kicad_search_footprints: "read",
  kicad_erc: "read",
  kicad_drc: "read",
  kicad_render: "read",
  kicad_export: "write",
  kicad_export_fab: "write",
  kicad_fab_preset: "write",
  kicad_create_schematic: "write",
  kicad_edit_schematic: "write",
  kicad_read_pcb: "read",
  kicad_edit_pcb: "write"
};
var DESIGN_WRITE_TOOLS = ["kicad_create_schematic", "kicad_edit_schematic", "kicad_edit_pcb", "kicad_fab_preset"];
var PATH_ARGUMENTS = {
  kicad_doctor: [],
  kicad_read_schematic: ["path"],
  kicad_list_components: ["path"],
  kicad_get_symbol_pins: ["path"],
  kicad_list_nets: ["path"],
  kicad_search_symbols: [],
  kicad_library_symbol: [],
  kicad_search_footprints: [],
  kicad_erc: ["path"],
  kicad_drc: ["path"],
  kicad_render: ["path"],
  kicad_export: ["path", "output"],
  kicad_export_fab: ["pcb", "output_dir"],
  kicad_fab_preset: ["path"],
  kicad_create_schematic: ["path"],
  kicad_edit_schematic: ["path"],
  kicad_read_pcb: ["path"],
  kicad_edit_pcb: ["path"]
};
var FAB_PRESETS = ["jlcpcb", "pcbway"];
var FAB_EXTRAS = ["ipc2581", "odb", "step"];
var SCH = { type: "string", required: true, description: "Path to a .kicad_sch file (relative to the working directory or absolute)." };
var PCB = { type: "string", required: true, description: "Path to a .kicad_pcb file (relative to the working directory or absolute)." };
var JSON_OUT = { schema: { type: "json" }, render: (_args, value) => [{ type: "text", text: formatJson(value) }] };
function apply(ctx, config = {}) {
  const attachRenders = config.attachRenders ?? true;
  const at = (exec, path) => resolveIn(sessionCwd(ctx, exec), path);
  const tools = [
    defineTool({
      name: "kicad_doctor",
      description: "Check whether this machine can run the KiCad tools: kicad-cli present and KiCad 8+, symbol and footprint libraries, Python 3.10+, optional PNG rasterizer and kicad-python. Each check has a status and a fix; when KiCad is missing or too old the result lists install commands for this platform. Use it when a kicad_* tool fails with a KiCad/Python problem, then tell the user the fix. Do not install software yourself: the user installs KiCad (the KiCad doctor panel has an Install button, or /kicad-install).",
      parameters: {},
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: value.text }],
        presentationMeta: (_args, value) => doctorMeta(value)
      },
      isConcurrencySafe: () => true,
      async execute(_args, exec) {
        return await ctx.kicad.doctor(exec.signal);
      }
    }),
    defineTool({
      name: "kicad_read_schematic",
      description: "Summarize a KiCad schematic: title block, counts, components (reference, value, lib_id, footprint, position in mm), net labels, power nets, sub-sheets, the page size and drawable area, and functional blocks (titled frames with the parts inside, plus parts outside every block). Start here before editing.",
      parameters: {
        path: SCH,
        include_components: { type: "boolean", description: "Include the component list (default true)." },
        include_subsheets: { type: "boolean", description: "Also summarize every sub-sheet." },
        include_wiring: { type: "boolean", description: "Also list wires, junctions and no-connect flags with their uuids (for remove_item)." }
      },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("read_schematic", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_list_components",
      description: "List placed components, optionally filtered by a substring of reference, value, lib_id or footprint.",
      parameters: { path: SCH, filter: { type: "string" } },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("list_components", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_get_symbol_pins",
      description: "Pins of one placed symbol: number, name, electrical type, absolute position (mm) and outward direction. Use before wiring.",
      parameters: { path: SCH, reference: { type: "string", required: true, description: "Reference designator, e.g. U1." } },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("get_symbol_pins", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_list_nets",
      description: "Connectivity as KiCad computes it (netlist export): each net with its member pins. Use to verify what is actually connected.",
      parameters: { path: SCH, net: { type: "string", description: "Only nets whose name contains this text." } },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("list_nets", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_search_symbols",
      description: 'Search the installed KiCad symbol libraries (plus the project sym-lib-table) by keywords. Returns lib_ids such as "Device:R" for kicad_edit_schematic add_symbol.',
      parameters: {
        query: { type: "string", required: true, description: 'Keywords, e.g. "ldo 3.3" or "usb c receptacle".' },
        library: { type: "string", description: "Restrict to one library nickname, e.g. Device." },
        limit: { type: "integer", description: "Maximum results (default 20)." }
      },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("search_symbols", { ...args, project_dir: sessionCwd(ctx, exec) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_library_symbol",
      description: "Inspect a library symbol before placing it: every pin (number, name, electrical type, unit), description, default footprint and footprint filters. Use this instead of reading .kicad_sym files.",
      parameters: { lib_id: { type: "string", required: true, description: "e.g. MCU_Microchip_ATtiny:ATtiny85-20S" } },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("library_symbol", { ...args, project_dir: sessionCwd(ctx, exec) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_search_footprints",
      description: 'Find footprints in the installed KiCad libraries by name terms ("R 0603", "SOT-223", "USB_C 6P", "PinHeader 2x03"), or confirm an exact Library:Name and list its pads. Use this instead of listing .pretty directories.',
      parameters: {
        query: { type: "string", required: true, description: "Name terms (all must match, * allowed) or an exact Library:Name." },
        library: { type: "string", description: "Restrict to one library, e.g. Resistor_SMD." },
        pads: { type: "boolean", description: "Include pad names in every result." },
        limit: { type: "integer", description: "Maximum results (default 20)." }
      },
      output: JSON_OUT,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("search_footprints", { ...args, project_dir: sessionCwd(ctx, exec) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_erc",
      description: "Run KiCad's Electrical Rules Check. KiCad's verdict is authoritative: do not judge electrical correctness yourself. Fix errors, then run again.",
      parameters: { path: SCH, severity: { type: "string", enum: ["all", "error", "warning"] } },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatCheck(value) }],
        presentationMeta: (_args, value) => checkMeta(value)
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("erc", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_drc",
      description: "Run KiCad's Design Rules Check on a .kicad_pcb (optionally with schematic parity). KiCad's verdict is authoritative; unrouted connections count as errors. Zones are refilled first when the board has any.",
      parameters: {
        path: { type: "string", required: true, description: "Path to a .kicad_pcb file." },
        severity: { type: "string", enum: ["all", "error", "warning"] },
        schematic_parity: { type: "boolean" },
        refill_zones: { type: "boolean", description: "Refill zones before checking (in memory only). Default: when the board has zones." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatCheck(value) }],
        presentationMeta: (_args, value) => checkMeta(value)
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("drc", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_render",
      description: "Render a schematic (all sheets) or board with kicad-cli. Returns SVG/PNG paths under <project>/.dsh-kicad/render/ and, when the model accepts images, the first page as an image.",
      parameters: {
        path: { type: "string", required: true, description: "A .kicad_sch or .kicad_pcb file." },
        pages: { type: "string", description: "Comma-separated page numbers (schematic only)." },
        width: { type: "integer", description: "PNG width in pixels (default 1600)." }
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            path: { type: "string", required: true },
            svg: { type: "array", items: { type: "string" }, required: true },
            png: { type: "array", items: { type: "string" } },
            image: { type: "json" },
            note: { type: "string" }
          }
        },
        render: (_args, value) => renderContent(value),
        presentationMeta: (_args, value) => ({ svg: value.svg, png: value.png ?? [] })
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const path = at(exec, args.path);
        const wantImage = attachRenders && attachments(ctx) !== void 0 && await imageCapable(ctx, exec);
        const rendered = await ctx.kicad.run("render", {
          path,
          format: wantImage ? "png" : "svg",
          pages: args.pages,
          width: args.width ?? 1600
        }, exec.signal);
        const value = { path: rendered.path, svg: rendered.svg, ...rendered.png ? { png: rendered.png } : {} };
        if (wantImage && rendered.png?.[0]) {
          const data = await readFile(rendered.png[0]);
          value.image = await attachments(ctx).saveImage({ data: new Uint8Array(data), mediaType: "image/png", name: basename(rendered.png[0]) });
        } else if (!wantImage) {
          value.note = "The current model does not accept images (or no attachment store is mounted); open the SVG in the KiCad sidebar viewer.";
        }
        return value;
      }
    }),
    defineTool({
      name: "kicad_export",
      description: "Export a netlist or a bill of materials with kicad-cli. Without output, the BOM is returned inline.",
      parameters: {
        path: SCH,
        kind: { type: "string", enum: ["netlist", "bom"], required: true },
        output: { type: "string", description: "Destination file; required for netlist." },
        format: { type: "string", description: "Netlist format (kicadsexpr, kicadxml, spice, ...)." },
        group_by: { type: "string", description: 'BOM grouping fields (default "Value,Footprint").' }
      },
      output: JSON_OUT,
      async execute(args, exec) {
        const path = at(exec, args.path);
        if (args.kind === "netlist") {
          if (!args.output) throw new Error("output is required for a netlist export");
          return await ctx.kicad.run("export_netlist", { path, output: at(exec, args.output), ...args.format ? { format: args.format } : {} }, exec.signal);
        }
        return await ctx.kicad.run("export_bom", {
          path,
          ...args.output ? { output: at(exec, args.output) } : {},
          ...args.group_by ? { group_by: args.group_by } : {}
        }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_export_fab",
      description: [
        "Produce the files to order a board: Gerbers (copper, mask, paste, silkscreen, Edge.Cuts), Excellon drill + map, position CSV and BOM, zipped,",
        "plus front/back 3D previews; with preset jlcpcb also JLC BOM/CPL. Default output <project>/fab/<preset or kicad>/.",
        "KiCad gates it first: the export is refused (nothing written) while DRC has errors, connections are unrouted, schematic parity disagrees,",
        "or the board breaks the preset fab's limits. Fix what the gate lists and export again. Use force only when the user explicitly asks to export anyway;",
        "the result then says the gate was overridden."
      ].join(" "),
      parameters: {
        pcb: { type: "string", required: true, description: "Path to the .kicad_pcb." },
        preset: { type: "string", enum: [...FAB_PRESETS], description: "Fab house: checks the board against its limits and uses its output options." },
        output_dir: { type: "string", description: "Output directory (default <project>/fab/<preset or kicad>/)." },
        force: { type: "boolean", description: "Export even though the gate fails (recorded in the result)." },
        extras: { type: "array", items: { type: "string", enum: [...FAB_EXTRAS] }, description: "Additional formats for the zip." },
        preview: { type: "boolean", description: "Render front and back 3D PNGs (default true)." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => fabContent(value),
        presentationMeta: (_args, value) => fabMeta(value)
      },
      async execute(args, exec) {
        const value = await ctx.kicad.run("export_fab", {
          ...args,
          pcb: at(exec, args.pcb),
          ...args.output_dir ? { output_dir: at(exec, args.output_dir) } : {}
        }, exec.signal);
        const top = value.exported ? value.preview?.[0] : void 0;
        if (top && attachRenders && attachments(ctx) !== void 0 && await imageCapable(ctx, exec)) {
          const file = join(value.output_dir, top);
          value.image = await attachments(ctx).saveImage({ data: new Uint8Array(await readFile(file)), mediaType: "image/png", name: basename(file) });
        }
        return value;
      }
    }),
    defineTool({
      name: "kicad_fab_preset",
      description: "Adopt a fab house's limits (JLCPCB or PCBWay: minimum track, clearance, drill, annular ring, hole spacing, copper to edge) as the project's design rules, so kicad_drc checks what that fab can make: board setup minimums in the .kicad_pro, its custom rules in a managed block of the .kicad_dru (other rules are kept), netclass sizes raised to the minimums. dry_run lists the changes without writing.",
      parameters: {
        path: { type: "string", required: true, description: "The project's .kicad_pcb or .kicad_pro." },
        preset: { type: "string", required: true, enum: [...FAB_PRESETS] },
        dry_run: { type: "boolean", description: "List the changes without writing." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatPreset(value) }]
      },
      async execute(args, exec) {
        return await ctx.kicad.run("fab_preset", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_create_schematic",
      description: "Create a blank KiCad 10 schematic (plus a minimal .kicad_pro when the directory has none).",
      parameters: { path: SCH, paper: { type: "string", description: "Paper size (default A4)." } },
      output: JSON_OUT,
      async execute(args, exec) {
        return await ctx.kicad.run("create_schematic", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_edit_schematic",
      description: [
        "Apply a batch of edits to one .kicad_sch atomically (all succeed or nothing is written); untouched text stays byte-identical.",
        'Coordinates are millimetres, Y grows downward, everything snaps to the 1.27 mm grid. Pins are written "REF:PIN" (pin number or name).',
        'Operations: add_symbol{lib_id,x,y,reference?("R?" auto-numbers),value?,rotation?(0/90/180/270),mirror?(x|y),unit?,footprint?,properties?,dnp?};',
        "set_value{reference,value}; set_footprint{reference,footprint}; set_property{reference,name,value,hide?}; move_symbol{reference,x,y,rotation?}; remove_symbol{reference};",
        "connect_pins{a,b} (a wire between two pins, routed around parts, labels and other nets; it may join wiring already on either pin, with a junction); connect_pin_to_net{pin,net,kind?:label|global_label|power} (stub + label, or a power symbol such as GND/+3V3; on a wired pin it branches off that wiring);",
        "no_connect_pin{pin}; add_wire{points:[[x,y],...]}; add_label{text,x,y,kind?,rotation?}; add_junction{x,y}; add_no_connect{x,y}.",
        "Undo/fix: disconnect_pin{pin} removes the wires, labels, power symbols and no-connect flag attached to that pin; remove_item{uuid} removes any item (uuids from kicad_read_schematic include_wiring); remove_label{text,x?,y?}; remove_wire{x,y}.",
        "Layout by function: set_page{paper?,title?,date?,rev?,company?,comments?}; add_block{title, references:[...] (frame encloses those parts with their wiring) | x,y,width,height} draws a dashed frame with a bold title;",
        "move_block{title, dx,dy | x,y} moves the frame with the parts inside and their wiring; move_symbols{references,dx,dy} moves parts with their wires, labels and power symbols (refuses if that would tear a wire to a part left behind);",
        "add_text{text,x,y,size?,bold?}; add_rectangle{x,y,width,height,style?}.",
        "Rotation is counter-clockwise: Device:R/C/L at 0\xB0 are vertical with pin 1 on top; at 90\xB0 horizontal with pin 1 on the left; add_symbol results list the placed pin positions.",
        "Wire parts that work together with connect_pins (chain a net with several pins: A-B, then B-C); use power symbols for rails and labels between blocks or across the page. A connect_pins result with a note took a detour: move, rotate or mirror a part so the pins face each other, or use labels. Keep one call to at most ~20 operations; split bigger changes. Never rewrite or recreate a .kicad_sch to fix layout \u2014 remove and re-add the affected items.",
        "ERC runs automatically afterwards when the KiCad policy is enabled."
      ].join(" "),
      parameters: {
        path: SCH,
        operations: {
          type: "array",
          required: true,
          items: { type: "object", additionalProperties: true, properties: { op: { type: "string", required: true } } },
          description: "Ordered edit operations."
        },
        dry_run: { type: "boolean", description: "Validate without writing." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatEdit(value) }],
        presentationMeta: (_args, value) => ({ changes: value.changes ?? [], written: value.written })
      },
      async execute(args, exec) {
        if (args.operations.length === 0) throw new Error("operations must not be empty");
        return await ctx.kicad.run("edit_schematic", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_read_pcb",
      description: "Summarize a KiCad board: outline size, copper layers and thickness, design rules and net classes (from the .kicad_pro), every footprint (reference, value, footprint, position in mm, rotation, front/back side, locked, courtyard box, pad nets), zones, nets, and KiCad DRC's count of unrouted connections. Start here before editing a board.",
      parameters: {
        path: PCB,
        include_footprints: { type: "boolean", description: "Include the footprint list (default true)." },
        include_pads: { type: "boolean", description: "Also list every pad with its absolute position and layers." },
        include_items: { type: "boolean", description: "Also list tracks, vias, texts and outline shapes with their uuids (for remove_item)." },
        drc: { type: "boolean", description: "Run KiCad DRC for the unrouted count and verdict (default true)." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatBoard(value) }]
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("read_pcb", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_edit_pcb",
      description: [
        "Apply a batch of edits to one .kicad_pcb atomically (all succeed or nothing is written); untouched text stays byte-identical. Design rules and net classes are stored in the board's .kicad_pro, which the same batch updates.",
        'Millimetres, Y grows downward, rotation in degrees counter-clockwise; a pad is written "REF:PAD".',
        "Outline: set_board_outline{width,height,corner_radius?,x?,y?} (rectangle; x,y is the top-left corner, default: the old outline's corner or centred on the parts) or set_board_outline{points:[[x,y],...]}; it replaces everything on Edge.Cuts. add_mounting_hole{x,y,drill?(3.2),plated?,footprint?,reference?}.",
        "Placement: move_footprint{reference,x?,y?,rotation?,side?:front|back} (flipping to the back mirrors the part as KiCad does); move_footprints{references,dx,dy}; lock_footprint{reference,locked?} (locked parts refuse to move).",
        "Rules: set_design_rules{min_clearance?,min_track_width?,min_via_diameter?,min_via_annular_width?,min_through_hole_diameter?,min_hole_to_hole?,min_hole_clearance?,min_copper_edge_clearance?,min_silk_clearance?,min_text_height?,...}; set_net_class{name,nets?,track_width?,clearance?,via_diameter?,via_drill?} (nets move to that class; tracks and vias on them default to its sizes).",
        `Copper: add_track{points:[[x,y] | "REF:PAD",...],net?,layer?(F.Cu),width?} (pad endpoints snap to the pad centre; the pad must be on the track's net and layer); add_via{x,y,net,diameter?,drill?}; add_zone{net,layer | layers,outline?("board" | [[x,y],...]),priority?,clearance?,connect_pads?:thermal|solid|none}; add_keepout{outline,layers?,tracks?,vias?,pads?,copperpour?,footprints?} (true = not allowed).`,
        "Silkscreen: add_text{text,x,y,layer?(F.SilkS),size?,thickness?,rotation?}; set_reference_text{reference,x?,y?,size?,thickness?,rotation?,hide?} (x,y on the board).",
        "Undo: remove_item{uuid} removes a footprint, track, via, zone, text or outline shape (uuids from kicad_read_pcb include_items).",
        "Keep one call to at most ~30 operations. Never rewrite a .kicad_pcb by hand. DRC runs automatically afterwards when the KiCad policy is enabled."
      ].join(" "),
      parameters: {
        path: PCB,
        operations: {
          type: "array",
          required: true,
          items: { type: "object", additionalProperties: true, properties: { op: { type: "string", required: true } } },
          description: "Ordered edit operations."
        },
        dry_run: { type: "boolean", description: "Validate without writing." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatEdit(value) }],
        presentationMeta: (_args, value) => ({ changes: value.changes ?? [], written: value.written })
      },
      async execute(args, exec) {
        if (args.operations.length === 0) throw new Error("operations must not be empty");
        return await ctx.kicad.run("edit_pcb", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    })
  ];
  for (const tool of tools) ctx.effect(() => ctx.tools.register(tool), `kicad tool ${tool.name}`);
}
function fabContent(value) {
  const blocks = [{ type: "text", text: formatFab(value) }];
  if (value.image) blocks.push(imageBlock(value.image));
  return blocks;
}
function fabMeta(r) {
  return {
    kind: "fab",
    exported: r.exported,
    refused: r.refused,
    forced: r.forced,
    preset: r.preset,
    output_dir: r.output_dir,
    zip: r.zip ?? null,
    gate: { passed: r.gate.passed, blocking: r.gate.blocking, drc: r.gate.drc, unrouted: r.gate.unrouted, parity: { checked: r.gate.parity.checked, issues: r.gate.parity.issues } },
    layers: r.layers ?? [],
    files: (r.files ?? []).length,
    preview: r.preview ?? []
  };
}
function renderContent(value) {
  const lines = [`Rendered ${value.path}`, ...value.svg.map((p) => `svg: ${p}`), ...(value.png ?? []).map((p) => `png: ${p}`)];
  if (value.note) lines.push(value.note);
  const blocks = [{ type: "text", text: lines.join("\n") }];
  if (value.image) blocks.push(imageBlock(value.image));
  return blocks;
}
function doctorMeta(report) {
  return {
    kind: "doctor",
    ok: report.ok,
    status: report.status,
    summary: report.summary,
    kicad: report.kicad,
    checks: report.checks.map((c) => ({ id: c.id, label: c.label, status: c.status, required: c.required, summary: c.summary, ...c.fix ? { fix: c.fix } : {} })),
    install: report.install.map((o) => ({
      id: o.id,
      label: o.label,
      command: o.command,
      needs_root: o.needs_root,
      runnable: o.runnable,
      available: o.available,
      recommended: o.recommended,
      note: o.note,
      ...o.url ? { url: o.url } : {}
    }))
  };
}
function checkMeta(report) {
  return {
    kind: report.kind,
    passed: report.passed,
    counts: report.counts,
    by_type: report.by_type,
    kicad_version: report.kicad_version ?? null,
    violations: report.violations.slice(0, 50).map((v) => ({
      severity: v.severity,
      type: v.type,
      description: v.description,
      items: v.items.slice(0, 4).map((i) => ({ description: i.description ?? "", ...i.pos ? { pos: i.pos } : {} }))
    }))
  };
}
export {
  DESIGN_WRITE_TOOLS,
  FAB_EXTRAS,
  FAB_PRESETS,
  PATH_ARGUMENTS,
  TOOL_ACCESS,
  apply,
  checkMeta,
  doctorMeta,
  fabMeta,
  formatBoard,
  formatCheck,
  formatEdit,
  formatFab,
  formatFabGate,
  formatJson,
  formatPreset,
  inject,
  name
};
