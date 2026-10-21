// packages/kicad-bridge/src/index.ts
import { fileURLToPath } from "node:url";

// packages/kicad-bridge/src/dsh.ts
import { Service } from "@deepseek-ai/cordis";
import { default as default2 } from "@deepseek-ai/schemastery";

// packages/kicad-bridge/src/doctor.ts
import { homedir } from "node:os";
var ELEVATION = /* @__PURE__ */ new Set(["sudo", "su", "doas", "pkexec", "runas", "gsudo"]);
var MAX_LOG_LINES = 400;
var MAX_LINE = 400;
function needsElevation(option) {
  return option.needs_root || option.steps.some((step) => ELEVATION.has(baseName(step[0] ?? "")));
}
function baseName(path) {
  return path.split(/[\\/]/).pop().replace(/\.exe$/i, "").toLowerCase();
}
function unavailableReport(reason, python) {
  const pythonMissing = /not found|ENOENT|needs Python 3\.10|no such file|cannot find/i.test(reason);
  const fix = `Install Python 3.10 or newer (https://www.python.org/downloads/ or your package manager, e.g. \`sudo dnf install python3\`, \`sudo apt-get install python3\`, \`brew install python\`, \`winget install Python.Python.3.12\`) and, if it is not on PATH, set the KiCad bridge 'python' setting to it.`;
  const checks = [
    {
      id: "python",
      label: "Python",
      status: "error",
      required: true,
      summary: pythonMissing ? `The KiCad sidecar could not start with "${python}": ${reason}` : `The KiCad sidecar failed to start: ${reason}`,
      fix
    },
    { id: "kicad_cli", label: "kicad-cli", status: "error", required: true, summary: "Not checked: the sidecar is not running.", fix: "Fix Python first, then check again." }
  ];
  const summary = "The KiCad sidecar (Python) could not start, so nothing else was checked.";
  return {
    ok: false,
    status: "unavailable",
    summary,
    kicad: { cli: null, source: null, version: null, minimum: "8.0" },
    checks,
    install: [],
    text: `${summary}

\u2717 Python: ${checks[0].summary}
    fix: ${fix}`
  };
}
var Installer = class {
  constructor(deps) {
    this.deps = deps;
  }
  current;
  controller;
  running;
  nextId = 1;
  get job() {
    return this.current && { ...this.current, log: [...this.current.log] };
  }
  /** Start a plan. Throws when another install runs or the plan is not allowed to run here. */
  start(option) {
    if (this.current?.state === "running") throw new Error(`an installation is already running (${this.current.label})`);
    if (needsElevation(option)) {
      throw new Error(`"${option.label}" needs administrator rights, so it is not run from dsh. Run it yourself in a terminal:
${option.command}
then check again with /kicad-doctor.`);
    }
    if (!option.runnable || option.steps.length === 0) {
      throw new Error(`"${option.label}" cannot run here${option.note ? `: ${option.note}` : ""}${option.url ? ` ${option.url}` : ""}`);
    }
    this.controller = new AbortController();
    const job = {
      id: this.nextId++,
      option: option.id,
      label: option.label,
      command: option.command,
      state: "running",
      phase: "installing",
      step: 0,
      steps: option.steps.length,
      startedAt: Date.now(),
      log: []
    };
    this.current = job;
    this.running = this.run(job, option, this.controller.signal);
    return this.job;
  }
  cancel() {
    if (this.current?.state !== "running") return false;
    this.controller?.abort();
    return true;
  }
  /** Resolves when the current job (and its re-check) has finished. */
  async settled() {
    await this.running;
    return this.job;
  }
  append(job, text) {
    for (const line of text.split(/\r?\n|\r/)) {
      if (!line.trim()) continue;
      job.log.push(line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}\u2026` : line);
    }
    if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES);
  }
  async run(job, option, signal) {
    const subprocess = this.deps.subprocess();
    try {
      for (const [index, step] of option.steps.entries()) {
        job.step = index + 1;
        this.append(job, `$ ${step.join(" ")}`);
        this.deps.logger?.(`install ${option.id} step ${index + 1}: ${step.join(" ")}`);
        const executable = await subprocess.resolveExecutable(step[0], void 0, signal);
        const handle = subprocess.spawn({
          argv: [executable, ...step.slice(1)],
          cwd: homedir(),
          // No stdin: nothing can stop and wait for a password or a prompt.
          stdio: { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
          graceMs: 5e3,
          signal
        });
        for (const stream of [handle.stdout, handle.stderr]) {
          stream?.setEncoding("utf8");
          stream?.on("data", (chunk) => this.append(job, chunk));
        }
        const outcome = await handle.done;
        job.exitCode = outcome.exitCode;
        if (signal.aborted) {
          job.state = "cancelled";
          break;
        }
        if (outcome.exitCode !== 0) {
          job.state = "failed";
          job.error = `step ${index + 1} exited with ${outcome.exitCode ?? outcome.signal}`;
          break;
        }
      }
      if (job.state === "running") job.state = "succeeded";
    } catch (error) {
      job.state = signal.aborted ? "cancelled" : "failed";
      job.error = error.message;
      this.append(job, job.error);
    }
    job.finishedAt = Date.now();
    job.phase = "checking";
    this.append(job, `installer ${job.state}; checking KiCad again\u2026`);
    try {
      job.doctor = await this.deps.recheck();
      this.append(job, job.doctor.summary);
    } catch (error) {
      this.append(job, `re-check failed: ${error.message}`);
    }
    job.phase = "done";
  }
};

// packages/kicad-bridge/src/launcher.ts
import { join } from "node:path";
function defaultPython(platform = process.platform) {
  return platform === "win32" ? "python" : "python3";
}
function launchSpec(options) {
  const tail = ["-m", "dsh_kicad_sidecar", ...options.kicadCli ? ["--kicad-cli", options.kicadCli] : []];
  const env = { PYTHONUTF8: "1", PYTHONUNBUFFERED: "1", PYTHONDONTWRITEBYTECODE: "1" };
  if (options.launcher === "uv") {
    const extras = (options.extras ?? []).flatMap((extra) => ["--extra", extra]);
    return { argv: [options.executable, "run", "--quiet", "--project", options.sidecarDir, ...extras, "python", ...tail], env };
  }
  const sep = (options.platform ?? process.platform) === "win32" ? ";" : ":";
  env.PYTHONPATH = [join(options.sidecarDir, "src"), process.env.PYTHONPATH].filter(Boolean).join(sep);
  return { argv: [options.executable, ...tail], env };
}

// packages/kicad-bridge/src/rpc.ts
var RpcError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "RpcError";
  }
};
var McpClient = class {
  constructor(input, output, timeoutMs = 3e5) {
    this.input = input;
    this.timeoutMs = timeoutMs;
    output.setEncoding("utf8");
    output.on("data", (chunk) => this.onData(chunk));
    output.on("end", () => this.close(new RpcError("sidecar closed its output")));
    output.on("error", (error) => this.close(error));
  }
  nextId = 1;
  pending = /* @__PURE__ */ new Map();
  buffer = "";
  closedError;
  /** Perform the MCP handshake and return the server info. */
  async initialize(signal) {
    const result = await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "dsh-kicad-bridge", version: "0.1.0" }
    }, signal);
    this.notify("notifications/initialized");
    return result;
  }
  async listTools(signal) {
    const result = await this.request("tools/list", {}, signal);
    return result.tools;
  }
  async callTool(name, args, signal) {
    return await this.request("tools/call", { name, arguments: args }, signal);
  }
  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, ...params === void 0 ? {} : { params } });
  }
  request(method, params, signal) {
    if (this.closedError) return Promise.reject(this.closedError);
    if (signal?.aborted) return Promise.reject(signal.reason ?? new RpcError("aborted"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.settle(id)?.reject(new RpcError(`sidecar did not answer ${method} within ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      const onAbort = () => {
        this.notify("notifications/cancelled", { requestId: id, reason: "aborted" });
        this.settle(id)?.reject(signal?.reason instanceof Error ? signal.reason : new RpcError("aborted"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        }
      });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        this.settle(id)?.reject(error);
      }
    });
  }
  /** Reject everything in flight; later requests fail immediately. */
  close(error = new RpcError("client closed")) {
    if (this.closedError) return;
    this.closedError = error;
    for (const id of [...this.pending.keys()]) this.settle(id)?.reject(error);
  }
  get closed() {
    return this.closedError !== void 0;
  }
  settle(id) {
    const entry = this.pending.get(id);
    if (!entry) return void 0;
    this.pending.delete(id);
    entry.cleanup();
    return entry;
  }
  write(message) {
    this.input.write(JSON.stringify(message) + "\n");
  }
  onData(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.onMessage(line);
    }
  }
  onMessage(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.id !== "number") return;
    const entry = this.settle(message.id);
    if (!entry) return;
    if (message.error) entry.reject(new RpcError(message.error.message, message.error.code));
    else entry.resolve(message.result);
  }
};

// packages/kicad-bridge/src/index.ts
var Config = default2.object({
  launcher: default2.union(["python", "uv"]).default("python").description("How to start the Python sidecar."),
  python: default2.string().volatile().description("Python 3.10+ interpreter (default: python3, or python on Windows)."),
  uv: default2.string().default("uv").description("uv executable for the uv launcher."),
  uvExtras: default2.array(default2.string()).default([]).description("Sidecar extras for the uv launcher: png, ipc."),
  kicadCli: default2.string().volatile().description("kicad-cli path; empty searches $KICAD_CLI, PATH and standard locations."),
  requestTimeoutMs: default2.natural().default(3e5).description("Timeout for one sidecar request, in milliseconds."),
  sidecarDir: default2.string().description("Sidecar directory override (development only).")
});
var KiCadBridge = class extends Service {
  constructor(ctx, config) {
    super(ctx, "kicad");
    this.config = config;
    this.sidecarDir = config.sidecarDir ?? fileURLToPath(new URL("../sidecar/", import.meta.url));
    this.installer = new Installer({
      subprocess: () => this.ctx.subprocess,
      // A fresh sidecar re-reads PATH and searches for kicad-cli again: no dsh restart needed.
      recheck: async () => {
        await this.stop();
        return await this.doctor();
      },
      logger: (message) => this.ctx.logger("kicad").info(message)
    });
    ctx.effect(() => () => {
      this.installer.cancel();
      return this.stop();
    }, "kicad sidecar");
  }
  static inject = ["subprocess"];
  static Config = Config;
  running;
  toolCache;
  sidecarDir;
  /** Runs a KiCad install plan the user confirmed (see {@link install}). */
  installer;
  /**
   * Check the local KiCad environment. Never throws: when the sidecar itself cannot
   * start (no Python, Python < 3.10) the report says so and how to fix it.
   */
  async doctor(signal) {
    try {
      const result = await this.call("doctor", {}, signal);
      if (result.ok && result.value) return result.value;
      return unavailableReport(result.text, this.pythonCommand());
    } catch (error) {
      if (signal?.aborted) throw error;
      return unavailableReport(error.message, this.pythonCommand());
    }
  }
  /**
   * Start installing KiCad with one of the plans the doctor offered. Callers must have
   * shown the command to the user and received an explicit confirmation. Plans that need
   * root are refused (the user runs those themselves); so is installing when KiCad is fine.
   */
  async install(optionId, signal) {
    if (this.installer.job?.state === "running") throw new Error(`an installation is already running (${this.installer.job.label})`);
    const report = await this.doctor(signal);
    if (report.status === "ok") throw new Error(`KiCad ${report.kicad.version} is already installed and usable; nothing to install.`);
    const option = report.install.find((o) => o.id === optionId);
    if (!option) {
      const known = report.install.map((o) => o.id).join(", ");
      throw new Error(known ? `unknown install option "${optionId}"; choose one of: ${known}` : `no install options: ${report.summary}`);
    }
    return this.installer.start(option);
  }
  pythonCommand() {
    return this.config.launcher === "uv" ? this.config.uv : this.config.python.get() || defaultPython();
  }
  /** Call one sidecar tool (see the sidecar catalog for names and arguments). */
  async call(tool, args, signal) {
    const { client } = await this.ensure(signal);
    const result = await client.callTool(tool, args, signal);
    return toResult(result);
  }
  /** Like {@link call} but throws on a domain error. */
  async run(tool, args, signal) {
    const result = await this.call(tool, args, signal);
    if (!result.ok) throw new Error(result.text);
    return result.value;
  }
  async tools(signal) {
    if (!this.toolCache) this.toolCache = await (await this.ensure(signal)).client.listTools(signal);
    return this.toolCache;
  }
  /** Stop the sidecar; the next call starts a fresh one. */
  async stop() {
    const running = this.running;
    this.running = void 0;
    this.toolCache = void 0;
    if (!running) return;
    try {
      const { handle, client } = await running;
      client.close();
      handle.stdin?.end();
      const exited = await Promise.race([handle.done.then(() => true, () => true), delay(2e3).then(() => false)]);
      if (!exited) handle.terminate();
      await handle.waitForExit(AbortSignal.timeout(5e3)).catch(() => false);
    } catch {
    }
  }
  launchKey() {
    return JSON.stringify([this.config.launcher, this.config.python.get(), this.config.kicadCli.get()]);
  }
  async ensure(signal) {
    if (this.running) {
      const current = await this.running.catch(() => void 0);
      if (!current || current.client.closed || current.key !== this.launchKey()) await this.stop();
    }
    if (!this.running) {
      this.running = this.start(signal);
      this.running.catch(() => {
        this.running = void 0;
      });
    }
    return this.running;
  }
  async start(signal) {
    const subprocess = this.ctx.subprocess;
    const key = this.launchKey();
    const command = this.pythonCommand();
    const executable = await subprocess.resolveExecutable(command, void 0, signal).catch((error) => {
      const what = this.config.launcher === "uv" ? "uv" : "Python 3.10+";
      throw new RpcError(`${what} executable "${command}" was not found (${error.message}). Install ${what} or set the KiCad bridge '${this.config.launcher === "uv" ? "uv" : "python"}' setting; /kicad-doctor shows what else is missing.`);
    });
    const spec = launchSpec({
      launcher: this.config.launcher,
      executable,
      sidecarDir: this.sidecarDir,
      kicadCli: this.config.kicadCli.get() || void 0,
      extras: this.config.uvExtras
    });
    const handle = subprocess.spawn({
      argv: spec.argv,
      cwd: this.sidecarDir,
      stdio: { stdin: "pipe", stdout: "pipe", stderr: { maxBytes: 64 * 1024 } },
      graceMs: 2e3,
      env: spec.env
    });
    const client = new McpClient(handle.stdin, handle.stdout, this.config.requestTimeoutMs);
    handle.done.then(
      (outcome) => {
        const tail = handle.collected.stderr?.readFrom(0).text.trim().split("\n").slice(-5).join("\n") ?? "";
        client.close(new RpcError(`KiCad sidecar exited (code ${outcome.exitCode}, signal ${outcome.signal})${tail ? `: ${tail}` : ""}`));
      },
      (error) => client.close(error instanceof Error ? error : new RpcError(String(error)))
    );
    await client.initialize(signal);
    this.ctx.logger("kicad").info("sidecar started: %s", spec.argv.join(" "));
    return { handle, client, key };
  }
};
function toResult(result) {
  const text = result.content.map((block) => block.text ?? "").join("\n");
  return { ok: !result.isError, value: result.isError ? void 0 : result.structuredContent, text };
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var index_default = KiCadBridge;
export {
  Config,
  Installer,
  KiCadBridge,
  McpClient,
  RpcError,
  index_default as default,
  defaultPython,
  launchSpec,
  needsElevation,
  unavailableReport
};
