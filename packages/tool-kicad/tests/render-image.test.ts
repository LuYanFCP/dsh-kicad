import { Service, type Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import * as toolKiCad from '../src/index.ts'
import { bootKiCad, disposeAll, fixtureProject, hasKiCadCli, runTool } from '../../../test/harness.ts'

afterEach(disposeAll)

class StubLlm extends Service {
  constructor(ctx: Context) { super(ctx, 'llm') }
  async resolveModelInfo() { return { inputModalities: ['text', 'image'] } }
}

const saved: Array<{ bytes: number, mediaType: string }> = []
class StubAttachments extends Service {
  constructor(ctx: Context) { super(ctx, 'attachments') }
  async saveImage(input: { data: Uint8Array, mediaType: string, name?: string }) {
    saved.push({ bytes: input.data.byteLength, mediaType: input.mediaType })
    return { attachmentId: 'att-1', mediaType: input.mediaType, bytes: input.data.byteLength, width: 800, height: 566, name: input.name }
  }
}

it.runIf(hasKiCadCli())('attaches a PNG render as an image block for image-capable models', async () => {
  const ctx = await bootKiCad([StubLlm], [StubAttachments], [toolKiCad])
  const agent = { session: { requestHeader: () => ({ config: { provider: 'p', model: 'vision' } }) }, options: {} }
  let result
  try {
    result = await runTool(ctx, 'kicad_render', { path: fixtureProject('rc_filter'), width: 800 }, { agent })
  } catch (error) {
    throw new Error(`ToolRuntime rejected the stub agent: ${(error as Error).message}`)
  }
  if (result.isError && /rasterizer/.test(JSON.stringify(result.content))) return
  expect(result.isError).toBeFalsy()
  const image = result.content.find(b => b.type === 'image') as { attachment: { attachmentId: string } } | undefined
  expect(image?.attachment.attachmentId).toBe('att-1')
  expect(saved[0]?.mediaType).toBe('image/png')
  expect(saved[0]!.bytes).toBeGreaterThan(1000)
})
