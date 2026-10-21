/** Host half of the spike: one tool built with the installation's defineTool. */
import { defineTool } from '@deepseek-ai/dsh-tools'
import { writeFileSync } from 'node:fs'

export const name = 'kicad-spike-hello'
export const inject = ['tools']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'kicad_hello',
    description: 'Spike tool: greet from the KiCad bundle.',
    parameters: { who: { type: 'string', required: true, description: 'Who to greet' } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return `Hello ${args.who} from dsh-kicad` },
  }))
  // Drive one call through the real pipeline so the spike is observable without a model.
  const marker = process.env.DSH_KICAD_SPIKE_MARKER
  void ctx.tools.execute({
    callId: 'spike-1', name: 'kicad_hello', arguments: { who: 'spike' },
    signal: new AbortController().signal,
  }).then((result) => {
    const line = `[kicad-spike] ${JSON.stringify(result.content)} isError=${result.isError === true}`
    ctx.logger('kicad-spike').info(line)
    if (marker) writeFileSync(marker, line + '\n')
  })
}
