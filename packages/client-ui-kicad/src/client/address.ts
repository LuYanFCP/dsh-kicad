/**
 * The `file` resource address grammar (dsh util/workspace-path), re-implemented
 * because Client plugins must not import dsh packages:
 *   dsh-resource://file/session/<sessionId>/<relative/path>
 *   dsh-resource://file/absolute/<absolute/path without leading slash>
 * Segments are component-encoded; ':' stays literal (Windows drives).
 */

export interface FileAddress {
  scope: 'session' | 'absolute'
  sessionId?: string
  /** Workspace-relative path for session addresses; absolute path otherwise. */
  path: string
}

const PREFIX = 'dsh-resource://file/'

export function parseFileAddress(address: string): FileAddress | undefined {
  if (!address.startsWith(PREFIX)) return undefined
  const rest = address.slice(PREFIX.length).split('?')[0]!.split('#')[0]!
  const parts = rest.split('/').map(decodeURIComponent)
  if (parts[0] === 'session' && parts.length >= 3 && parts[1]) {
    return { scope: 'session', sessionId: parts[1], path: parts.slice(2).join('/') }
  }
  if (parts[0] === 'absolute' && parts.length >= 2) {
    const joined = parts.slice(1).join('/')
    return { scope: 'absolute', path: /^[A-Za-z]:/.test(joined) ? joined : `/${joined}` }
  }
  return undefined
}

const enc = (segment: string): string => encodeURIComponent(segment).replace(/%3A/gi, ':')

export function sessionFileAddress(sessionId: string, relativePath: string): string {
  return `${PREFIX}session/${enc(sessionId)}/${relativePath.split('/').filter(Boolean).map(enc).join('/')}`
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function stem(path: string): string {
  return basename(path).replace(/\.kicad_(sch|pcb)$/, '')
}

/** Where kicad-cli renders land (same convention as the sidecar's `render` tool). */
export function renderDir(designPath: string): string {
  const dir = dirname(designPath)
  return `${dir ? `${dir}/` : ''}.dsh-kicad/render/${stem(designPath)}`
}

/** Order rendered pages: the root sheet (<stem>.svg) first, then the rest by name. */
export function orderPages(designPath: string, names: string[]): string[] {
  const root = `${stem(designPath)}.svg`
  return names.filter(n => n.endsWith('.svg')).sort((a, b) => (a === root ? -1 : b === root ? 1 : a.localeCompare(b)))
}

export function isDesignFile(path: string): boolean {
  return /\.kicad_(sch|pcb)$/i.test(path)
}
