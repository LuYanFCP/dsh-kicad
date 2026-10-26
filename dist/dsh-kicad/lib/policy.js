// packages/kicad-policy/src/index.ts
import { existsSync } from "node:fs";
import { basename } from "node:path";

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
function violationLine(v) {
  const where = v.items.map((i) => `${i.description ?? ""}${i.pos ? ` @ (${round(i.pos.x)}, ${round(i.pos.y)})` : ""}`).filter(Boolean).join("; ");
  return `- [${v.severity}] ${v.type}: ${v.description}${where ? ` \u2014 ${where}` : ""}${v.sheet && v.sheet !== "/" ? ` [sheet ${v.sheet}]` : ""}`;
}
function round(n) {
  return Math.round(n * 100) / 100;
}

// packages/tool-kicad/lib/index.js
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

// packages/kicad-policy/src/dsh.ts
import { default as default2 } from "@deepseek-ai/schemastery";
function agentCwd(ctx, agent) {
  const wd = ctx.get("workingDirectory");
  const session = agent?.session;
  if (!wd || !session) return void 0;
  try {
    return wd.get(session);
  } catch {
    return void 0;
  }
}
function assemblyAgent(context) {
  return context?.agent;
}
function sessionPermissions(ctx, agent) {
  const session = agent?.session;
  if (!session) return {};
  const out = {};
  try {
    out.approval = ctx.get("approval")?.effectivePolicy(session);
  } catch {
  }
  try {
    out.sandbox = ctx.get("sandboxPolicy")?.resolve({ session }).mode;
  } catch {
  }
  return out;
}

// packages/kicad-policy/src/paths.ts
import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
function realish(path) {
  let current = resolve(path);
  const rest = [];
  for (; ; ) {
    try {
      return resolve(realpathSync(current), ...rest.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return resolve(path);
      rest.push(current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
      current = parent;
    }
  }
}
function inside(path, root) {
  const rel = relative(realish(root), realish(path));
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
function resolveArg(cwd, value) {
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value);
}

// packages/kicad-policy/src/project.ts
import { readdirSync, statSync } from "node:fs";
import { join, relative as relative2, resolve as resolve2 } from "node:path";
var ErcMemory = class {
  byPath = /* @__PURE__ */ new Map();
  remember(path, report) {
    this.byPath.set(resolve2(path), {
      passed: report.passed,
      errors: report.counts.error,
      warnings: report.counts.warning,
      ...report.unrouted !== void 0 ? { unrouted: report.unrouted } : {},
      types: Object.keys(report.by_type ?? {}).slice(0, 5)
    });
  }
  get(path) {
    return this.byPath.get(resolve2(path));
  }
};
var KICAD_EXT = /\.(kicad_pro|kicad_sch|kicad_pcb)$/;
var MAX_FILES = 30;
function scan(cwd) {
  const found = [];
  const visit = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= MAX_FILES) return;
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const full = join(dir, entry);
      if (KICAD_EXT.test(entry)) {
        found.push(full);
      } else if (depth < 1) {
        try {
          if (statSync(full).isDirectory()) visit(full, depth + 1);
        } catch {
        }
      }
    }
  };
  visit(cwd, 0);
  return found;
}
function projectContext(cwd, memory) {
  const files = scan(cwd);
  if (files.length === 0) return "";
  const rel = (p) => relative2(cwd, p) || p;
  const group = (ext) => files.filter((f) => f.endsWith(ext));
  const lines = ["KiCad design files in the working directory:"];
  const pro = group(".kicad_pro");
  if (pro.length) lines.push(`- projects: ${pro.map(rel).join(", ")}`);
  const sch = group(".kicad_sch");
  if (sch.length) lines.push(`- schematics: ${sch.map(rel).join(", ")}`);
  const pcb = group(".kicad_pcb");
  if (pcb.length) lines.push(`- boards: ${pcb.map(rel).join(", ")}`);
  for (const file of [...sch, ...pcb]) {
    const last = memory?.get(file);
    if (last) {
      const kind = file.endsWith(".kicad_pcb") ? "DRC" : "ERC";
      const unrouted = last.unrouted !== void 0 ? `, ${last.unrouted} unrouted` : "";
      lines.push(`- last ${kind} of ${rel(file)}: ${last.passed ? "passed" : "FAILED"} (${last.errors} errors, ${last.warnings} warnings${unrouted}${last.types.length ? `: ${last.types.join(", ")}` : ""})`);
    }
  }
  if (files.length >= MAX_FILES) lines.push("- (listing truncated)");
  return lines.join("\n");
}

// packages/kicad-policy/src/index.ts
var name = "dsh-kicad-policy";
var inject = ["tools", "kicad"];
var Config = default2.object({
  approval: default2.union(["follow", "ask", "allow"]).default("follow").volatile().description("follow: like dsh file writes (no extra prompt); ask: approve every edit; allow: never ask."),
  restrictToWorkspace: default2.boolean().default(true).description("Only allow KiCad writes inside the working directory."),
  extraRoots: default2.array(default2.string()).default([]).description("Additional directories KiCad tools may write to."),
  autoErc: default2.boolean().default(true).volatile().description("Run ERC after every schematic edit."),
  autoDrc: default2.boolean().default(true).volatile().description("Run DRC after every board edit."),
  autoRender: default2.boolean().default(true).volatile().description("Re-render the sidebar SVG after every schematic edit."),
  guidance: default2.boolean().default(true).description("Add KiCad working rules to the system prompt."),
  projectContext: default2.boolean().default(true).description("Tell the model which KiCad project is open.")
});
var GUIDANCE = `# KiCad (EDA) work

- Use the kicad_* tools for KiCad files; never hand-edit .kicad_sch / .kicad_pcb text with generic file tools.
- If the request is vague or the user is new to electronics (no parts, values or connections given), load the kicad-design-brief skill and agree on a written spec before editing anything.
- Read before you change: kicad_read_schematic, kicad_get_symbol_pins, kicad_list_nets. Find parts with kicad_search_symbols.
- Put related changes in one kicad_edit_schematic batch (atomic; at most ~20 operations).
- Draw the circuit with wires: connect parts that work together with connect_pins (it routes around parts and other nets). Use power symbols for supply rails and net labels only between blocks or across the page, not for two parts side by side. Place parts so the pins you will wire face each other.
- Fix mistakes with disconnect_pin / remove_item / move_symbol. Never rebuild or rewrite a schematic file to change its layout.
- Organise a schematic by function: one titled frame per block (add_block / move_block), parts inside a block wired together, blocks connected only through net labels and power symbols, never through wires that cross a frame.
- Boards (load the kicad-pcb-layout skill: it takes a board from the synced schematic to the fab files, with KiCad's verdict at each step): create or refresh the board from the schematic with kicad_update_pcb (after ERC passes, and after every schematic change; it lists the REF:PINs to fix when it refuses), read with kicad_read_pcb (outline, footprints with courtyards and pad nets, rules, unrouted count), then change them with one kicad_edit_pcb batch: outline and mounting holes, placement, rules and net classes, tracks (route pad to pad with "REF:PAD" endpoints), vias, zones, keepouts, silkscreen.
- Place a new board with one kicad_edit_pcb auto_place (it follows the schematic's functional blocks: draw them with add_block first), look at it with kicad_render (view "3d"), then fine-tune with move_footprint / place_block; kicad_read_pcb's placement line must show no overlaps and nothing outside the outline.
- Routing: after placement, route critical nets by hand (power, USB/differential pairs, crystal) with add_track / add_via locked: true, then kicad_autoroute routes the rest without touching them; add a GND pour (add_zone on both copper layers), which kicad_autoroute refills. If it reports Freerouting or Java missing, give the user its install guidance (/kicad-install freerouting); do not install anything yourself.
- To order a board: kicad_export_fab writes Gerber, drill, position and BOM files in one zip, and refuses while KiCad reports DRC errors, unrouted connections or schematic parity issues; pass force only when the user explicitly asks. kicad_fab_preset makes a fab house's limits (JLCPCB, PCBWay) the project's design rules.
- Verify behaviour, not only wiring: when the user states a requirement (a rail voltage, an LED current, a filter cutoff), add the simulation sources and models the circuit needs (Simulation_SPICE VDC/VSIN/VPULSE, a ground, set_sim_model on diodes, LEDs, regulators and ICs: find vendor models with kicad_sim_model, never invent one) and run kicad_simulate with one assertion per requirement; add monte_carlo when the requirement must hold across part tolerances. Report its verdict, never your own estimate. If ngspice is missing, give the user the install guidance from kicad_doctor; do not install anything yourself.
- Microcontrollers: state what the firmware needs from each signal (ADC usable with WiFi, a real output, a DAC, a pin that is not a strapping pin) and choose GPIOs for it before wiring, then run kicad_check_mcu with those requirements (kicad-mcu-check skill) and fix its errors. If it says CANNOT VERIFY, tell the user that MCU's wiring was not checked; never call it checked. For an ATtiny or a classic ESP32 with a firmware image the user supplies (ESP32: the merged flash image or the ESP-IDF build's flasher_args.json), kicad_simulate_firmware verifies behaviour against the board (a requirement such as "the button lights the LED within 20 ms" becomes stimuli and assertions); never write or invent firmware, and report a run that stopped on an unsupported peripheral as unverified. If it says Espressif's QEMU is missing, give the user its install guidance (/kicad-install qemu-esp32); do not install anything yourself.
- KiCad decides correctness: after edits read the ERC/DRC verdict appended to the result (or run kicad_erc / kicad_drc). Do not declare a design correct while KiCad reports errors or unrouted connections.
- Coordinates are millimetres, Y grows downward, on the 1.27 mm grid.
- If a kicad_* tool fails because KiCad or Python is missing or too old, run kicad_doctor and give the user its fix. Do not install software yourself; the user installs KiCad (the doctor panel's Install button or /kicad-install).`;
var isKiCadTool = (name2) => Object.hasOwn(TOOL_ACCESS, name2);
var AUTO_CHECK = { kicad_edit_schematic: "erc", kicad_edit_pcb: "drc", kicad_update_pcb: "drc", kicad_fab_preset: "drc", kicad_autoroute: "drc" };
var CHECKED = /* @__PURE__ */ new Set(["kicad_update_pcb", "kicad_autoroute"]);
var GUARDED = new Set(
  Object.keys(TOOL_ACCESS).filter((n) => TOOL_ACCESS[n] === "write" || n === "kicad_render" || n === "kicad_simulate")
);
function apply(ctx, config) {
  const memory = new ErcMemory();
  const cwdOf = (exec) => agentCwd(ctx, exec.agent) ?? process.cwd();
  const outsideWorkspace = (exec) => {
    if (!config.restrictToWorkspace || !GUARDED.has(exec.name)) return void 0;
    const cwd = cwdOf(exec);
    const roots = [cwd, ...config.extraRoots];
    for (const key of PATH_ARGUMENTS[exec.name]) {
      const value = exec.arguments?.[key];
      if (typeof value !== "string" || value === "") continue;
      const target = resolveArg(cwd, value);
      if (!roots.some((root) => inside(target, root))) {
        return `${exec.name} may only write inside the project directory (${cwd}); "${value}" resolves to ${target}. Copy the design into the project first, or add a root to the KiCad policy's extraRoots.`;
      }
    }
    return void 0;
  };
  if (config.restrictToWorkspace) ctx.effect(() => ctx.tools.guard(outsideWorkspace), "kicad workspace guard");
  {
    ctx.on("tools/pre-execute", async (exec, next) => {
      if (!DESIGN_WRITE_TOOLS.includes(exec.name)) return next();
      const denied = outsideWorkspace(exec);
      if (denied) return { kind: "deny", reason: denied };
      const args = exec.arguments ?? {};
      if (args.dry_run) return next();
      const permissions = sessionPermissions(ctx, exec.agent);
      if (permissions.sandbox === "read-only") {
        return { kind: "deny", reason: `${exec.name} writes a design file, but this session is read-only. Ask the user to switch permissions to workspace write (or full access) and try again.` };
      }
      if (config.approval.get() !== "ask" || permissions.approval === "never") return next();
      const decision = await next();
      if (decision.kind !== "allow") return decision;
      return { kind: "ask", ...describeEdit(exec.name, args) };
    });
  }
  {
    ctx.on("tools/post-execute", async (exec, result, next) => {
      const decision = await next();
      const check = AUTO_CHECK[exec.name];
      if (!check || result.isError || decision.kind !== "accept") return decision;
      const args = exec.arguments;
      if (args.dry_run) return decision;
      const synced = CHECKED.has(exec.name) ? result.value : void 0;
      let path = synced ? synced.pcb : typeof args.path === "string" ? resolveArg(cwdOf(exec), args.path) : void 0;
      if (!path) return decision;
      if (exec.name === "kicad_fab_preset") {
        path = path.replace(/\.kicad_pro$/, ".kicad_pcb");
        if (result.value?.written === false || !existsSync(path)) return decision;
      }
      if (check === "erc" && config.autoRender.get()) {
        void ctx.kicad.call("render", { path, format: "svg" }).catch(() => void 0);
      }
      if (!(check === "erc" ? config.autoErc : config.autoDrc).get()) return decision;
      const label = check.toUpperCase();
      let note;
      try {
        const report = synced?.drc ? { ok: true, value: synced.drc, text: "" } : await ctx.kicad.call(check, { path, ...synced ? { schematic_parity: true } : {} }, exec.signal);
        if (report.ok && report.value) {
          memory.remember(path, report.value);
          note = `Automatic ${formatCheck(report.value)}`;
        } else {
          note = `Automatic ${label} could not run: ${report.text}`;
        }
      } catch (error) {
        note = `Automatic ${label} could not run: ${error.message}`;
      }
      const base = "content" in decision && decision.content ? decision.content : result.content;
      return { ...decision, content: [...base, { type: "text", text: note }] };
    });
  }
  ctx.on("tools/result", (exec, result) => {
    if (exec.name !== "kicad_erc" && exec.name !== "kicad_drc" || result.isError) return;
    const value = result.value;
    if (value?.path) memory.remember(value.path, value);
  });
  ctx.inject(["systemPrompt"], (ctx2) => {
    if (config.guidance) {
      ctx2.effect(() => ctx2.systemPrompt.section({ name: "kicad:guidance", order: 3200, text: GUIDANCE, interpolate: false }), "kicad guidance");
    }
    if (config.projectContext) {
      ctx2.effect(() => ctx2.systemPrompt.context({
        name: "kicad:project",
        order: 130,
        interpolate: false,
        text: (assembly) => {
          const cwd = agentCwd(ctx2, assemblyAgent(assembly));
          return cwd ? projectContext(cwd, memory) : "";
        }
      }), "kicad project context");
    }
  });
}
function describeEdit(tool, args) {
  const file = args.path ? basename(args.path) : "a design file";
  if (tool === "kicad_create_schematic") {
    return { reason: `create ${args.path}`, displayReason: { en: `Create KiCad schematic ${file}`, zh: `\u521B\u5EFA KiCad \u539F\u7406\u56FE ${file}` } };
  }
  if (tool === "kicad_fab_preset") {
    return { reason: `apply ${args.preset} design rules to ${args.path}`, displayReason: { en: `Apply ${args.preset} design rules to ${file}`, zh: `\u5C06 ${args.preset} \u8BBE\u8BA1\u89C4\u5219\u5E94\u7528\u5230 ${file}` } };
  }
  if (tool === "kicad_update_pcb") {
    const sch = args.schematic ? basename(args.schematic) : "the schematic";
    const board = args.pcb ? basename(args.pcb) : sch.replace(/\.kicad_sch$/, ".kicad_pcb");
    const removed = args.delete_removed ? { en: ", deleting footprints whose symbol is gone", zh: "\uFF0C\u5E76\u5220\u9664\u539F\u7406\u56FE\u4E2D\u5DF2\u4E0D\u5B58\u5728\u7684\u5C01\u88C5" } : { en: "", zh: "" };
    return {
      reason: `update ${args.pcb ?? board} from ${args.schematic}${args.delete_removed ? " (delete_removed)" : ""}`,
      displayReason: { en: `Update board ${board} from ${sch}${removed.en}`, zh: `\u6839\u636E ${sch} \u66F4\u65B0\u7535\u8DEF\u677F ${board}${removed.zh}` }
    };
  }
  if (tool === "kicad_autoroute") {
    const board = args.pcb ? basename(args.pcb) : "the board";
    const scope = args.nets?.length ? { en: `, only ${args.nets.join(", ")}`, zh: `\uFF0C\u4EC5 ${args.nets.join("\u3001")}`, reason: ` nets=${args.nets.join(",")}` } : args.exclude_nets?.length ? { en: `, except ${args.exclude_nets.join(", ")}`, zh: `\uFF0C\u8DF3\u8FC7 ${args.exclude_nets.join("\u3001")}`, reason: ` exclude_nets=${args.exclude_nets.join(",")}` } : { en: "", zh: "", reason: "" };
    return {
      reason: `autoroute ${args.pcb}${scope.reason}`,
      displayReason: { en: `Autoroute board ${board} with Freerouting${scope.en}`, zh: `\u7528 Freerouting \u81EA\u52A8\u5E03\u7EBF ${board}${scope.zh}` }
    };
  }
  const ops = args.operations ?? [];
  const counts = /* @__PURE__ */ new Map();
  for (const op of ops) counts.set(op.op ?? "?", (counts.get(op.op ?? "?") ?? 0) + 1);
  const summary = [...counts].map(([op, n]) => n > 1 ? `${op}\xD7${n}` : op).join(", ");
  return {
    reason: `edit ${args.path}: ${summary}`,
    displayReason: {
      en: `Edit ${file}: ${ops.length} operation(s) \u2014 ${summary}`,
      zh: `\u4FEE\u6539 ${file}\uFF1A${ops.length} \u9879\u64CD\u4F5C \u2014 ${summary}`
    }
  };
}
export {
  Config,
  ErcMemory,
  GUIDANCE,
  apply,
  describeEdit,
  inject,
  isKiCadTool,
  name,
  projectContext
};
