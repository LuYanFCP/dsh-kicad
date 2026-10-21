/** Workspace containment for tool paths, resolving symlinks of the nearest existing ancestor. */
import { realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export function realish(path: string): string {
  let current = resolve(path)
  const rest: string[] = []
  for (;;) {
    try {
      return resolve(realpathSync(current), ...rest.reverse())
    } catch {
      const parent = dirname(current)
      if (parent === current) return resolve(path)
      rest.push(current.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)))
      current = parent
    }
  }
}

export function inside(path: string, root: string): boolean {
  const rel = relative(realish(root), realish(path))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function resolveArg(cwd: string, value: string): string {
  return isAbsolute(value) ? resolve(value) : resolve(cwd, value)
}
