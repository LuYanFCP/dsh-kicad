#!/usr/bin/env node
/**
 * Build a dsh Web Client module for a package outside the dsh repository.
 *
 * dsh's own `clientBundle` tsdown preset is not published, so this reproduces
 * its artifact contract: one script that calls
 *   window.__ModuleLoader__.load({ id: <package name>, factory(require) { ... return module.exports } })
 * where `require` resolves only the shell's frozen platform modules
 * (react, react/jsx-runtime, react-dom, @deepseek-ai/cordis, ...). Everything
 * else is bundled. Usage (from a package directory):
 *   node ../../scripts/build-client.mjs [entry=src/client/index.tsx] [out=lib/client.js]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { build } from 'esbuild'

// Mirror of dsh's PLATFORM_MODULES (packages/client/web/src/platform.ts, dsh 0.2.x).
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  'zod', '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
]

export async function buildClient({ cwd = process.cwd(), entry = 'src/client/index.tsx', out = 'lib/client.js', minify = false, id } = {}) {
  const pkg = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'))
  const result = await build({
    absWorkingDir: cwd,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    minify,
    legalComments: 'none',
    external: PLATFORM_MODULES,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
  })
  const body = result.outputFiles[0].text
  const artifact = `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(id ?? pkg.name)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n${body}\n\t\treturn module.exports;\n\t}\n});\n`
  const target = resolve(cwd, out)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, artifact)
  return { target, bytes: artifact.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [entry, out] = process.argv.slice(2)
  const { target, bytes } = await buildClient({ entry, out })
  console.log(`client module → ${target} (${bytes} bytes)`)
}
