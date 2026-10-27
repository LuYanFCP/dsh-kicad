import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { orderPages, parseFileAddress, readCheckMeta, renderDir, sessionFileAddress, toOps } from '../src/client/index.tsx'
import { CheckCard, EditCard } from '../src/client/Cards.tsx'
import { createViewer } from '../src/client/Viewer.tsx'
import { BridgeSettings, PolicySettings } from '../src/client/Settings.tsx'
import type { ClientRemote, ToolViewProps } from '../src/client/dsh.ts'
import { stubLocalStorage } from './storage.ts'
stubLocalStorage()

describe('addresses', () => {
  it('parses session and absolute file addresses', () => {
    expect(parseFileAddress('dsh-resource://file/session/abc/hw/my%20board.kicad_sch')).toEqual({ scope: 'session', sessionId: 'abc', path: 'hw/my board.kicad_sch' })
    expect(parseFileAddress('dsh-resource://file/absolute/home/u/x.kicad_pcb')).toEqual({ scope: 'absolute', path: '/home/u/x.kicad_pcb' })
    expect(parseFileAddress('dsh-resource://file/absolute/C:/x/y.kicad_sch')?.path).toBe('C:/x/y.kicad_sch')
    expect(parseFileAddress('sidebar://guide')).toBeUndefined()
    expect(sessionFileAddress('abc', 'hw/my board.kicad_sch')).toBe('dsh-resource://file/session/abc/hw/my%20board.kicad_sch')
  })

  it('locates renders like the sidecar does', () => {
    expect(renderDir('hw/rc.kicad_sch')).toBe('hw/.dsh-kicad/render/rc')
    expect(renderDir('rc.kicad_pcb')).toBe('.dsh-kicad/render/rc')
    expect(orderPages('rc.kicad_sch', ['rc-power.svg', 'notes.txt', 'rc.svg'])).toEqual(['rc.svg', 'rc-power.svg'])
  })
})

const ercMeta = {
  kind: 'erc', passed: false, counts: { error: 1, warning: 1, total: 2 }, by_type: {},
  violations: [{ severity: 'error', type: 'pin_not_connected', description: 'Pin not connected', items: [{ description: 'Symbol R1 Pin 1', pos: { x: 100.33, y: 76.2 } }] }],
}
const toolProps = (over: Partial<ToolViewProps>): ToolViewProps => ({
  toolName: 'kicad_erc', callId: 'c1', phase: 'result',
  block: { call: { name: 'kicad_erc', argsRaw: '{"path":"hw/rc.kicad_sch"}' }, content: [{ type: 'text', text: 'ERC …' }], isError: false, meta: ercMeta },
  ...over,
})

describe('conversation cards', () => {
  it('validates check metadata', () => {
    expect(readCheckMeta(ercMeta)).toBeDefined()
    expect(readCheckMeta({ kind: 'erc' })).toBeUndefined()
    expect(readCheckMeta(null)).toBeUndefined()
  })

  it('renders an ERC verdict and expands violations', () => {
    const { container } = render(<CheckCard {...toolProps({})} />)
    expect(container.querySelector('[data-kicad-card="erc"]')?.getAttribute('data-kicad-passed')).toBe('false')
    expect(screen.getByText('failed')).toBeTruthy()
    expect(screen.getByText('1 errors · 1 warnings')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/Symbol R1 Pin 1 @ \(100.33, 76.2\) mm/)).toBeTruthy()
  })

  it('falls back to text for errors or unknown metadata, and shows progress before the result', () => {
    render(<CheckCard {...toolProps({ block: { content: [{ type: 'text', text: 'kicad-cli not found' }], isError: true } })} />)
    expect(screen.getByText('kicad-cli not found')).toBeTruthy()
    render(<CheckCard {...toolProps({ toolName: 'kicad_drc', phase: 'start' })} />)
    render(<EditCard {...toolProps({ toolName: 'kicad_edit_schematic', phase: 'preparing', block: { args: { text: (k: string) => (k === 'path' ? 'hw/board.kicad_sch' : undefined) } } })} />)
    expect(screen.getByText('Editing board.kicad_sch…')).toBeTruthy()
    expect(screen.getByText(/Running KiCad DRC/)).toBeTruthy()
  })

  it('summarizes an edit with its automatic ERC verdict', () => {
    render(<EditCard {...toolProps({
      toolName: 'kicad_edit_schematic',
      block: {
        call: { name: 'kicad_edit_schematic', argsRaw: '{"path":"rc.kicad_sch","operations":[]}' },
        content: [{ type: 'text', text: 'Wrote rc.kicad_sch (2 operations).\n- added R2' }, { type: 'text', text: 'Automatic ERC by KiCad 10.0.7 on rc.kicad_sch: PASSED — 0 error(s), 0 warning(s)' }],
        meta: { changes: ['added R2 (Device:R) at (1, 2)', 'wired R1:2 to R2:1'], written: true },
      },
    })} />)
    expect(screen.getByText('2 changes')).toBeTruthy()
    expect(screen.getByText(/Automatic ERC · passed/)).toBeTruthy()
  })
})

describe('settings cards', () => {
  it('turns edits into set/unset operations', () => {
    expect(toOps([{ key: 'kicadCli', label: 'settings.kicadCli', kind: 'text' }], { kicadCli: '' }, { kicadCli: '/x' })).toEqual([{ op: 'unset', path: ['kicadCli'] }])
    expect(toOps([{ key: 'autoErc', label: 'settings.autoErc', kind: 'check' }], { autoErc: false }, { autoErc: true })).toEqual([{ op: 'set', path: ['autoErc'], value: false }])
  })

  it('saves through the page form with the read revision', async () => {
    const mutate = vi.fn(async () => true)
    const form = { state: { status: 'ready' as const, value: { approval: 'ask', autoErc: true, autoRender: true }, revision: 7, writable: true }, mutate }
    render(<PolicySettings view="page" form={form} />)
    fireEvent.click(screen.getByLabelText(/Ask before every schematic edit/))
    await act(async () => { fireEvent.click(screen.getByText('Save')) })
    expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['approval'], value: 'follow' }], 7)
    render(<BridgeSettings view="summary" form={form} />)
    expect(screen.getByText('kicad-cli: default')).toBeTruthy()
  })

  it('edits the paths of the optional tools on the bridge page', async () => {
    const mutate = vi.fn(async () => true)
    const form = { state: { status: 'ready' as const, value: { kicadCli: '', java: '/usr/bin/java' }, revision: 3, writable: true }, mutate }
    const page = within(render(<BridgeSettings view="page" form={form} />).container)
    for (const label of [/^Java \(for Freerouting\)/, /^Freerouting/, /^ngspice/, /^QEMU for ESP32/]) expect(page.getByLabelText(label)).toBeTruthy()
    fireEvent.change(page.getByLabelText(/^Freerouting/), { target: { value: '/opt/freerouting-2.5.0.jar' } })
    fireEvent.change(page.getByLabelText(/^Java \(for Freerouting\)/), { target: { value: '' } })
    await act(async () => { fireEvent.click(page.getByText('Save')) })
    expect(mutate).toHaveBeenCalledWith([{ op: 'unset', path: ['java'] }, { op: 'set', path: ['freerouting'], value: '/opt/freerouting-2.5.0.jar' }], 3)
  })
})

describe('sidebar viewer (SVG mode)', () => {
  beforeEach(() => localStorage.setItem('dsh-kicad:viewer-mode', 'svg'))
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'
  const address = sessionFileAddress('s1', 'rc.kicad_sch')

  function remote(pages: string[]): ClientRemote & { execute: ReturnType<typeof vi.fn> } {
    const execute = vi.fn(async () => ({ ok: true as const, value: { result: { kind: 'success' as const, text: '{}' } } }))
    return {
      execute,
      commands: { execute },
      workspaceFiles: {
        list: vi.fn(async () => ({ ok: true as const, value: { absolutePath: '/p', entries: pages.map(name => ({ name, type: 'file' as const })) } })),
        readBytes: vi.fn(async () => ({ ok: true as const, value: { absolutePath: '/p/rc.svg', version: 'v1', data: new TextEncoder().encode(SVG), eof: true } })),
      },
    }
  }
  const tabProps = { useTabInfo: () => ({ tab: { id: 't1', contentId: address, signal: new AbortController().signal } }) }

  it('shows the rendered SVG of the opened design', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:svg')
    URL.revokeObjectURL = vi.fn()
    const r = remote(['rc.svg'])
    const Viewer = createViewer(r)
    const { container } = render(<Viewer {...tabProps} />)
    await waitFor(() => expect(container.querySelector('img[data-kicad-state="image"]')).toBeTruthy())
    expect(r.workspaceFiles.list).toHaveBeenCalledWith('s1', '.dsh-kicad/render/rc')
    expect(r.workspaceFiles.readBytes).toHaveBeenCalledWith('s1', '.dsh-kicad/render/rc/rc.svg', {}, expect.anything())
  })

  it('offers a render when none exists and runs /kicad-render', async () => {
    const r = remote([])
    const Viewer = createViewer(r)
    const { container } = render(<Viewer {...tabProps} />)
    await waitFor(() => expect(container.querySelector('[data-kicad-state="empty"]')).toBeTruthy())
    await act(async () => { fireEvent.click(container.querySelector('[data-kicad-action="render"]')!) })
    expect(r.execute).toHaveBeenCalledWith('s1', '/kicad-render rc.kicad_sch', [])
  })
})

