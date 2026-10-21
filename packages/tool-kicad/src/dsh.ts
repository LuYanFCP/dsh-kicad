/**
 * Every dsh / Cordis API this package uses, in one place. When dsh changes an
 * interface, adapt it here.
 */
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type {} from 'dsh-kicad-bridge'

export { defineTool } from '@deepseek-ai/dsh-tools'
export type { ToolDefinition, ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools'
export type { Context }

import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Content blocks returned to the model. */
export type Block = ContentBlock

/** Wrap a stored image reference (plain JSON after the canonical value round-trip) as an image block. */
export function imageBlock(ref: ImageRef): Block {
  return { type: 'image', attachment: ref } as unknown as Block
}

export interface ImageRef {
  attachmentId: string
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
  bytes: number
  width: number
  height: number
  name?: string
  originalDimensions?: { width: number, height: number }
}

interface WorkingDirectoryLike { get(session: unknown): string }
interface AttachmentsLike {
  saveImage(input: { data: Uint8Array, mediaType: 'image/png', name?: string }): Promise<ImageRef>
}
interface LlmLike {
  resolveModelInfo(provider: string, model: string, signal?: AbortSignal): Promise<{ inputModalities?: readonly string[] }>
}
interface AgentLike {
  session: { requestHeader?(): { config?: { provider?: string, model?: string } } | undefined }
  options?: { provider?: string, model?: string }
}

/** The session's working directory, or the process cwd outside a session. */
export function sessionCwd(ctx: Context, exec: Pick<ToolExecution, 'agent'>): string {
  const wd = ctx.get('workingDirectory' as never) as WorkingDirectoryLike | undefined
  const agent = exec.agent as unknown as AgentLike | undefined
  if (wd && agent) {
    try {
      return wd.get(agent.session)
    } catch {
      // fall through
    }
  }
  return process.cwd()
}

export function resolveIn(cwd: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path)
}

/** Whether the calling agent's current model accepts image input (same rule as dsh's read_image). */
export async function imageCapable(ctx: Context, exec: Pick<ToolExecution, 'agent' | 'signal'>): Promise<boolean> {
  const agent = exec.agent as unknown as AgentLike | undefined
  const llm = ctx.get('llm' as never) as LlmLike | undefined
  if (!agent || !llm) return false
  const routed = agent.session.requestHeader?.()?.config
  const provider = routed?.provider ?? agent.options?.provider
  const model = routed?.model ?? agent.options?.model
  if (!provider || !model) return false
  try {
    const info = await llm.resolveModelInfo(provider, model, exec.signal)
    return info.inputModalities?.includes('image') ?? false
  } catch {
    return false
  }
}

export function attachments(ctx: Context): AttachmentsLike | undefined {
  return ctx.get('attachments' as never) as AttachmentsLike | undefined
}
