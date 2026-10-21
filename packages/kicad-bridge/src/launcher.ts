/** Compute how to start the Python sidecar. Pure, so it is unit-testable. */
import { join } from 'node:path'

export type LauncherKind = 'python' | 'uv'

export interface LaunchOptions {
  launcher: LauncherKind
  /** Resolved interpreter (python mode) or uv executable (uv mode). */
  executable: string
  sidecarDir: string
  kicadCli?: string
  /** Java and Freerouting for the autorouter (empty: the sidecar searches). */
  java?: string
  freerouting?: string
  /** Optional extras installed by uv (`png`, `ipc`). */
  extras?: readonly string[]
  platform?: NodeJS.Platform
}

export interface LaunchSpec {
  argv: string[]
  env: Record<string, string>
}

export function defaultPython(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'python' : 'python3'
}

export function launchSpec(options: LaunchOptions): LaunchSpec {
  const tail = [
    '-m', 'dsh_kicad_sidecar',
    ...(options.kicadCli ? ['--kicad-cli', options.kicadCli] : []),
    ...(options.java ? ['--java', options.java] : []),
    ...(options.freerouting ? ['--freerouting', options.freerouting] : []),
  ]
  const env: Record<string, string> = { PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', PYTHONDONTWRITEBYTECODE: '1' }
  if (options.launcher === 'uv') {
    const extras = (options.extras ?? []).flatMap(extra => ['--extra', extra])
    return { argv: [options.executable, 'run', '--quiet', '--project', options.sidecarDir, ...extras, 'python', ...tail], env }
  }
  // The sidecar core is stdlib-only: put its sources on the path instead of installing it.
  const sep = (options.platform ?? process.platform) === 'win32' ? ';' : ':'
  env.PYTHONPATH = [join(options.sidecarDir, 'src'), process.env.PYTHONPATH].filter(Boolean).join(sep)
  return { argv: [options.executable, ...tail], env }
}
