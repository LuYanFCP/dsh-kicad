// packages/kicad-policy/src/index.ts
import { basename } from "node:path";

// packages/tool-kicad/lib/dsh.js
import { defineTool } from "@deepseek-ai/dsh-tools";

// packages/tool-kicad/lib/format.js
var MAX_LISTED = 60;
function formatCheck(report) {
  const label = report.kind.toUpperCase();
  const verdict = report.passed ? "PASSED" : "FAILED";
  const head = `${label} by KiCad ${report.kicad_version ?? ""}`.trim() + `${report.path ? ` on ${report.path}` : ""}: ${verdict} \u2014 ${report.counts.error} error(s), ${report.counts.warning} warning(s)` + (report.counts.exclusion ? `, ${report.counts.exclusion} excluded` : "");
  const active = report.violations.filter((v) => !v.excluded);
  if (active.length === 0)
    return head;
  const lines = active.slice(0, MAX_LISTED).map((v) => {
    const where = v.items.map((i) => `${i.description ?? ""}${i.pos ? ` @ (${round(i.pos.x)}, ${round(i.pos.y)})` : ""}`).filter(Boolean).join("; ");
    return `- [${v.severity}] ${v.type}: ${v.description}${where ? ` \u2014 ${where}` : ""}${v.sheet && v.sheet !== "/" ? ` [sheet ${v.sheet}]` : ""}`;
  });
  if (active.length > MAX_LISTED)
    lines.push(`\u2026 ${active.length - MAX_LISTED} more`);
  return `${head}
${lines.join("\n")}`;
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
  kicad_export: "write",
  kicad_create_schematic: "write",
  kicad_edit_schematic: "write"
};
var DESIGN_WRITE_TOOLS = ["kicad_create_schematic", "kicad_edit_schematic"];
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
  kicad_create_schematic: ["path"],
  kicad_edit_schematic: ["path"]
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
  for (const s of sch) {
    const erc = memory?.get(s);
    if (erc) {
      lines.push(`- last ERC of ${rel(s)}: ${erc.passed ? "passed" : "FAILED"} (${erc.errors} errors, ${erc.warnings} warnings${erc.types.length ? `: ${erc.types.join(", ")}` : ""})`);
    }
  }
  if (files.length >= MAX_FILES) lines.push("- (listing truncated)");
  return lines.join("\n");
}

// packages/kicad-policy/src/index.ts
var name = "dsh-kicad-policy";
var inject = ["tools", "kicad"];
var Config = default2.object({
  approval: default2.union(["ask", "allow"]).default("ask").volatile().description("Ask before KiCad design edits, or allow them."),
  restrictToWorkspace: default2.boolean().default(true).description("Only allow KiCad writes inside the working directory."),
  extraRoots: default2.array(default2.string()).default([]).description("Additional directories KiCad tools may write to."),
  autoErc: default2.boolean().default(true).volatile().description("Run ERC after every schematic edit."),
  autoRender: default2.boolean().default(true).volatile().description("Re-render the sidebar SVG after every schematic edit."),
  guidance: default2.boolean().default(true).description("Add KiCad working rules to the system prompt."),
  projectContext: default2.boolean().default(true).description("Tell the model which KiCad project is open.")
});
var GUIDANCE = `# KiCad (EDA) work

- Use the kicad_* tools for KiCad files; never hand-edit .kicad_sch / .kicad_pcb text with generic file tools.
- If the request is vague or the user is new to electronics (no parts, values or connections given), load the kicad-design-brief skill and agree on a written spec before editing anything.
- Read before you change: kicad_read_schematic, kicad_get_symbol_pins, kicad_list_nets. Find parts with kicad_search_symbols.
- Put related changes in one kicad_edit_schematic batch (atomic; at most ~20 operations). Prefer connect_pin_to_net (labels, power symbols) over long wires.
- Fix mistakes with disconnect_pin / remove_item / move_symbol. Never rebuild or rewrite a schematic file to change its layout.
- KiCad decides correctness: after edits read the ERC verdict appended to the result (or run kicad_erc / kicad_drc). Do not declare a design correct while KiCad reports errors.
- Coordinates are millimetres, Y grows downward, on the 1.27 mm grid.
- If a kicad_* tool fails because KiCad or Python is missing or too old, run kicad_doctor and give the user its fix. Do not install software yourself; the user installs KiCad (the doctor panel's Install button or /kicad-install).`;
var isKiCadTool = (name2) => Object.hasOwn(TOOL_ACCESS, name2);
var GUARDED = new Set(
  Object.keys(TOOL_ACCESS).filter((n) => TOOL_ACCESS[n] === "write" || n === "kicad_render")
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
      if (args.dry_run || config.approval.get() !== "ask") return next();
      const decision = await next();
      if (decision.kind !== "allow") return decision;
      return { kind: "ask", ...describeEdit(exec.name, args) };
    });
  }
  {
    ctx.on("tools/post-execute", async (exec, result, next) => {
      const decision = await next();
      if (exec.name !== "kicad_edit_schematic" || result.isError || decision.kind !== "accept") return decision;
      const args = exec.arguments;
      if (args.dry_run || typeof args.path !== "string") return decision;
      const path = resolveArg(cwdOf(exec), args.path);
      if (config.autoRender.get()) {
        void ctx.kicad.call("render", { path, format: "svg" }).catch(() => void 0);
      }
      if (!config.autoErc.get()) return decision;
      let note;
      try {
        const erc = await ctx.kicad.call("erc", { path }, exec.signal);
        if (erc.ok && erc.value) {
          memory.remember(path, erc.value);
          note = `Automatic ${formatCheck(erc.value)}`;
        } else {
          note = `Automatic ERC could not run: ${erc.text}`;
        }
      } catch (error) {
        note = `Automatic ERC could not run: ${error.message}`;
      }
      const base = "content" in decision && decision.content ? decision.content : result.content;
      return { ...decision, content: [...base, { type: "text", text: note }] };
    });
  }
  ctx.on("tools/result", (exec, result) => {
    if (exec.name !== "kicad_erc" || result.isError) return;
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
  const file = args.path ? basename(args.path) : "a schematic";
  if (tool === "kicad_create_schematic") {
    return { reason: `create ${args.path}`, displayReason: { en: `Create KiCad schematic ${file}`, zh: `\u521B\u5EFA KiCad \u539F\u7406\u56FE ${file}` } };
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
