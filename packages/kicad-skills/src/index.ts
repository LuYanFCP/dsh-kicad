/**
 * dsh-kicad-skills: packaged KiCad skills (through `ctx.skills`) and human
 * commands (through `ctx.commands`). Both are optional: each half mounts only
 * when its registry exists in the composition.
 */
import { createCommands } from './commands.ts'
import type { Context } from './dsh.ts'
import { createSkillProvider } from './skills.ts'

export { createCommands, designRequest, fabArgs, fabCommand, flags, formatBom, formatDoctor, formatJob, formatPlan, installCommand, targetFile } from './commands.ts'
export type { FabArgs } from './commands.ts'
export { createSkillProvider, parseSkill, PROVIDER, SKILLS_DIR } from './skills.ts'

export const name = 'dsh-kicad-skills'
export const inject = ['kicad']

export interface Config {
  skills?: boolean
  commands?: boolean
}

export function apply(ctx: Context, config: Config = {}): void {
  if (config.skills !== false) {
    ctx.inject(['skills'], (ctx) => {
      const provider = createSkillProvider()
      ctx.effect(() => ctx.skills.registerProvider(() => provider), 'kicad skills')
    })
  }
  if (config.commands !== false) {
    ctx.inject(['commands'], (ctx) => {
      for (const command of createCommands(ctx)) ctx.effect(() => ctx.commands.register(command), `kicad /${command.name}`)
    })
  }
}
