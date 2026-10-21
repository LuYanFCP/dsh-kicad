/**
 * Right-sidebar body for .kicad_sch / .kicad_pcb: shows the SVG that kicad-cli
 * rendered into <project>/.dsh-kicad/render/<name>/, follows file changes through
 * `useResource`, and re-renders on request through the `/kicad-render` command.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from 'react'
import { orderPages, parseFileAddress, renderDir, sessionFileAddress } from './address.ts'
import { KICAD_MISSING, KiCadNotice } from './Doctor.tsx'
import { InteractiveView } from './InteractiveView.tsx'
import type { ClientRemote, TabBodyProps } from './dsh.ts'
import { translate, type KiCadLocaleKey } from './locales.ts'
import { CSS } from './styles.ts'

interface View { scale: number, x: number, y: number }

type Mode = 'interactive' | 'svg'
const MODE_KEY = 'dsh-kicad:viewer-mode'
const THEME_KEY = 'dsh-kicad:viewer-theme'

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = globalThis.localStorage?.getItem(key) as T | null
    return value && allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

function remember(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    // storage unavailable: the choice lasts for this tab only
  }
}

export function createViewer(remote: ClientRemote) {
  const SvgView = createSvgView(remote)
  return function KiCadViewer(props: TabBodyProps): ReactNode {
    const tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>): string => translate(props.t, key, vars)
    const [mode, setMode] = useState<Mode>(() => stored<Mode>(MODE_KEY, ['interactive', 'svg'], 'interactive'))
    const [theme, setTheme] = useState(() => stored(THEME_KEY, ['kicad', 'witchhazel'], 'kicad'))
    const [fallback, setFallback] = useState<string | undefined>(undefined)
    const { tab } = props.useTabInfo()
    const file = useMemo(() => parseFileAddress(tab.contentId ?? ''), [tab.contentId])
    const sourceVersion = props.useResource?.(tab.contentId ?? 'none:')?.value?.version
    const choose = (next: Mode): void => {
      setFallback(undefined)
      setMode(next)
      remember(MODE_KEY, next)
    }
    const effective: Mode = mode === 'interactive' && fallback === undefined ? 'interactive' : 'svg'
    const modeSwitch = (
      <span className="dshk-segmented" role="group">
        <button type="button" className="dshk-btn" aria-pressed={effective === 'interactive'} data-kicad-mode="interactive" onClick={() => choose('interactive')}>{tr('viewer.interactive')}</button>
        <button type="button" className="dshk-btn" aria-pressed={effective === 'svg'} data-kicad-mode="svg" onClick={() => choose('svg')}>{tr('viewer.svg')}</button>
      </span>
    )
    if (effective === 'svg' || file?.scope !== 'session' || !file.sessionId) {
      return <SvgView {...props} modeSwitch={modeSwitch} notice={fallback ? tr('viewer.fellBack', { message: fallback }) : undefined} />
    }
    return (
      <div className="dshk-root" data-kicad-viewer={file.path} data-kicad-mode-active="interactive">
        <style>{CSS}</style>
        <div className="dshk-bar">
          {modeSwitch}
          <span className="dshk-spacer" />
          <label>
            {tr('viewer.theme')}{' '}
            <select className="dshk-select" value={theme} onChange={(e) => { setTheme(e.target.value); remember(THEME_KEY, e.target.value) }}>
              <option value="kicad">KiCad</option>
              <option value="witchhazel">Witch Hazel</option>
            </select>
          </label>
        </div>
        <KiCadNotice remote={remote} sessionId={file.sessionId} t={props.t} />
        <InteractiveView remote={remote} sessionId={file.sessionId} designPath={file.path} version={sourceVersion} theme={theme} tr={tr} onFailed={setFallback} />
      </div>
    )
  }
}

function createSvgView(remote: ClientRemote) {
  return function KiCadSvgView(props: TabBodyProps & { modeSwitch?: ReactNode, notice?: string }): ReactNode {
    const tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>): string => translate(props.t, key, vars)
    const { tab } = props.useTabInfo()
    const file = useMemo(() => parseFileAddress(tab.contentId ?? ''), [tab.contentId])
    const sessionId = file?.scope === 'session' ? file.sessionId : undefined
    const designPath = file?.path ?? ''
    const dir = renderDir(designPath)

    const [pages, setPages] = useState<string[] | undefined>(undefined)
    const [pageIndex, setPageIndex] = useState(0)
    const [listing, setListing] = useState(0)
    const [svgUrl, setSvgUrl] = useState<string | undefined>(undefined)
    const [error, setError] = useState<string | undefined>(undefined)
    const [rendering, setRendering] = useState(false)
    const [kicadFailed, setKicadFailed] = useState(false)
    const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
    const stageRef = useRef<HTMLDivElement>(null)
    const imgRef = useRef<HTMLImageElement>(null)
    const drag = useRef<{ x: number, y: number, vx: number, vy: number } | undefined>(undefined)

    const page = pages?.[Math.min(pageIndex, pages.length - 1)]
    const pagePath = page ? `${dir}/${page}` : undefined
    const svgState = props.useResource?.(sessionId && pagePath ? sessionFileAddress(sessionId, pagePath) : 'none:')
    const sourceState = props.useResource?.(tab.contentId ?? 'none:')
    const svgVersion = svgState?.value?.version
    const sourceVersion = sourceState?.value?.version
    const sourceAtLoad = useRef<string | undefined>(undefined)

    // List rendered pages (again after a render or when the root page changes on disk).
    useEffect(() => {
      if (!sessionId) return
      let live = true
      void remote.workspaceFiles.list(sessionId, dir).then((result) => {
        if (!live) return
        setPages(result.ok ? orderPages(designPath, result.value.entries.filter(e => e.type === 'file').map(e => e.name)) : [])
      }, () => live && setPages([]))
      return () => { live = false }
    }, [sessionId, dir, designPath, listing, svgVersion === undefined])

    // Load the selected page whenever it or its version changes.
    useEffect(() => {
      if (!sessionId || !pagePath) {
        setSvgUrl(undefined)
        return
      }
      const controller = new AbortController()
      let url: string | undefined
      void remote.workspaceFiles.readBytes(sessionId, pagePath, {}, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        if (!result.ok) {
          setError(tr('viewer.failed', { message: result.error.message }))
          return
        }
        url = URL.createObjectURL(new Blob([result.value.data as BlobPart], { type: 'image/svg+xml' }))
        sourceAtLoad.current = sourceVersion
        setError(undefined)
        setSvgUrl(url)
      }, (cause: unknown) => !controller.signal.aborted && setError(tr('viewer.failed', { message: String(cause) })))
      return () => {
        controller.abort()
        if (url) URL.revokeObjectURL(url)
      }
    }, [sessionId, pagePath, svgVersion])

    const fit = useCallback(() => {
      const stage = stageRef.current
      const img = imgRef.current
      if (!stage || !img || !img.naturalWidth) return
      const scale = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight) * 0.96 || 1
      setView({ scale, x: (stage.clientWidth - img.naturalWidth * scale) / 2, y: (stage.clientHeight - img.naturalHeight * scale) / 2 })
    }, [])

    const zoom = (factor: number, cx?: number, cy?: number): void => {
      const stage = stageRef.current
      const px = cx ?? (stage ? stage.clientWidth / 2 : 0)
      const py = cy ?? (stage ? stage.clientHeight / 2 : 0)
      setView(v => {
        const scale = Math.min(40, Math.max(0.02, v.scale * factor))
        const k = scale / v.scale
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })
    }

    const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
      const rect = event.currentTarget.getBoundingClientRect()
      zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - rect.left, event.clientY - rect.top)
    }
    const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }
    }
    const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
      const d = drag.current
      if (d) setView(v => ({ ...v, x: d.vx + event.clientX - d.x, y: d.vy + event.clientY - d.y }))
    }
    const onPointerUp = (): void => { drag.current = undefined }

    const render = async (): Promise<void> => {
      if (!sessionId) return
      setRendering(true)
      setError(undefined)
      try {
        const result = await remote.commands.execute(sessionId, `/kicad-render ${designPath}`, [])
        if (!result.ok) setError(tr('viewer.renderFailed', { message: result.error.message }))
        else if (result.value?.result.kind === 'error') {
          setError(tr('viewer.renderFailed', { message: result.value.result.text }))
          // Re-check so the notice (with the installer) appears right away.
          if (KICAD_MISSING.test(result.value.result.text)) setKicadFailed(true)
        }
        else setListing(n => n + 1)
      } catch (cause) {
        setError(tr('viewer.renderFailed', { message: String(cause) }))
      } finally {
        setRendering(false)
      }
    }

    if (!sessionId) {
      return <div className="dshk-root"><style>{CSS}</style><div className="dshk-note">{tr('viewer.noSession')}</div></div>
    }
    const stale = svgUrl !== undefined && sourceAtLoad.current !== undefined && sourceVersion !== undefined && sourceVersion !== sourceAtLoad.current
    return (
      <div className="dshk-root" data-kicad-viewer={designPath}>
        <style>{CSS}</style>
        <div className="dshk-bar">
          {props.modeSwitch}
          <button type="button" className="dshk-btn" onClick={() => void render()} disabled={rendering} data-kicad-action="render">
            {rendering ? tr('viewer.rendering') : tr('viewer.render')}
          </button>
          {pages && pages.length > 1 && (
            <label>
              {tr('viewer.page')}{' '}
              <select className="dshk-select" value={Math.min(pageIndex, pages.length - 1)} onChange={e => setPageIndex(Number(e.target.value))}>
                {pages.map((p, i) => <option key={p} value={i}>{p.replace(/\.svg$/, '')}</option>)}
              </select>
            </label>
          )}
          <span className="dshk-spacer" />
          <button type="button" className="dshk-btn" aria-label={tr('viewer.zoomOut')} onClick={() => zoom(1 / 1.25)}>−</button>
          <button type="button" className="dshk-btn" aria-label={tr('viewer.zoomIn')} onClick={() => zoom(1.25)}>+</button>
          <button type="button" className="dshk-btn" onClick={fit}>{tr('viewer.fit')}</button>
        </div>
        <KiCadNotice remote={remote} sessionId={sessionId} t={props.t} force={kicadFailed} />
        {props.notice && <div className="dshk-warn" data-kicad-state="fallback">{props.notice}</div>}
        {stale && <div className="dshk-warn" data-kicad-state="stale">{tr('viewer.stale')}</div>}
        {error && <div className="dshk-error" data-kicad-state="error">{error}</div>}
        {pages !== undefined && pages.length === 0 && !rendering && <div className="dshk-note" data-kicad-state="empty">{tr('viewer.empty')}</div>}
        <div
          ref={stageRef}
          className="dshk-stage"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={fit}
        >
          {svgUrl && (
            <img
              ref={imgRef}
              src={svgUrl}
              alt={page ?? ''}
              draggable={false}
              onLoad={fit}
              data-kicad-state="image"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            />
          )}
        </div>
      </div>
    )
  }
}
