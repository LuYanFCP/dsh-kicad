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
  const head = `${label} by KiCad ${report.kicad_version ?? ""}`.trim() + `${report.path ? ` on ${report.path}` : ""}: ${verdict} \u2014 ${report.counts.error} error(s), ${report.counts.warning} warning(s)` + (report.unrouted !== void 0 ? `, ${report.unrouted} unrouted` : "") + (report.parity !== void 0 ? `, ${report.parity} schematic parity issue(s)` : "") + (report.counts.exclusion ? `, ${report.counts.exclusion} excluded` : "") + (report.schematic_parity_error ? `
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
var MAX_CHANGES = 80;
function formatSync(v) {
  const counts = Object.entries(v.counts).map(([kind, n]) => `${kind} ${n}`).join(", ");
  const head = v.dry_run ? `Dry run, nothing written: ${v.changes.length ? `${v.created ? "creating" : "updating"} ${v.pcb} from ${v.schematic} would make ${v.changes.length} change(s) (${counts}).` : `${v.pcb} is already in sync with ${v.schematic}.`}` : v.written ? `${v.created ? "Created" : "Updated"} ${v.pcb} from ${v.schematic}: ${v.changes.length} change(s) (${counts}).` : `${v.pcb} is in sync with ${v.schematic}: nothing to change, nothing written.`;
  const lines = [head, ...v.changes.slice(0, MAX_CHANGES).map((c) => `- ${c}`)];
  if (v.changes.length > MAX_CHANGES) lines.push(`\u2026 ${v.changes.length - MAX_CHANGES} more`);
  if (v.flagged.length) lines.push(`Footprints without a symbol, kept (${v.flagged.length}):`, ...v.flagged.map((f) => `- ${f}`));
  if (v.staged.length) {
    lines.push(`Staged right of the board outline, to be placed: ${v.staged.map((s) => `${s.reference} @ (${round(s.at[0])}, ${round(s.at[1])})`).join(", ")}`);
  }
  const o = v.board.outline;
  lines.push(`Board: ${v.board.footprints} footprint(s), ${v.board.copper_layers.length} copper layers, format ${v.board.format}` + (o ? `, outline (${round(o[0])}, ${round(o[1])})\u2013(${round(o[2])}, ${round(o[3])})` : ", no outline"));
  lines.push(...v.notes ?? []);
  if (v.parity) {
    const types = Object.entries(v.parity.by_type).map(([t, n]) => `${t}\xD7${n}`).join(", ");
    const extra = v.parity.by_type.extra_footprint ? " Footprints without a symbol go with delete_removed: true." : "";
    lines.push(v.parity.total === 0 ? "Schematic parity (KiCad DRC): 0 issues." : `Schematic parity (KiCad DRC): ${v.parity.total} issue(s) (${types}).${extra} Details: kicad_drc with schematic_parity.`);
  }
  return lines.join("\n");
}
var PREFIXES = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "\xB5"], [1e-9, "n"], [1e-12, "p"]];
function eng(value) {
  if (value === 0 || !Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  const [scale, prefix] = PREFIXES.find(([s]) => abs >= s * 0.9995) ?? PREFIXES[PREFIXES.length - 1];
  return `${Number((value / scale).toPrecision(3))}${prefix}`;
}
function formatMonteCarlo(mc) {
  const spread = Object.entries(mc.tolerances).map(([ref, pct]) => `${ref} \xB1${pct}%`).join(", ");
  const lines = [`Monte Carlo: ${mc.passed ? "PASSED" : "FAILED"} \u2014 ${mc.runs} runs (seed ${mc.seed}, ${mc.distribution}; varied ${spread}); an assertion must hold in ${Math.round(mc.min_pass_rate * 100)}% of the runs.`];
  for (const a of mc.assertions) {
    const bounds = [a.min_required !== null ? `\u2265 ${eng(a.min_required)}${a.unit}` : "", a.max_required !== null ? `\u2264 ${eng(a.max_required)}${a.unit}` : ""].filter(Boolean).join(" and ");
    lines.push(`${a.passed ? "\u2713" : "\u2717"} ${a.name}: holds in ${a.passes}/${a.runs} runs; ${eng(a.min)}${a.unit} \u2026 ${eng(a.mean)}${a.unit} (mean) \u2026 ${eng(a.max)}${a.unit} (required ${bounds})`);
    if (a.first_failure) {
      const f = a.first_failure;
      lines.push(`    first failure: run ${f.run}, ${eng(f.value)}${a.unit} with ${Object.entries(f.varied).map(([k, x]) => `${k} = ${eng(x)}`).join(", ")}`);
    }
  }
  return lines;
}
function formatSimModel(v) {
  if (v.files.length === 0) return `No .subckt or .model found in ${v.path}.`;
  const lines = [`${v.models} model(s) in ${v.files.length} file(s) under ${v.path}${v.truncated ? " (list truncated)" : ""}:`];
  for (const f of v.files) {
    lines.push(f.file);
    for (const m of f.models) {
      lines.push(m.kind === "subckt" ? `  .subckt ${m.name} ${(m.pins ?? []).join(" ")}${m.comment ? `   \u2014 ${m.comment}` : ""}` : `  .model ${m.name} ${m.type}`);
    }
  }
  lines.push("Bind one with kicad_edit_schematic set_sim_model {reference, library, name, pins?}.");
  return lines.join("\n");
}
function formatSimulate(v) {
  const held = v.assertions.filter((a) => a.passed).length;
  const head = v.passed === null ? `SPICE by ngspice ${v.ngspice ?? ""} on ${v.path}: no assertions given, results only.`.replace("  ", " ") : `SPICE by ngspice ${v.ngspice ?? ""} on ${v.path}: ${v.passed ? "PASSED" : "FAILED"} \u2014 ${held}/${v.assertions.length} assertion(s) hold.`.replace("  ", " ");
  const lines = [head];
  if (v.spec?.loaded.length) lines.push(`Requirements from ${v.spec.path} (${v.spec.loaded.join(", ")}).`);
  if (v.spec?.saved) lines.push(`Requirements saved to ${v.spec.path}.`);
  for (const a of v.assertions) {
    const bounds = [a.min !== null ? `\u2265 ${eng(a.min)}${a.unit}` : "", a.max !== null ? `\u2264 ${eng(a.max)}${a.unit}` : ""].filter(Boolean).join(" and ");
    lines.push(`${a.passed ? "\u2713" : "\u2717"} ${a.name}: ${eng(a.value)}${a.unit} (required ${bounds})`);
  }
  for (const analysis of v.analyses) {
    if (analysis.type === "op") {
      const entries = Object.entries(analysis.values);
      if (entries.length) lines.push(`Operating point: ${entries.map(([k, x]) => `${k} = ${eng(x)}${k.startsWith("I(") ? "A" : "V"}`).join(", ")}`);
    } else if (analysis.type === "tran") {
      lines.push(`Transient to ${eng(analysis.stop)}s (${analysis.points} points): ${Object.entries(analysis.signals).slice(0, 12).map(([k, s]) => `${k} ${eng(s.initial)} \u2192 ${eng(s.final)} (min ${eng(s.min)}, max ${eng(s.max)})`).join("; ")}`);
    } else {
      lines.push(`AC sweep ${eng(analysis.start)}\u2013${eng(analysis.stop)} Hz (${analysis.points} points); judge it with ac assertions.`);
    }
  }
  if (v.ignored.length) lines.push(`Not simulated (no SPICE model, left out of the circuit): ${v.ignored.join(", ")}.`);
  if (v.monte_carlo) lines.push(...formatMonteCarlo(v.monte_carlo));
  lines.push(...v.notes, ...(v.warnings ?? []).map((w) => `ngspice: ${w}`));
  lines.push(`Netlist and log: ${v.netlist}`);
  return lines.join("\n");
}
var MARK = { error: "\u2717", warning: "!", info: "i" };
function formatMcu(v) {
  if (v.mcus.length === 0) return `MCU check on ${v.path}: no microcontroller found in the schematic.`;
  const verdict = v.passed === null ? "CANNOT VERIFY (no MCU is covered by a provider)" : v.passed ? "PASSED" : "FAILED";
  const lines = [`MCU check on ${v.path}: ${verdict}.`];
  for (const m of v.mcus) {
    if (m.status === "cannot_verify") {
      lines.push(`${m.reference} ${m.value} (${m.lib_id}): CANNOT VERIFY \u2014 ${m.reason}`);
      continue;
    }
    lines.push(`${m.reference} ${m.value} (provider ${m.provider}): ${m.errors} error(s), ${m.warnings} warning(s)`);
    for (const f of m.findings ?? []) lines.push(`  ${MARK[f.severity]} ${f.severity} ${f.pin}${f.pin_name ? ` ${f.pin_name}` : ""}: ${f.message}${f.fix ? ` \u2192 ${f.fix}` : ""}`);
  }
  if (v.requirements.length) {
    lines.push("Requirements:");
    for (const r of v.requirements) {
      const mark = r.passed === null ? "?" : r.passed ? "\u2713" : "\u2717";
      lines.push(`  ${mark} ${r.target} needs ${r.needs.join(" + ")}${r.pin ? ` (${r.pin})` : ""}${r.reason ? `: ${r.reason}` : ""}`);
    }
  }
  return lines.join("\n");
}
var ms = (t) => `${Number((t * 1e3).toPrecision(4))} ms`;
function formatFirmware(v) {
  const verdict = v.passed === null ? "CANNOT VERIFY" : v.passed ? "PASSED" : "FAILED";
  const chip = v.device === "esp32" ? `ESP32 on QEMU${v.qemu?.version ? ` ${v.qemu.version}` : ""}, ${v.vcc} V` : `${eng(v.clock_hz ?? 0)}Hz, ${v.vcc} V`;
  const work = v.instructions === void 0 ? "" : `, ${v.instructions} instructions`;
  const lines = [`Firmware ${v.firmware.split("/").pop()} on ${v.mcu} (${chip}), ${ms(v.simulated_to)} of ${ms(v.duration)} simulated${work}: ${verdict}.`];
  if (v.aborted) lines.push(`Stopped at ${ms(v.aborted.t)}: ${v.aborted.reason}. What the firmware does after that is not simulated, so assertions about later times cannot be verified.`);
  for (const a of v.assertions) {
    const mark = a.passed === null ? "?" : a.passed ? "\u2713" : "\u2717";
    lines.push(`${mark} ${a.name} (${a.when})${a.reason ? `: ${a.reason}` : ""}`);
  }
  for (const h of v.hazards) {
    const mark = h.severity === "error" ? "\u2717" : h.severity === "warning" ? "!" : "i";
    lines.push(`${mark} ${h.severity}${h.pin ? ` ${h.pin}` : ""}${h.t ? ` at ${ms(h.t)}` : ""}: ${h.message}${h.fix ? ` \u2192 ${h.fix}` : ""}`);
  }
  if (v.timeline.length) {
    lines.push(`Board over time (${v.timeline.length} change(s); pins ${Object.entries(v.pins).map(([p, n]) => `${p}=${n}`).join(", ")}):`);
    for (const e of v.timeline.slice(0, 14)) {
      const leds = Object.entries(e.leds).map(([k, f]) => `${k} ${f >= 0.99 ? "on" : f <= 0.01 ? "off" : `${Math.round(f * 100)}%`}`);
      lines.push(`  ${ms(e.t)}: ${Object.entries(e.pins).map(([p, s]) => `${p} ${s}`).join(", ")}${leds.length ? `; ${leds.join(", ")}` : ""}${e.switches.length ? `; closed: ${e.switches.join(", ")}` : ""}`);
    }
    if (v.timeline.length > 14) lines.push(`  \u2026 ${v.timeline.length - 14} more`);
  }
  if (v.eeprom && Object.keys(v.eeprom.changed).length) lines.push(`EEPROM at the end: ${Object.entries(v.eeprom.changed).map(([a, x]) => `[${a}] = ${x}`).join(", ")} (${v.eeprom.writes.length} write(s)).`);
  if (v.usi_transfers?.length) lines.push(`USI transfers: ${v.usi_transfers.slice(0, 8).map((x) => `${ms(x.t)} sent 0x${x.tx.toString(16).toUpperCase().padStart(2, "0")} received 0x${x.rx.toString(16).toUpperCase().padStart(2, "0")}`).join("; ")}${v.usi_transfers.length > 8 ? ` \u2026 ${v.usi_transfers.length - 8} more` : ""}.`);
  if (v.interrupts?.length) {
    const more = (v.interrupt_count ?? v.interrupts.length) - Math.min(v.interrupts.length, 8);
    lines.push(`GPIO interrupts: ${v.interrupts.slice(0, 8).map((i) => `${ms(i.t)} ${i.gpio} ${i.type}`).join("; ")}${more > 0 ? ` \u2026 ${more} more` : ""}.`);
  }
  if (v.adc?.length) {
    const shown = v.adc.slice(0, 8).map((c) => `${ms(c.t)} ${c.gpio} (${c.adc}, ${c.atten_db} dB) ${c.volts === null ? "floating" : `${round(c.volts)} V`} \u2192 ${c.reading} (${c.calibrated_mv} mV)`);
    lines.push(`ADC conversions (${v.adc_count ?? v.adc.length}; the first per channel and each change): ${shown.join("; ")}${v.adc.length > 8 ? ` \u2026 ${v.adc.length - 8} more changes` : ""}.`);
  }
  if (v.strap?.download_mode) lines.push(`The strapping pins (GPIO_STRAP ${v.strap.value}) started the serial bootloader: the firmware did not run.`);
  if (v.uart?.trim()) {
    const tail = v.uart.replace(/\x1b\[[0-9;]*m/g, "").trimEnd().split("\n").slice(-8);
    lines.push(`UART0 output (${v.uart_bytes ?? v.uart.length} bytes; the last lines):`, ...tail.map((l) => `  ${l.trimEnd()}`));
  }
  if (v.scenario?.loaded.length) lines.push(`Scenario from ${v.scenario.path} (${v.scenario.loaded.join(", ")}).`);
  if (v.scenario?.saved) lines.push(`Scenario saved to ${v.scenario.path}.`);
  lines.push(...v.notes);
  return lines.join("\n");
}
function formatAutoroute(v) {
  const fr = v.freerouting;
  const router = fr.version ? `Freerouting ${fr.version}` : "Freerouting";
  const lines = [v.written ? `Routed ${v.pcb} with ${router} in ${fr.seconds} s: +${v.added.segments} track segment(s), +${v.added.vias} via(s), ${round(v.added.length_mm)} mm on ${v.nets.changed.length} net(s).` : `${router} found nothing to add on ${v.pcb} (${fr.seconds} s); the board was not changed.`];
  lines.push(`Router: ${fr.state ?? "finished"} after ${fr.passes} routing pass(es)${fr.optimizer_passes ? ` and ${fr.optimizer_passes} optimizer pass(es)` : ""}` + (fr.unrouted_before !== null ? `, ${fr.unrouted_before} \u2192 ${fr.unrouted ?? "?"} unrouted by its count` : "") + ".");
  if (v.kept.tracks || v.kept.vias) lines.push(`Kept as fixed wiring: ${v.kept.tracks} track(s), ${v.kept.vias} via(s) already on the board.`);
  if (v.nets.left_out.length) lines.push(`Not routed (nets / exclude_nets): ${v.nets.left_out.join(", ")}.`);
  if (v.zones_filled) lines.push("Copper zones refilled and saved by KiCad.");
  lines.push(`KiCad: ${v.unrouted} unrouted connection(s), ${v.drc.counts.error} DRC error(s).`);
  lines.push(...v.notes);
  lines.push(`Design, session and router log: ${fr.files}`);
  return lines.join("\n");
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
  if (b.placement) {
    const p = b.placement;
    const issues = [
      p.courtyard_overlaps.length ? `courtyards overlap: ${p.courtyard_overlaps.map(([a, c]) => `${a}/${c}`).join(", ")}` : "",
      p.outside_outline.length ? `outside the outline: ${p.outside_outline.join(", ")}` : "",
      p.reference_over_pads.length ? `reference over pads: ${p.reference_over_pads.join(", ")}` : ""
    ].filter(Boolean);
    const edge = Object.entries(p.overhang).map(([ref, o2]) => `${ref} on the ${o2.side} edge`);
    lines.push(`Placement: ratsnest ${p.ratsnest_mm} mm; ${issues.length ? issues.join("; ") : "no courtyard overlaps, every footprint inside the outline"}${edge.length ? `; ${edge.join(", ")}` : ""}`);
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
  kicad_simulate: "read",
  kicad_sim_model: "read",
  kicad_check_mcu: "read",
  kicad_simulate_firmware: "read",
  kicad_export: "write",
  kicad_export_fab: "write",
  kicad_fab_preset: "write",
  kicad_create_schematic: "write",
  kicad_edit_schematic: "write",
  kicad_read_pcb: "read",
  kicad_edit_pcb: "write",
  kicad_update_pcb: "write",
  kicad_autoroute: "write"
};
var DESIGN_WRITE_TOOLS = ["kicad_create_schematic", "kicad_edit_schematic", "kicad_edit_pcb", "kicad_update_pcb", "kicad_fab_preset", "kicad_autoroute"];
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
  kicad_simulate: ["path", "output_dir", "spec"],
  kicad_sim_model: ["path"],
  kicad_check_mcu: ["path"],
  kicad_simulate_firmware: ["path", "firmware", "scenario"],
  kicad_export: ["path", "output"],
  kicad_export_fab: ["pcb", "output_dir"],
  kicad_fab_preset: ["path"],
  kicad_create_schematic: ["path"],
  kicad_edit_schematic: ["path"],
  kicad_read_pcb: ["path"],
  kicad_edit_pcb: ["path"],
  kicad_update_pcb: ["schematic", "pcb"],
  kicad_autoroute: ["pcb"]
};
var FAB_PRESETS = ["jlcpcb", "pcbway"];
var FAB_EXTRAS = ["ipc2581", "odb", "step"];
var SCH = { type: "string", required: true, description: "Path to a .kicad_sch file (relative to the working directory or absolute)." };
var PCB = { type: "string", required: true, description: "Path to a .kicad_pcb file (relative to the working directory or absolute)." };
var JSON_OUT = { schema: { type: "json" }, render: (_args, value) => [{ type: "text", text: formatJson(value) }] };
var AUTOROUTE_TIMEOUT = 300;
var AUTOROUTE_OVERHEAD_MS = 18e4;
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
      description: `Render a schematic (all sheets) or board with kicad-cli. Returns SVG/PNG paths under <project>/.dsh-kicad/render/ and, when the model accepts images, the first page as an image. For a board, view "3d" renders KiCad's 3D view (PNG): use it to check a placement, from any side or angle (side, rotate, zoom), e.g. rotate "-45,0,45" for an isometric view, side "bottom" for the back, zoom 3 on a corner with pivot.`,
      parameters: {
        path: { type: "string", required: true, description: "A .kicad_sch or .kicad_pcb file." },
        pages: { type: "string", description: "Comma-separated page numbers (schematic only)." },
        width: { type: "integer", description: "PNG width in pixels (default 1600)." },
        view: { type: "string", enum: ["2d", "3d"], description: 'Boards: "3d" renders the 3D view as PNG instead of the 2D plot (default "2d").' },
        side: { type: "string", enum: ["top", "bottom", "left", "right", "front", "back"], description: "3D: the side the camera looks from (default top)." },
        rotate: { type: "string", description: '3D: rotation "X,Y,Z" in degrees applied after side, e.g. "-45,0,45" (isometric from the front left), "-60,0,0" (tilted from the front).' },
        zoom: { type: "number", description: "3D: camera zoom; 1 (default) shows the whole board, 2 is twice as close." },
        pivot: { type: "string", description: '3D: point to look at, "X,Y,Z" in cm from the board centre (X right, Y up the board, Z out of the top); use with zoom to look at one area.' },
        perspective: { type: "boolean", description: "3D: perspective instead of orthographic projection (default false)." },
        quality: { type: "string", enum: ["basic", "high"], description: '3D: "high" ray-traces (a few seconds; default basic).' }
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
          width: args.width ?? 1600,
          ...args.view ? { view: args.view } : {},
          ...Object.fromEntries(["side", "rotate", "zoom", "pivot", "perspective", "quality"].filter((k) => args[k] !== void 0).map((k) => [k, args[k]]))
        }, exec.signal);
        const value = { path: rendered.path, svg: rendered.svg, ...rendered.png ? { png: rendered.png } : {} };
        if (wantImage && rendered.png?.[0]) {
          const data = await readFile(rendered.png[0]);
          value.image = await attachments(ctx).saveImage({ data: new Uint8Array(data), mediaType: "image/png", name: basename(rendered.png[0]) });
        } else if (!wantImage) {
          value.note = args.view === "3d" ? "The current model does not accept images (or no attachment store is mounted); the PNG is on disk." : "The current model does not accept images (or no attachment store is mounted); open the SVG in the KiCad sidebar viewer.";
        }
        return value;
      }
    }),
    defineTool({
      name: "kicad_simulate",
      description: [
        "Verify what a schematic does with SPICE, then let the tool judge it: KiCad exports the netlist (symbols' Sim.* properties; sources from Simulation_SPICE such as VDC, VSIN, VPULSE), ngspice runs it headless, and every assertion is checked against the numbers (never decide by eye).",
        "Analyses: op (DC operating point, the default), tran {stop, step?} (transient), ac {start, stop, points?} (frequency sweep; needs a source with an ac magnitude). Probes: V(net), V(netA,netB), I(R1|C1|L1|D1|V1); ngspice sign: a source that supplies current reads negative, so use abs: true.",
        "assertions: [{probe, min?, max?, equals? with tol or tol_pct, name?, analysis?, measure?, at?, from?, to?, ref?, abs?}]. Numbers take SPICE suffixes (10k, 100n, 3.3, 20m). Measures: op value; tran final|initial|max|min|mean|rms|pp|at (at = time, from/to a window); ac gain_db|phase_deg (at = frequency)|peak_gain_db|lowpass_cutoff_hz|highpass_cutoff_hz (ref: e.g. V(IN) for gain relative to the input).",
        `Turn each requirement into an assertion (e.g. 3V3 rail: {probe: "V(3V3)", min: 3.2, max: 3.4}; LED current: {probe: "I(D1)", min: "5m", max: "15m", abs: true}); on a failure change the circuit and run again. Report the tool's verdict, not your own.`,
        "Keep the requirements with the project: save_spec: true writes this call's analyses, assertions and monte_carlo to <schematic name>.sim.json; later calls (and the /simulate command) use that file when it exists, so a change can be re-verified against every requirement without retyping them. Arguments you pass replace the same key of the file.",
        "Tolerance: add monte_carlo to learn whether the requirements still hold when parts vary (e.g. 5% resistors); it reports pass counts and the spread per assertion, with the first failing draw.",
        'Every simulated part needs a SPICE model: R, C, L work from the value; a diode or LED needs set_sim_model {reference, device: "D", params: "is=1e-18 n=2 rs=3" for an LED}, otherwise the tool refuses; ICs, regulators and transistors need a vendor model: find it with kicad_sim_model and bind it with kicad_edit_schematic set_sim_model (it maps the pins and checks them); parts without a model are left out and listed. The circuit needs a ground net (a power:GND symbol) and, for tran/ac, a source.',
        "Needs ngspice: when it is missing the error says how to install it; tell the user (kicad_doctor lists the commands), never install anything yourself."
      ].join(" "),
      parameters: {
        path: SCH,
        analyses: {
          type: "array",
          description: 'Default: one operating point. At most one of each type: {type: "op"} \xB7 {type: "tran", stop (s, e.g. "10m"), step?} \xB7 {type: "ac", start, stop (Hz, e.g. 10 and "1Meg"), points? per decade, sweep?: dec|oct|lin}.',
          items: { type: "object", additionalProperties: true, properties: { type: { type: "string", enum: ["op", "tran", "ac"], required: true } } }
        },
        assertions: { type: "array", items: { type: "object", additionalProperties: true, properties: { probe: { type: "string", required: true } } }, description: "The requirements to verify, as described above." },
        probes: { type: "array", items: { type: "string" }, description: "Extra currents to record, e.g. I(R1); node voltages are always recorded." },
        monte_carlo: {
          type: "object",
          additionalProperties: true,
          description: 'Tolerance analysis (needs assertions): {runs? 2-500 (default 50), seed? (default 1, repeatable), tolerances? {R: 5, C: 10, L: 10, R1: "1%", V1: 2} in percent (a part letter or a reference; defaults R 5, C 10, L 10), distribution? uniform | gaussian (3\u03C3 = tolerance), min_pass_rate? 0-1 (default 1: every run must pass)}. Repeats the run with those values drawn at random and reports how often each assertion holds.'
        },
        timeout: { type: "number", description: "Seconds ngspice may run (default 60, at most 600)." },
        spec: { type: "string", description: "Requirements file (JSON: analyses, assertions, probes, monte_carlo, timeout). Default: <schematic name>.sim.json next to the schematic, used when it exists; what this call names replaces the same key of the file." },
        save_spec: { type: "boolean", description: "Write the analyses, assertions and monte_carlo this call used to the spec file: the requirements then stay with the project and /simulate checks them again." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatSimulate(value) }]
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const seconds = Math.min(Math.max(Number(args.timeout ?? 60), 1), 600);
        return await ctx.kicad.run("simulate", { ...args, path: at(exec, args.path), ...args.spec ? { spec: at(exec, args.spec) } : {} }, exec.signal, { timeoutMs: seconds * 1e3 + 6e4 });
      }
    }),
    defineTool({
      name: "kicad_sim_model",
      description: "List the SPICE models in a model file (.lib .mod .sub .cir .sp .spi .ckt .cmp .mdl .inc) or in every model file below a folder, optionally filtered by part of the model name: each .subckt with its pin names and the comment above it, each .model with its device type. Use it to find the model for a part and to see its pins before binding it with kicad_edit_schematic set_sim_model {reference, library, name, pins?}. Models come from files the user has (vendor downloads); do not invent them.",
      parameters: {
        path: { type: "string", required: true, description: "A model file, or a folder to search (e.g. the project folder)." },
        name: { type: "string", description: "Only models whose name contains this text (case-insensitive)." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatSimModel(value) }]
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("sim_model", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_check_mcu",
      description: [
        "Check how each microcontroller is wired, from KiCad's netlist and a per-family pin table (MCU providers), and let the tool judge it: strapping pins held at the wrong level at reset (ESP32 GPIO0, GPIO2, GPIO12), reserved flash/PSRAM pins in use, input-only GPIOs left floating or used to drive, an EN pin without pull-up, thin supply decoupling.",
        'requirements states what the firmware needs from the board, one per signal: [{net: "VBAT_SENSE", needs: "adc1"}, {pin: "U1:IO25", needs: ["output", "dac"]}]; needs is output (not input-only), input, adc, adc1 (ESP32: usable with WiFi), adc2, dac, touch, boot_free (not a strapping pin) or, per MCU, a fixed peripheral such as pwm, i2c_sda, i2c_scl, spi_mosi, spi_miso, spi_sck. Derive them from what the user says the board must do, then choose GPIOs that satisfy them before checking.',
        "Covered now: classic ESP32 modules and PICO, and the 8-pin ATtiny25/45/85 (a project can add its own provider as <family>.mcu.json next to the schematic). An MCU no provider covers comes back as CANNOT VERIFY: say so to the user, do not call that design checked.",
        "This is a static wiring check, not a firmware simulation: it cannot tell what the firmware does with a pin. Report the tool's verdict and fixes; run it after placing or changing an MCU, and fix every error before calling the design done."
      ].join(" "),
      parameters: {
        path: SCH,
        reference: { type: "string", description: "Only this MCU, e.g. U1." },
        requirements: { type: "array", items: { type: "object", additionalProperties: true, properties: { needs: { type: "string" } } }, description: "What the firmware needs from the board, as described above." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatMcu(value) }]
      },
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        return await ctx.kicad.run("check_mcu", { ...args, path: at(exec, args.path) }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_simulate_firmware",
      description: [
        'Run a firmware image on the simulated MCU against the schematic and judge what the board does, so "press the button, the LED lights" is checked rather than assumed. The tool decides; report its verdict.',
        "Covered: the 8-pin ATtiny25/45/85, a Python AVR core that follows the datasheet: GPIO, external and pin-change interrupts, Timer0 and Timer1 (normal, CTC, phase-correct and fast PWM; their OC pins are a duty cycle and a frequency, an LED on one is lit that fraction of the time; Timer1 also with the PLL clock and the complementary outputs), the ADC (single-ended and differential channels, the bandgap, the temperature sensor, Vcc / 1.1 V / 2.56 V / AREF references), the analog comparator, EEPROM (3.4 ms writes, persisting across resets), the watchdog (reset and interrupt mode), resets (the RESET pin, the watchdog, the 64 ms start-up delay), the USI in three-wire mode (SPI) and sleep. Anything else the firmware uses (USI two-wire/I\xB2C, dead-time generators, forced output compares, Timer0 mode 5) stops the run with the reason, and assertions about later times come back CANNOT VERIFY, never passed.",
        "Also covered: the classic ESP32 (WROOM/WROVER modules, PICO). Its flash image runs on Espressif's QEMU (ROM, bootloader, FreeRTOS, both cores); the tool watches the pin registers: outputs, open drain, internal pull-ups/downs, inputs (they read the board), the GPIO matrix, the LEDC: a pad on an LEDC channel is a PWM wave (duty, frequency, hardware fades), and the ADCs: a conversion (analogRead, adc_oneshot_read, ADC.read_uv) reads the voltage the board puts on the pad as a typical chip with ESP-IDF's calibration would (the result lists the conversions). The strapping pins are read from the board at power-on (GPIO0 held low really starts the serial bootloader; GPIO12 high is an error), EN low holds the chip in reset, resets are logged with their cause, and the UART0 output is captured. GPIO interrupts reach the firmware (its handlers run: attachInterrupt, gpio_isr_handler_add, Pin.irq; the result lists them). A pad on the board driven by another peripheral (I2C, SPI, RMT), an LEDC timer paused or held in reset while it drives one, an ADC reading a pad a PWM wave switches without a capacitor to filter it, a firmware crash or a firmware waiting for hardware QEMU lacks stops the run: CANNOT VERIFY after that point. Hardware the simulation does not emulate (WiFi, Bluetooth, touch pads, the temperature sensor, ...) is listed under not_emulated. Needs Espressif's QEMU: when it is missing the error says how to install it; tell the user (/kicad-install qemu-esp32, or ESP-IDF's idf_tools.py install qemu-xtensa), never install anything yourself. Other MCUs: this tool refuses; kicad_check_mcu still checks their wiring.",
        "The firmware is what the user built; this tool never builds, writes or invents one. ATtiny: a .hex or .elf (avr-gcc, PlatformIO, Arduino; an ELF also carries the initial EEPROM). ESP32: the merged flash image (.bin with the bootloader at 0x1000: ESP-IDF `esptool.py merge_bin`, Arduino's .merged.bin) or the ESP-IDF build folder's flasher_args.json. Without one, say that firmware behaviour could not be verified.",
        "The board is a DC network: resistors, closed switches, the chip's pin drivers and internal pull-ups, rails and ground. LEDs report whether they would light (forward voltage 1.8 V); transistors, ICs and anything else on those nets are open circuits and are listed in the result. ATtiny: PB5 is the RESET pin (pulled up inside, a switch to ground resets the chip) unless rstdisbl says the fuse is programmed. ESP32: EN is the reset (a switch to ground holds the chip in reset until released).",
        `stimuli: [{at: "30ms", press: "SW1", name: "press"}, {at: "70ms", release: "SW1"}, {at, toggle: "SW1"}, {at, drive: "NET", level: "high"|"low"|"release"|a voltage such as 7.4 (an ideal source that also overrides a rail: a battery that sags)}, {at, temperature: 85} (ATtiny)]. assertions: subject {led: "D2", is: "on"|"off"} | {led, min?, max?} (brightness 0-1: the fraction of time lit, for a PWM-dimmed LED) | {pin: "PB4" (ESP32: "GPIO2"), level: "high"|"low"} | {pin: "PB0", duty: 0.25, tol?: 0.02} | {pin, freq: 490, tol_pct?: 2} (a PWM pin: ATtiny timers, ESP32 LEDC) | {net: "NAME", level: ...} | {net, min?, max?} in volts (the average on a PWM net); when {at: "40ms"} | {after: "press", within: "20ms"} (it becomes true in the window) | {from: "35ms", to: "69ms"} (true throughout). Logged events: {reset: "any"|"external"|"watchdog" (ESP32 also "power-on"|"software"|"deep-sleep"|"brownout"), after, within} | {resets: N | {min, max}, at} | {eeprom: 0, is: 42, at} | {usi: "tx"|"rx", nth: 1, is: 165, by} (ATtiny) | {uart: "text", is?: "present"|"absent", by?: "2s"} (ESP32 UART0). Use the user's timing requirements as the windows; an ESP32 boots first (about 0.2 s, MicroPython about 2 s).`,
        "Other inputs: eeprom {address: value} (initial bytes), usi_input [bytes] (what a slave shifts into the USI on DI, one per transfer), temperature (\xB0C for the ADC sensor), startup_ms (the restart delay after a reset, default 64), clock_hz (default 1000000: the factory 8 MHz RC with CKDIV8; set it to the clock the firmware was built for): all ATtiny only. initial, vcc, led_vf, duration (ATtiny: default 100 ms, at most 5 s; ESP32: default 2 s, at most 30 s).",
        "Keep the scenario with the project: save_scenario: true writes this call's arguments to <schematic name>.fw.json; later calls (and the /mcu-sim command) use that file when it exists, so a change is re-verified against every saved requirement without retyping them. Arguments you pass replace the same key of the file.",
        "Also reports hazards without being asked: a floating input the firmware reads (a button without a pull-up), an output fighting a switch (overcurrent), a level stuck between the thresholds, and every reset.",
        "ATtiny: a sleeping chip costs nothing to simulate; a busy loop costs wall-clock time. ESP32: idle time passes in real time, so a run takes at least its duration of wall-clock time; timings inside the application vary by under a millisecond between runs, the boot by tens of milliseconds: start the stimuli after the timeline shows the firmware set its pins up."
      ].join(" "),
      parameters: {
        path: SCH,
        firmware: { type: "string", description: "Path to the firmware: ATtiny Intel HEX or ELF; ESP32 merged flash image (.bin) or flasher_args.json (optional when the scenario file names it)." },
        reference: { type: "string", description: "The MCU, e.g. U1 (default: the simulable one)." },
        duration: { type: "string", description: 'Simulated time, e.g. "200ms".' },
        clock_hz: { type: "number", description: "CPU clock in Hz after any fuse divider (default 1000000)." },
        stimuli: { type: "array", items: { type: "object", additionalProperties: true, properties: { at: { type: "string", required: true } } }, description: "What happens to the board and when." },
        assertions: { type: "array", items: { type: "object", additionalProperties: true }, description: "What must hold." },
        initial: { type: "object", additionalProperties: true, description: 'Switch states at the start, e.g. {"SW1": "closed"} (default all open).' },
        eeprom: { type: "object", additionalProperties: true, description: 'Initial EEPROM bytes as {"0": 42, "1": 7}.' },
        usi_input: { type: "array", items: { type: "integer" }, description: "Bytes a slave shifts into the USI on DI, one per transfer." },
        temperature: { type: "number", description: "Chip temperature for the ADC temperature sensor, \xB0C (default 25)." },
        rstdisbl: { type: "boolean", description: "The RSTDISBL fuse is programmed: PB5 is a GPIO (ADC0), not the RESET pin." },
        startup_ms: { type: "number", description: "Milliseconds before the program restarts after a reset (default 64)." },
        vcc: { type: "number", description: "Supply voltage (default: from the supply net name, else 5)." },
        led_vf: { type: "number", description: "Forward voltage at which an LED counts as lit (default 1.8)." },
        scenario: { type: "string", description: "Scenario file (JSON). Default: <schematic name>.fw.json next to the schematic, used when it exists; what this call names replaces the same key of the file." },
        save_scenario: { type: "boolean", description: "Write the arguments this call used to the scenario file (needs assertions)." },
        timeout: { type: "number", description: "Wall-clock seconds (default 60)." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatFirmware(value) }]
      },
      async execute(args, exec) {
        const seconds = Math.min(Math.max(Number(args.timeout ?? 60), 1), 600);
        return await ctx.kicad.run("simulate_firmware", {
          ...args,
          path: at(exec, args.path),
          ...args.firmware ? { firmware: at(exec, args.firmware) } : {},
          ...args.scenario ? { scenario: at(exec, args.scenario) } : {}
        }, exec.signal, { timeoutMs: seconds * 1e3 + 3e4 });
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
        'SPICE models for kicad_simulate: set_sim_model{reference, library, name, pins?} binds a .subckt or .model from a model file (library relative to the project; find them with kicad_sim_model), matching symbol pins to model pins by name and refusing when it cannot, so give pins {"1":"GND","2":"OUT"} (symbol pin \u2192 model pin) when the names differ; set_sim_model{reference, device:"D", params:"is=1e-18 n=2 rs=3"} sets a built-in device (diode, LED) without a file.',
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
      description: "Summarize a KiCad board: outline size, copper layers and thickness, design rules and net classes (from the .kicad_pro), every footprint (reference, value, footprint, position in mm, rotation, front/back side, locked, courtyard box, pad nets), zones, nets, placement checks (courtyard overlaps, footprints outside the outline, reference text over pads, total ratsnest length) and KiCad DRC's count of unrouted connections. Start here before editing a board.",
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
        `Automatic placement: auto_place{} lays out every unlocked footprint from the schematic's functional blocks (add_block frames; without them its sheets, else net connectivity): each block stays together, connectors sit on the board edge facing out, decoupling capacitors at their IC's power pins, crystals at their IC; the outline is sized to fit unless you drew one, which the parts must then fit (outline: "fit" | "keep" forces either); references:[...] places only those, e.g. parts kicad_update_pcb staged; groups:[{title,references}] overrides the blocks; gap?/group_gap?/margin? in mm. place_block{title | references, x, y, width?, height?, face?:left|right|top|bottom} lays out one block with its top-left corner at x,y or inside that rectangle. Both report the ratsnest length before/after and the placement checks; run them on a new board before routing, then check with kicad_render (view "3d").`,
        "Rules: set_design_rules{min_clearance?,min_track_width?,min_via_diameter?,min_via_annular_width?,min_through_hole_diameter?,min_hole_to_hole?,min_hole_clearance?,min_copper_edge_clearance?,min_silk_clearance?,min_text_height?,...}; set_net_class{name,nets?,track_width?,clearance?,via_diameter?,via_drill?} (nets move to that class; tracks and vias on them default to its sizes).",
        `Copper: add_track{points:[[x,y] | "REF:PAD",...],net?,layer?(F.Cu),width?,locked?} (pad endpoints snap to the pad centre; the pad must be on the track's net and layer; locked tracks stay as they are when kicad_autoroute runs); add_via{x,y,net,diameter?,drill?,locked?}; lock_tracks{nets? | uuids?,locked?}; remove_tracks{nets?,locked?} (unroute before placing again; locked tracks stay unless locked: true); add_zone{net,layer | layers,outline?("board" | [[x,y],...]),priority?,clearance?,connect_pads?:thermal|solid|none}; add_keepout{outline,layers?,tracks?,vias?,pads?,copperpour?,footprints?} (true = not allowed).`,
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
    }),
    defineTool({
      name: "kicad_update_pcb",
      description: [
        `Update PCB from Schematic, headless: create or update the board so it matches the schematic, as KiCad's "Update PCB from Schematic" does. Run it after the schematic passes ERC and every board symbol has a footprint, and again after every schematic change.`,
        "A new board (<schematic name>.kicad_pcb, the file KiCad pairs with the schematic) gets KiCad's empty board, a default 2-layer stackup (copper_layers: 4 for four), every footprint packed in rows inside a placeholder outline, and KiCad's default design rules.",
        'It refuses, writing nothing, with every REF:PIN that cannot go on the board: a symbol without a footprint (power symbols need a "#" reference), a footprint in no library, a pin without a pad of that number. Fix those in the schematic (set_footprint, or a footprint whose pads match the pins) and run it again.',
        "On an existing board, placed footprints keep their position, rotation, side and lock; new ones are staged right of the outline for you to place (kicad_edit_pcb auto_place with their references, or move_footprint); references, values, fields and pad nets follow the schematic; a renamed net keeps its tracks, vias and zones; a changed footprint is swapped in place; footprints whose symbol is gone are listed, and deleted only with delete_removed: true. Untouched text stays byte-identical; a second run changes nothing.",
        "The result ends with KiCad's schematic parity count: the board matches the schematic only at 0. Use dry_run to preview."
      ].join(" "),
      parameters: {
        schematic: SCH,
        pcb: { type: "string", description: "The board (default: <schematic name>.kicad_pcb next to the schematic, where KiCad looks for it). Created when missing." },
        delete_removed: { type: "boolean", description: "Delete footprints whose symbol is gone (default false: they are only listed). Locked ones stay." },
        dry_run: { type: "boolean", description: "List the changes without writing." },
        copper_layers: { type: "integer", enum: [2, 4], description: "Copper layers of a new board (default 2)." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatSync(value) }],
        presentationMeta: (_args, value) => syncMeta(value)
      },
      async execute(args, exec) {
        return await ctx.kicad.run("update_pcb", {
          ...args,
          schematic: at(exec, args.schematic),
          ...args.pcb ? { pcb: at(exec, args.pcb) } : {}
        }, exec.signal);
      }
    }),
    defineTool({
      name: "kicad_autoroute",
      description: [
        "Route a board with the Freerouting autorouter, headless, then let KiCad judge it. Run it after placement (every part inside the outline, nothing overlapping).",
        "Tracks and vias already on the board are kept exactly as they are and the router routes around and onto them: route critical nets by hand first (power, USB/differential pairs, crystals) with kicad_edit_pcb add_track/add_via locked: true, then autoroute the rest.",
        "nets routes only those nets, exclude_nets leaves nets unrouted (names or glob patterns). Only new tracks and vias are added; footprints never move.",
        "Copper zones are refilled and saved afterwards, so add a GND pour (add_zone on both copper layers; connect_pads: solid avoids starved thermal reliefs) before or after routing.",
        `The result gives KiCad's unrouted count; the automatic DRC follows. If connections stay unrouted, route those by hand, or give the parts more room (after auto_place: remove_tracks, then auto_place with outline "fit" and a larger gap, e.g. 2 and group_gap 4) and run it again (existing tracks are kept).`,
        "Needs Java and Freerouting: when they are missing the error says how to install them; tell the user (/kicad-install freerouting), never install anything yourself.",
        `Long-running: timeout (default ${AUTOROUTE_TIMEOUT} s) stops the router, keeping what it routed.`
      ].join(" "),
      parameters: {
        pcb: PCB,
        nets: { type: "array", items: { type: "string" }, description: 'Route only these nets (names or glob patterns such as "/LED*").' },
        exclude_nets: { type: "array", items: { type: "string" }, description: "Leave these nets unrouted, e.g. nets you route by hand later." },
        passes: { type: "integer", description: "Maximum routing passes (default: Freerouting's own; it stops when it no longer improves)." },
        timeout: { type: "number", description: `Seconds before the router stops and keeps what it has (default ${AUTOROUTE_TIMEOUT}, at most 3600).` },
        fill_zones: { type: "boolean", description: "Refill and save copper zones afterwards (default true)." }
      },
      output: {
        schema: { type: "json" },
        render: (_args, value) => [{ type: "text", text: formatAutoroute(value) }],
        presentationMeta: (_args, value) => autorouteMeta(value)
      },
      async execute(args, exec) {
        const seconds = Math.min(Math.max(args.timeout ?? AUTOROUTE_TIMEOUT, 5), 3600);
        const log = ctx.logger("kicad");
        return await ctx.kicad.run("autoroute", { ...args, pcb: at(exec, args.pcb) }, exec.signal, {
          timeoutMs: seconds * 1e3 + AUTOROUTE_OVERHEAD_MS,
          onProgress: (p) => log.debug("autoroute %s: %s", args.pcb, p.message ?? p.progress)
        });
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
    file_list: (r.files ?? []).slice(0, MAX_META_ITEMS).map((f) => ({ path: f.path, kind: f.kind, layer: f.layer ?? null })),
    preview: r.preview ?? []
  };
}
var MAX_META_ITEMS = 80;
function syncMeta(v) {
  return {
    kind: "sync",
    schematic: v.schematic,
    pcb: v.pcb,
    created: v.created,
    dry_run: v.dry_run,
    written: v.written,
    counts: v.counts,
    changes: v.changes.slice(0, MAX_META_ITEMS),
    more_changes: Math.max(0, v.changes.length - MAX_META_ITEMS),
    staged: v.staged.slice(0, MAX_META_ITEMS).map((s) => s.reference),
    flagged: v.flagged.slice(0, MAX_META_ITEMS),
    footprints: v.board.footprints,
    copper_layers: v.board.copper_layers.length,
    parity: v.parity ? { total: v.parity.total, by_type: v.parity.by_type } : null
  };
}
function autorouteMeta(v) {
  const fr = v.freerouting;
  return {
    kind: "autoroute",
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
    notes: v.notes.slice(0, 8)
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
  AUTOROUTE_TIMEOUT,
  DESIGN_WRITE_TOOLS,
  FAB_EXTRAS,
  FAB_PRESETS,
  PATH_ARGUMENTS,
  TOOL_ACCESS,
  apply,
  autorouteMeta,
  checkMeta,
  doctorMeta,
  eng,
  fabMeta,
  formatAutoroute,
  formatBoard,
  formatCheck,
  formatEdit,
  formatFab,
  formatFabGate,
  formatFirmware,
  formatJson,
  formatMcu,
  formatPreset,
  formatSimModel,
  formatSimulate,
  formatSync,
  inject,
  name,
  syncMeta
};
