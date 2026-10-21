import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, describe, expect, it } from 'vitest'
import KiCadBridge, { Installer, needsElevation, type DoctorReport, type InstallOption } from '../src/index.ts'
import { SIDECAR_DIR } from './helpers.ts'

const contexts: Context[] = []
const savedEnv = { PATH: process.env.PATH, KICAD_CLI: process.env.KICAD_CLI }
const posix = process.platform !== 'win32'
const python = posix ? execFileSync('sh', ['-c', 'command -v python3'], { encoding: 'utf8' }).trim() : 'python'

async function boot(config: Record<string, unknown> = {}): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(KiCadBridge, { sidecarDir: SIDECAR_DIR, ...config })
  return ctx
}

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.kicad?.stop()
  process.env.PATH = savedEnv.PATH
  if (savedEnv.KICAD_CLI === undefined) delete process.env.KICAD_CLI
  else process.env.KICAD_CLI = savedEnv.KICAD_CLI
})

function option(steps: string[][], extra: Partial<InstallOption> = {}): InstallOption {
  return {
    id: 'test', label: 'Test', steps, command: steps.map(s => s.join(' ')).join(' && '),
    needs_root: false, runnable: true, available: true, recommended: true, note: '', ...extra,
  }
}

const okReport = { ok: true, status: 'ok', summary: 'Ready', kicad: { cli: 'x', source: 'path', version: '10.0.7', minimum: '8.0' }, checks: [], install: [], text: 'Ready' } as DoctorReport

async function installer(recheck = async () => okReport) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  return new Installer({ subprocess: () => ctx.subprocess, recheck })
}

describe('ctx.kicad.doctor', () => {
  it('reports every check with a status', async () => {
    const ctx = await boot()
    const report = await ctx.kicad.doctor()
    expect(['ok', 'missing', 'outdated', 'error']).toContain(report.status)
    expect(report.checks.map(c => c.id)).toEqual(expect.arrayContaining(['kicad_cli', 'kicad_version', 'symbol_libraries', 'footprint_libraries', 'python', 'png', 'kipy']))
    expect(report.text.startsWith(report.summary)).toBe(true)
  })

  it('diagnoses a missing Python instead of throwing', async () => {
    const ctx = await boot({ python: 'definitely-not-a-python' })
    const report = await ctx.kicad.doctor()
    expect(report.status).toBe('unavailable')
    expect(report.checks[0]).toMatchObject({ id: 'python', status: 'error' })
    expect(report.checks[0].fix).toMatch(/Python 3\.10/)
    await expect(ctx.kicad.tools()).rejects.toThrow(/Python 3\.10\+ executable "definitely-not-a-python" was not found/)
  })

  it.runIf(posix)('names the install command when a tool runs without KiCad', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'dsh-kicad-nobin-'))
    process.env.PATH = bin
    delete process.env.KICAD_CLI
    const ctx = await boot({ python })
    const result = await ctx.kicad.call('list_nets', { path: join(SIDECAR_DIR, 'tests/fixtures/rc_filter/rc_filter.kicad_sch') })
    expect(result.ok).toBe(false)
    expect(result.text).toMatch(/KiCad is not installed/)
    expect(result.text).toMatch(/kicad\.org\/download/)
    expect(result.text).toMatch(/\/kicad-doctor/)
  })
})

describe('Installer', () => {
  it('refuses plans that need root, even when mislabelled', async () => {
    const inst = await installer()
    expect(needsElevation(option([['sudo', 'dnf', 'install', 'kicad']]))).toBe(true)
    expect(needsElevation(option([['/usr/bin/pkexec', 'x']]))).toBe(true)
    expect(() => inst.start(option([['sudo', 'dnf', 'install', '-y', 'kicad']]))).toThrow(/administrator rights[\s\S]*sudo dnf install -y kicad/)
    expect(() => inst.start(option([['dnf', 'install']], { needs_root: true }))).toThrow(/administrator rights/)
    expect(() => inst.start(option([], { id: 'download', url: 'https://www.kicad.org/download/' }))).toThrow(/cannot run here/)
    expect(inst.job).toBeUndefined()
  })

  it.runIf(posix)('runs the steps in order, keeps the log and re-checks', async () => {
    let rechecks = 0
    const inst = await installer(async () => { rechecks++; return okReport })
    const job = inst.start(option([['sh', '-c', 'echo one; echo warn >&2'], ['sh', '-c', 'printf "a\\rb\\n"; echo two']]))
    expect(job).toMatchObject({ state: 'running', phase: 'installing', steps: 2 })
    expect(() => inst.start(option([['true']]))).toThrow(/already running/)
    const done = await inst.settled()
    expect(done).toMatchObject({ state: 'succeeded', phase: 'done', step: 2, exitCode: 0 })
    expect(done!.log).toEqual(expect.arrayContaining(['$ sh -c echo one; echo warn >&2', 'one', 'warn', 'two']))
    expect(done!.doctor?.status).toBe('ok')
    expect(rechecks).toBe(1)
  })

  it.runIf(posix)('stops at a failing step and can be cancelled', async () => {
    const inst = await installer()
    inst.start(option([['sh', '-c', 'echo boom; exit 4'], ['sh', '-c', 'echo never']]))
    const failed = await inst.settled()
    expect(failed).toMatchObject({ state: 'failed', exitCode: 4, step: 1 })
    expect(failed!.log).not.toContain('never')

    inst.start(option([['sleep', '30']]))
    expect(inst.cancel()).toBe(true)
    const cancelled = await inst.settled()
    expect(cancelled?.state).toBe('cancelled')
    expect(Date.now() - cancelled!.startedAt).toBeLessThan(20_000)
  })
})

describe('optional components', () => {
  it.runIf(posix)('installs what a check offers (Freerouting) although KiCad is ready, then has nothing left to do', async () => {
    const ctx = await boot({ python })
    const freerouting = option([['sh', '-c', 'echo downloaded freerouting']], { id: 'freerouting', label: 'Freerouting 2.5.0' })
    let installed = false
    ctx.kicad.doctor = async () => ({
      ...okReport,
      checks: [installed
        ? { id: 'freerouting', label: 'Freerouting', status: 'ok', required: false, summary: 'Freerouting 2.5.0: /data/freerouting-2.5.0.jar.' }
        : { id: 'freerouting', label: 'Freerouting', status: 'warn', required: false, summary: 'Freerouting is not installed.', install: [freerouting] }],
    })
    const job = await ctx.kicad.install('freerouting')
    expect(job.command).toBe(freerouting.command)
    const done = await ctx.kicad.installer.settled()
    expect(done).toMatchObject({ state: 'succeeded', phase: 'done' })
    expect(done!.log).toContain('downloaded freerouting')
    installed = true
    await expect(ctx.kicad.install('freerouting')).rejects.toThrow(/Freerouting 2\.5\.0: \/data\/freerouting-2\.5\.0\.jar\. Nothing to install/)
    await expect(ctx.kicad.install('flatpak')).rejects.toThrow(/already installed and usable/)
  })

  it('refuses an optional plan that needs root', async () => {
    const ctx = await boot({ python })
    const java = option([['sudo', 'dnf', 'install', '-y', 'java-25-openjdk-headless']], { id: 'java', needs_root: true, runnable: false })
    ctx.kicad.doctor = async () => ({ ...okReport, checks: [{ id: 'java', label: 'Java', status: 'warn', required: false, summary: 'Java was not found.', install: [java] }] })
    await expect(ctx.kicad.install('java')).rejects.toThrow(/administrator rights[\s\S]*sudo dnf install -y java-25-openjdk-headless/)
  })
})

describe.runIf(process.platform === 'linux')('install → re-check without restarting dsh', () => {
  it('installs through a (fake) Flatpak and then finds kicad-cli inside it', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'dsh-kicad-flatpak-'))
    const marker = join(bin, 'installed')
    writeFileSync(join(bin, 'flatpak'), `#!/bin/sh
case "$1" in
  remote-add) echo "remote flathub added";;
  install) echo "Installing org.kicad.KiCad"; : > "${marker}"; echo "Installation complete.";;
  info) [ -f "${marker}" ] && [ "$2" = org.kicad.KiCad ] && exit 0; exit 1;;
  run) while [ $# -gt 0 ] && [ "$1" != org.kicad.KiCad ]; do shift; done; shift
       if [ -x /usr/bin/kicad-cli ]; then exec /usr/bin/kicad-cli "$@"; fi
       [ "$1" = version ] && echo 10.0.7;;
esac
`)
    chmodSync(join(bin, 'flatpak'), 0o755)
    process.env.PATH = bin
    delete process.env.KICAD_CLI
    const ctx = await boot({ python })

    const before = await ctx.kicad.doctor()
    expect(before.status).toBe('missing')
    const flatpak = before.install.find(o => o.id === 'flatpak')!
    expect(flatpak).toMatchObject({ runnable: true, needs_root: false, recommended: true })
    await expect(ctx.kicad.install('dnf')).rejects.toThrow(/administrator rights|unknown install option/)

    const job = await ctx.kicad.install('flatpak')
    expect(job.command).toContain('flatpak install --user')
    const done = await ctx.kicad.installer.settled()
    expect(done).toMatchObject({ state: 'succeeded', phase: 'done' })
    expect(done!.log).toEqual(expect.arrayContaining(['Installation complete.']))
    expect(done!.doctor?.kicad.source).toBe('flatpak')
    expect(done!.doctor?.checks.find(c => c.id === 'kicad_version')?.status).toBe('ok')

    // The same bridge (no dsh restart) now runs kicad-cli through Flatpak.
    const env = await ctx.kicad.run<{ kicad_cli: string, kicad_cli_source: string }>('environment', {})
    expect(env.kicad_cli_source).toBe('flatpak')
    expect(env.kicad_cli).toContain('--command=kicad-cli')
    await expect(ctx.kicad.install('flatpak')).rejects.toThrow(/already installed/)
  })
})
