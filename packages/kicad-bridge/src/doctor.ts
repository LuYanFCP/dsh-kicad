/**
 * Environment check ("doctor") shapes and the KiCad installer. The sidecar's
 * `doctor` tool produces the report and the install plans; the bridge only runs
 * a plan the user confirmed, one at a time, and never one that needs root.
 */
import { homedir } from 'node:os'
import type { SubprocessHandle, SubprocessRuntime } from './dsh.ts'

export type CheckStatus = 'ok' | 'warn' | 'error'

export interface DoctorCheck {
  id: string
  label: string
  status: CheckStatus
  required: boolean
  summary: string
  fix?: string
  /** Optional components (Java, Freerouting) carry their own install plans. */
  install?: InstallOption[]
  [extra: string]: unknown
}

export interface InstallOption {
  id: string
  label: string
  /** argv of each step, run in order. Empty for the manual download. */
  steps: string[][]
  /** The steps as one shell line, for display and copying. */
  command: string
  needs_root: boolean
  /** The bridge may run it (after the user confirms): no root and the tool is present. */
  runnable: boolean
  available: boolean
  recommended: boolean
  note: string
  url?: string
}

export interface DoctorReport {
  ok: boolean
  /** `unavailable`: the sidecar itself could not start (usually Python). */
  status: 'ok' | 'missing' | 'outdated' | 'error' | 'unavailable'
  summary: string
  kicad: { cli: string | null, source: string | null, version: string | null, minimum: string }
  platform?: { os: string, distro: string | null, name: string | null }
  checks: DoctorCheck[]
  install: InstallOption[]
  text: string
}

export interface InstallJob {
  id: number
  option: string
  label: string
  command: string
  state: 'running' | 'succeeded' | 'failed' | 'cancelled'
  /** `checking` while KiCad is checked again after the installer finished; `done` after that. */
  phase: 'installing' | 'checking' | 'done'
  /** 1-based index of the running (or last) step. */
  step: number
  steps: number
  startedAt: number
  finishedAt?: number
  exitCode?: number | null
  error?: string
  /** Tail of the combined output. */
  log: string[]
  /** The check that ran after the installer finished. */
  doctor?: DoctorReport
}

/** Commands that elevate privileges: the bridge never runs them for the user. */
const ELEVATION = new Set(['sudo', 'su', 'doas', 'pkexec', 'runas', 'gsudo'])
const MAX_LOG_LINES = 400
const MAX_LINE = 400

export function needsElevation(option: Pick<InstallOption, 'needs_root' | 'steps'>): boolean {
  return option.needs_root || option.steps.some(step => ELEVATION.has(baseName(step[0] ?? '')))
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop()!.replace(/\.exe$/i, '').toLowerCase()
}

/** Report used when the sidecar cannot start, so the UI and the model still get a diagnosis and a fix. */
export function unavailableReport(reason: string, python: string): DoctorReport {
  const pythonMissing = /not found|ENOENT|needs Python 3\.10|no such file|cannot find/i.test(reason)
  const fix = `Install Python 3.10 or newer (https://www.python.org/downloads/ or your package manager, e.g. \`sudo dnf install python3\`, \`sudo apt-get install python3\`, \`brew install python\`, \`winget install Python.Python.3.12\`) and, if it is not on PATH, set the KiCad bridge 'python' setting to it.`
  const checks: DoctorCheck[] = [
    {
      id: 'python',
      label: 'Python',
      status: 'error',
      required: true,
      summary: pythonMissing ? `The KiCad sidecar could not start with "${python}": ${reason}` : `The KiCad sidecar failed to start: ${reason}`,
      fix,
    },
    { id: 'kicad_cli', label: 'kicad-cli', status: 'error', required: true, summary: 'Not checked: the sidecar is not running.', fix: 'Fix Python first, then check again.' },
  ]
  const summary = 'The KiCad sidecar (Python) could not start, so nothing else was checked.'
  return {
    ok: false,
    status: 'unavailable',
    summary,
    kicad: { cli: null, source: null, version: null, minimum: '8.0' },
    checks,
    install: [],
    text: `${summary}\n\n✗ Python: ${checks[0].summary}\n    fix: ${fix}`,
  }
}

export interface InstallerDeps {
  subprocess: () => SubprocessRuntime
  /** Fresh report (the bridge restarts the sidecar first, so new installs are found). */
  recheck: () => Promise<DoctorReport>
  logger?: (message: string) => void
}

/** Runs one confirmed install plan at a time and keeps its log for polling clients. */
export class Installer {
  private current: InstallJob | undefined
  private controller: AbortController | undefined
  private running: Promise<void> | undefined
  private nextId = 1

  constructor(private readonly deps: InstallerDeps) {}

  get job(): InstallJob | undefined {
    return this.current && { ...this.current, log: [...this.current.log] }
  }

  /** Start a plan. Throws when another install runs or the plan is not allowed to run here. */
  start(option: InstallOption): InstallJob {
    if (this.current?.state === 'running') throw new Error(`an installation is already running (${this.current.label})`)
    if (needsElevation(option)) {
      throw new Error(`"${option.label}" needs administrator rights, so it is not run from dsh. Run it yourself in a terminal:\n${option.command}\nthen check again with /kicad-doctor.`)
    }
    if (!option.runnable || option.steps.length === 0) {
      throw new Error(`"${option.label}" cannot run here${option.note ? `: ${option.note}` : ''}${option.url ? ` ${option.url}` : ''}`)
    }
    this.controller = new AbortController()
    const job: InstallJob = {
      id: this.nextId++, option: option.id, label: option.label, command: option.command,
      state: 'running', phase: 'installing', step: 0, steps: option.steps.length, startedAt: Date.now(), log: [],
    }
    this.current = job
    this.running = this.run(job, option, this.controller.signal)
    return this.job!
  }

  cancel(): boolean {
    if (this.current?.state !== 'running') return false
    this.controller?.abort()
    return true
  }

  /** Resolves when the current job (and its re-check) has finished. */
  async settled(): Promise<InstallJob | undefined> {
    await this.running
    return this.job
  }

  private append(job: InstallJob, text: string): void {
    for (const line of text.split(/\r?\n|\r/)) {
      if (!line.trim()) continue
      job.log.push(line.length > MAX_LINE ? `${line.slice(0, MAX_LINE)}…` : line)
    }
    if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES)
  }

  private async run(job: InstallJob, option: InstallOption, signal: AbortSignal): Promise<void> {
    const subprocess = this.deps.subprocess()
    try {
      for (const [index, step] of option.steps.entries()) {
        job.step = index + 1
        this.append(job, `$ ${step.join(' ')}`)
        this.deps.logger?.(`install ${option.id} step ${index + 1}: ${step.join(' ')}`)
        const executable = await subprocess.resolveExecutable(step[0], undefined, signal)
        const handle: SubprocessHandle = subprocess.spawn({
          argv: [executable, ...step.slice(1)],
          cwd: homedir(),
          // No stdin: nothing can stop and wait for a password or a prompt.
          stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
          graceMs: 5000,
          signal,
        })
        for (const stream of [handle.stdout, handle.stderr]) {
          stream?.setEncoding('utf8')
          stream?.on('data', (chunk: string) => this.append(job, chunk))
        }
        const outcome = await handle.done
        job.exitCode = outcome.exitCode
        if (signal.aborted) {
          job.state = 'cancelled'
          break
        }
        if (outcome.exitCode !== 0) {
          job.state = 'failed'
          job.error = `step ${index + 1} exited with ${outcome.exitCode ?? outcome.signal}`
          break
        }
      }
      if (job.state === 'running') job.state = 'succeeded'
    } catch (error) {
      job.state = signal.aborted ? 'cancelled' : 'failed'
      job.error = (error as Error).message
      this.append(job, job.error)
    }
    job.finishedAt = Date.now()
    job.phase = 'checking'
    this.append(job, `installer ${job.state}; checking KiCad again…`)
    try {
      job.doctor = await this.deps.recheck()
      this.append(job, job.doctor.summary)
    } catch (error) {
      this.append(job, `re-check failed: ${(error as Error).message}`)
    }
    job.phase = 'done'
  }
}
