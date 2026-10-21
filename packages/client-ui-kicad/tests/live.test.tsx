import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubLocalStorage } from './storage.ts'
import type { ClientRemote, ToolViewProps } from '../src/client/dsh.ts'
stubLocalStorage()

// Fake KiCanvas: loads unless the source text contains "BROKEN"; remembers camera calls.
const cameraCalls: Array<{ x: number, y: number, zoom: number }> = []
vi.mock('../src/client/kicanvas.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/client/kicanvas.ts')>()
  return {
    ...real,
    loadKiCanvas: async () => {
      if (customElements.get('kicanvas-embed')) return
      customElements.define('kicanvas-embed', class extends HTMLElement {
        camera = { x: 0, y: 0, zoom: 1 }
        connectedCallback() {
          if (!this.textContent?.includes('BROKEN')) this.setAttribute('loaded', '')
        }
        dsh_get_camera() { return { ...this.camera } }
        dsh_set_camera(s: { x: number, y: number, zoom: number }) { cameraCalls.push(s); this.camera = { ...s }; return true }
      })
    },
  }
})
const { InteractiveView } = await import('../src/client/InteractiveView.tsx')
const { EditCard, CreateCard } = await import('../src/client/Cards.tsx')
const follow = await import('../src/client/follow.ts')

function remote(contents: { text: string }): ClientRemote {
  return {
    commands: { execute: vi.fn() } as never,
    workspaceFiles: {
      list: vi.fn(async () => ({ ok: true as const, value: { absolutePath: '/p', entries: [{ name: 'a.kicad_sch', type: 'file' as const }] } })),
      readBytes: vi.fn(async () => ({ ok: true as const, value: { absolutePath: '/p/a.kicad_sch', version: 'v', data: new TextEncoder().encode(contents.text), eof: true } })),
    },
  }
}
const tr = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`

describe('live interactive view', () => {
  beforeEach(() => { cameraCalls.length = 0 })

  it('swaps in each new version and keeps the camera', async () => {
    const contents = { text: '(kicad_sch v1)' }
    const r = remote(contents)
    const onFailed = vi.fn()
    const props = { remote: r, sessionId: 's', designPath: 'a.kicad_sch', theme: 'kicad', tr: tr as never, onFailed }
    const view = render(<InteractiveView {...props} version="1" />)
    await waitFor(() => expect(view.container.querySelector('[data-kicad-state="kicanvas-ready"]')).toBeTruthy())
    const first = view.container.querySelector('kicanvas-embed') as HTMLElement & { camera: object }
    first.camera = { x: 12, y: 34, zoom: 5 } // the user panned and zoomed
    contents.text = '(kicad_sch v2)'
    view.rerender(<InteractiveView {...props} version="2" />)
    await waitFor(() => expect(view.container.querySelector('[data-kicad-reloads="1"]')).toBeTruthy())
    const embeds = view.container.querySelectorAll('kicanvas-embed')
    expect(embeds).toHaveLength(1)
    expect(embeds[0]!.textContent).toContain('v2')
    expect(cameraCalls).toEqual([{ x: 12, y: 34, zoom: 5 }])
    expect(view.container.querySelector('[data-kicad-live="ready"]')?.textContent).toMatch(/viewer.liveUpdated/)
    expect(onFailed).not.toHaveBeenCalled()
  })

  it('keeps the last good drawing when a new version cannot be parsed', async () => {
    const contents = { text: '(kicad_sch ok)' }
    const props = { remote: remote(contents), sessionId: 's', designPath: 'a.kicad_sch', theme: 'kicad', tr: tr as never, onFailed: vi.fn() }
    const view = render(<InteractiveView {...props} version="1" />)
    await waitFor(() => expect(view.container.querySelector('[data-kicad-state="kicanvas-ready"]')).toBeTruthy())
    contents.text = '(kicad_sch BROKEN'
    view.rerender(<InteractiveView {...props} version="2" />)
    await waitFor(() => expect(view.container.textContent).toMatch(/viewer.liveStale/), { timeout: 6000 })
    expect(view.container.querySelectorAll('kicanvas-embed')).toHaveLength(1)
    expect(view.container.querySelector('kicanvas-embed')!.textContent).toContain('ok')
    expect(props.onFailed).not.toHaveBeenCalled()
  }, 10_000)
})

describe('follow the agent', () => {
  beforeEach(() => { follow.resetFollowed(); localStorage.clear() })
  const now = Date.now()

  it('decides when a tool row should open its design', () => {
    const base = { toolName: 'kicad_edit_schematic', phase: 'start', time: now, path: 'hw/a.kicad_sch', now }
    expect(follow.shouldFollow(base)).toBe(true)
    expect(follow.shouldFollow({ ...base, time: now - 10 * 60_000 })).toBe(false) // replayed history
    expect(follow.shouldFollow({ ...base, path: 'notes.md' })).toBe(false)
    expect(follow.shouldFollow({ ...base, path: 'hw/.scratch_orient.kicad_sch' })).toBe(false)
    expect(follow.shouldFollow({ ...base, toolName: 'kicad_create_schematic' })).toBe(false) // not created yet
    expect(follow.shouldFollow({ ...base, toolName: 'kicad_create_schematic', phase: 'result' })).toBe(true)
    expect(follow.shouldFollow({ ...base, phase: 'result', isError: true })).toBe(false)
  })

  const row = (over: Partial<ToolViewProps>): ToolViewProps => ({
    toolName: 'kicad_edit_schematic', callId: 'c', phase: 'start', cwd: '/p',
    block: { argsRaw: '{"path":"hw/a.kicad_sch","operations":[]}', time: Date.now() }, ...over,
  })

  it('opens a live edit once per design and ignores history', async () => {
    const openFile = vi.fn()
    render(<EditCard {...row({ openFile })} />)
    render(<EditCard {...row({ openFile, callId: 'c2' })} />) // a second edit of the same file
    render(<EditCard {...row({ openFile, callId: 'old', block: { argsRaw: '{"path":"hw/b.kicad_sch"}', time: Date.now() - 3_600_000 } })} />)
    await act(async () => {})
    expect(openFile.mock.calls).toEqual([['hw/a.kicad_sch']])
  })

  it('opens a created schematic when creation settles, unless following is off', async () => {
    const openFile = vi.fn()
    const created = row({ toolName: 'kicad_create_schematic', phase: 'result', openFile, block: { argsRaw: '{"path":"new.kicad_sch"}', time: Date.now(), content: [{ type: 'text', text: '{}' }] } })
    const view = render(<CreateCard {...created} />)
    await act(async () => {})
    expect(openFile).toHaveBeenCalledWith('new.kicad_sch')
    expect(view.container.querySelector('[data-kicad-card="create"]')).toBeTruthy()
    follow.resetFollowed()
    follow.setFollowEnabled(false)
    const off = vi.fn()
    render(<CreateCard {...{ ...created, openFile: off }} />)
    await act(async () => {})
    expect(off).not.toHaveBeenCalled()
  })
})
