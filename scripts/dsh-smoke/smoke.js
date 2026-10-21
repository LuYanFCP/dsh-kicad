/**
 * Keyless smoke test inside a real dsh process (no model needed). Mount with
 *   dsh --profile <p> --patch scripts/dsh-smoke/smoke.patch.yml
 * from a directory containing a KiCad project. Writes a JSON report to
 * $DSH_KICAD_SMOKE_OUT (default ./dsh-kicad-smoke.json).
 */
import { writeFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const name = 'dsh-kicad-smoke'
export const inject = ['tools', 'kicad']

export function apply(ctx) {
  const out = process.env.DSH_KICAD_SMOKE_OUT ?? resolve('dsh-kicad-smoke.json')
  const report = { cwd: process.cwd(), steps: [] }
  const step = (name, data) => { report.steps.push({ name, ...data }) }
  let n = 0
  const run = async (tool, args) => {
    const r = await ctx.tools.execute({ callId: `smoke-${++n}`, name: tool, arguments: args, signal: AbortSignal.timeout(120000) })
    return { isError: r.isError === true, text: r.content.map(b => b.text ?? `[${b.type}]`).join('\n').slice(0, 1500) }
  }
  setTimeout(async () => {
    try {
      const sch = readdirSync(process.cwd()).find(f => f.endsWith('.kicad_sch'))
      const path = join(process.cwd(), sch)
      step('kicad tools registered', { tools: ctx.tools.schemas().map(s => s.name).filter(x => x.startsWith('kicad_')) })
      step('environment', await ctx.kicad.run('environment', {}).then(v => ({ value: v })))
      step('kicad_read_schematic', await run('kicad_read_schematic', { path, include_components: false }))
      step('kicad_erc (before)', await run('kicad_erc', { path }))
      step('kicad_edit_schematic (policy ask, no agent)', await run('kicad_edit_schematic', { path, operations: [{ op: 'no_connect_pin', pin: 'R1:2' }] }))
      step('kicad_edit_schematic outside workspace', await run('kicad_edit_schematic', { path: '/tmp/elsewhere.kicad_sch', operations: [{ op: 'no_connect_pin', pin: 'R1:2' }] }))
      step('kicad_render', await run('kicad_render', { path }))
      const skills = ctx.get('skills')
      if (skills) step('skills', { names: (await skills.list({ cwd: process.cwd() })).map(s => s.name).filter(x => x.startsWith('kicad-')) })
    } catch (error) {
      step('error', { message: String(error?.stack ?? error) })
    }
    writeFileSync(out, JSON.stringify(report, null, 1))
  }, 1500)
}
