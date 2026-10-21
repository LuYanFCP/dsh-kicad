import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { McpClient, type Progress } from '../src/rpc.ts'

/** A client wired to in-memory streams: `sent` holds what it wrote, `reply` feeds it the sidecar's lines. */
function wire() {
  const toServer = new PassThrough()
  const toClient = new PassThrough()
  const client = new McpClient(toServer, toClient, 5_000)
  const sent: Array<{ id?: number, method?: string, params?: Record<string, any> }> = []
  toServer.setEncoding('utf8')
  toServer.on('data', (chunk: string) => chunk.split('\n').filter(Boolean).forEach(line => sent.push(JSON.parse(line))))
  const reply = (message: unknown): void => { toClient.write(JSON.stringify(message) + '\n') }
  return { client, sent, reply }
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 10))

describe('McpClient', () => {
  it('hands progress notifications to the call that asked for them', async () => {
    const { client, sent, reply } = wire()
    const seen: Progress[] = []
    const call = client.callTool('autoroute', { pcb: 'b.kicad_pcb' }, undefined, { onProgress: p => seen.push(p) })
    await tick()
    const request = sent[0]!
    const token = request.params!._meta.progressToken
    expect(request).toMatchObject({ method: 'tools/call', params: { name: 'autoroute', arguments: { pcb: 'b.kicad_pcb' } } })
    reply({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: 1, total: 5, message: 'routing pass 1: 3 unrouted' } })
    reply({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: 'someone-else', progress: 9 } })
    reply({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: 'ok' }], isError: false } })
    expect((await call).isError).toBe(false)
    expect(seen).toEqual([{ progress: 1, total: 5, message: 'routing pass 1: 3 unrouted' }])
  })

  it('calls without a progress listener carry no progress token', async () => {
    const { client, sent, reply } = wire()
    const call = client.callTool('drc', { path: 'b' })
    await tick()
    expect(sent[0]!.params!._meta).toBeUndefined()
    reply({ jsonrpc: '2.0', id: sent[0]!.id, result: { content: [], isError: false } })
    await call
  })

  it('a per-call timeout, like an abort, cancels the request in the sidecar', async () => {
    const { client, sent } = wire()
    await expect(client.callTool('autoroute', {}, undefined, { timeoutMs: 50 })).rejects.toThrow(/did not answer tools\/call within 50 ms/)
    await tick()
    expect(sent.at(-1)).toMatchObject({ method: 'notifications/cancelled', params: { requestId: sent[0]!.id, reason: 'timeout' } })
    const controller = new AbortController()
    const pending = client.callTool('autoroute', {}, controller.signal)
    await tick()
    controller.abort()
    await expect(pending).rejects.toThrow()
    await tick()
    expect(sent.at(-1)).toMatchObject({ method: 'notifications/cancelled', params: { requestId: sent.at(-2)!.id, reason: 'aborted' } })
  })
})
