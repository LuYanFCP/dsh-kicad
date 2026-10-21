/**
 * Validate market/index.json with dsh's own validator. Needs an installed dsh:
 *   node market/validate.mjs [path/to/node_modules/@deepseek-ai/dsh-plugin-market-index]
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const where = process.argv[2] ?? createRequire(import.meta.url).resolve('@deepseek-ai/dsh-plugin-market-index')
const mod = await import(where.endsWith('.js') ? pathToFileURL(where).href : pathToFileURL(`${where}/lib/index.js`).href)
const index = JSON.parse(readFileSync(new URL('./index.json', import.meta.url), 'utf8'))
const parsed = mod.parseMarketIndex(index, 'https://luyanfcp.github.io/dsh-kicad/index.json')
for (const plugin of parsed.plugins) {
  for (const version of plugin.versions) console.log(plugin.name, version.version, '→', JSON.stringify(mod.marketInstallTarget(plugin.name, version)))
}
console.log('index OK:', parsed.plugins.length, 'plugin(s)')
