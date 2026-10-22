/**
 * Right-sidebar body for .kicad_sch / .kicad_pcb, in three modes: Interactive (KiCanvas),
 * SVG (what kicad-cli rendered into <project>/.dsh-kicad/render/<name>/, re-rendered on
 * request through the `/kicad-render` command and by itself when a board changes, see
 * `rendersItself`) and, for boards, 3D (Board3D.tsx). Every mode follows file changes
 * through `useResource`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type WheelEvent } from 'react'
import { orderPages, parseFileAddress, renderDir, sessionFileAddress } from './address.ts'
import { KICAD_MISSING, KiCadNotice } from './Doctor.tsx'
import { followEnabled, setFollowEnabled } from './follow.ts'
import { Board3DView } from './Board3D.tsx'
import { InteractiveView } from './InteractiveView.tsx'
import type { ClientRemote, TabBodyProps } from './dsh.ts'
import { translate, type KiCadLocaleKey } from './locales.ts'
import { CSS } from './styles.ts'

interface View { scale: number, x: number, y: number }

type Mode = 'interactive' | 'svg' | '3d'
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

/** Quiet time after a design change before the SVG view renders it itself; a host render landing sooner wins. */
export const SELF_RENDER_DELAY_MS = 1500

/**
 * Designs the SVG view re-renders itself when they change on disk. The policy's
 * autoRender re-renders a schematic after each kicad_edit_schematic (and the user
 * may switch that off); nothing on the host renders a board after kicad_edit_pcb
 * (or after KiCad itself saves it).
 */
export function rendersItself(path: string): boolean {
  return /\.kicad_pcb$/i.test(path)
}

export function createViewer(remote: ClientRemote) {
  const SvgView = createSvgView(remote)
  return function KiCadViewer(props: TabBodyProps): ReactNode {
    const tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>): string => translate(props.t, key, vars)
    const [mode, setMode] = useState<Mode>(() => stored<Mode>(MODE_KEY, ['interactive', 'svg', '3d'], 'interactive'))
    const [follow, setFollow] = useState(followEnabled)
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
    const board = rendersItself(file?.path ?? '')
    // Schematics have no 3D mode: a board's choice of 3D opens them interactively.
    const wanted: Mode = mode === '3d' && !board ? 'interactive' : mode
    const effective: Mode = wanted === 'interactive' && fallback !== undefined ? 'svg' : wanted
    const modeSwitch = (
      <span className="dshk-segmented" role="group">
        <button type="button" className="dshk-btn" aria-pressed={effective === 'interactive'} data-kicad-mode="interactive" onClick={() => choose('interactive')}>{tr('viewer.interactive')}</button>
        <button type="button" className="dshk-btn" aria-pressed={effective === 'svg'} data-kicad-mode="svg" onClick={() => choose('svg')}>{tr('viewer.svg')}</button>
        {board && <button type="button" className="dshk-btn" aria-pressed={effective === '3d'} data-kicad-mode="3d" onClick={() => choose('3d')}>{tr('viewer.3d')}</button>}
      </span>
    )
    const followToggle = (
      <label className="dshk-check dshk-follow" title={tr('viewer.followHint')}>
        <input type="checkbox" checked={follow} data-kicad-follow onChange={(e) => { setFollow(e.target.checked); setFollowEnabled(e.target.checked) }} />
        <span>{tr('viewer.follow')}</span>
      </label>
    )
    if (effective === 'svg' || file?.scope !== 'session' || !file.sessionId) {
      return <SvgView {...props} modeSwitch={<>{modeSwitch}{followToggle}</>} notice={fallback ? tr('viewer.fellBack', { message: fallback }) : undefined} />
    }
    if (effective === '3d') {
      return (
        <>
          <style>{CSS}</style>
          <Board3DView remote={remote} sessionId={file.sessionId} designPath={file.path} version={sourceVersion} visible={tab.visible !== false}
            tr={tr} t={props.t} toolbarStart={<>{modeSwitch}{followToggle}</>} />
        </>
      )
    }
    return (
      <div className="dshk-root" data-kicad-viewer={file.path} data-kicad-mode-active="interactive">
        <style>{CSS}</style>
        <div className="dshk-bar">
          {modeSwitch}
          {followToggle}
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
    /** Source version the shown SVG was rendered from (state: a reload must re-check staleness). */
    const [sourceAtLoad, setSourceAtLoad] = useState<string | undefined>(undefined)
    /** Source version when this design opened: a change from it counts even before any render exists. */
    const sourceAtOpen = useRef<{ path: string, version: string | undefined } | undefined>(undefined)
    /** Source version the last render started from (the file may change again while it runs). */
    const renderedFrom = useRef<string | undefined>(undefined)
    /** Source version the view last re-rendered by itself: one attempt per version, so failures do not loop. */
    const selfRendered = useRef<string | undefined>(undefined)

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
        setSourceAtLoad(renderedFrom.current ?? sourceVersion)
        renderedFrom.current = undefined
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

    /** Render with kicad-cli; `background` renders are the view's own and hidden from the chat (`--json`). */
    const render = async (background = false): Promise<void> => {
      if (!sessionId) return
      setRendering(true)
      setError(undefined)
      renderedFrom.current = sourceVersion
      let failure: string | undefined
      try {
        const result = await remote.commands.execute(sessionId, `/kicad-render ${designPath}${background ? ' --json' : ''}`, [])
        if (!result.ok) failure = result.error.message
        else if (result.value?.result.kind === 'error') {
          failure = result.value.result.text
          // Re-check so the notice (with the installer) appears right away.
          if (KICAD_MISSING.test(failure)) setKicadFailed(true)
        }
        else setListing(n => n + 1)
      } catch (cause) {
        failure = String(cause)
      } finally {
        setRendering(false)
      }
      if (failure !== undefined) {
        renderedFrom.current = undefined
        setError(tr('viewer.renderFailed', { message: failure }))
      }
    }

    useEffect(() => {
      if (sourceAtOpen.current?.path !== designPath) sourceAtOpen.current = { path: designPath, version: sourceVersion }
      else sourceAtOpen.current.version ??= sourceVersion
    }, [designPath, sourceVersion])

    // Keep a board live: once it differs from what is shown and has been quiet for a
    // moment, render it again. Only while this tab is visible; a hidden tab catches up when shown.
    useEffect(() => {
      if (!sessionId || !rendersItself(designPath) || tab.visible === false || rendering || sourceVersion === undefined) return
      const shown = svgUrl !== undefined ? sourceAtLoad : sourceAtOpen.current?.version
      if (shown === undefined || shown === sourceVersion || selfRendered.current === sourceVersion) return
      const timer = setTimeout(() => {
        selfRendered.current = sourceVersion
        void render(true)
      }, SELF_RENDER_DELAY_MS)
      return () => clearTimeout(timer)
    }, [sessionId, designPath, sourceVersion, svgUrl, sourceAtLoad, rendering, tab.visible])

    if (!sessionId) {
      return <div className="dshk-root"><style>{CSS}</style><div className="dshk-note">{tr('viewer.noSession')}</div></div>
    }
    const stale = svgUrl !== undefined && sourceAtLoad !== undefined && sourceVersion !== undefined && sourceVersion !== sourceAtLoad
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
        <KiCadNotice remote={remote} sessionId={sessionId} t={props.t} force={kicadFailed} onReady={() => {
          // KiCad was installed (or fixed) after a render failed for that reason: render now.
          if (!kicadFailed) return
          setKicadFailed(false)
          void render()
        }} />
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
