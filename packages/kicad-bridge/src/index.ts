/**
 * dsh-kicad-bridge: the `ctx.kicad` service. Owns one long-lived Python sidecar
 * (started lazily through `ctx.subprocess`, restarted after a crash) and speaks
 * MCP to it. Every other KiCad package talks to KiCad only through this service.
 */
import { fileURLToPath } from 'node:url'
import { Service, z, type Context, type SubprocessHandle, type SubprocessRuntime, type Volatile } from './dsh.ts'
import { Installer, needsElevation, unavailableReport, type DoctorCheck, type DoctorReport, type InstallJob, type InstallOption } from './doctor.ts'
import { launchSpec, defaultPython, type LauncherKind } from './launcher.ts'
import { McpClient, RpcError, type CallOptions, type Progress, type ToolCallResult, type ToolInfo } from './rpc.ts'

export { Installer, McpClient, RpcError, launchSpec, defaultPython, needsElevation, unavailableReport }
export type { CallOptions, DoctorCheck, DoctorReport, InstallJob, InstallOption, Progress, ToolCallResult, ToolInfo, LauncherKind }

declare module '@deepseek-ai/cordis' {
  interface Context {
    kicad: KiCadBridge
  }
}

export interface Config {
  /** `python` runs the stdlib-only sidecar from source; `uv` runs it in a uv-managed venv with extras. */
  launcher: LauncherKind
  /** Python interpreter for the `python` launcher. */
  python: Volatile<string | undefined>
  /** uv executable for the `uv` launcher. */
  uv: string
  /** uv extras to install (`png` for cairosvg, `ipc` for kicad-python). */
  uvExtras: string[]
  /** kicad-cli executable; empty uses $KICAD_CLI, PATH, and standard install locations. */
  kicadCli: Volatile<string | undefined>
  /** Java for Freerouting (kicad_autoroute); empty uses $JAVA_HOME, then PATH. */
  java: Volatile<string | undefined>
  /** freerouting.jar (or a freerouting executable); empty uses $FREEROUTING_JAR, then the jar /kicad-install freerouting downloaded. */
  freerouting: Volatile<string | undefined>
  /** ngspice executable (kicad_simulate); empty uses $NGSPICE, then PATH. */
  ngspice: Volatile<string | undefined>
  /** Espressif's qemu-system-xtensa (ESP32 firmware simulation); empty uses $QEMU_XTENSA, PATH, ESP-IDF's tools, then the one /kicad-install qemu-esp32 downloaded. */
  qemu: Volatile<string | undefined>
  /** Upper bound for one sidecar request. */
  requestTimeoutMs: number
  /** Override the sidecar directory (development). */
  sidecarDir?: string
}

export const Config: z<Config> = z.object({
  launcher: z.union(['python', 'uv'] as const).default('python').description('How to start the Python sidecar.'),
  python: z.string().volatile().description('Python 3.10+ interpreter (default: python3, or python on Windows).'),
  uv: z.string().default('uv').description('uv executable for the uv launcher.'),
  uvExtras: z.array(z.string()).default([]).description('Sidecar extras for the uv launcher: png, ipc.'),
  kicadCli: z.string().volatile().description('kicad-cli path; empty searches $KICAD_CLI, PATH and standard locations.'),
  java: z.string().volatile().description('Java for the Freerouting autorouter; empty searches $JAVA_HOME and PATH.'),
  freerouting: z.string().volatile().description('freerouting.jar for the autorouter; empty uses $FREEROUTING_JAR or the jar /kicad-install freerouting downloaded.'),
  ngspice: z.string().volatile().description('ngspice executable for kicad_simulate; empty uses $NGSPICE, then PATH.'),
  qemu: z.string().volatile().description('Espressif\'s qemu-system-xtensa for ESP32 firmware simulation; empty uses $QEMU_XTENSA, PATH, ESP-IDF\'s tools or the one /kicad-install qemu-esp32 downloaded.'),
  requestTimeoutMs: z.natural().default(300_000).description('Timeout for one sidecar request, in milliseconds.'),
  sidecarDir: z.string().description('Sidecar directory override (development only).'),
}) as unknown as z<Config>

/** Outcome of one KiCad tool call. `value` is the structured result when the call succeeded. */
export interface KiCadResult<T = unknown> {
  ok: boolean
  value: T | undefined
  text: string
}

interface Running {
  handle: SubprocessHandle
  client: McpClient
  key: string
}

export class KiCadBridge extends Service {
  static inject = ['subprocess']
  static Config = Config

  private running: Promise<Running> | undefined
  private toolCache: ToolInfo[] | undefined
  readonly sidecarDir: string
  /** Runs a KiCad install plan the user confirmed (see {@link install}). */
  readonly installer: Installer

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'kicad')
    this.sidecarDir = config.sidecarDir ?? fileURLToPath(new URL('../sidecar/', import.meta.url))
    this.installer = new Installer({
      subprocess: () => this.ctx.subprocess,
      // A fresh sidecar re-reads PATH and searches for kicad-cli again: no dsh restart needed.
      recheck: async () => {
        await this.stop()
        return await this.doctor()
      },
      logger: message => this.ctx.logger('kicad').info(message),
    })
    ctx.effect(() => () => {
      this.installer.cancel()
      return this.stop()
    }, 'kicad sidecar')
  }

  /**
   * Check the local KiCad environment. Never throws: when the sidecar itself cannot
   * start (no Python, Python < 3.10) the report says so and how to fix it.
   */
  async doctor(signal?: AbortSignal): Promise<DoctorReport> {
    try {
      const result = await this.call<DoctorReport>('doctor', {}, signal)
      if (result.ok && result.value) return result.value
      return unavailableReport(result.text, this.pythonCommand())
    } catch (error) {
      if (signal?.aborted) throw error
      return unavailableReport((error as Error).message, this.pythonCommand())
    }
  }

  /**
   * Start installing KiCad with one of the plans the doctor offered. Callers must have
   * shown the command to the user and received an explicit confirmation. Plans that need
   * root are refused (the user runs those themselves); so is installing when KiCad is fine.
   */
  async install(optionId: string, signal?: AbortSignal): Promise<InstallJob> {
    if (this.installer.job?.state === 'running') throw new Error(`an installation is already running (${this.installer.job.label})`)
    const report = await this.doctor(signal)
    // Optional components (Freerouting, Java) carry their plans on their checks; KiCad's own are report.install.
    const optional = report.checks.flatMap(c => c.install ?? [])
    const option = optional.find(o => o.id === optionId) ?? (report.status === 'ok' ? undefined : report.install.find(o => o.id === optionId))
    if (!option) {
      const check = report.checks.find(c => c.id === optionId && c.status === 'ok')
      if (check) throw new Error(`${check.label}: ${check.summary} Nothing to install.`)
      if (report.status === 'ok') {
        const others = optional.length ? ` Optional components: ${optional.map(o => o.id).join(', ')}.` : ''
        throw new Error(`KiCad ${report.kicad.version} is already installed and usable; nothing to install.${others}`)
      }
      const known = [...report.install, ...optional].map(o => o.id).join(', ')
      throw new Error(known ? `unknown install option "${optionId}"; choose one of: ${known}` : `no install options: ${report.summary}`)
    }
    return this.installer.start(option)
  }

  private pythonCommand(): string {
    return this.config.launcher === 'uv' ? this.config.uv : (this.config.python.get() || defaultPython())
  }

  /**
   * Call one sidecar tool (see the sidecar catalog for names and arguments). Aborting `signal` cancels the call in
   * the sidecar too (MCP `notifications/cancelled`); `options` sets a longer timeout and receives progress.
   */
  async call<T = unknown>(tool: string, args: Record<string, unknown>, signal?: AbortSignal, options?: CallOptions): Promise<KiCadResult<T>> {
    const { client } = await this.ensure(signal)
    const result = await client.callTool(tool, args, signal, options)
    return toResult<T>(result)
  }

  /** Like {@link call} but throws on a domain error. */
  async run<T = unknown>(tool: string, args: Record<string, unknown>, signal?: AbortSignal, options?: CallOptions): Promise<T> {
    const result = await this.call<T>(tool, args, signal, options)
    if (!result.ok) throw new Error(result.text)
    return result.value as T
  }

  async tools(signal?: AbortSignal): Promise<ToolInfo[]> {
    if (!this.toolCache) this.toolCache = await (await this.ensure(signal)).client.listTools(signal)
    return this.toolCache
  }

  /** Stop the sidecar; the next call starts a fresh one. */
  async stop(): Promise<void> {
    const running = this.running
    this.running = undefined
    this.toolCache = undefined
    if (!running) return
    try {
      const { handle, client } = await running
      client.close()
      handle.stdin?.end()
      const exited = await Promise.race([handle.done.then(() => true, () => true), delay(2000).then(() => false)])
      if (!exited) handle.terminate()
      await handle.waitForExit(AbortSignal.timeout(5000)).catch(() => false)
    } catch {
      // A sidecar that never started has nothing to stop.
    }
  }

  private launchKey(): string {
    return JSON.stringify([this.config.launcher, this.config.python.get(), this.config.kicadCli.get(), this.config.java.get(), this.config.freerouting.get(),
      this.config.ngspice.get(), this.config.qemu.get()])
  }

  private async ensure(signal?: AbortSignal): Promise<Running> {
    // Settings edits (python / kicadCli) take effect on the next call.
    if (this.running) {
      const current = await this.running.catch(() => undefined)
      if (!current || current.client.closed || current.key !== this.launchKey()) await this.stop()
    }
    if (!this.running) {
      this.running = this.start(signal)
      this.running.catch(() => { this.running = undefined })
    }
    return this.running
  }

  private async start(signal?: AbortSignal): Promise<Running> {
    const subprocess: SubprocessRuntime = this.ctx.subprocess
    const key = this.launchKey()
    const command = this.pythonCommand()
    const executable = await subprocess.resolveExecutable(command, undefined, signal).catch((error: unknown) => {
      const what = this.config.launcher === 'uv' ? 'uv' : 'Python 3.10+'
      throw new RpcError(`${what} executable "${command}" was not found (${(error as Error).message}). `
        + `Install ${what} or set the KiCad bridge '${this.config.launcher === 'uv' ? 'uv' : 'python'}' setting; /kicad-doctor shows what else is missing.`)
    })
    const spec = launchSpec({
      launcher: this.config.launcher,
      executable,
      sidecarDir: this.sidecarDir,
      kicadCli: this.config.kicadCli.get() || undefined,
      java: this.config.java.get() || undefined,
      freerouting: this.config.freerouting.get() || undefined,
      ngspice: this.config.ngspice.get() || undefined,
      qemu: this.config.qemu.get() || undefined,
      extras: this.config.uvExtras,
    })
    const handle = subprocess.spawn({
      argv: spec.argv,
      cwd: this.sidecarDir,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: { maxBytes: 64 * 1024 } },
      graceMs: 2000,
      env: spec.env,
    })
    const client = new McpClient(handle.stdin!, handle.stdout!, this.config.requestTimeoutMs)
    handle.done.then(
      (outcome) => {
        const tail = handle.collected.stderr?.readFrom(0).text.trim().split('\n').slice(-5).join('\n') ?? ''
        client.close(new RpcError(`KiCad sidecar exited (code ${outcome.exitCode}, signal ${outcome.signal})${tail ? `: ${tail}` : ''}`))
      },
      error => client.close(error instanceof Error ? error : new RpcError(String(error))),
    )
    await client.initialize(signal)
    this.ctx.logger('kicad').info('sidecar started: %s', spec.argv.join(' '))
    return { handle, client, key }
  }
}

function toResult<T>(result: ToolCallResult): KiCadResult<T> {
  const text = result.content.map(block => block.text ?? '').join('\n')
  return { ok: !result.isError, value: result.isError ? undefined : result.structuredContent as T, text }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default KiCadBridge
