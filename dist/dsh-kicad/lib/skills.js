// packages/kicad-skills/src/commands.ts
import { readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

// packages/tool-kicad/lib/dsh.js
import { defineTool } from "@deepseek-ai/dsh-tools";

// packages/tool-kicad/lib/format.js
var MAX_LISTED = 60;
function formatCheck(report) {
  const label = report.kind.toUpperCase();
  const verdict = report.passed ? "PASSED" : "FAILED";
  const head = `${label} by KiCad ${report.kicad_version ?? ""}`.trim() + `${report.path ? ` on ${report.path}` : ""}: ${verdict} \u2014 ${report.counts.error} error(s), ${report.counts.warning} warning(s)` + (report.unrouted !== void 0 ? `, ${report.unrouted} unrouted` : "") + (report.counts.exclusion ? `, ${report.counts.exclusion} excluded` : "");
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
      description: "Install KiCad: list the ways for this machine, or run one you confirm (never with sudo)",
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
      description: "Re-render a KiCad schematic or board to SVG for the sidebar viewer",
      input: { hint: "path/to/file.kicad_sch" },
      handler: wrap(async (inv, cwd) => {
        const arg = inv.rawInput.trim();
        const path = arg ? isAbsolute(arg) ? arg : resolve(cwd, arg) : targetFile(cwd, "", ".kicad_sch");
        const out = await ctx.kicad.run("render", { path, format: "svg" }, inv.signal);
        return JSON.stringify({ path, svg: out.svg });
      })
    }
  ];
}
function flags(raw) {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  return { json: words.includes("--json"), yes: words.includes("--yes") || words.includes("-y"), words: words.filter((w) => !w.startsWith("-")) };
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
    const option = report.install.find((o) => o.id === method);
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
function formatDoctor(report) {
  const lines = [`**${report.summary}**`, ""];
  for (const c of report.checks) {
    lines.push(`- ${MARK[c.status]} **${c.label}**: ${c.summary}`);
    if (c.fix) lines.push(`  - fix: ${c.fix}`);
  }
  if (report.install.length) lines.push("", "Install KiCad: run `/kicad-install` to see the options for this machine.");
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
  if (report.status === "ok") return `${report.summary}
Nothing to install.`;
  if (!report.install.length) return formatDoctor(report);
  return [`**${report.summary}**`, "", ...report.install.map(formatOption), "", "After installing, run /kicad-doctor; dsh does not need a restart."].join("\n\n");
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
import { join as join2, sep } from "node:path";
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
      resourceBase: { kind: "directory", path: join2(dir, entry.name).split(sep).join("/") },
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
  flags,
  formatBom,
  formatDoctor,
  formatJob,
  formatPlan,
  inject,
  installCommand,
  name,
  parseSkill,
  targetFile
};
