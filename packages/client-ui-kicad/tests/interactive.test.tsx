import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pickFiles } from '../src/client/kicanvas.ts'
import { sessionFileAddress } from '../src/client/address.ts'
import { stubLocalStorage } from './storage.ts'
stubLocalStorage()
import type { ClientRemote } from '../src/client/dsh.ts'

// jsdom has no WebGL: replace the real KiCanvas with a fake custom element.
let loadedAttr = true
vi.mock('../src/client/kicanvas.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/client/kicanvas.ts')>()
  return {
    ...real,
    loadKiCanvas: async () => {
      if (!customElements.get('kicanvas-embed')) {
        customElements.define('kicanvas-embed', class extends HTMLElement {
          connectedCallback() { if (loadedAttr) this.setAttribute('loaded', '') }
        })
      }
    },
  }
})
const { createViewer } = await import('../src/client/Viewer.tsx')

describe('pickFiles', () => {
  it('passes every schematic of the directory (root first) plus the project', () => {
    const entries = ['b.kicad_sch', 'top.kicad_sch', 'top.kicad_pro', 'top.kicad_pcb', 'notes.md', 'a.kicad_sch'].map(name => ({ name, type: 'file' }))
    expect(pickFiles('top.kicad_sch', entries)).toEqual(['top.kicad_sch', 'a.kicad_sch', 'b.kicad_sch', 'top.kicad_pro'])
    expect(pickFiles('top.kicad_pcb', entries)).toEqual(['top.kicad_pcb', 'top.kicad_pro'])
    expect(pickFiles('x.kicad_sch', [{ name: 'huge.kicad_sch', type: 'file', size: 64 * 1024 * 1024 }])).toEqual(['x.kicad_sch'])
  })
})

describe('interactive viewer', () => {
  beforeEach(() => { localStorage.clear(); loadedAttr = true })

  function remote(): ClientRemote {
    const enc = new TextEncoder()
    return {
      commands: { execute: vi.fn(async () => ({ ok: true as const, value: undefined })) },
      workspaceFiles: {
        list: vi.fn(async () => ({ ok: true as const, value: { absolutePath: '/p/hw', entries: [
          { name: 'top.kicad_sch', type: 'file' as const }, { name: 'power.kicad_sch', type: 'file' as const }, { name: 'top.kicad_pro', type: 'file' as const }] } })),
        readBytes: vi.fn(async (_s: string, path: string) => ({ ok: true as const, value: { absolutePath: `/p/${path}`, version: 'v1', data: enc.encode(`(content of ${path})`), eof: true } })),
      },
    }
  }
  const props = (address: string) => ({ useTabInfo: () => ({ tab: { id: 't1', contentId: address, signal: new AbortController().signal } }) })

  it('opens the design in KiCanvas with all sheets as inline sources', async () => {
    const r = remote()
    const Viewer = createViewer(r)
    const { container } = render(<Viewer {...props(sessionFileAddress('s1', 'hw/top.kicad_sch'))} />)
    await waitFor(() => expect(container.querySelector('[data-kicad-state="kicanvas-ready"]')).toBeTruthy())
    expect(r.workspaceFiles.list).toHaveBeenCalledWith('s1', 'hw', expect.anything())
    const sources = [...container.querySelectorAll('kicanvas-source')].map(s => [s.getAttribute('name'), s.textContent])
    expect(sources).toEqual([
      ['top.kicad_sch', '(content of hw/top.kicad_sch)'],
      ['power.kicad_sch', '(content of hw/power.kicad_sch)'],
      ['top.kicad_pro', '(content of hw/top.kicad_pro)'],
    ])
    expect(container.querySelector('kicanvas-embed')?.getAttribute('theme')).toBe('kicad')
  })

  it('falls back to the SVG view when KiCanvas cannot load the file', async () => {
    loadedAttr = false
    const Viewer = createViewer(remote())
    const { container } = render(<Viewer {...props(sessionFileAddress('s1', 'top.kicad_sch'))} />)
    await waitFor(() => expect(container.querySelector('[data-kicad-state="fallback"]')).toBeTruthy(), { timeout: 6000 })
    expect(container.querySelector('[data-kicad-state="fallback"]')?.textContent).toMatch(/could not open/)
  }, 10_000)

  it('remembers the chosen mode', async () => {
    const Viewer = createViewer(remote())
    const { container } = render(<Viewer {...props(sessionFileAddress('s1', 'top.kicad_sch'))} />)
    await act(async () => { fireEvent.click(container.querySelector('[data-kicad-mode="svg"]')!) })
    expect(localStorage.getItem('dsh-kicad:viewer-mode')).toBe('svg')
    expect(container.querySelector('[data-kicad-action="render"]')).toBeTruthy()
  })
})
