import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sessionFileAddress } from '../src/client/address.ts'
import type { ClientRemote, ResourceState, TabBodyProps } from '../src/client/dsh.ts'
import { stubLocalStorage } from './storage.ts'
stubLocalStorage()

// jsdom has no WebGL: a fake KiCanvas that always loads.
vi.mock('../src/client/kicanvas.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/client/kicanvas.ts')>()
  return {
    ...real,
    loadKiCanvas: async () => {
      if (customElements.get('kicanvas-embed')) return
      customElements.define('kicanvas-embed', class extends HTMLElement {
        connectedCallback() { this.setAttribute('loaded', '') }
        dsh_get_camera() { return { x: 1, y: 2, zoom: 3 } }
        dsh_set_camera() { return true }
      })
    },
  }
})
const { createViewer, rendersItself, SELF_RENDER_DELAY_MS } = await import('../src/client/Viewer.tsx')

const enc = (text: string) => new TextEncoder().encode(text)
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
/** A kicad-cli render takes a while; the view sees it start and finish in separate updates. */
const RENDER_MS = 100

/** A session workspace whose file versions the test bumps, as dsh's resource watcher would. */
function workspace(design: string, options: { pages?: string[], renderFails?: string } = {}) {
  const versions: Record<string, string> = {}
  const texts: Record<string, string> = {}
  const pages = options.pages ?? ['board.svg']
  const execute = vi.fn(async (_session: string, line: string) => (line.startsWith('/kicad-render') && await new Promise(resolve => setTimeout(resolve, RENDER_MS)), options.renderFails
    ? { ok: true as const, value: { result: { kind: 'error' as const, text: options.renderFails } } }
    : { ok: true as const, value: { result: { kind: 'success' as const, text: '{}' } } }))
  const remote: ClientRemote = {
    commands: { execute },
    workspaceFiles: {
      list: vi.fn(async (_s: string, dir: string) => ({ ok: true as const, value: { absolutePath: `/p/${dir}`, entries: (dir.includes('.dsh-kicad') ? pages : Object.keys(texts)).map(name => ({ name, type: 'file' as const })) } })),
      readBytes: vi.fn(async (_s: string, path: string) => ({ ok: true as const, value: { absolutePath: `/p/${path}`, version: 'v', data: enc(path.endsWith('.svg') ? SVG : texts[path] ?? ''), eof: true } })),
    },
  }
  const address = sessionFileAddress('s1', design)
  const useResource = ((addr: string) => (addr === 'none:' ? { status: 'none' } : { status: 'live', value: { absolutePath: addr, version: versions[addr] ?? 'v0' } })) as <V>(addr: string) => ResourceState<V>
  const props = (visible = true): TabBodyProps => ({
    useTabInfo: () => ({ tab: { id: 't1', contentId: address, visible, signal: new AbortController().signal } }),
    useResource,
  })
  return {
    remote, texts, props,
    /** The `/kicad-render` calls (the viewer's KiCad notice also runs `/kicad-doctor --json`). */
    renders: () => execute.mock.calls.filter(([, line]) => line.startsWith('/kicad-render')),
    /** The design was written: bump its version. */
    edit: (version: string) => { versions[address] = version },
    /** A render landed: bump the version of the shown SVG page. */
    rendered: (version: string, page = pages[0] ?? 'board.svg') => { versions[sessionFileAddress('s1', `.dsh-kicad/render/${design.replace(/\.kicad_(sch|pcb)$/, '')}/${page}`)] = version },
  }
}

const pause = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

describe('board viewer: interactive mode', () => {
  beforeEach(() => localStorage.setItem('dsh-kicad:viewer-mode', 'interactive'))

  it('loads the board with its project and reloads it on every change, without kicad-cli renders', async () => {
    const ws = workspace('board.kicad_pcb')
    Object.assign(ws.texts, { 'board.kicad_pcb': '(kicad_pcb v1)', 'board.kicad_pro': '{}', 'board.kicad_sch': '(kicad_sch)' })
    const Viewer = createViewer(ws.remote)
    const view = render(<Viewer {...ws.props()} />)
    await waitFor(() => expect(view.container.querySelector('[data-kicad-state="kicanvas-ready"]')).toBeTruthy())
    const sources = () => [...view.container.querySelectorAll('kicanvas-source')].map(s => [s.getAttribute('name'), s.textContent])
    expect(sources()).toEqual([['board.kicad_pcb', '(kicad_pcb v1)'], ['board.kicad_pro', '{}']])
    for (const n of [2, 3]) {
      ws.texts['board.kicad_pcb'] = `(kicad_pcb v${n})`
      ws.edit(`v${n}`)
      view.rerender(<Viewer {...ws.props()} />)
      await waitFor(() => expect(view.container.querySelector(`[data-kicad-reloads="${n - 1}"]`)).toBeTruthy())
      expect(sources()[0]).toEqual(['board.kicad_pcb', `(kicad_pcb v${n})`])
    }
    expect(view.container.querySelectorAll('kicanvas-embed')).toHaveLength(1)
    expect(ws.renders()).toEqual([])
  })
})

describe('board viewer: SVG mode', () => {
  beforeEach(() => {
    localStorage.setItem('dsh-kicad:viewer-mode', 'svg')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    URL.createObjectURL = vi.fn(() => 'blob:svg')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => { vi.useRealTimers() })

  async function open(ws: ReturnType<typeof workspace>) {
    const Viewer = createViewer(ws.remote)
    const view = render(<Viewer {...ws.props()} />)
    const update = (visible = true) => view.rerender(<Viewer {...ws.props(visible)} />)
    return { view, update }
  }
  const image = (view: { container: HTMLElement }) => view.container.querySelector('img[data-kicad-state="image"]')

  it('only boards render themselves; schematics keep the policy render', () => {
    expect(rendersItself('hw/board.kicad_pcb')).toBe(true)
    expect(rendersItself('hw/board.kicad_sch')).toBe(false)
  })

  it('re-renders a changed board once it is quiet, hidden from the chat, and shows the new render', async () => {
    const ws = workspace('board.kicad_pcb')
    const { view, update } = await open(ws)
    await waitFor(() => expect(image(view)).toBeTruthy())
    ws.edit('v1')
    update()
    expect(view.container.querySelector('[data-kicad-state="stale"]')).toBeTruthy()
    await pause(SELF_RENDER_DELAY_MS - 200)
    expect(ws.renders()).toEqual([])
    await pause(400)
    expect(ws.renders()).toEqual([['s1', '/kicad-render board.kicad_pcb --json', []]])
    // The render lands: the view loads it and is current again.
    ws.rendered('r1')
    update()
    await waitFor(() => expect(ws.remote.workspaceFiles.readBytes).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.container.querySelector('[data-kicad-state="stale"]')).toBeNull())
    await pause(SELF_RENDER_DELAY_MS * 2)
    expect(ws.renders()).toHaveLength(1)
    // The next edit renders again.
    ws.edit('v2')
    update()
    await pause(SELF_RENDER_DELAY_MS + 200)
    expect(ws.renders()).toHaveLength(2)
  })

  it('waits for a burst of edits to settle, and stands down when a host render arrives first', async () => {
    const ws = workspace('board.kicad_pcb')
    const { view, update } = await open(ws)
    await waitFor(() => expect(image(view)).toBeTruthy())
    ws.edit('v1')
    update()
    await pause(SELF_RENDER_DELAY_MS - 500)
    ws.edit('v2')
    update()
    await pause(SELF_RENDER_DELAY_MS - 500)
    expect(ws.renders()).toEqual([])
    ws.rendered('host')
    update()
    await waitFor(() => expect(view.container.querySelector('[data-kicad-state="stale"]')).toBeNull())
    await pause(SELF_RENDER_DELAY_MS * 2)
    expect(ws.renders()).toEqual([])
  })

  it('renders again when the board changed while a render was running', async () => {
    const ws = workspace('board.kicad_pcb')
    const { view, update } = await open(ws)
    await waitFor(() => expect(image(view)).toBeTruthy())
    ws.edit('v1')
    update()
    await pause(SELF_RENDER_DELAY_MS + 50)
    ws.edit('v2') // written while kicad-cli renders v1
    update()
    await pause(RENDER_MS + 50)
    ws.rendered('r1')
    update()
    await waitFor(() => expect(ws.remote.workspaceFiles.readBytes).toHaveBeenCalledTimes(2))
    expect(view.container.querySelector('[data-kicad-state="stale"]')).toBeTruthy()
    await pause(SELF_RENDER_DELAY_MS + 50)
    expect(ws.renders()).toHaveLength(2)
  })

  it('tries a failing render once per version', async () => {
    const ws = workspace('board.kicad_pcb', { renderFails: 'Failed to load board' })
    const { view, update } = await open(ws)
    await waitFor(() => expect(image(view)).toBeTruthy())
    ws.edit('v1')
    update()
    await pause(SELF_RENDER_DELAY_MS + 50)
    expect(view.container.querySelector('[data-kicad-action="render"]')?.textContent).toMatch(/Rendering/)
    await pause(RENDER_MS + 50)
    await waitFor(() => expect(view.container.querySelector('[data-kicad-state="error"]')?.textContent).toMatch(/Failed to load board/))
    await pause(SELF_RENDER_DELAY_MS * 3)
    expect(ws.renders()).toHaveLength(1)
  })

  it('renders a board that had no render yet once it changes, and waits while the tab is hidden', async () => {
    const ws = workspace('board.kicad_pcb', { pages: [] })
    const { view, update } = await open(ws)
    await waitFor(() => expect(view.container.querySelector('[data-kicad-state="empty"]')).toBeTruthy())
    await pause(SELF_RENDER_DELAY_MS * 2)
    expect(ws.renders()).toEqual([])
    ws.edit('v1')
    update(false)
    await pause(SELF_RENDER_DELAY_MS * 2)
    expect(ws.renders()).toEqual([])
    update(true)
    await pause(SELF_RENDER_DELAY_MS + 200)
    expect(ws.renders()).toEqual([['s1', '/kicad-render board.kicad_pcb --json', []]])
  })

  it('leaves a changed schematic to the policy render (stale until it lands)', async () => {
    const ws = workspace('rc.kicad_sch', { pages: ['rc.svg'] })
    const { view, update } = await open(ws)
    await waitFor(() => expect(image(view)).toBeTruthy())
    ws.edit('v1')
    update()
    await pause(SELF_RENDER_DELAY_MS * 3)
    expect(ws.renders()).toEqual([])
    expect(view.container.querySelector('[data-kicad-state="stale"]')).toBeTruthy()
  })
})
