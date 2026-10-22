import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionFileAddress } from '../src/client/address.ts'
import {
  cameraAxes, fitDistance, homeDistance, kicadCamera, kicadRenderFlags, kicadViewMatrix, rotationXYZ, viewCamera, viewDirection, VIEWS,
  type CameraState, type Vec3, type ViewName,
} from '../src/client/camera3d.ts'
import { forgetDoctor } from '../src/client/Doctor.tsx'
import type { ClientRemote, ResourceState, TabBodyProps } from '../src/client/dsh.ts'
import type { BoardInfo, SceneOptions } from '../src/client/scene3d.ts'
import { stubLocalStorage } from './storage.ts'
stubLocalStorage()

// jsdom has no WebGL: the three.js chunk is replaced by a scene that records what the view asks of it.
const fake = vi.hoisted(() => ({
  webgl: true,
  chunkFails: undefined as string | undefined,
  scenes: [] as Array<{ options: SceneOptions, loads: Array<{ bytes: number, info: BoardInfo }>, calls: string[], camera: CameraState, disposed: boolean }>,
}))
vi.mock('../src/client/three.ts', () => ({
  SCENE_CHUNK: 'client.three.js',
  webglAvailable: () => fake.webgl,
  loadScene: async () => {
    if (fake.chunkFails) throw new Error(fake.chunkFails)
    return {
      createBoardScene: (host: HTMLElement, options: SceneOptions) => {
        const record = {
          options, loads: [] as Array<{ bytes: number, info: BoardInfo }>, calls: [] as string[], disposed: false,
          camera: options.camera ?? { target: [0, 0, 0] as Vec3, direction: viewDirection(options.view ?? 'iso'), distance: 50, ortho: options.ortho },
        }
        fake.scenes.push(record)
        host.append(Object.assign(document.createElement('canvas'), { className: 'fake-3d' }))
        return {
          load: async (glb: Uint8Array, info: BoardInfo) => { record.loads.push({ bytes: glb.byteLength, info }); return { components: info.references.length } },
          setView: (view: string) => { record.calls.push(`view:${view}`); record.camera = { ...record.camera, direction: viewDirection(view as never), target: [0, 0, 0] } },
          setOrtho: (ortho: boolean) => { record.calls.push(`ortho:${ortho}`); record.camera = { ...record.camera, ortho } },
          setComponentsVisible: (visible: boolean) => { record.calls.push(`components:${visible}`) },
          camera: () => record.camera,
          setCamera: (state: CameraState) => { record.camera = state },
          boardSize: () => 40,
          dispose: () => { record.disposed = true },
        }
      },
    }
  },
}))
// Schematics open in the interactive view: a KiCanvas stand-in that loads.
vi.mock('../src/client/kicanvas.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/client/kicanvas.ts')>(),
  loadKiCanvas: async () => {
    if (!customElements.get('kicanvas-embed')) {
      customElements.define('kicanvas-embed', class extends HTMLElement {
        connectedCallback() { this.setAttribute('loaded', '') }
      })
    }
  },
}))
const { createViewer } = await import('../src/client/Viewer.tsx')
const { LIVE_3D_DELAY_MS, readWorkspaceFile, renderSize } = await import('../src/client/Board3D.tsx')

const enc = (text: string) => new TextEncoder().encode(text)
const GLB = new Uint8Array(1234)
const LIBRARY_MISSING = { var: 'KICAD10_3DMODEL_DIR', dir: '/usr/share/kicad/3dmodels', installed: false }

function sceneExport(over: Record<string, unknown> = {}) {
  return {
    path: '/p/board.kicad_pcb', glb: '/p/.dsh-kicad/render/board/board.glb', cached: false, seconds: 0.5, bytes: GLB.length,
    board: { bbox: [100, 100, 140, 130], width: 40, height: 30, center: [120, 115], thickness: 1.6 },
    references: ['R1', 'C1', 'U1'],
    models: { footprints_with_models: 3, missing: [], library: { ...LIBRARY_MISSING, installed: true } },
    ...over,
  }
}

const doctorReport = {
  ok: true, status: 'ok', summary: 'Ready: KiCad 10.0.7.', install: [],
  checks: [
    { id: 'kicad_cli', label: 'kicad-cli', status: 'ok', summary: '/usr/bin/kicad-cli' },
    { id: '3d_models', label: '3D models (optional)', status: 'warn', summary: "KiCad's 3D model library is not installed.", fix: 'Install it.',
      install: [{ id: 'packages3d', label: 'KiCad 3D models (dnf)', command: 'sudo dnf install -y kicad-packages3d', needs_root: true, runnable: false, available: true, recommended: false, note: '' }] },
  ],
}

/** A session workspace with a board; `exports` answers each `--glb` run in turn (the last one repeats). */
function workspace(options: { exports?: Array<Record<string, unknown> | string>, design?: string } = {}) {
  const design = options.design ?? 'board.kicad_pcb'
  const versions: Record<string, string> = {}
  const exports = options.exports ?? [sceneExport()]
  let glbRuns = 0
  const ok = (text: string) => ({ ok: true as const, value: { result: { kind: 'success' as const, text } } })
  const fail = (text: string) => ({ ok: true as const, value: { result: { kind: 'error' as const, text } } })
  const execute = vi.fn(async (_session: string, line: string) => {
    if (line.startsWith('/kicad-doctor')) return ok(JSON.stringify(doctorReport))
    if (line.startsWith('/kicad-install status')) return ok(JSON.stringify({ job: null }))
    if (line.includes('--glb')) {
      const answer = exports[Math.min(glbRuns++, exports.length - 1)]!
      return typeof answer === 'string' ? fail(answer) : ok(JSON.stringify(answer))
    }
    if (line.includes('--3d')) return ok(JSON.stringify({ path: '/p/board.kicad_pcb', svg: [], png: ['/p/.dsh-kicad/render/board/board-3d-top-view.png'] }))
    return ok('{}')
  })
  const readBytes = vi.fn(async (_s: string, path: string) => ({ ok: true as const, value: { absolutePath: `/p/${path}`, version: 'v', data: path.endsWith('.glb') ? GLB : enc('x'), eof: true } }))
  const remote: ClientRemote = {
    commands: { execute },
    workspaceFiles: {
      list: vi.fn(async () => ({ ok: true as const, value: { absolutePath: '/p', entries: [] } })),
      readBytes,
    },
  }
  const address = sessionFileAddress('s1', design)
  const useResource = ((addr: string) => (addr === 'none:' ? { status: 'none' } : { status: 'live', value: { absolutePath: addr, version: versions[addr] ?? 'v0' } })) as <V>(addr: string) => ResourceState<V>
  const props = (visible = true): TabBodyProps => ({
    useTabInfo: () => ({ tab: { id: 't1', contentId: address, visible, signal: new AbortController().signal } }),
    useResource,
  })
  return {
    remote, props, execute, readBytes,
    lines: () => execute.mock.calls.map(([, line]) => line).filter(l => l.startsWith('/kicad-render')),
    edit: (version: string) => { versions[address] = version },
  }
}

const pause = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const q = (view: { container: HTMLElement }, selector: string) => view.container.querySelector(selector)

async function open(ws: ReturnType<typeof workspace>) {
  const Viewer = createViewer(ws.remote)
  const view = render(<Viewer {...ws.props()} />)
  const update = (visible = true) => view.rerender(<Viewer {...ws.props(visible)} />)
  return { view, update }
}

beforeEach(() => {
  localStorage.clear()
  forgetDoctor()
  fake.webgl = true
  fake.chunkFails = undefined
  fake.scenes = []
  vi.useFakeTimers({ shouldAdvanceTime: true })
  URL.createObjectURL = vi.fn(() => 'blob:render')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { vi.useRealTimers() })

describe('3D mode', () => {
  it('is offered for boards only; schematics keep their two modes', async () => {
    const sch = await open(workspace({ design: 'rc.kicad_sch' }))
    expect(q(sch.view, '[data-kicad-mode="interactive"]')).toBeTruthy()
    expect(q(sch.view, '[data-kicad-mode="3d"]')).toBeNull()
    sch.view.unmount()
    // A board's choice of 3D opens a schematic interactively.
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const again = await open(workspace({ design: 'rc.kicad_sch' }))
    expect(q(again.view, '[data-kicad-mode-active="3d"]')).toBeNull()
    expect(q(again.view, '[data-kicad-mode="interactive"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('exports the board as GLB through /kicad-render --glb, reads its bytes and shows it', async () => {
    localStorage.setItem('dsh-kicad:viewer-mode', 'svg')
    const ws = workspace()
    const { view } = await open(ws)
    await act(async () => { fireEvent.click(q(view, '[data-kicad-mode="3d"]')!) })
    expect(localStorage.getItem('dsh-kicad:viewer-mode')).toBe('3d')
    await waitFor(() => expect(q(view, '[data-kicad-state="3d-ready"]')).toBeTruthy())
    expect(ws.lines()).toContain('/kicad-render board.kicad_pcb --glb --json')
    expect(ws.readBytes).toHaveBeenCalledWith('s1', '.dsh-kicad/render/board/board.glb', {}, undefined)
    expect(fake.scenes).toHaveLength(1)
    const [load] = fake.scenes[0]!.loads
    expect(load).toEqual({ bytes: GLB.length, info: { bbox: [100, 100, 140, 130], width: 40, height: 30, center: [120, 115], thickness: 1.6, references: ['R1', 'C1', 'U1'] } })
    expect(q(view, '[data-kicad-live="ready"]')?.textContent).toMatch(/Live · updated/)
    expect(q(view, '[data-kicad-state="models-missing"]')).toBeNull()
    // KiCad's views, projection and components reach the scene.
    await act(async () => { fireEvent.click(q(view, '[data-kicad-view="bottom"]')!) })
    await act(async () => { fireEvent.click(q(view, '[data-kicad-projection="ortho"]')!) })
    await act(async () => { fireEvent.click(q(view, '[data-kicad-components]')!) })
    await act(async () => { fireEvent.click(q(view, '[data-kicad-action="reset-view"]')!) })
    expect(fake.scenes[0]!.calls).toEqual(expect.arrayContaining(['view:bottom', 'ortho:true', 'components:false', 'view:iso']))
    expect(localStorage.getItem('dsh-kicad:3d-projection')).toBe('off')
    expect(localStorage.getItem('dsh-kicad:3d-components')).toBe('off')
  })

  it('reloads a changed board after a quiet moment and keeps the camera, also across mode switches', async () => {
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const ws = workspace()
    const { view, update } = await open(ws)
    await waitFor(() => expect(fake.scenes[0]?.loads).toHaveLength(1))
    // The user orbits somewhere.
    const orbited: CameraState = { target: [5, 0, -3], direction: viewDirection('right'), distance: 20, ortho: false }
    fake.scenes[0]!.camera = orbited
    ws.edit('v1')
    update()
    await pause(LIVE_3D_DELAY_MS - 300)
    ws.edit('v2') // a burst of edits settles first
    update()
    await pause(LIVE_3D_DELAY_MS - 300)
    expect(fake.scenes[0]!.loads).toHaveLength(1)
    await pause(400)
    await waitFor(() => expect(fake.scenes[0]!.loads).toHaveLength(2))
    await waitFor(() => expect(q(view, '[data-kicad-reloads="1"]')).toBeTruthy())
    // Same scene, no view reset: the camera is where the user left it.
    expect(fake.scenes).toHaveLength(1)
    expect(fake.scenes[0]!.calls.filter(c => c.startsWith('view:'))).toEqual([])
    expect(fake.scenes[0]!.camera).toBe(orbited)
    expect(ws.lines().filter(l => l.includes('--glb'))).toHaveLength(2)
    // A hidden tab waits and catches up when shown.
    ws.edit('v3')
    update(false)
    await pause(LIVE_3D_DELAY_MS * 3)
    expect(fake.scenes[0]!.loads).toHaveLength(2)
    update(true)
    await pause(LIVE_3D_DELAY_MS + 100)
    await waitFor(() => expect(fake.scenes[0]!.loads).toHaveLength(3))
    // To SVG and back: a new scene starts from the kept camera.
    await act(async () => { fireEvent.click(q(view, '[data-kicad-mode="svg"]')!) })
    expect(fake.scenes[0]!.disposed).toBe(true)
    await act(async () => { fireEvent.click(q(view, '[data-kicad-mode="3d"]')!) })
    await waitFor(() => expect(fake.scenes).toHaveLength(2))
    expect(fake.scenes[1]!.options.camera).toEqual(orbited)
  })

  it('keeps the last good model when an export fails, with a notice', async () => {
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const ws = workspace({ exports: [sceneExport(), 'kicad-cli pcb export glb failed (1): Failed to load board'] })
    const { view, update } = await open(ws)
    await waitFor(() => expect(fake.scenes[0]?.loads).toHaveLength(1))
    ws.edit('v1')
    update()
    await pause(LIVE_3D_DELAY_MS + 100)
    await waitFor(() => expect(q(view, '[data-kicad-state="stale"]')?.textContent).toMatch(/last good model.*Failed to load board/))
    expect(fake.scenes[0]!.loads).toHaveLength(1)
    expect(q(view, '[data-kicad-state="3d-ready"]')).toBeTruthy()
    expect(q(view, '[data-kicad-live="ready"]')?.textContent).toMatch(/could not be displayed/)
    // One attempt per version: no retry loop.
    await pause(LIVE_3D_DELAY_MS * 3)
    expect(ws.lines().filter(l => l.includes('--glb'))).toHaveLength(2)
  })

  it('says so when the first export fails, and can try again', async () => {
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const ws = workspace({ exports: ['Board outline is missing', sceneExport()] })
    const { view } = await open(ws)
    await waitFor(() => expect(q(view, '[data-kicad-state="error"]')?.textContent).toMatch(/Could not export the board in 3D: Board outline is missing/))
    await act(async () => { fireEvent.click(q(view, '[data-kicad-action="retry"]')!) })
    await waitFor(() => expect(q(view, '[data-kicad-state="3d-ready"]')).toBeTruthy())
    expect(ws.lines()).toContain('/kicad-render board.kicad_pcb --glb --force --json')
  })

  it('shows how to install KiCad\'s 3D models when footprints reference missing library models', async () => {
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const missing = [{ reference: 'R1', model: '${KICAD10_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0603_1608Metric.step' }, { reference: 'C1', model: '${KICAD10_3DMODEL_DIR}/Capacitor_SMD.3dshapes/C_0603_1608Metric.step' }]
    const ws = workspace({ exports: [sceneExport({ models: { footprints_with_models: 3, missing, library: LIBRARY_MISSING } })] })
    const { view } = await open(ws)
    await waitFor(() => expect(q(view, '[data-kicad-state="models-missing"]')?.textContent).toMatch(/3D model library is not installed, so 2 of 3 footprints have no body/))
    await act(async () => { fireEvent.click(q(view, '[data-kicad-action="models-help"]')!) })
    await waitFor(() => expect(q(view, '[data-kicad-models-doctor] [data-kicad-option="packages3d"]')).toBeTruthy())
    const panel = q(view, '[data-kicad-models-doctor]')!
    expect(panel.textContent).toContain('sudo dnf install -y kicad-packages3d')
    expect(panel.querySelector('[data-kicad-action="copy"]')).toBeTruthy()
    expect(panel.querySelector('[data-kicad-action="install"]')).toBeNull() // root-only: shown, never run
    expect(panel.querySelector('[data-kicad-check="kicad_cli"]')).toBeNull() // only the 3D model check
  })

  it('lists project models that were not found', async () => {
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const missing = [{ reference: 'J9', model: '${KIPRJMOD}/models/custom.step' }]
    const ws = workspace({ exports: [sceneExport({ models: { footprints_with_models: 3, missing, library: { ...LIBRARY_MISSING, installed: true } } })] })
    const { view } = await open(ws)
    await waitFor(() => expect(q(view, '[data-kicad-state="models-missing"]')?.textContent).toMatch(/1 footprint 3D model\(s\) were not found: J9/))
    await act(async () => { fireEvent.click(q(view, '[data-kicad-action="models-help"]')!) })
    expect(q(view, '[data-kicad-missing-models]')?.textContent).toContain('J9: ${KIPRJMOD}/models/custom.step')
  })

  it('renders the current camera with KiCad (high quality) and shows the image', async () => {
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const ws = workspace()
    const { view } = await open(ws)
    await waitFor(() => expect(fake.scenes[0]?.loads).toHaveLength(1))
    await act(async () => { fireEvent.click(q(view, '[data-kicad-view="front"]')!) })
    await act(async () => { fireEvent.click(q(view, '[data-kicad-action="kicad-render"]')!) })
    await waitFor(() => expect(q(view, '[data-kicad-state="kicad-render"] img')?.getAttribute('src')).toBe('blob:render'))
    const line = ws.lines().find(l => l.includes('--3d'))!
    expect(line).toMatch(/^\/kicad-render board\.kicad_pcb --3d --side=top --rotate=-90,0,0 --zoom=[\d.]+ --pivot=0,0,0 --perspective --quality=high --width=\d+ --height=\d+ --name=view --json$/)
    expect(ws.readBytes).toHaveBeenCalledWith('s1', '/p/.dsh-kicad/render/board/board-3d-top-view.png', {}, undefined)
    await act(async () => { fireEvent.click(q(view, '[data-kicad-action="close-render"]')!) })
    expect(q(view, '[data-kicad-state="kicad-render"]')).toBeNull()
  })

  it('shows KiCad renders when the browser has no WebGL', async () => {
    fake.webgl = false
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const ws = workspace()
    const { view } = await open(ws)
    await waitFor(() => expect(q(view, '[data-kicad-state="kicad-render"] img')).toBeTruthy())
    expect(fake.scenes).toEqual([])
    expect(q(view, '[data-kicad-state="no-webgl"]')?.textContent).toMatch(/WebGL is not available/)
    expect(ws.lines()).toEqual([expect.stringMatching(/^\/kicad-render board\.kicad_pcb --3d --side=top --rotate=-45,0,45 --zoom=[\d.]+ --pivot=0,0,0 --perspective --quality=basic .*--name=view --json$/)])
    // A view button renders that view.
    await act(async () => { fireEvent.click(q(view, '[data-kicad-view="top"]')!) })
    await waitFor(() => expect(ws.lines()).toHaveLength(2))
    expect(ws.lines()[1]).toMatch(/--rotate=0,0,0 /)
    expect(q(view, '[data-kicad-view="top"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('falls back to KiCad renders when the 3D chunk cannot load', async () => {
    fake.chunkFails = 'chunk 404'
    localStorage.setItem('dsh-kicad:viewer-mode', '3d')
    const ws = workspace()
    const { view } = await open(ws)
    await waitFor(() => expect(q(view, '[data-kicad-state="no-webgl"]')?.textContent).toMatch(/could not start \(chunk 404\)/))
    await waitFor(() => expect(q(view, '[data-kicad-state="kicad-render"] img')).toBeTruthy())
  })
})

describe('3D data path', () => {
  it('reads a scene above dsh\'s whole-file limit in 2 MiB windows', async () => {
    const size = 5 * 1024 * 1024 + 10
    const file = new Uint8Array(size)
    for (let i = 0; i < size; i += 4099) file[i] = (i / 4099) % 251
    const readBytes = vi.fn(async (_s: string, _p: string, options: { range?: { offset?: number, length?: number } }) => {
      if (!options.range) return { ok: false as const, error: { code: 'workspace-file/too-large', message: 'too large' } }
      const { offset = 0, length = 0 } = options.range
      expect(length).toBeLessThanOrEqual(2 * 1024 * 1024)
      const data = file.slice(offset, offset + length)
      return { ok: true as const, value: { absolutePath: '/p/x.glb', version: 'v', data, eof: offset + data.length >= size } }
    })
    const remote = { workspaceFiles: { readBytes, list: vi.fn() }, commands: { execute: vi.fn() } } as unknown as ClientRemote
    const out = await readWorkspaceFile(remote, 's1', 'x.glb')
    expect(out.length).toBe(size)
    expect(Buffer.compare(out, file)).toBe(0)
    expect(readBytes).toHaveBeenCalledTimes(4)
    const missing = { workspaceFiles: { readBytes: vi.fn(async () => ({ ok: false as const, error: { code: 'workspace-file/not-found', message: 'no such file' } })) } } as unknown as ClientRemote
    await expect(readWorkspaceFile(missing, 's1', 'x.glb')).rejects.toThrow('no such file')
  })

  it('sizes KiCad renders to the stage, at most 1600 px', () => {
    expect(renderSize(0, 0)).toEqual({ width: 1200, height: 900 })
    expect(renderSize(400, 300, 2)).toEqual({ width: 800, height: 600 })
    expect(renderSize(1200, 600, 2)).toEqual({ width: 1600, height: 800 })
  })
})

describe('camera mapping to kicad-cli pcb render', () => {
  const close = (a: readonly (readonly number[])[], b: readonly (readonly number[])[], digits = 5) =>
    a.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(b[i]![j]!, digits)))
  const board = { size: 40 }

  it('maps the iso view to kicad-cli\'s isometric example and the plain views to KiCad\'s view commands', () => {
    const home = (view: ViewName, ortho = false): CameraState => ({ ...viewCamera(view, board, ortho), distance: homeDistance(board) })
    expect(kicadCamera(home('iso', true), board)).toEqual({ side: 'top', rotate: [-45, 0, 45], zoom: 1, pivot: [0, 0, 0], perspective: false })
    expect(kicadCamera(viewCamera('top', board, false), board).rotate).toEqual([0, 0, 0])
    expect(kicadCamera(viewCamera('front', board, false), board).rotate).toEqual([-90, 0, 0])
    // CAMERA::ViewCommand_T1: Euler angles of each view, composed as Rx·Ry·Rz.
    const kicad: Record<string, Vec3> = { top: [0, 0, 0], bottom: [0, 180, 0], front: [-90, 0, 0], back: [-90, 0, 180], left: [-90, 0, 90], right: [-90, 0, -90], iso: [-45, 0, 45] }
    for (const view of VIEWS) {
      close(kicadViewMatrix(viewDirection(view)), rotationXYZ(kicad[view]!))
      // And the decomposition the render command gets reproduces the same view.
      close(rotationXYZ(kicadCamera(viewCamera(view, board, false), board).rotate), rotationXYZ(kicad[view]!), 3)
    }
  })

  it('maps distance to zoom and the orbit target to the pivot', () => {
    expect(homeDistance(board)).toBe(50)
    const state: CameraState = { target: [10, 0, -20], direction: viewDirection('iso'), distance: 25, ortho: false }
    const camera = kicadCamera(state, board)
    expect(camera.zoom).toBe(2)
    expect(camera.pivot).toEqual([1, 2, 0]) // board X right, up the board (= -Z), cm
    expect(camera.perspective).toBe(true)
    expect(kicadRenderFlags(camera)).toEqual(['--side=top', '--rotate=-45,0,45', '--zoom=2', '--pivot=1,2,0', '--perspective'])
    expect(kicadCamera({ ...state, distance: 1e-3 }, board).zoom).toBe(48)
  })

  it('starts views framing the whole board, closer in a wide view than in a narrow sidebar', () => {
    const frame = { size: 40, radius: 25 }
    const wide = fitDistance(frame, 16 / 9)
    const narrow = fitDistance(frame, 0.6)
    expect(narrow).toBeGreaterThan(wide)
    expect(wide).toBeCloseTo((25 / Math.sin(Math.PI / 8)) * 1.04, 5)
    expect(viewCamera('top', frame, false, 0.6).distance).toBe(narrow)
    // Within the zoom range kicad-cli accepts.
    expect(fitDistance({ size: 40, radius: 1e6 }, 1)).toBe(homeDistance(frame) / 0.5)
  })

  it('handles any orbit angle', () => {
    for (const direction of [[0.3, 0.4, -0.866], [-0.9, -0.2, 0.39], [0, -1, 1e-6], [0.01, 0.99, 0.01]] as Vec3[]) {
      const state: CameraState = { target: [0, 0, 0], direction, distance: 50, ortho: false }
      // Angles are rounded to 0.01°.
      close(rotationXYZ(kicadCamera(state, board).rotate), kicadViewMatrix(direction), 3)
      const [right, up, back] = cameraAxes(direction)
      expect(Math.abs(right[0] * up[0] + right[1] * up[1] + right[2] * up[2])).toBeLessThan(1e-9)
      expect(Math.hypot(...back)).toBeCloseTo(1)
    }
  })
})
