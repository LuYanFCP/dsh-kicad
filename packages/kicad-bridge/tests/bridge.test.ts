import { Context } from '@deepseek-ai/cordis'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, describe, expect, it } from 'vitest'
import KiCadBridge from '../src/index.ts'
import { fixtureProject, hasKiCadCli, SIDECAR_DIR } from './helpers.ts'

const contexts: Context[] = []

async function boot(config: Record<string, unknown> = {}): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(KiCadBridge, { sidecarDir: SIDECAR_DIR, ...config })
  return ctx
}

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.kicad?.stop()
})

describe('ctx.kicad', () => {
  it('starts the sidecar lazily and lists its tools', async () => {
    const ctx = await boot()
    const names = (await ctx.kicad.tools()).map(t => t.name)
    expect(names).toContain('edit_schematic')
    const env = await ctx.kicad.run<{ sidecar_version: string }>('environment', {})
    expect(env.sidecar_version).toBe('0.1.0')
  })

  it('returns structured values and domain errors', async () => {
    const ctx = await boot()
    const path = fixtureProject('rc_filter')
    const summary = await ctx.kicad.run<{ components: Array<{ reference: string }> }>('read_schematic', { path })
    expect(summary.components.map(c => c.reference)).toEqual(['C1', 'J1', 'R1'])
    const missing = await ctx.kicad.call('read_schematic', { path: '/nonexistent/x.kicad_sch' })
    expect(missing.ok).toBe(false)
    expect(missing.text).toMatch(/does not exist/)
  })

  it('restarts after the sidecar dies', async () => {
    const ctx = await boot()
    await ctx.kicad.tools()
    // Simulate a crash by stopping the process behind the service's back.
    const running = await (ctx.kicad as unknown as { running: Promise<{ handle: { terminate(): void, done: Promise<unknown> } }> }).running
    running.handle.terminate()
    await running.handle.done.catch(() => undefined)
    const env = await ctx.kicad.run<{ sidecar_version: string }>('environment', {})
    expect(env.sidecar_version).toBe('0.1.0')
  })

  it.runIf(hasKiCadCli())('runs KiCad ERC through the sidecar', async () => {
    const ctx = await boot()
    const erc = await ctx.kicad.run<{ passed: boolean, by_type: Record<string, number> }>('erc', { path: fixtureProject('erc_errors') })
    expect(erc.passed).toBe(false)
    expect(erc.by_type.pin_not_connected).toBe(2)
  })

  it('reports a missing interpreter clearly', async () => {
    const ctx = await boot({ python: 'definitely-not-a-python' })
    await expect(ctx.kicad.tools()).rejects.toThrow()
  })
})
