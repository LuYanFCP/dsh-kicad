/** Packaged SKILL.md files exposed through a dsh skill provider. */
import { readdirSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUNDLED_RANK, type SkillCandidate, type SkillProvider } from './dsh.ts'

export const PROVIDER = 'dsh-kicad'
export const SKILLS_DIR = fileURLToPath(new URL('../skills/', import.meta.url))

/** Split `---` frontmatter (simple `key: value` lines) from the body. */
export function parseSkill(raw: string, path: string): { meta: Record<string, string>, content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)
  if (!match) throw new Error(`${path}: missing frontmatter`)
  const meta: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, '')
  }
  if (!meta.name || !meta.description) throw new Error(`${path}: frontmatter needs name and description`)
  return { meta, content: raw.slice(match[0].length).trim() }
}

export function createSkillProvider(dir: string = SKILLS_DIR): SkillProvider {
  const candidates: SkillCandidate[] = readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map((entry) => {
      const path = join(dir, entry.name, 'SKILL.md')
      const { meta } = parseSkill(readFileSync(path, 'utf8'), path)
      return {
        name: meta.name!,
        description: meta.description!,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: PROVIDER,
        source: 'bundled',
        rank: BUNDLED_RANK,
        path,
        resourceBase: { kind: 'directory', path: join(dir, entry.name).split(sep).join('/') },
        locator: path,
      } as SkillCandidate
    })
  return {
    name: PROVIDER,
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate
      const raw = await readFile(locator as string, { encoding: 'utf8', signal: options.signal })
      return { ...summary, content: parseSkill(raw, locator as string).content }
    },
  }
}
