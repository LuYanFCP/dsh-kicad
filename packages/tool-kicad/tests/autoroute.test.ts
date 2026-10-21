import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as policy from '../../kicad-policy/src/index.ts'
import * as toolKiCad from '../src/index.ts'
import { formatAutoroute, type AutorouteValue } from '../src/index.ts'
import { bootKiCad, disposeAll, fixtureBoard, hasKiCadCli, runTool, text } from '../../../test/harness.ts'

const saved = { FREEROUTING_JAR: process.env.FREEROUTING_JAR, FAKE_SES: process.env.FAKE_SES, XDG_DATA_HOME: process.env.XDG_DATA_HOME }

afterEach(async () => {
  await disposeAll()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const posix = process.platform !== 'win32'

/** Routes for the rc_board fixture in Freerouting's session format (0.1 µm, Y up): IN and GND, not OUT. */
const SESSION = `(session rc_board.ses (base_design rc_board.dsn)
  (routes (resolution um 10)
    (library_out (padstack "Via[0-1]_600:300_um" (shape (circle F.Cu 6000 0 0)) (shape (circle B.Cu 6000 0 0)) (attach off)))
    (network_out
      (net IN (wire (path F.Cu 2000 1050000 -1124600 1100000 -1100000 1191750 -1100000)))
      (net GND (wire (path F.Cu 2000 1320000 -1172250 1340000 -1172250))
        (via "Via[0-1]_600:300_um" 1340000 -1172250)
        (wire (path B.Cu 2000 1340000 -1172250 1340000 -1250000 1050000 -1250000 1050000 -1175400))))))
`

/** A stand-in for Freerouting (the bridge's freerouting setting may name an executable): writes the session above. */
function fakeFreerouting(): string {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-kicad-fake-freerouting-'))
  const ses = join(dir, 'routes.ses')
  writeFileSync(ses, SESSION)
  const script = join(dir, 'freerouting')
  writeFileSync(script, `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
console.log('INFO   Freerouting v9.9.9 (build-date: 2026-10-05)')
console.log("INFO   Auto-routing pass #1 on board 'b' was completed in 0.1 seconds with score 999 (0 unrouted and 0 violations)")
console.log('INFO   Job x finished with state: COMPLETED')
fs.copyFileSync(process.env.FAKE_SES, args[args.indexOf('-do') + 1])
`)
  chmodSync(script, 0o755)
  process.env.FAKE_SES = ses
  return script
}

const policyConfig = (over: Record<string, unknown>) => ({
  approval: 'allow', restrictToWorkspace: true, extraRoots: [], autoErc: true, autoDrc: true, autoRender: false, guidance: true, projectContext: true, ...over,
})

describe('kicad_autoroute', () => {
  it.runIf(posix && hasKiCadCli())('routes through the sidecar and the policy appends the DRC it already ran', async () => {
    process.env.FREEROUTING_JAR = fakeFreerouting()
    const pcb = fixtureBoard('rc_board')
    const ctx = await bootKiCad([toolKiCad], [policy, policyConfig({ extraRoots: [dirname(pcb)] })])
    const result = await runTool(ctx, 'kicad_autoroute', { pcb, exclude_nets: ['OUT'] })
    expect(result.isError).toBeFalsy()
    const out = text(result)
    expect(out).toMatch(/^Routed .*rc_board\.kicad_pcb with Freerouting 9\.9\.9 in [\d.]+ s: \+6 track segment\(s\), \+1 via\(s\)/)
    expect(out).toContain('Not routed (nets / exclude_nets): OUT.')
    expect(out).toContain('KiCad: 2 unrouted connection(s), 2 DRC error(s).')
    expect(out).toMatch(/Automatic DRC by KiCad .*FAILED — 2 error\(s\), 0 warning\(s\), 2 unrouted/)
    expect(readFileSync(pcb, 'utf8')).toContain('(via\n\t\t(at 134 117.225)')
  })

  it.runIf(posix)('without Freerouting the error says how to install it', async () => {
    process.env.FREEROUTING_JAR = '/nonexistent/freerouting.jar'
    process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), 'dsh-kicad-no-data-'))
    const pcb = fixtureBoard('rc_board')
    const before = readFileSync(pcb, 'utf8')
    const ctx = await bootKiCad([toolKiCad], [policy, policyConfig({ extraRoots: [dirname(pcb)] })])
    const result = await runTool(ctx, 'kicad_autoroute', { pcb })
    expect(result.isError).toBe(true)
    expect(text(result)).toMatch(/kicad_autoroute needs the Freerouting autorouter[\s\S]*\/kicad-install freerouting[\s\S]*never with sudo/)
    expect(readFileSync(pcb, 'utf8')).toBe(before)
  })

  it('is a guarded design write', async () => {
    const ctx = await bootKiCad([toolKiCad], [policy, policyConfig({})])
    const outside = await runTool(ctx, 'kicad_autoroute', { pcb: '/etc/x.kicad_pcb' })
    expect(text(outside)).toMatch(/kicad_autoroute may only write inside the project directory/)
    expect(toolKiCad.DESIGN_WRITE_TOOLS).toContain('kicad_autoroute')
    expect(toolKiCad.PATH_ARGUMENTS.kicad_autoroute).toEqual(['pcb'])
  })
})

describe('formatAutoroute', () => {
  const value: AutorouteValue = {
    pcb: '/p/b.kicad_pcb', written: true, files: ['/p/b.kicad_pcb'],
    nets: { routed: 12, left_out: ['GND'], changed: ['+3V3', '/SCK'] },
    added: { segments: 121, vias: 8, length_mm: 328.9771 }, kept: { tracks: 8, vias: 0 }, zones_filled: true,
    freerouting: { version: '2.5.0', state: 'COMPLETED', passes: 3, optimizer_passes: 2, unrouted_before: 36, unrouted: 0, seconds: 3.2, timed_out: false, command: 'Freerouting 2.5.0', files: '/p/.dsh-kicad/autoroute' },
    unrouted: 0, drc: { kind: 'drc', passed: true, counts: { error: 0, warning: 0, exclusion: 0, total: 0 }, by_type: {}, violations: [] } as never,
    notes: [],
  }

  it('says what was added, what was kept and what KiCad counts', () => {
    expect(formatAutoroute(value).split('\n')).toEqual([
      'Routed /p/b.kicad_pcb with Freerouting 2.5.0 in 3.2 s: +121 track segment(s), +8 via(s), 328.98 mm on 2 net(s).',
      'Router: COMPLETED after 3 routing pass(es) and 2 optimizer pass(es), 36 → 0 unrouted by its count.',
      'Kept as fixed wiring: 8 track(s), 0 via(s) already on the board.',
      'Not routed (nets / exclude_nets): GND.',
      'Copper zones refilled and saved by KiCad.',
      'KiCad: 0 unrouted connection(s), 0 DRC error(s).',
      'Design, session and router log: /p/.dsh-kicad/autoroute',
    ])
  })

  it('reports a run that added nothing', () => {
    const idle = { ...value, written: false, nets: { routed: 3, left_out: [], changed: [] }, kept: { tracks: 0, vias: 0 }, zones_filled: false, notes: ['timed out'] }
    expect(formatAutoroute(idle)).toMatch(/^Freerouting 2\.5\.0 found nothing to add on \/p\/b\.kicad_pcb \(3\.2 s\); the board was not changed\.\n/)
    expect(formatAutoroute(idle)).toContain('\ntimed out\n')
  })
})
