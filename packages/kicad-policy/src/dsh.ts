/** Every dsh / Cordis API this package relies on. Adapt here when dsh changes. */
import type { Context } from '@deepseek-ai/cordis'
import type { PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from 'dsh-kicad-bridge'

export { default as z } from '@deepseek-ai/schemastery'
export type { Volatile } from '@deepseek-ai/cordis'
export type { Context, PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult }

interface WorkingDirectoryLike { get(session: unknown): string }

/** The calling agent's working directory, when one is known. */
export function agentCwd(ctx: Context, agent: unknown): string | undefined {
  const wd = ctx.get('workingDirectory' as never) as WorkingDirectoryLike | undefined
  const session = (agent as { session?: unknown } | undefined)?.session
  if (!wd || !session) return undefined
  try {
    return wd.get(session)
  } catch {
    return undefined
  }
}

/** `AssembleContext.agent` is merged in by dsh-agent; read it defensively. */
export function assemblyAgent(context: unknown): unknown {
  return (context as { agent?: unknown } | undefined)?.agent
}

interface ApprovalLike { effectivePolicy(session: unknown): 'ask' | 'never' }
interface SandboxPolicyLike { resolve(request?: { session?: unknown }): { mode: 'read-only' | 'workspace-write' | 'danger-full-access' } }

/** The session's dsh permission knobs (approval policy, sandbox mode), when those services exist. */
export function sessionPermissions(ctx: Context, agent: unknown): { approval?: 'ask' | 'never', sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access' } {
  const session = (agent as { session?: unknown } | undefined)?.session
  if (!session) return {}
  const out: { approval?: 'ask' | 'never', sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access' } = {}
  try {
    out.approval = (ctx.get('approval' as never) as ApprovalLike | undefined)?.effectivePolicy(session)
  } catch {
    // no approval service or no policy for this session
  }
  try {
    out.sandbox = (ctx.get('sandboxPolicy' as never) as SandboxPolicyLike | undefined)?.resolve({ session }).mode
  } catch {
    // no sandbox policy service
  }
  return out
}
