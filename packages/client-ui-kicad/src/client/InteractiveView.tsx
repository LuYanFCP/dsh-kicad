/**
 * Interactive KiCanvas view of a schematic or board, fed from the session workspace
 * and kept live: every change of the design file loads the new version off-screen,
 * swaps it in once KiCanvas reports `loaded`, and carries the user's pan/zoom over.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { basename, dirname } from './address.ts'
import type { ClientRemote } from './dsh.ts'
import { createEmbed, loadKiCanvas, pickFiles, type SourceFile } from './kicanvas.ts'
import type { KiCadLocaleKey } from './locales.ts'

export interface InteractiveViewProps {
  remote: ClientRemote
  sessionId: string
  designPath: string
  /** Changes when the design file changes on disk; triggers a live reload. */
  version: string | undefined
  theme: string
  tr: (key: KiCadLocaleKey, vars?: Record<string, string | number>) => string
  /** The first load failed: the parent falls back to the SVG view. */
  onFailed: (message: string) => void
}

/** Camera API added to <kicanvas-embed> by scripts/vendor-kicanvas.mjs. */
interface CameraEmbed extends HTMLElement {
  dsh_get_camera?(): { x: number, y: number, zoom: number } | null
  dsh_set_camera?(state: { x: number, y: number, zoom: number }): boolean
}

type Status = 'loading' | 'ready' | 'updating' | 'failed'

const LOAD_TIMEOUT_MS = 20_000

export async function readDesignFiles(remote: ClientRemote, sessionId: string, designPath: string, signal: AbortSignal): Promise<SourceFile[]> {
  const dir = dirname(designPath)
  const listing = await remote.workspaceFiles.list(sessionId, dir || '.', signal)
  if (!listing.ok) throw new Error(listing.error.message)
  const decoder = new TextDecoder()
  const files: SourceFile[] = []
  for (const name of pickFiles(basename(designPath), listing.value.entries)) {
    const read = await remote.workspaceFiles.readBytes(sessionId, dir ? `${dir}/${name}` : name, {}, signal)
    if (!read.ok) {
      if (name === basename(designPath)) throw new Error(read.error.message)
      continue
    }
    files.push({ name, text: decoder.decode(read.value.data) })
  }
  return files
}

function waitLoaded(embed: HTMLElement, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now()
    const poll = (): void => {
      if (signal.aborted) return resolve(false)
      if (embed.hasAttribute('loaded')) return resolve(true)
      // KiCanvas drops `loading` without setting `loaded` when parsing fails.
      if (Date.now() - started > LOAD_TIMEOUT_MS || (!embed.hasAttribute('loading') && Date.now() - started > 3_000)) return resolve(false)
      setTimeout(poll, 200)
    }
    poll()
  })
}

export function InteractiveView(props: InteractiveViewProps): ReactNode {
  const host = useRef<HTMLDivElement>(null)
  const shown = useRef<CameraEmbed | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined)
  const [reloads, setReloads] = useState(0)
  const [stale, setStale] = useState(false)
  const { remote, sessionId, designPath, version, theme, tr, onFailed } = props

  // A different design starts from scratch (no camera to carry over).
  useEffect(() => () => {
    shown.current = null
    host.current?.replaceChildren()
  }, [sessionId, designPath])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    let staged: HTMLElement | undefined
    const first = shown.current === null
    setStatus(first ? 'loading' : 'updating')
    void (async () => {
      const files = await readDesignFiles(remote, sessionId, designPath, signal)
      await loadKiCanvas()
      if (signal.aborted || !host.current) return
      const embed = createEmbed(files, theme) as CameraEmbed
      embed.style.position = 'absolute'
      embed.style.inset = '0'
      embed.style.visibility = 'hidden'
      staged = embed
      host.current.append(embed)
      const ok = await waitLoaded(embed, signal)
      if (signal.aborted) return
      if (!ok) {
        embed.remove()
        if (first) {
          setStatus('failed')
          onFailed(tr('viewer.kicanvasFailed'))
        } else {
          // Keep showing the last good version; a later save usually parses again.
          setStatus('ready')
          setStale(true)
        }
        return
      }
      const camera = shown.current?.dsh_get_camera?.()
      if (camera) embed.dsh_set_camera?.(camera)
      embed.style.visibility = 'visible'
      shown.current?.remove()
      shown.current = embed
      staged = undefined
      setStale(false)
      setStatus('ready')
      setUpdatedAt(Date.now())
      if (!first) setReloads(n => n + 1)
    })().catch((cause: unknown) => {
      if (signal.aborted) return
      if (first) {
        setStatus('failed')
        onFailed(cause instanceof Error ? cause.message : String(cause))
      } else {
        setStatus('ready')
        setStale(true)
      }
    })
    return () => {
      controller.abort()
      staged?.remove()
    }
  }, [sessionId, designPath, version, theme])

  const time = updatedAt ? new Date(updatedAt).toLocaleTimeString() : ''
  return (
    <div className="dshk-stage dshk-kicanvas" data-kicad-state={`kicanvas-${status}`} data-kicad-reloads={reloads}>
      {status === 'loading' && <div className="dshk-note dshk-overlay">{tr('viewer.loading')}</div>}
      {(status === 'ready' || status === 'updating') && (
        <div className="dshk-live" data-kicad-live={status}>
          <span className={`dshk-live-dot${status === 'updating' ? ' dshk-live-busy' : ''}`} />
          {status === 'updating' ? tr('viewer.updating') : tr('viewer.liveUpdated', { time })}
          {stale && <span className="dshk-live-stale"> · {tr('viewer.liveStale')}</span>}
        </div>
      )}
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
