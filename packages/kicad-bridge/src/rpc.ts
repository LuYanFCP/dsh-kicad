/**
 * Minimal MCP (JSON-RPC 2.0, newline-delimited) client over a pair of streams.
 * Transport-agnostic so it can be tested against any duplex pair.
 */
import type { Readable, Writable } from 'node:stream'

/** One `tools/call` outcome as the sidecar reports it. */
export interface ToolCallResult {
  content: Array<{ type: string, text?: string }>
  structuredContent?: unknown
  isError: boolean
}

export interface ToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean, destructiveHint?: boolean }
}

/** One MCP `notifications/progress` from a long call (autoroute: one per routing pass). */
export interface Progress {
  progress: number
  total?: number
  message?: string
}

export interface CallOptions {
  /** Upper bound for this call instead of the client's default. */
  timeoutMs?: number
  /** Receives the call's progress notifications. */
  onProgress?: (progress: Progress) => void
}

export class RpcError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message)
    this.name = 'RpcError'
  }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  cleanup: () => void
}

export class McpClient {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly progress = new Map<string, (progress: Progress) => void>()
  private buffer = ''
  private closedError: Error | undefined

  constructor(private readonly input: Writable, output: Readable, private readonly timeoutMs = 300_000) {
    output.setEncoding('utf8')
    output.on('data', (chunk: string) => this.onData(chunk))
    output.on('end', () => this.close(new RpcError('sidecar closed its output')))
    output.on('error', error => this.close(error))
  }

  /** Perform the MCP handshake and return the server info. */
  async initialize(signal?: AbortSignal): Promise<{ serverInfo: { name: string, version: string }, instructions?: string }> {
    const result = await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dsh-kicad-bridge', version: '0.1.0' },
    }, signal) as { serverInfo: { name: string, version: string }, instructions?: string }
    this.notify('notifications/initialized')
    return result
  }

  async listTools(signal?: AbortSignal): Promise<ToolInfo[]> {
    const result = await this.request('tools/list', {}, signal) as { tools: ToolInfo[] }
    return result.tools
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal, options: CallOptions = {}): Promise<ToolCallResult> {
    const token = options.onProgress ? `p${this.nextId}` : undefined
    if (token) this.progress.set(token, options.onProgress!)
    try {
      const params = { name, arguments: args, ...(token ? { _meta: { progressToken: token } } : {}) }
      return await this.request('tools/call', params, signal, options.timeoutMs) as ToolCallResult
    } finally {
      if (token) this.progress.delete(token)
    }
  }

  notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) })
  }

  request(method: string, params: unknown, signal?: AbortSignal, timeoutMs = this.timeoutMs): Promise<unknown> {
    if (this.closedError) return Promise.reject(this.closedError)
    if (signal?.aborted) return Promise.reject(signal.reason ?? new RpcError('aborted'))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Tell the sidecar too, so a long call (autoroute) stops instead of running on unseen.
        this.notify('notifications/cancelled', { requestId: id, reason: 'timeout' })
        this.settle(id)?.reject(new RpcError(`sidecar did not answer ${method} within ${timeoutMs} ms`))
      }, timeoutMs)
      const onAbort = (): void => {
        this.notify('notifications/cancelled', { requestId: id, reason: 'aborted' })
        this.settle(id)?.reject(signal?.reason instanceof Error ? signal.reason : new RpcError('aborted'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(id, {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer)
          signal?.removeEventListener('abort', onAbort)
        },
      })
      try {
        this.write({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        this.settle(id)?.reject(error as Error)
      }
    })
  }

  /** Reject everything in flight; later requests fail immediately. */
  close(error: Error = new RpcError('client closed')): void {
    if (this.closedError) return
    this.closedError = error
    for (const id of [...this.pending.keys()]) this.settle(id)?.reject(error)
  }

  get closed(): boolean {
    return this.closedError !== undefined
  }

  private settle(id: number): Pending | undefined {
    const entry = this.pending.get(id)
    if (!entry) return undefined
    this.pending.delete(id)
    entry.cleanup()
    return entry
  }

  private write(message: unknown): void {
    this.input.write(JSON.stringify(message) + '\n')
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let newline: number
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line) this.onMessage(line)
    }
  }

  private onMessage(line: string): void {
    let message: { id?: number, method?: string, params?: unknown, result?: unknown, error?: { code: number, message: string } }
    try {
      message = JSON.parse(line)
    } catch {
      return // stray non-protocol output; the sidecar logs to stderr
    }
    if (message.method === 'notifications/progress') {
      const { progressToken, ...progress } = (message.params ?? {}) as Progress & { progressToken?: string }
      if (progressToken !== undefined) this.progress.get(String(progressToken))?.(progress)
      return
    }
    if (typeof message.id !== 'number') return
    const entry = this.settle(message.id)
    if (!entry) return
    if (message.error) entry.reject(new RpcError(message.error.message, message.error.code))
    else entry.resolve(message.result)
  }
}
