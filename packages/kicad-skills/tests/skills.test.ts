import { dirname } from 'node:path'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { afterEach, describe, expect, it } from 'vitest'
import * as skills from '../src/index.ts'
import { bootKiCad, disposeAll, fixtureProject, hasKiCadCli } from '../../../test/harness.ts'

afterEach(disposeAll)

const invocation = (rawInput: string) => ({ rawInput, signal: new AbortController().signal, attachments: [], agent: undefined, commandId: 'c1' }) as never

describe('kicad skills', () => {
  it('registers packaged skills with the dsh skill registry', async () => {
    const ctx = await bootKiCad([SkillRegistry], [skills, { commands: false }])
    const names = (await ctx.skills.list()).map(s => s.name).filter(n => n.startsWith('kicad-'))
    expect(names).toEqual(['kicad-agent-workflow', 'kicad-erc-triage', 'kicad-schematic-design'])
    const body = await ctx.skills.get('kicad-erc-triage')
    expect(body?.content).toContain('power_pin_not_driven')
    expect(body?.content.startsWith('---')).toBe(false)
  })

  it('keeps every SKILL.md under the 8192-character pruning threshold', async () => {
    const provider = skills.createSkillProvider()
    for (const c of await provider.list({}) as Array<{ name: string }>) {
      const def = await provider.get(c as never, {})
      expect(def?.content.length, c.name).toBeLessThan(8192)
    }
  })
})

describe('kicad commands', () => {
  it('finds the root schematic next to the .kicad_pro', () => {
    const path = fixtureProject('rc_filter')
    expect(skills.targetFile(dirname(path), '', '.kicad_sch')).toBe(path)
    expect(() => skills.targetFile(dirname(path), '', '.kicad_pcb')).toThrow(/no .kicad_pcb file/)
  })

  it.runIf(hasKiCadCli())('/erc and /bom report KiCad results; /drc fails cleanly without a board', async () => {
    const ctx = await bootKiCad()
    const commands = Object.fromEntries(skills.createCommands(ctx).map(c => [c.name, c]))
    const path = fixtureProject('erc_errors')
    const erc = await commands.erc!.handler(invocation(path))
    expect(erc).toMatchObject({ kind: 'success' })
    expect((erc as { text: string }).text).toMatch(/ERC by KiCad .*FAILED — 2 error/)
    const bom = await commands.bom!.handler(invocation(fixtureProject('rc_filter')))
    expect((bom as { text: string }).text).toMatch(/\| R1 \| 10k \|/)
    const drc = await commands.drc!.handler(invocation(`${dirname(path)}/missing.kicad_pcb`))
    expect(drc.kind).toBe('error')
  })

  it('formats an empty BOM', () => {
    expect(skills.formatBom(['Refs'], [])).toBe('BOM is empty.')
  })
})
