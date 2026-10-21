import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckCard } from '../src/client/Cards.tsx'
import { createDoctorCard, withKiCadHint } from '../src/client/Cards.tsx'
import { DoctorPanel, forgetDoctor, KICAD_MISSING, KiCadNotice, pickSession, readReport, type DoctorReport } from '../src/client/Doctor.tsx'
import { createBridgeSettings } from '../src/client/Settings.tsx'
import type { ClientRemote, ConfigViewProps, ToolViewProps } from '../src/client/dsh.ts'

const missing: DoctorReport = {
  ok: false,
  status: 'missing',
  summary: 'KiCad (kicad-cli) is not installed or was not found.',
  checks: [
    { id: 'kicad_cli', label: 'kicad-cli', status: 'error', summary: 'kicad-cli was not found.', fix: 'Install KiCad.' },
    { id: 'python', label: 'Python', status: 'ok', summary: 'Python 3.14.6' },
  ],
  install: [
    { id: 'dnf', label: 'Fedora package (dnf)', command: 'sudo dnf install -y kicad', needs_root: true, runnable: false, available: true, recommended: false, note: '' },
    { id: 'flatpak', label: 'Flatpak from Flathub', command: 'flatpak install --user -y flathub org.kicad.KiCad', needs_root: false, runnable: true, available: true, recommended: true, note: 'about 1.5 GB' },
    { id: 'download', label: 'Installer from kicad.org', command: '', needs_root: false, runnable: false, available: true, recommended: false, note: '', url: 'https://www.kicad.org/download/' },
  ],
}
const ready: DoctorReport = { ...missing, ok: true, status: 'ok', summary: 'Ready: KiCad 10.0.7.', checks: [{ id: 'kicad_cli', label: 'kicad-cli', status: 'ok', summary: '/usr/bin/kicad-cli' }], install: [] }

/** A Host that answers the KiCad commands; the install finishes on the second status poll. */
function fakeHost(initial: DoctorReport, sessions = [{ sessionId: 's1', updatedAt: 1, agentAvailable: true }]) {
  let report = initial
  let job: Record<string, unknown> | null = null
  let polls = 0
  const lines: Array<[string, string]> = []
  const ok = (text: string) => ({ ok: true as const, value: { result: { kind: 'success' as const, text } } })
  const execute = vi.fn(async (sessionId: string, line: string) => {
    lines.push([sessionId, line])
    if (line.startsWith('/kicad-doctor')) return ok(JSON.stringify(report))
    if (line === '/kicad-install status --json') {
      if (job && job.phase !== 'done' && ++polls >= 2) {
        report = ready
        job = { ...job, state: 'succeeded', phase: 'done', log: [...(job.log as string[]), 'Installation complete.'], doctor: ready }
      }
      return ok(JSON.stringify({ job }))
    }
    const start = /^\/kicad-install (\w+) --yes --json$/.exec(line)
    if (start) {
      job = { id: 1, option: start[1], label: start[1], command: 'flatpak install …', state: 'running', phase: 'installing', step: 1, steps: 2, log: ['$ flatpak remote-add …'] }
      return ok(JSON.stringify({ job }))
    }
    return { ok: false as const, error: { message: `unexpected ${line}`, code: 'x' } }
  })
  const remote: ClientRemote = {
    commands: { execute },
    workspaceFiles: { list: vi.fn(), readBytes: vi.fn() } as never,
    session: { list: vi.fn(async () => ({ ok: true as const, value: { items: sessions } })) },
  }
  return { remote, execute, lines }
}

beforeEach(() => forgetDoctor())
afterEach(cleanup)

describe('DoctorPanel', () => {
  it('shows each check and installs only after an explicit confirmation, then re-checks', async () => {
    const host = fakeHost(missing)
    const { container } = render(<DoctorPanel remote={host.remote} sessionId="s1" pollMs={10} />)
    await waitFor(() => expect(screen.getByText('KiCad not installed')).toBeTruthy())
    expect(screen.getByText(/kicad-cli was not found/)).toBeTruthy()
    expect(screen.getByText(/Fix: Install KiCad\./)).toBeTruthy()

    // Root-only: shown and copyable, never runnable from dsh.
    const dnf = container.querySelector('[data-kicad-option="dnf"]')!
    expect(dnf.querySelector('[data-kicad-action="install"]')).toBeNull()
    expect(dnf.querySelector('[data-kicad-action="copy"]')).toBeTruthy()
    expect(dnf.textContent).toContain('sudo dnf install -y kicad')
    expect(container.querySelector('[data-kicad-option="download"] a')?.getAttribute('href')).toBe('https://www.kicad.org/download/')

    // Clicking Install only opens the confirmation with the exact command.
    fireEvent.click(container.querySelector('[data-kicad-option="flatpak"] [data-kicad-action="install"]')!)
    const confirm = container.querySelector('[data-kicad-confirm="flatpak"]')!
    expect(confirm.textContent).toContain('flatpak install --user -y flathub org.kicad.KiCad')
    expect(host.lines.some(([, l]) => l.includes('--yes'))).toBe(false)
    fireEvent.click(confirm.querySelector('[data-kicad-action="cancel-confirm"]')!)
    expect(container.querySelector('[data-kicad-confirm]')).toBeNull()

    fireEvent.click(container.querySelector('[data-kicad-option="flatpak"] [data-kicad-action="install"]')!)
    await act(async () => { fireEvent.click(container.querySelector('[data-kicad-action="confirm-install"]')!) })
    expect(host.execute).toHaveBeenCalledWith('s1', '/kicad-install flatpak --yes --json', [])
    await waitFor(() => expect(container.querySelector('[data-kicad-log]')?.textContent).toContain('flatpak remote-add'))
    // Progress, then the automatic re-check.
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy())
    expect(container.querySelector('[data-kicad-job-phase="done"]')).toBeTruthy()
    expect(container.querySelector('[data-kicad-log]')?.textContent).toContain('Installation complete.')
    expect(container.querySelector('[data-kicad-install]')).toBeNull()
  })

  it('borrows the most recent live session when the page has none', async () => {
    const host = fakeHost(ready, [
      { sessionId: 'old', updatedAt: 1, agentAvailable: false },
      { sessionId: 'sub', updatedAt: 9, agentAvailable: true, origin: 'subagent' } as never,
      { sessionId: 'live', updatedAt: 5, agentAvailable: true },
    ])
    expect(await pickSession(host.remote)).toBe('live')
    render(<DoctorPanel remote={host.remote} />)
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy())
    expect(host.execute).toHaveBeenCalledWith('live', '/kicad-doctor --json', [])
  })

  it('asks for a conversation when there is no session at all', async () => {
    const host = fakeHost(ready, [])
    const { container } = render(<DoctorPanel remote={host.remote} />)
    await waitFor(() => expect(container.querySelector('[data-kicad-state="no-session"]')).toBeTruthy())
    expect(host.execute).not.toHaveBeenCalled()
  })
})

describe('surfaces', () => {
  it('bridge settings page shows the check under the fields', async () => {
    const host = fakeHost(missing)
    const Settings = createBridgeSettings(host.remote)
    const form = { state: { status: 'ready', value: {}, revision: 1, writable: true }, mutate: vi.fn(async () => true) } as ConfigViewProps['form']
    const { container } = render(<Settings view="page" form={form} />)
    await waitFor(() => expect(container.querySelector('[data-kicad-doctor-status="missing"]')).toBeTruthy())
    expect(container.querySelector('[data-kicad-settings] [data-kicad-doctor]')).toBeTruthy()
  })

  it('viewer notice stays silent when KiCad is ready and offers the installer when it is not', async () => {
    const quiet = render(<KiCadNotice remote={fakeHost(ready).remote} sessionId="s1" />)
    await waitFor(() => expect(quiet.container.innerHTML).toBe(''))
    forgetDoctor()
    const { container } = render(<KiCadNotice remote={fakeHost(missing).remote} sessionId="s2" />)
    await waitFor(() => expect(container.querySelector('[data-kicad-notice="missing"]')).toBeTruthy())
    fireEvent.click(container.querySelector('[data-kicad-action="open-doctor"]')!)
    expect(container.querySelector('[data-kicad-option="flatpak"]')).toBeTruthy()
  })

  const failed = (text: string): ToolViewProps => ({
    toolName: 'kicad_erc', callId: 'c1', phase: 'result',
    block: { call: { name: 'kicad_erc', argsRaw: '{"path":"rc.kicad_sch"}' }, content: [{ type: 'text', text }], isError: true },
  })

  it('a tool failure caused by missing KiCad offers the installer; other failures do not', async () => {
    const host = fakeHost(missing)
    const Card = withKiCadHint(host.remote, CheckCard)
    const { container } = render(<Card {...failed('KiCad is not installed or kicad-cli was not found (KiCad 8+ is required). Install it with …')} />)
    expect(container.querySelector('[data-kicad-missing]')).toBeTruthy()
    fireEvent.click(container.querySelector('[data-kicad-action="open-doctor"]')!)
    await waitFor(() => expect(container.querySelector('[data-kicad-option="flatpak"]')).toBeTruthy())
    const other = render(<Card {...failed('/x.kicad_sch does not exist')} />)
    expect(other.container.querySelector('[data-kicad-missing]')).toBeNull()
  })

  it('kicad_doctor row shows the verdict and the install button from the tool metadata', () => {
    const Card = createDoctorCard(fakeHost(missing).remote)
    const { container } = render(<Card {...{ ...failed(''), toolName: 'kicad_doctor', block: { content: [], isError: false, meta: { kind: 'doctor', ...missing } } }} />)
    expect(container.querySelector('[data-kicad-card="doctor"]')?.getAttribute('data-kicad-doctor-status')).toBe('missing')
    fireEvent.click(container.querySelector('[data-kicad-action="open-doctor"]')!)
    expect(container.querySelector('[data-kicad-option="dnf"]')).toBeTruthy()
  })

  it('recognizes the Host error messages', () => {
    for (const text of [
      'KiCad is not installed or kicad-cli was not found (KiCad 8+ is required).',
      'This kicad-cli is KiCad 7.0.11; the KiCad tools need KiCad 8 or newer.',
      'Python 3.10+ executable "python3" was not found (ENOENT).',
    ]) expect(KICAD_MISSING.test(text), text).toBe(true)
    expect(readReport({ status: 'ok' })).toBeUndefined()
  })
})
