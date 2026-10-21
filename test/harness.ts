/** Shared test harness: a real Cordis Context with dsh's tool pipeline and the KiCad bridge. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KiCadBridge from '../packages/kicad-bridge/src/index.ts'

export const SIDECAR_DIR = resolve(import.meta.dirname, '../packages/kicad-bridge/sidecar')
export const FIXTURES = join(SIDECAR_DIR, 'tests/fixtures')

export function hasKiCadCli(): boolean {
  try {
    execFileSync(process.env.KICAD_CLI ?? 'kicad-cli', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Copy a fixture project into a fresh temp dir; returns the .kicad_sch path. */
export function fixtureProject(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-kicad-${name}-`))
  cpSync(join(FIXTURES, name), dir, { recursive: true })
  return join(dir, `${name}.kicad_sch`)
}

/** Copy a fixture board project into a fresh temp dir; returns the .kicad_pcb path. */
export function fixtureBoard(name: string): string {
  return fixtureProject(name).replace(/\.kicad_sch$/, '.kicad_pcb')
}

/** Copy a KiCad demo project (e.g. pic_programmer) into a fresh temp dir; undefined when the demos are not installed. */
export function demoProject(name: string): string | undefined {
  const src = join(process.env.KICAD_DEMOS ?? '/usr/share/kicad/demos', name)
  if (!existsSync(src)) return undefined
  const dir = mkdtempSync(join(tmpdir(), `dsh-kicad-${name}-`))
  cpSync(src, dir, { recursive: true })
  return dir
}

/** Remove one track of net D1-K from the pic_programmer demo board: KiCad then reports one unrouted connection. */
export function unrouteOneTrack(pcb: string): void {
  const board = readFileSync(pcb, 'utf8')
  const segment = /\n\t\(segment\n(?:\t\t.*\n)*?\t\t\(net "Net-\(D1-K\)"\)\n(?:\t\t.*\n)*?\t\)/.exec(board)
  if (!segment) throw new Error(`no Net-(D1-K) track in ${pcb}`)
  writeFileSync(pcb, board.slice(0, segment.index) + board.slice(segment.index + segment[0].length))
}

const live: Context[] = []

export async function bootKiCad(...plugins: Array<[unknown, unknown?]>): Promise<Context> {
  const ctx = new Context()
  live.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, {})
  await ctx.plugin(KiCadBridge, { sidecarDir: SIDECAR_DIR })
  for (const [plugin, config] of plugins) await ctx.plugin(plugin as never, (config ?? {}) as never)
  return ctx
}

export async function disposeAll(): Promise<void> {
  for (const ctx of live.splice(0)) await ctx.kicad?.stop()
}

let calls = 0
export async function runTool(ctx: Context, name: string, args: unknown, extra: Record<string, unknown> = {}) {
  return await ctx.tools.execute({
    callId: `test-${++calls}` as never,
    name,
    arguments: args,
    signal: new AbortController().signal,
    ...extra,
  } as never)
}

export function text(result: { content: ReadonlyArray<{ type: string, text?: string }> }): string {
  return result.content.map(b => b.text ?? '').join('\n')
}
