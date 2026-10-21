// packages/kicad-bridge/src/index.ts
import { fileURLToPath } from "node:url";

// packages/kicad-bridge/src/dsh.ts
import { Service } from "@deepseek-ai/cordis";
import { default as default2 } from "@deepseek-ai/schemastery";

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
    ctx.effect(() => () => this.stop(), "kicad sidecar");
  }
  static inject = ["subprocess"];
  static Config = Config;
  running;
  toolCache;
  sidecarDir;
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
    const executable = await subprocess.resolveExecutable(
      this.config.launcher === "uv" ? this.config.uv : this.config.python.get() || defaultPython(),
      void 0,
      signal
    );
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
  KiCadBridge,
  McpClient,
  RpcError,
  index_default as default,
  defaultPython,
  launchSpec
};
