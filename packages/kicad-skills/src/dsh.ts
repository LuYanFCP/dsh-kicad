/** Every dsh / Cordis API this package relies on. Adapt here when dsh changes. */
import type { Context } from '@deepseek-ai/cordis'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SkillCandidate, SkillProvider } from '@deepseek-ai/dsh-skill'
import type {} from 'dsh-kicad-bridge'

export type { CommandDefinition, CommandInvocation, CommandResult, Context, SkillCandidate, SkillProvider }

/** dsh-skill's `BUNDLED_SKILL_RANK`: packaged skills lose to project and user skills of the same name. */
export const BUNDLED_RANK = 600

interface WorkingDirectoryLike { get(session: unknown): string }

export function agentCwd(ctx: Context, agent: unknown): string {
  const wd = ctx.get('workingDirectory' as never) as WorkingDirectoryLike | undefined
  const session = (agent as { session?: unknown } | undefined)?.session
  try {
    if (wd && session) return wd.get(session)
  } catch {
    // fall through
  }
  return process.cwd()
}

/** Queue a user-authored follow-up turn on the invoking agent (as `/plan <message>` does). */
export function followup(agent: unknown, text: string): void {
  const target = agent as { followup?(message: unknown): void } | undefined
  if (!target?.followup) throw new Error('this command needs a running session')
  target.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
}
