/** Interactive KiCanvas view of a schematic or board, fed from the session workspace. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { basename, dirname } from './address.ts'
import type { ClientRemote } from './dsh.ts'
import { createEmbed, loadKiCanvas, pickFiles } from './kicanvas.ts'
import type { KiCadLocaleKey } from './locales.ts'

export interface InteractiveViewProps {
  remote: ClientRemote
  sessionId: string
  designPath: string
  /** Changes when the design file changes on disk; triggers a reload. */
  version: string | undefined
  theme: string
  tr: (key: KiCadLocaleKey, vars?: Record<string, string | number>) => string
  onFailed: (message: string) => void
}

export function InteractiveView(props: InteractiveViewProps): ReactNode {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const { remote, sessionId, designPath, version, theme, tr, onFailed } = props

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    let timer: ReturnType<typeof setTimeout> | undefined
    const fail = (message: string): void => {
      if (signal.aborted) return
      setStatus('failed')
      onFailed(message)
    }
    setStatus('loading')
    void (async () => {
      const dir = dirname(designPath)
      const listing = await remote.workspaceFiles.list(sessionId, dir || '.', signal)
      if (signal.aborted) return
      if (!listing.ok) return fail(listing.error.message)
      const names = pickFiles(basename(designPath), listing.value.entries)
      const decoder = new TextDecoder()
      const files = []
      for (const name of names) {
        const read = await remote.workspaceFiles.readBytes(sessionId, dir ? `${dir}/${name}` : name, {}, signal)
        if (signal.aborted) return
        if (!read.ok) {
          if (name === basename(designPath)) return fail(read.error.message)
          continue
        }
        files.push({ name, text: decoder.decode(read.value.data) })
      }
      await loadKiCanvas()
      if (signal.aborted || !host.current) return
      const embed = createEmbed(files, theme)
      host.current.replaceChildren(embed)
      // KiCanvas reports through attributes: `loaded` on success; `loading` drops without `loaded` on failure.
      const started = Date.now()
      const poll = (): void => {
        if (signal.aborted) return
        if (embed.hasAttribute('loaded')) return setStatus('ready')
        if (Date.now() - started > 20_000 || (!embed.hasAttribute('loading') && Date.now() - started > 3_000)) {
          return fail(tr('viewer.kicanvasFailed'))
        }
        timer = setTimeout(poll, 250)
      }
      poll()
    })().catch((cause: unknown) => fail(String(cause)))
    return () => {
      controller.abort()
      if (timer) clearTimeout(timer)
      host.current?.replaceChildren()
    }
  }, [sessionId, designPath, version, theme])

  return (
    <div className="dshk-stage dshk-kicanvas" data-kicad-state={`kicanvas-${status}`}>
      {status === 'loading' && <div className="dshk-note dshk-overlay">{tr('viewer.loading')}</div>}
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
    </div>
  )
}
