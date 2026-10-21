import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const SIDECAR_DIR = resolve(import.meta.dirname, '../sidecar')
export const FIXTURES = join(SIDECAR_DIR, 'tests/fixtures')

export function hasKiCadCli(): boolean {
  try {
    execFileSync(process.env.KICAD_CLI ?? 'kicad-cli', ['version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Copy a fixture project to a fresh temp dir; returns the .kicad_sch path. */
export function fixtureProject(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-kicad-${name}-`))
  cpSync(join(FIXTURES, name), dir, { recursive: true })
  return join(dir, `${name}.kicad_sch`)
}
