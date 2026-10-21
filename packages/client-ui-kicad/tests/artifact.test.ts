// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('client artifact', () => {
  it('registers a factory in the dsh module-loader format', async () => {
    const { buildClient } = await import('../../../scripts/build-client.mjs')
    const { target } = await buildClient({ cwd: resolve(import.meta.dirname, '..') })
    const code = readFileSync(target, 'utf8')
    const loaded: Array<{ id: string, factory: (req: (id: string) => unknown) => Record<string, unknown> }> = []
    const requested: string[] = []
    const nodeRequire = createRequire(import.meta.url)
    new Function('window', code)({ __ModuleLoader__: { load: (entry: never) => loaded.push(entry) } })
    expect(loaded[0]!.id).toBe('dsh-client-ui-kicad')
    const exports = loaded[0]!.factory((id) => { requested.push(id); return nodeRequire(id) })
    expect(typeof exports.apply).toBe('function')
    expect(exports.inject).toEqual(['slots', 'locale', 'sidebarRightTabs', 'remote'])
    expect(new Set(requested)).toEqual(new Set(['react', 'react/jsx-runtime']))
  })
})
