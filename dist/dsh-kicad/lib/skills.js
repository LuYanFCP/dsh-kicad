// packages/kicad-skills/src/commands.ts
import { readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

// packages/tool-kicad/lib/dsh.js
import { defineTool } from "@deepseek-ai/dsh-tools";

// packages/tool-kicad/lib/format.js
var MAX_LISTED = 60;
function formatCheck(report) {
  const label = report.kind.toUpperCase();
  const verdict = report.passed ? "PASSED" : "FAILED";
  const head = `${label} by KiCad ${report.kicad_version ?? ""}`.trim() + `${report.path ? ` on ${report.path}` : ""}: ${verdict} \u2014 ${report.counts.error} error(s), ${report.counts.warning} warning(s)` + (report.unrouted !== void 0 ? `, ${report.unrouted} unrouted` : "") + (report.parity !== void 0 ? `, ${report.parity} schematic parity issue(s)` : "") + (report.counts.exclusion ? `, ${report.counts.exclusion} excluded` : "") + (report.schematic_parity_error ? `
Schematic parity was NOT checked: ${report.schematic_parity_error}` : "");
  const active = report.violations.filter((v) => !v.excluded);
  if (active.length === 0)
    return head;
  const lines = active.slice(0, MAX_LISTED).map(violationLine);
  if (active.length > MAX_LISTED)
    lines.push(`\u2026 ${active.length - MAX_LISTED} more`);
  return `${head}
${lines.join("\n")}`;
}
var PREFIXES = [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "\xB5"], [1e-9, "n"], [1e-12, "p"]];
function eng(value) {
  if (value === 0 || !Number.isFinite(value))
    return String(value);
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
function formatSimulate(v) {
  const held = v.assertions.filter((a) => a.passed).length;
  const head = v.passed === null ? `SPICE by ngspice ${v.ngspice ?? ""} on ${v.path}: no assertions given, results only.`.replace("  ", " ") : `SPICE by ngspice ${v.ngspice ?? ""} on ${v.path}: ${v.passed ? "PASSED" : "FAILED"} \u2014 ${held}/${v.assertions.length} assertion(s) hold.`.replace("  ", " ");
  const lines = [head];
  if (v.spec?.loaded.length)
    lines.push(`Requirements from ${v.spec.path} (${v.spec.loaded.join(", ")}).`);
  if (v.spec?.saved)
    lines.push(`Requirements saved to ${v.spec.path}.`);
  for (const a of v.assertions) {
    const bounds = [a.min !== null ? `\u2265 ${eng(a.min)}${a.unit}` : "", a.max !== null ? `\u2264 ${eng(a.max)}${a.unit}` : ""].filter(Boolean).join(" and ");
    lines.push(`${a.passed ? "\u2713" : "\u2717"} ${a.name}: ${eng(a.value)}${a.unit} (required ${bounds})`);
  }
  for (const analysis of v.analyses) {
    if (analysis.type === "op") {
      const entries = Object.entries(analysis.values);
      if (entries.length)
        lines.push(`Operating point: ${entries.map(([k, x]) => `${k} = ${eng(x)}${k.startsWith("I(") ? "A" : "V"}`).join(", ")}`);
    } else if (analysis.type === "tran") {
      lines.push(`Transient to ${eng(analysis.stop)}s (${analysis.points} points): ${Object.entries(analysis.signals).slice(0, 12).map(([k, s]) => `${k} ${eng(s.initial)} \u2192 ${eng(s.final)} (min ${eng(s.min)}, max ${eng(s.max)})`).join("; ")}`);
    } else {
      lines.push(`AC sweep ${eng(analysis.start)}\u2013${eng(analysis.stop)} Hz (${analysis.points} points); judge it with ac assertions.`);
    }
  }
  if (v.ignored.length)
    lines.push(`Not simulated (no SPICE model, left out of the circuit): ${v.ignored.join(", ")}.`);
  if (v.monte_carlo)
    lines.push(...formatMonteCarlo(v.monte_carlo));
  lines.push(...v.notes, ...(v.warnings ?? []).map((w) => `ngspice: ${w}`));
  lines.push(`Netlist and log: ${v.netlist}`);
  return lines.join("\n");
}
function violationLine(v) {
  const where = v.items.map((i) => `${i.description ?? ""}${i.pos ? ` @ (${round(i.pos.x)}, ${round(i.pos.y)})` : ""}`).filter(Boolean).join("; ");
  return `- [${v.severity}] ${v.type}: ${v.description}${where ? ` \u2014 ${where}` : ""}${v.sheet && v.sheet !== "/" ? ` [sheet ${v.sheet}]` : ""}`;
}
function formatFabGate(gate) {
  if (!gate.passed)
    return `FAILED \u2014 ${gate.blocking.join("; ")}`;
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
  if (b?.width_mm)
    lines.push(`Board: ${b.width_mm} \xD7 ${b.height_mm} mm, ${b.copper_layers} copper layer(s), ${b.thickness_mm} mm thick`);
  lines.push(`Files in ${r.output_dir}:`);
  for (const f of r.files ?? []) {
    const what = f.layer ? f.layer : f.kind === "drill" ? `drill, ${f.holes} hole(s), ${f.tools} tool(s)` : f.kind;
    lines.push(`- ${f.path} \u2014 ${what}`);
  }
  if (r.preview?.length)
    lines.push(`3D preview: ${r.preview.join(", ")}`);
  if (r.warnings?.length)
    lines.push("Warnings:", ...r.warnings.map((w) => `- ${w}`));
  if (r.notes?.length)
    lines.push(`Notes (${fab}):`, ...r.notes.map((n) => `- ${n}`));
  return lines.join("\n");
}
function round(n) {
  return Math.round(n * 100) / 100;
}

// packages/tool-kicad/lib/index.js
var FAB_EXTRAS = ["ipc2581", "odb", "step"];

// packages/kicad-skills/src/dsh.ts
import { createUserMessage } from "@deepseek-ai/dsh-llm";
var BUNDLED_RANK = 600;
function agentCwd(ctx, agent) {
  const wd = ctx.get("workingDirectory");
  const session = agent?.session;
  try {
    if (wd && session) return wd.get(session);
  } catch {
  }
  return process.cwd();
}
function followup(agent, text) {
  const target = agent;
  if (!target?.followup) throw new Error("this command needs a running session");
  target.followup(createUserMessage({ content: [{ type: "text", text }], source: { kind: "user" } }));
}

// packages/kicad-skills/src/commands.ts
function targetFile(cwd, rawInput, ext) {
  const arg = rawInput.trim();
  if (arg) return isAbsolute(arg) ? arg : resolve(cwd, arg);
  const entries = readdirSync(cwd);
  const pro = entries.find((e) => e.endsWith(".kicad_pro"));
  if (pro) {
    const sibling = pro.replace(/\.kicad_pro$/, ext);
    if (entries.includes(sibling)) return join(cwd, sibling);
  }
  const any = entries.find((e) => e.endsWith(ext));
  if (any) return join(cwd, any);
  throw new Error(`no ${ext} file in ${cwd}; pass a path, e.g. /${ext === ".kicad_sch" ? "erc" : "drc"} hardware/board${ext}`);
}
function createCommands(ctx) {
  const wrap = (fn) => async (inv) => {
    try {
      return { kind: "success", text: await fn(inv, agentCwd(ctx, inv.agent)) };
    } catch (error) {
      return { kind: "error", text: error.message };
    }
  };
  const check = (tool, ext) => wrap(async (inv, cwd) => {
    const report = await ctx.kicad.run(tool, { path: targetFile(cwd, inv.rawInput, ext) }, inv.signal);
    return formatCheck(report);
  });
  return [
    {
      name: "kicad-doctor",
      description: "Check whether KiCad (kicad-cli 8+), its libraries and Python are ready, and how to fix what is missing",
      input: { hint: "[--json]" },
      handler: wrap(async (inv) => {
        const report = await ctx.kicad.doctor(inv.signal);
        return flags(inv.rawInput).json ? JSON.stringify(report) : formatDoctor(report);
      })
    },
    {
      name: "kicad-install",
      description: "Install KiCad, or the Freerouting autorouter: list the ways for this machine, or run one you confirm (never with sudo)",
      input: { hint: "[<method> --yes | status | cancel] [--json]" },
      handler: wrap(async (inv) => installCommand(ctx, inv.rawInput, inv.signal))
    },
    {
      name: "erc",
      description: "Run KiCad ERC on the project schematic (or the given .kicad_sch)",
      input: { hint: "[path/to/file.kicad_sch]" },
      handler: check("erc", ".kicad_sch")
    },
    {
      name: "drc",
      description: "Run KiCad DRC on the project board (or the given .kicad_pcb)",
      input: { hint: "[path/to/file.kicad_pcb]" },
      handler: check("drc", ".kicad_pcb")
    },
    {
      name: "bom",
      description: "Show the bill of materials of the project schematic",
      input: { hint: "[path/to/file.kicad_sch]" },
      handler: wrap(async (inv, cwd) => {
        const bom = await ctx.kicad.run(
          "export_bom",
          { path: targetFile(cwd, inv.rawInput, ".kicad_sch") },
          inv.signal
        );
        return formatBom(bom.columns, bom.rows);
      })
    },
    {
      name: "simulate",
      description: "Verify the project schematic with ngspice: the requirements saved in <name>.sim.json, or a DC operating point showing every net voltage when there are none",
      input: { hint: "[path/to/file.kicad_sch]" },
      handler: wrap(async (inv, cwd) => {
        const result = await ctx.kicad.run("simulate", { path: targetFile(cwd, inv.rawInput, ".kicad_sch") }, inv.signal, { timeoutMs: 12e4 });
        return formatSimulate(result);
      })
    },
    {
      name: "kicad-fab",
      description: "Export the project board for ordering: Gerber, drill, position and BOM files in one zip, once KiCad finds it ready",
      input: { hint: "[path/to/board.kicad_pcb] [--preset jlcpcb|pcbway] [--force] [--step] [--ipc2581] [--odb]" },
      handler: wrap(async (inv, cwd) => fabCommand(ctx, cwd, inv.rawInput, inv.signal))
    },
    {
      name: "kicad-design",
      description: "Describe the board you want in one sentence; the agent asks a few questions, writes a full spec, then designs it",
      input: { hint: "e.g. a USB-powered board where a button turns an LED on" },
      handler: wrap(async (inv) => {
        const idea = inv.rawInput.trim();
        if (!idea) throw new Error("Write what you want after the command, e.g. /kicad-design a USB-powered board where a button turns an LED on");
        followup(inv.agent, designRequest(idea));
        return /[\u3400-\u9fff]/.test(idea) ? "\u5DF2\u4EA4\u7ED9 agent\uFF1A\u5148\u5E2E\u4F60\u8865\u5168\u9700\u6C42\u3001\u786E\u8BA4\u540E\u518D\u753B\u539F\u7406\u56FE\u3002" : "Sent to the agent: it will complete the requirements with you, then draw the schematic.";
      })
    },
    {
      name: "kicad-render",
      description: "Re-render a KiCad schematic or board for the sidebar viewer: SVG, a board's 3D scene (--glb) or KiCad's 3D render (--3d)",
      input: { hint: "path/to/file.kicad_sch [--glb [--force] | --3d [--side=top] [--rotate=X,Y,Z] [--zoom=1] [--pivot=X,Y,Z] [--perspective] [--quality=basic|high] [--width=W] [--height=H] [--name=N]] [--json]" },
      // `--json` marks the viewer's own runs, whose chat rows stay hidden; the output is JSON either way.
      handler: wrap(async (inv, cwd) => renderCommand(ctx, cwd, inv.rawInput, inv.signal))
    }
  ];
}
var RENDER_VALUES = ["side", "rotate", "zoom", "pivot", "quality", "width", "height", "name"];
var RENDER_NUMBERS = /* @__PURE__ */ new Set(["zoom", "width", "height"]);
function renderArgs(raw) {
  const out = { path: "", kind: "svg", force: false, camera: {} };
  const rest = [];
  for (const word of raw.trim().split(/\s+/).filter(Boolean)) {
    const option = /^--([a-z0-9-]+)(?:=(.*))?$/.exec(word);
    if (!option) {
      rest.push(word);
      continue;
    }
    const [, name2, value] = option;
    if (name2 === "json") continue;
    if (name2 === "glb" || name2 === "3d") {
      if (out.kind !== "svg" && out.kind !== name2) throw new Error("use either --glb (3D scene) or --3d (KiCad render)");
      out.kind = name2;
    } else if (name2 === "force") {
      out.force = true;
    } else if (name2 === "perspective") {
      out.camera.perspective = true;
    } else if (RENDER_VALUES.includes(name2)) {
      if (!value) throw new Error(`--${name2} needs a value, e.g. --${name2}=${name2 === "rotate" || name2 === "pivot" ? "-45,0,45" : name2 === "side" ? "top" : name2 === "quality" ? "high" : "1"}`);
      const number = Number(value);
      if (RENDER_NUMBERS.has(name2) && !Number.isFinite(number)) throw new Error(`--${name2} must be a number, got ${value}`);
      out.camera[name2] = RENDER_NUMBERS.has(name2) ? number : value;
    } else {
      throw new Error(`unknown option --${name2}; use --glb [--force], or --3d with --side, --rotate, --zoom, --pivot, --perspective, --quality, --width, --height, --name`);
    }
  }
  if (out.kind !== "3d" && Object.keys(out.camera).length) throw new Error("camera options need --3d");
  if (out.force && out.kind !== "glb") throw new Error("--force goes with --glb");
  out.path = rest.join(" ");
  return out;
}
async function renderCommand(ctx, cwd, raw, signal) {
  const args = renderArgs(raw);
  const path = args.path ? isAbsolute(args.path) ? args.path : resolve(cwd, args.path) : targetFile(cwd, "", args.kind === "svg" ? ".kicad_sch" : ".kicad_pcb");
  if (args.kind === "glb") {
    const out2 = await ctx.kicad.run("export_glb", { path, force: args.force }, signal);
    return JSON.stringify({ path, ...out2 });
  }
  if (args.kind === "3d") {
    const out2 = await ctx.kicad.run("render", { path, view: "3d", ...args.camera }, signal);
    return JSON.stringify({ path, svg: [], png: out2.png, ...out2.camera ? { camera: out2.camera } : {} });
  }
  const out = await ctx.kicad.run("render", { path, format: "svg" }, signal);
  return JSON.stringify({ path, svg: out.svg });
}
function flags(raw) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  return { json: words.includes("--json"), yes: words.includes("--yes") || words.includes("-y"), words: words.filter((w) => !w.startsWith("-")) };
}
function fabArgs(raw) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  const out = { path: "", force: false, extras: [], json: false };
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const preset = /^--preset(?:=(.*))?$/.exec(word);
    if (preset) {
      out.preset = preset[1] ?? words[++i];
      if (!out.preset) throw new Error("--preset needs a fab house, e.g. --preset jlcpcb");
    } else if (word === "--force") {
      out.force = true;
    } else if (word === "--json") {
      out.json = true;
    } else if (word.startsWith("--") && FAB_EXTRAS.includes(word.slice(2))) {
      out.extras.push(word.slice(2));
    } else if (word.startsWith("-")) {
      throw new Error(`unknown option ${word}; use --preset <name>, --force, ${FAB_EXTRAS.map((e) => `--${e}`).join(", ")}`);
    } else if (!out.path) {
      out.path = word;
    } else {
      throw new Error(`expected one board, got "${out.path}" and "${word}"`);
    }
  }
  return out;
}
async function fabCommand(ctx, cwd, raw, signal) {
  const args = fabArgs(raw);
  const pcb = targetFile(cwd, args.path, ".kicad_pcb");
  const real = (path) => {
    try {
      return realpathSync(path);
    } catch {
      return resolve(path);
    }
  };
  const rel = relative(real(cwd), real(pcb));
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`/kicad-fab writes next to the board, so the board must be inside the working directory (${cwd}); got ${pcb}`);
  }
  const result = await ctx.kicad.run("export_fab", {
    pcb,
    force: args.force,
    extras: args.extras,
    ...args.preset ? { preset: args.preset } : {}
  }, signal);
  return args.json ? JSON.stringify(result) : formatFab(result);
}
async function installCommand(ctx, raw, signal) {
  const { json, yes, words } = flags(raw);
  const [verb = "plan"] = words;
  if (verb === "status") {
    const job2 = ctx.kicad.installer.job;
    return json ? JSON.stringify({ job: job2 ?? null }) : job2 ? formatJob(job2) : "No KiCad installation has run since dsh started.";
  }
  if (verb === "cancel") {
    const cancelled = ctx.kicad.installer.cancel();
    return json ? JSON.stringify({ cancelled, job: ctx.kicad.installer.job ?? null }) : cancelled ? "Cancelling the KiCad installation\u2026" : "No KiCad installation is running.";
  }
  if (verb === "plan") {
    const report = await ctx.kicad.doctor(signal);
    return json ? JSON.stringify({ report, job: ctx.kicad.installer.job ?? null }) : formatPlan(report);
  }
  const method = verb === "start" ? words[1] ?? "" : verb;
  if (!yes) {
    const report = await ctx.kicad.doctor(signal);
    const option = [...optionalInstalls(report), ...report.install].find((o) => o.id === method);
    if (!option) return formatPlan(report);
    return option.runnable ? `This will run:

    ${option.command}

Run \`/kicad-install ${option.id} --yes\` to confirm.` : formatOption(option);
  }
  const job = await ctx.kicad.install(method, signal);
  return json ? JSON.stringify({ job }) : `Started: ${job.command}
Follow it with /kicad-install status; KiCad is checked again when it finishes.`;
}
var MARK = { ok: "\u2713", warn: "!", error: "\u2717" };
function optionalInstalls(report) {
  return report.checks.flatMap((c) => c.install ?? []);
}
function formatDoctor(report) {
  const lines = [`**${report.summary}**`, ""];
  for (const c of report.checks) {
    lines.push(`- ${MARK[c.status]} **${c.label}**: ${c.summary}`);
    if (c.fix) lines.push(`  - fix: ${c.fix}`);
  }
  if (report.install.length) lines.push("", "Install KiCad: run `/kicad-install` to see the options for this machine.");
  const optional = optionalInstalls(report).filter((o) => o.runnable);
  if (optional.length) lines.push("", `Optional: ${optional.map((o) => `\`/kicad-install ${o.id}\` (${o.label})`).join(", ")}.`);
  return lines.join("\n");
}
function formatOption(o) {
  const tags = [o.recommended && "recommended", o.needs_root && "needs administrator rights: run it yourself", !o.available && "not available here"].filter(Boolean);
  const how = o.command ? o.runnable ? `\`/kicad-install ${o.id} --yes\` runs:

    ${o.command}` : `

    ${o.command}` : o.url ?? "";
  return `**${o.label}**${tags.length ? ` (${tags.join("; ")})` : ""}: ${how}${o.note ? `
${o.note}` : ""}`;
}
function formatPlan(report) {
  const optional = optionalInstalls(report);
  const extras = report.checks.filter((c) => c.install?.length).flatMap((c) => [`**${c.label}:**`, ...c.install.map(formatOption)]);
  if (report.status === "ok") {
    return optional.length ? [`**${report.summary}**`, ...extras].join("\n\n") : `${report.summary}
Nothing to install.`;
  }
  if (!report.install.length) return [formatDoctor(report), ...extras].join("\n\n");
  return [`**${report.summary}**`, "", ...report.install.map(formatOption), ...extras, "", "After installing, run /kicad-doctor; dsh does not need a restart."].join("\n\n");
}
function formatJob(job) {
  const head = `${job.label}: ${job.state}${job.phase === "checking" ? " (checking KiCad again)" : ""} \u2014 step ${job.step}/${job.steps}`;
  const log = job.log.slice(-20).join("\n");
  return `${head}

\`\`\`
${log}
\`\`\`${job.doctor ? `

${job.doctor.summary}` : ""}`;
}
function formatBom(columns, rows) {
  if (rows.length === 0) return "BOM is empty.";
  const header = `| ${columns.join(" | ")} |`;
  const rule = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${columns.map((c) => (r[c] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [header, rule, ...body].join("\n");
}
function designRequest(idea) {
  if (/[\u3400-\u9fff]/.test(idea)) {
    return `\u6211\u60F3\u8BBE\u8BA1\uFF1A${idea}

\u6211\u4E0D\u662F\u786C\u4EF6\u4E13\u5BB6\u3002\u8BF7\u5148\u4F7F\u7528 kicad-design-brief \u6280\u80FD\uFF1A\u628A\u9700\u6C42\u8865\u5168\u6210\u5B8C\u6574\u7684\u7F16\u53F7\u8BBE\u8BA1\u89C4\u683C\uFF08\u5143\u4EF6\u3001\u6570\u503C\u3001\u5C01\u88C5\u548C\u6BCF\u4E00\u6761\u8FDE\u63A5\uFF09\uFF0C\u53EA\u95EE\u6211\u771F\u6B63\u9700\u8981\u6211\u51B3\u5B9A\u7684 3\u20134 \u4E2A\u95EE\u9898\u5E76\u7ED9\u51FA\u63A8\u8350\u9009\u9879\uFF0C\u628A\u89C4\u683C\u4FDD\u5B58\u4E3A design-brief.md \u7ED9\u6211\u786E\u8BA4\uFF1B\u6211\u786E\u8BA4\u540E\u518D\u753B\u539F\u7406\u56FE\uFF0C\u5E76\u786E\u4FDD KiCad ERC 0 error\u3002`;
  }
  return `I want to design: ${idea}

I am not a hardware expert. First use the kicad-design-brief skill: complete this into a numbered design spec (parts, values, footprints and every connection), ask me only the 3\u20134 questions I really need to decide, with recommended options, save the spec as design-brief.md for my confirmation, and draw the schematic only after I confirm, with KiCad ERC at 0 errors.`;
}

// packages/kicad-skills/src/skills.ts
import { readdirSync as readdirSync2, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join as join2, sep as sep2 } from "node:path";
import { fileURLToPath } from "node:url";
var PROVIDER = "dsh-kicad";
var SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url));
function parseSkill(raw, path) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) throw new Error(`${path}: missing frontmatter`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  if (!meta.name || !meta.description) throw new Error(`${path}: frontmatter needs name and description`);
  return { meta, content: raw.slice(match[0].length).trim() };
}
function createSkillProvider(dir = SKILLS_DIR) {
  const candidates = readdirSync2(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
    const path = join2(dir, entry.name, "SKILL.md");
    const { meta } = parseSkill(readFileSync(path, "utf8"), path);
    return {
      name: meta.name,
      description: meta.description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: PROVIDER,
      source: "bundled",
      rank: BUNDLED_RANK,
      path,
      resourceBase: { kind: "directory", path: join2(dir, entry.name).split(sep2).join("/") },
      locator: path
    };
  });
  return {
    name: PROVIDER,
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate;
      const raw = await readFile(locator, { encoding: "utf8", signal: options.signal });
      return { ...summary, content: parseSkill(raw, locator).content };
    }
  };
}

// packages/kicad-skills/src/index.ts
var name = "dsh-kicad-skills";
var inject = ["kicad"];
function apply(ctx, config = {}) {
  if (config.skills !== false) {
    ctx.inject(["skills"], (ctx2) => {
      const provider = createSkillProvider();
      ctx2.effect(() => ctx2.skills.registerProvider(() => provider), "kicad skills");
    });
  }
  if (config.commands !== false) {
    ctx.inject(["commands"], (ctx2) => {
      for (const command of createCommands(ctx2)) ctx2.effect(() => ctx2.commands.register(command), `kicad /${command.name}`);
    });
  }
}
export {
  PROVIDER,
  SKILLS_DIR,
  apply,
  createCommands,
  createSkillProvider,
  designRequest,
  fabArgs,
  fabCommand,
  flags,
  formatBom,
  formatDoctor,
  formatJob,
  formatPlan,
  inject,
  installCommand,
  name,
  parseSkill,
  renderArgs,
  renderCommand,
  targetFile
};
