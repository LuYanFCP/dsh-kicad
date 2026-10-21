/**
 * KiCad environment check and installer UI. Everything goes through the Host's
 * `/kicad-install … --json` and `/kicad-doctor --json` commands (Client → Host
 * only via `remote.commands`). The check and the installer are machine-wide, so
 * any session can carry the command; surfaces without one (the settings page)
 * borrow the most recent session.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ClientRemote } from './dsh.ts'
import { translate, type KiCadLocaleKey } from './locales.ts'
import { CSS } from './styles.ts'

type Tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>) => string

export interface DoctorCheck { id: string, label: string, status: 'ok' | 'warn' | 'error', required?: boolean, summary: string, fix?: string }
export interface InstallOption {
  id: string
  label: string
  command: string
  needs_root: boolean
  runnable: boolean
  available: boolean
  recommended: boolean
  note: string
  url?: string
}
export interface DoctorReport {
  ok: boolean
  status: 'ok' | 'missing' | 'outdated' | 'error' | 'unavailable'
  summary: string
  kicad?: { cli: string | null, version: string | null }
  checks: DoctorCheck[]
  install: InstallOption[]
}
export interface InstallJob {
  id: number
  option: string
  label: string
  command: string
  state: 'running' | 'succeeded' | 'failed' | 'cancelled'
  phase: 'installing' | 'checking' | 'done'
  step: number
  steps: number
  error?: string
  log: string[]
  doctor?: DoctorReport
}

/** Validate a report from the wire (command text or tool metadata). */
export function readReport(value: unknown): DoctorReport | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const r = value as Partial<DoctorReport>
  if (typeof r.status !== 'string' || typeof r.summary !== 'string' || !Array.isArray(r.checks)) return undefined
  return { ...r, install: Array.isArray(r.install) ? r.install : [] } as DoctorReport
}

/** Tool failures that mean "KiCad (or the sidecar's Python) is missing or too old". */
export const KICAD_MISSING = /KiCad is not installed|kicad-cli was not found|kicad-cli could not be started|need KiCad \d+ or newer|executable "[^"]*" was not found|needs Python 3\.10/

/** Run a slash command and return its success text; throws with the command's error. */
export type CommandRunner = (line: string) => Promise<string>

/** The session that will carry commands: the given one, else the most recently used one. */
export async function pickSession(remote: ClientRemote, preferred?: string): Promise<string | undefined> {
  if (preferred) return preferred
  const listed = await remote.session?.list({})
  if (!listed?.ok) return undefined
  const rows = listed.value.items.filter(s => s.origin !== 'subagent')
  rows.sort((a, b) => Number(b.agentAvailable) - Number(a.agentAvailable) || b.updatedAt - a.updatedAt)
  return rows[0]?.sessionId
}

export function createRunner(remote: ClientRemote, sessionId?: string): CommandRunner {
  let session: Promise<string | undefined> | undefined
  return async (line) => {
    session ??= pickSession(remote, sessionId)
    const id = await session
    if (!id) {
      session = undefined
      throw new NoSessionError()
    }
    const result = await remote.commands.execute(id, line, [])
    if (!result.ok) throw new Error(result.error.message)
    const outcome = result.value?.result
    if (!outcome) throw new Error(`${line.split(' ')[0]} is not available (is the KiCad plugin enabled?)`)
    if (outcome.kind === 'error') throw new Error(outcome.text)
    return outcome.text ?? ''
  }
}

export class NoSessionError extends Error {
  constructor() {
    super('no session')
    this.name = 'NoSessionError'
  }
}

// One check per page load and runner key, shared by every surface; refreshed after an install.
const cache = new Map<string, { at: number, report: Promise<DoctorReport> }>()
const TTL = 5 * 60_000

export function cachedDoctor(key: string, run: CommandRunner, force = false): Promise<DoctorReport> {
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < TTL) return hit.report
  const report = run('/kicad-doctor --json').then((text) => {
    const parsed = readReport(JSON.parse(text))
    if (!parsed) throw new Error('unexpected /kicad-doctor output')
    return parsed
  })
  cache.set(key, { at: Date.now(), report })
  report.catch(() => cache.delete(key))
  return report
}

export function forgetDoctor(): void {
  cache.clear()
}

const STATUS_KEY: Record<DoctorReport['status'], KiCadLocaleKey> = {
  ok: 'doctor.status.ok',
  missing: 'doctor.status.missing',
  outdated: 'doctor.status.outdated',
  error: 'doctor.status.error',
  unavailable: 'doctor.status.unavailable',
}
const MARK = { ok: '✓', warn: '!', error: '✗' } as const

export function StatusBadge(props: { report: DoctorReport, tr: Tr }): ReactNode {
  return (
    <span className={`dshk-badge ${props.report.status === 'ok' ? 'dshk-pass' : 'dshk-fail'}`} data-kicad-doctor-status={props.report.status}>
      {props.tr(STATUS_KEY[props.report.status])}
    </span>
  )
}

export function CheckList(props: { report: DoctorReport, tr: Tr }): ReactNode {
  return (
    <ul className="dshk-list" data-kicad-checks>
      {props.report.checks.map(c => (
        <li key={c.id} data-kicad-check={c.id} data-status={c.status}>
          <span className={`dshk-code dshk-sev-${c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'warning' : 'error'}`}>{MARK[c.status]}</span>{' '}
          <strong>{c.label}</strong>: {c.summary}
          {c.fix && c.status !== 'ok' && <div className="dshk-muted">{props.tr('doctor.fix')}: {c.fix}</div>}
        </li>
      ))}
    </ul>
  )
}

export interface DoctorPanelProps {
  remote: ClientRemote
  /** Session to run commands in; omitted → the most recent session. */
  sessionId?: string
  t?: (key: string, vars?: Record<string, string | number>) => string
  /** A report the surface already has (e.g. from a tool result); skips the first check. */
  initial?: DoctorReport
  /** Called with every fresh report. */
  onReport?: (report: DoctorReport) => void
  /** Check again on mount instead of reusing this page's cached report (settings may have changed). */
  fresh?: boolean
  pollMs?: number
}

/** Status, per-check fixes and — when KiCad is missing or too old — the install options. */
export function DoctorPanel(props: DoctorPanelProps): ReactNode {
  const tr: Tr = (key, vars) => translate(props.t, key, vars)
  const runner = useRef<CommandRunner>(undefined as never)
  runner.current ??= createRunner(props.remote, props.sessionId)
  const key = props.sessionId ?? '*'
  const [report, setReport] = useState<DoctorReport | undefined>(props.initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [noSession, setNoSession] = useState(false)
  const [job, setJob] = useState<InstallJob | undefined>(undefined)
  const [confirming, setConfirming] = useState<InstallOption | undefined>(undefined)
  const [copied, setCopied] = useState<string | undefined>(undefined)
  const live = useRef(true)
  useEffect(() => () => { live.current = false }, [])

  const accept = (next: DoctorReport): void => {
    setReport(next)
    props.onReport?.(next)
  }

  const fail = (cause: unknown): void => {
    if (cause instanceof NoSessionError) setNoSession(true)
    else setError(String((cause as Error)?.message ?? cause))
  }

  const check = async (force: boolean): Promise<void> => {
    setBusy(true)
    setError(undefined)
    try {
      const next = await cachedDoctor(key, runner.current, force)
      if (!live.current) return
      setNoSession(false)
      accept(next)
      // Pick up an installation that is already running (e.g. started from another page).
      const status = JSON.parse(await runner.current('/kicad-install status --json')) as { job: InstallJob | null }
      if (live.current && status.job && status.job.phase !== 'done') setJob(status.job)
    } catch (cause) {
      if (live.current) fail(cause)
    } finally {
      if (live.current) setBusy(false)
    }
  }

  useEffect(() => {
    if (!props.initial) void check(props.fresh === true)
  }, [])

  // Follow a running installation until it has been checked again.
  const running = job !== undefined && job.phase !== 'done'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      void runner.current('/kicad-install status --json').then((text) => {
        if (!live.current) return
        const next = (JSON.parse(text) as { job: InstallJob | null }).job
        if (!next) return
        setJob(next)
        if (next.phase === 'done') {
          forgetDoctor()
          const fresh = readReport(next.doctor)
          if (fresh) {
            cache.set(key, { at: Date.now(), report: Promise.resolve(fresh) })
            accept(fresh)
          }
        }
      }, (cause: unknown) => live.current && fail(cause))
    }, props.pollMs ?? 1000)
    return () => clearInterval(timer)
  }, [running])

  const start = async (option: InstallOption): Promise<void> => {
    setConfirming(undefined)
    setError(undefined)
    try {
      const text = await runner.current(`/kicad-install ${option.id} --yes --json`)
      if (live.current) setJob((JSON.parse(text) as { job: InstallJob }).job)
    } catch (cause) {
      if (live.current) fail(cause)
    }
  }

  const cancel = async (): Promise<void> => {
    try {
      await runner.current('/kicad-install cancel --json')
    } catch (cause) {
      fail(cause)
    }
  }

  const copy = (option: InstallOption): void => {
    void navigator.clipboard?.writeText(option.command).then(() => setCopied(option.id), () => setCopied(undefined))
  }

  return (
    <div className="dshk-doctor" data-kicad-doctor>
      <style>{CSS}</style>
      <div className="dshk-check">
        <strong>{tr('doctor.title')}</strong>
        {report && <StatusBadge report={report} tr={tr} />}
        <span className="dshk-spacer" />
        <button type="button" className="dshk-btn" disabled={busy || running} onClick={() => void check(true)} data-kicad-action="recheck">
          {busy ? tr('doctor.checking') : tr('doctor.recheck')}
        </button>
      </div>
      {noSession && <div className="dshk-note" data-kicad-state="no-session">{tr('doctor.noSession')}</div>}
      {error && <div className="dshk-error" data-kicad-state="error">{error}</div>}
      {!report && busy && <div className="dshk-note">{tr('doctor.checking')}</div>}
      {report && (
        <>
          <div className="dshk-hint" data-kicad-summary>{report.summary}</div>
          <CheckList report={report} tr={tr} />
        </>
      )}
      {job && (
        <div className="dshk-install-job" data-kicad-job={job.state} data-kicad-job-phase={job.phase}>
          <div className="dshk-check">
            <strong>{tr('install.job', { label: job.label })}</strong>
            <span className="dshk-muted">{tr(`install.state.${job.state}` as KiCadLocaleKey)}{job.phase === 'checking' ? ` · ${tr('doctor.checking')}` : ''} · {tr('install.step', { step: job.step, steps: job.steps })}</span>
            <span className="dshk-spacer" />
            {job.state === 'running' && <button type="button" className="dshk-btn" onClick={() => void cancel()} data-kicad-action="cancel-install">{tr('install.cancel')}</button>}
          </div>
          <pre className="dshk-log dshk-code" data-kicad-log>{job.log.slice(-40).join('\n')}</pre>
          {job.error && <div className="dshk-error">{job.error}</div>}
        </div>
      )}
      {report && report.install.length > 0 && !running && (
        <div className="dshk-install" data-kicad-install>
          <div><strong>{tr('install.title')}</strong> <span className="dshk-hint">{tr('install.intro')}</span></div>
          {report.install.map(option => (
            <div key={option.id} className="dshk-option" data-kicad-option={option.id}>
              <div className="dshk-check">
                <strong>{option.label}</strong>
                {option.recommended && <span className="dshk-badge dshk-pass">{tr('install.recommended')}</span>}
                {option.needs_root && <span className="dshk-badge dshk-muted">{tr('install.needsRoot')}</span>}
                <span className="dshk-spacer" />
                {option.runnable && (
                  <button type="button" className="dshk-btn" onClick={() => setConfirming(option)} data-kicad-action="install">{tr('install.install')}</button>
                )}
                {!option.runnable && option.command && (
                  <button type="button" className="dshk-btn" onClick={() => copy(option)} data-kicad-action="copy">
                    {copied === option.id ? tr('install.copied') : tr('install.copy')}
                  </button>
                )}
                {option.url && (
                  <a className="dshk-btn" href={option.url} target="_blank" rel="noreferrer" data-kicad-action="download">{tr('install.download')}</a>
                )}
              </div>
              {option.command && <pre className="dshk-cmd dshk-code">{option.command}</pre>}
              {option.needs_root && <div className="dshk-hint">{tr('install.rootHint')}</div>}
              {option.note && <div className="dshk-hint">{option.note}</div>}
              {confirming?.id === option.id && (
                <div className="dshk-confirm" role="alertdialog" data-kicad-confirm={option.id}>
                  <div>{tr('install.confirm')}</div>
                  <pre className="dshk-cmd dshk-code">{option.command}</pre>
                  <div className="dshk-check">
                    <button type="button" className="dshk-btn dshk-primary" onClick={() => void start(option)} data-kicad-action="confirm-install">{tr('install.run')}</button>
                    <button type="button" className="dshk-btn" onClick={() => setConfirming(undefined)} data-kicad-action="cancel-confirm">{tr('install.back')}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A one-line notice for surfaces that need KiCad (the sidebar viewer): silent when
 * KiCad is ready, otherwise the problem plus a button that opens the full panel.
 */
export function KiCadNotice(props: { remote: ClientRemote, sessionId: string, t?: DoctorPanelProps['t'], force?: boolean }): ReactNode {
  const tr: Tr = (key, vars) => translate(props.t, key, vars)
  const [report, setReport] = useState<DoctorReport | undefined>(undefined)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let live = true
    void cachedDoctor(props.sessionId, createRunner(props.remote, props.sessionId), props.force).then(r => live && setReport(r), () => undefined)
    return () => { live = false }
  }, [props.sessionId, props.force])
  if (!report || (report.status === 'ok' && !open)) return null
  return (
    <div className="dshk-warn" data-kicad-notice={report.status}>
      {!open && (
        <div className="dshk-check">
          <span>{report.summary}</span>
          <span className="dshk-spacer" />
          <button type="button" className="dshk-btn" onClick={() => setOpen(true)} data-kicad-action="open-doctor">
            {report.install.length ? tr('install.openButton') : tr('doctor.open')}
          </button>
        </div>
      )}
      {open && <DoctorPanel remote={props.remote} sessionId={props.sessionId} t={props.t} initial={report} onReport={setReport} />}
    </div>
  )
}
