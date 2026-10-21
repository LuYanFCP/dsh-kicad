/** Lazy loader for the vendored KiCanvas web components. */
let loading: Promise<void> | undefined

export function loadKiCanvas(): Promise<void> {
  // esbuild inlines this dynamic import into client.js and evaluates it on first use.
  loading ??= import('../../vendor/kicanvas/kicanvas.js').then(() => undefined)
  return loading
}

export interface SourceFile { name: string, text: string }

/** Build a <kicanvas-embed> holding the given files as inline sources (main design first). */
export function createEmbed(files: SourceFile[], theme: string): HTMLElement {
  const embed = document.createElement('kicanvas-embed')
  embed.setAttribute('controls', 'full')
  embed.setAttribute('theme', theme)
  embed.style.display = 'block'
  embed.style.width = '100%'
  embed.style.height = '100%'
  for (const file of files) {
    const source = document.createElement('kicanvas-source')
    source.setAttribute('name', file.name)
    source.textContent = file.text
    embed.append(source)
  }
  return embed
}

const MAX_SHEETS = 64
const MAX_BYTES = 16 * 1024 * 1024

/**
 * Which files the viewer needs: a board alone (plus the project), or every
 * schematic in the design's directory so hierarchical sheets resolve.
 */
export function pickFiles(designName: string, entries: Array<{ name: string, type: string, size?: number }>): string[] {
  const files = entries.filter(e => e.type === 'file' && (e.size ?? 0) <= MAX_BYTES).map(e => e.name)
  const project = files.filter(n => n.endsWith('.kicad_pro'))
  if (designName.endsWith('.kicad_pcb')) return [designName, ...project]
  const sheets = files.filter(n => n.endsWith('.kicad_sch') && n !== designName).sort().slice(0, MAX_SHEETS - 1)
  return [designName, ...sheets, ...project]
}
