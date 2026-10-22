/**
 * 3D mode for a .kicad_pcb, modelled on KiCad's 3D Viewer. The Host exports the board as
 * a GLB (`/kicad-render <board> --glb --json`, cached by board content under
 * .dsh-kicad/render/<board>/); the view reads it with `remote.workspaceFiles.readBytes`
 * (raw bytes) and shows it with three.js, loaded as a separate chunk on first use.
 * The board stays live: a change re-exports it after a quiet moment and the camera stays
 * put. "KiCad render" renders the current camera with KiCad's own renderer
 * (`kicad-cli pcb render --quality high`); without WebGL those renders are the view.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { basename, renderDir, stem } from './address.ts'
import { kicadCamera, kicadRenderFlags, viewCamera, VIEWS, type CameraState, type ViewName } from './camera3d.ts'
import { DoctorPanel, KICAD_MISSING, KiCadNotice, type DoctorReport } from './Doctor.tsx'
import type { ClientRemote } from './dsh.ts'
import type { KiCadLocaleKey } from './locales.ts'
import { loadScene, webglAvailable } from './three.ts'
import type { BoardScene } from './scene3d.ts'

type Tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>) => string

/** Quiet time after a board change before the 3D view exports it again. */
export const LIVE_3D_DELAY_MS = 1000
export const PROJECTION_KEY = 'dsh-kicad:3d-projection'
export const COMPONENTS_KEY = 'dsh-kicad:3d-components'
/** dsh's per-call byte window and the largest scene this view reads. */
const WINDOW_BYTES = 2 * 1024 * 1024
const MAX_SCENE_BYTES = 512 * 1024 * 1024
const MAX_RENDER_SIDE = 1600

export interface MissingModel { reference: string, model: string, reason?: string }
/** `/kicad-render <board> --glb --json` (the sidecar's export_glb result). */
export interface SceneExport {
  glb: string
  cached: boolean
  seconds?: number
  bytes?: number
  board: { center: [number, number] | null, width: number | null, height: number | null, thickness: number } | null
  references: string[]
  models: { footprints_with_models: number, missing: MissingModel[], missing_count?: number, library: { var: string, dir: string | null, installed: boolean } }
}

/** The camera of each open board, kept across mode switches and remounts (this page only). */
const cameras = new Map<string, CameraState>()

function stored(key: string, fallback: boolean): boolean {
  try {
    const value = globalThis.localStorage?.getItem(key)
    return value === null || value === undefined ? fallback : value === 'on'
  } catch {
    return fallback
  }
}

function remember(key: string, on: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, on ? 'on' : 'off')
  } catch {
    // storage unavailable: the choice lasts for this view only
  }
}

/** A workspace file's bytes: one read up to dsh's whole-file limit, 2 MiB windows beyond it. */
export async function readWorkspaceFile(remote: ClientRemote, sessionId: string, path: string, signal?: AbortSignal): Promise<Uint8Array> {
  const whole = await remote.workspaceFiles.readBytes(sessionId, path, {}, signal)
  if (whole.ok) return whole.value.data
  if (whole.error.code !== 'workspace-file/too-large') throw new Error(whole.error.message)
  const parts: Uint8Array[] = []
  let offset = 0
  for (;;) {
    const window = await remote.workspaceFiles.readBytes(sessionId, path, { range: { offset, length: WINDOW_BYTES } }, signal)
    if (!window.ok) throw new Error(window.error.message)
    parts.push(window.value.data)
    offset += window.value.data.length
    if (window.value.eof || window.value.data.length === 0) break
    if (offset > MAX_SCENE_BYTES) throw new Error(`${path} is larger than ${MAX_SCENE_BYTES / 1024 / 1024} MiB`)
  }
  const out = new Uint8Array(offset)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** Run one `/kicad-render … --json` and parse its JSON; throws with the command's error. */
async function runRender<T>(remote: ClientRemote, sessionId: string, line: string): Promise<T> {
  const result = await remote.commands.execute(sessionId, line, [])
  if (!result.ok) throw new Error(result.error.message)
  const outcome = result.value?.result
  if (!outcome) throw new Error('/kicad-render is not available (is the KiCad plugin enabled?)')
  if (outcome.kind === 'error') throw new Error(outcome.text)
  return JSON.parse(outcome.text ?? '{}') as T
}

/** Pixel size of a KiCad render that fills the stage. */
export function renderSize(width: number, height: number, ratio = 1): { width: number, height: number } {
  if (!(width > 0 && height > 0)) return { width: 1200, height: 900 }
  const k = Math.min(MAX_RENDER_SIDE / Math.max(width * ratio, height * ratio), 1) * ratio
  return { width: Math.max(64, Math.round(width * k)), height: Math.max(64, Math.round(height * k)) }
}

const KICAD_MODEL_VAR = /^\$\{KICAD\d*_3DMODEL_DIR\}/

export interface Board3DProps {
  remote: ClientRemote
  sessionId: string
  designPath: string
  /** Version of the board file (changes when it is written). */
  version: string | undefined
  visible: boolean
  tr: Tr
  t?: (key: string, vars?: Record<string, string | number>) => string
  /** Mode switch and other controls of the viewer, placed first in the toolbar. */
  toolbarStart?: ReactNode
}

type Phase = 'loading' | 'ready' | 'updating' | 'failed'

export function Board3DView(props: Board3DProps): ReactNode {
  const { remote, sessionId, designPath, version, visible, tr } = props
  const key = `${sessionId}::${designPath}`
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const scene = useRef<BoardScene | null>(null)
  const [webgl] = useState(webglAvailable)
  const [sceneReady, setSceneReady] = useState(false)
  /** Why the view shows KiCad renders instead of the interactive scene. */
  const [imageMode, setImageMode] = useState<string | undefined>(() => (webgl ? undefined : tr('viewer3d.noWebgl')))
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | undefined>(undefined)
  const [shown, setShown] = useState<SceneExport | undefined>(undefined)
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined)
  const [reloads, setReloads] = useState(0)
  const [ortho, setOrtho] = useState(() => !stored(PROJECTION_KEY, true))
  const [components, setComponents] = useState(() => stored(COMPONENTS_KEY, true))
  const [view, setView] = useState<ViewName>('iso')
  const [image, setImage] = useState<{ url: string, quality: string } | undefined>(undefined)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | undefined>(undefined)
  const [kicadFailed, setKicadFailed] = useState(false)
  const [modelsOpen, setModelsOpen] = useState(false)
  /** Board version the shown model came from, and the last version tried (one attempt per version). */
  const shownVersion = useRef<string | undefined>(undefined)
  const tried = useRef<string | undefined>(undefined)
  const sequence = useRef(0)
  const live = useRef(true)
  useEffect(() => () => { live.current = false }, [])

  // The scene: three.js comes in its own chunk, loaded the first time a board opens in 3D.
  useEffect(() => {
    if (imageMode !== undefined || !host.current) return
    let alive = true
    let created: BoardScene | undefined
    void loadScene().then((module) => {
      if (!alive || !host.current) return
      created = module.createBoardScene(host.current, {
        ortho, components, camera: cameras.get(key), view: 'iso',
        onChange: (state) => { cameras.set(key, state) },
      })
      scene.current = created
      setSceneReady(true)
    }).catch((cause: unknown) => {
      if (alive) setImageMode(tr('viewer3d.sceneFailed', { message: cause instanceof Error ? cause.message : String(cause) }))
    })
    return () => {
      alive = false
      if (created) {
        cameras.set(key, created.camera())
        created.dispose()
      }
      scene.current = null
      setSceneReady(false)
      setShown(undefined)
      setPhase('loading')
      shownVersion.current = undefined
      tried.current = undefined
    }
  }, [key, imageMode === undefined])

  useEffect(() => { scene.current?.setOrtho(ortho) }, [ortho, sceneReady])
  useEffect(() => { scene.current?.setComponentsVisible(components) }, [components, sceneReady])

  /** Export (or take the cached) GLB and show it, keeping the camera. */
  const refresh = async (force = false): Promise<void> => {
    const current = scene.current
    if (!current) return
    const seq = ++sequence.current
    const from = version
    tried.current = from
    const first = shownVersion.current === undefined
    setPhase(first ? 'loading' : 'updating')
    try {
      const out = await runRender<SceneExport>(remote, sessionId, `/kicad-render ${designPath} --glb${force ? ' --force' : ''} --json`)
      const glb = `${renderDir(designPath)}/${stem(designPath)}.glb`
      const data = await readWorkspaceFile(remote, sessionId, glb)
      if (!live.current || seq !== sequence.current || scene.current !== current) return
      await current.load(data, { ...(out.board ?? { center: null, width: null, height: null, thickness: 1.6 }), references: out.references ?? [] })
      if (!live.current || seq !== sequence.current) return
      shownVersion.current = from
      setShown(out)
      setError(undefined)
      setPhase('ready')
      setUpdatedAt(Date.now())
      if (!first) setReloads(n => n + 1)
    } catch (cause) {
      if (!live.current || seq !== sequence.current) return
      const message = cause instanceof Error ? cause.message : String(cause)
      if (KICAD_MISSING.test(message)) setKicadFailed(true)
      setError(message)
      // Keep showing the last good model; a later save usually exports again.
      setPhase(first ? 'failed' : 'ready')
    }
  }

  /** Render the current camera with KiCad's own renderer (kicad-cli pcb render) and show the image. */
  const renderKiCad = async (quality: 'basic' | 'high'): Promise<void> => {
    const box = stage.current
    const size = renderSize(box?.clientWidth ?? 0, box?.clientHeight ?? 0, Math.min(globalThis.devicePixelRatio || 1, 2))
    // Without a scene the camera is a preset view framing a board of unknown shape (zoom is relative to its size).
    const state = scene.current?.camera() ?? viewCamera(view, { size: 1 }, ortho, size.width / size.height)
    const camera = kicadCamera(state, { size: scene.current?.boardSize() ?? 1 })
    setRendering(true)
    setRenderError(undefined)
    try {
      // One file for the view's renders (`<board>-3d-view.png`), replaced by the next one.
      const flags = [...kicadRenderFlags(camera), `--quality=${quality}`, `--width=${size.width}`, `--height=${size.height}`, '--name=view']
      const out = await runRender<{ png?: string[] }>(remote, sessionId, `/kicad-render ${designPath} --3d ${flags.join(' ')} --json`)
      const png = out.png?.[0]
      if (!png) throw new Error('kicad-cli wrote no image')
      const rel = `${renderDir(designPath)}/${basename(png)}`
      const data = await readWorkspaceFile(remote, sessionId, png.startsWith('/') || /^[A-Za-z]:/.test(png) ? png : rel)
      if (!live.current) return
      // The previous image's URL is revoked by the effect below.
      setImage({ url: URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/png' })), quality })
      if (imageMode !== undefined) {
        tried.current = version
        shownVersion.current = version
        setUpdatedAt(Date.now())
        setPhase('ready')
      }
    } catch (cause) {
      if (!live.current) return
      const message = cause instanceof Error ? cause.message : String(cause)
      if (KICAD_MISSING.test(message)) setKicadFailed(true)
      setRenderError(message)
      if (imageMode !== undefined && shownVersion.current === undefined) setPhase('failed')
    } finally {
      if (live.current) setRendering(false)
    }
  }
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])

  // Live: load now when nothing is shown, else after the board has been quiet for a moment.
  // Only while the tab is visible; a hidden tab catches up when shown.
  useEffect(() => {
    if (!visible) return
    const ready = imageMode === undefined ? sceneReady : true
    if (!ready || rendering) return
    if (tried.current !== undefined && (tried.current === version || shownVersion.current === version)) return
    const run = (): void => { void (imageMode === undefined ? refresh() : renderKiCad('basic')) }
    if (tried.current === undefined) {
      run()
      return
    }
    const timer = setTimeout(run, LIVE_3D_DELAY_MS)
    return () => clearTimeout(timer)
  }, [version, visible, sceneReady, imageMode, rendering])

  const chooseView = (next: ViewName): void => {
    setView(next)
    scene.current?.setView(next)
  }
  const chooseOrtho = (next: boolean): void => {
    setOrtho(next)
    remember(PROJECTION_KEY, !next)
  }
  const reset = (): void => chooseView('iso')
  // In image mode the camera is a preset: re-render when it changes (state settles first).
  useEffect(() => { if (imageMode !== undefined && shownVersion.current !== undefined) void renderKiCad('basic') }, [view, ortho])

  const missing = shown?.models.missing ?? []
  const missingCount = shown?.models.missing_count ?? missing.length
  const libraryMissing = missing.some(m => KICAD_MODEL_VAR.test(m.model)) && shown?.models.library.installed === false
  const time = updatedAt ? new Date(updatedAt).toLocaleTimeString() : ''
  const status = imageMode !== undefined ? (rendering ? 'updating' : phase) : phase
  const onDoctor = (report: DoctorReport): void => {
    if (report.checks.find(c => c.id === '3d_models')?.status === 'ok' && libraryMissing) {
      setModelsOpen(false)
      void refresh(true)
    }
  }

  return (
    <div className="dshk-root" data-kicad-viewer={designPath} data-kicad-mode-active="3d">
      <div className="dshk-bar">
        {props.toolbarStart}
        <span className="dshk-spacer" />
        <span className="dshk-segmented" role="group" aria-label={tr('viewer3d.projection')}>
          <button type="button" className="dshk-btn" aria-pressed={!ortho} data-kicad-projection="perspective" onClick={() => chooseOrtho(false)}>{tr('viewer3d.perspective')}</button>
          <button type="button" className="dshk-btn" aria-pressed={ortho} data-kicad-projection="ortho" onClick={() => chooseOrtho(true)}>{tr('viewer3d.ortho')}</button>
        </span>
        {imageMode === undefined && (
          <label className="dshk-check" title={tr('viewer3d.componentsHint')}>
            <input type="checkbox" checked={components} data-kicad-components onChange={(e) => { setComponents(e.target.checked); remember(COMPONENTS_KEY, e.target.checked) }} />
            <span>{tr('viewer3d.components')}</span>
          </label>
        )}
        <button type="button" className="dshk-btn" disabled={rendering} onClick={() => void renderKiCad('high')} data-kicad-action="kicad-render" title={tr('viewer3d.kicadRenderHint')}>
          {rendering ? tr('viewer.rendering') : tr('viewer3d.kicadRender')}
        </button>
      </div>
      <div className="dshk-bar dshk-views" role="group" aria-label={tr('viewer3d.views')}>
        {VIEWS.map(name => (
          <button key={name} type="button" className="dshk-btn" data-kicad-view={name} aria-pressed={imageMode !== undefined ? view === name : undefined} onClick={() => chooseView(name)}>
            {tr(`viewer3d.view.${name}` as KiCadLocaleKey)}
          </button>
        ))}
        <span className="dshk-spacer" />
        {imageMode === undefined && <button type="button" className="dshk-btn" onClick={reset} data-kicad-action="reset-view">{tr('viewer3d.reset')}</button>}
      </div>
      <KiCadNotice remote={remote} sessionId={sessionId} t={props.t} force={kicadFailed} onReady={() => {
        if (!kicadFailed) return
        setKicadFailed(false)
        void (imageMode === undefined ? refresh() : renderKiCad('basic'))
      }} />
      {imageMode !== undefined && <div className="dshk-warn" data-kicad-state="no-webgl">{imageMode}</div>}
      {error && phase !== 'failed' && <div className="dshk-warn" data-kicad-state="stale">{tr('viewer3d.updateFailed', { message: error })}</div>}
      {phase === 'failed' && error && (
        <div className="dshk-error" data-kicad-state="error">
          {tr('viewer3d.exportFailed', { message: error })}{' '}
          <button type="button" className="dshk-btn" onClick={() => void refresh(true)} data-kicad-action="retry">{tr('viewer3d.retry')}</button>
        </div>
      )}
      {renderError && <div className="dshk-error" data-kicad-state="render-error">{tr('viewer.renderFailed', { message: renderError })}</div>}
      {missingCount > 0 && (
        <div className="dshk-warn" data-kicad-state="models-missing">
          <div className="dshk-check">
            <span>
              {libraryMissing
                ? tr('viewer3d.libraryMissing', { count: missingCount, total: shown?.models.footprints_with_models ?? missingCount })
                : tr('viewer3d.modelsMissing', { count: missingCount, refs: missing.slice(0, 6).map(m => m.reference).join(', ') + (missingCount > 6 ? ', …' : '') })}
            </span>
            <span className="dshk-spacer" />
            <button type="button" className="dshk-btn" aria-expanded={modelsOpen} onClick={() => setModelsOpen(o => !o)} data-kicad-action="models-help">
              {libraryMissing ? tr('viewer3d.installModels') : tr('doctor.open')}
            </button>
          </div>
          {modelsOpen && !libraryMissing && (
            <ul className="dshk-list" data-kicad-missing-models>
              {missing.map(m => <li key={`${m.reference}:${m.model}`} className="dshk-code">{m.reference}: {m.model}</li>)}
            </ul>
          )}
        </div>
      )}
      {modelsOpen && libraryMissing && (
        <div className="dshk-notice-open" data-kicad-models-doctor>
          <DoctorPanel remote={remote} sessionId={sessionId} t={props.t} only="3d_models" title={tr('viewer3d.modelsTitle')} fresh onReport={onDoctor} />
        </div>
      )}
      <div ref={stage} className="dshk-stage dshk-3d" data-kicad-state={`3d-${status}`} data-kicad-reloads={reloads}>
        {status === 'loading' && <div className="dshk-note dshk-overlay">{tr('viewer3d.loading')}</div>}
        {(status === 'ready' || status === 'updating') && (
          <div className="dshk-live" data-kicad-live={status}>
            <span className={`dshk-live-dot${status === 'updating' ? ' dshk-live-busy' : ''}`} />
            {status === 'updating' ? tr('viewer.updating') : tr('viewer.liveUpdated', { time })}
            {error && <span className="dshk-live-stale"> · {tr('viewer.liveStale')}</span>}
          </div>
        )}
        <div ref={host} className="dshk-3d-host" style={{ position: 'absolute', inset: 0 }} hidden={imageMode !== undefined} />
        {image && (
          <div className={imageMode !== undefined ? 'dshk-3d-image dshk-3d-fill' : 'dshk-3d-image'} data-kicad-state="kicad-render">
            <img src={image.url} alt={tr('viewer3d.kicadRender')} draggable={false} />
            {imageMode === undefined && (
              <button type="button" className="dshk-btn dshk-3d-close" onClick={() => setImage(undefined)} data-kicad-action="close-render">{tr('viewer3d.backTo3d')}</button>
            )}
          </div>
        )}
      </div>
      {imageMode === undefined && <div className="dshk-hint dshk-3d-help">{tr('viewer3d.help')}</div>}
    </div>
  )
}
