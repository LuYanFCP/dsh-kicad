import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditCard } from '../src/client/Cards.tsx'
import type { ClientRemote, ToolViewProps } from '../src/client/dsh.ts'
import { resetFollowed } from '../src/client/follow.ts'
import { AutorouteCard, createFabCard, readAutorouteMeta, readFabMeta, readSyncMeta, SyncCard, workspacePath } from '../src/client/PcbCards.tsx'
import { stubLocalStorage } from './storage.ts'
stubLocalStorage()

const syncMeta = {
  kind: 'sync', schematic: '/p/usb.kicad_sch', pcb: '/p/usb.kicad_pcb', created: false, dry_run: false, written: true,
  counts: { added: 2, changed: 1 }, more_changes: 0, staged: ['R6', 'C4'], flagged: ['R9'], footprints: 17, copper_layers: 2,
  changes: ['added R6 (Resistor_SMD:R_0603_1608Metric) at (160, 100)', 'added C4 (Capacitor_SMD:C_0603_1608Metric) at (160, 104)', 'value of R1: 1k → 2k2'],
  parity: { total: 1, by_type: { extra_footprint: 1 } },
}
const routeMeta = {
  kind: 'autoroute', pcb: '/p/rc.kicad_pcb', written: true, nets: { routed: 4, left_out: ['OUT'] }, added: { segments: 121, vias: 8, length_mm: 412.5 },
  kept: { tracks: 8, vias: 0 }, zones_filled: true, unrouted: 2, unrouted_before: 6,
  freerouting: { version: '2.5.0', state: 'COMPLETED', passes: 3, seconds: 4.52, timed_out: false },
  drc: { passed: false, errors: 2, warnings: 0, parity: 0 }, notes: ['Route those by hand, or give the parts more room.'],
}
const fabMeta = {
  kind: 'fab', pcb: '/p/board.kicad_pcb', exported: true, refused: false, forced: false, preset: 'jlcpcb', preset_label: 'JLCPCB standard 1-2 layer, 1 oz',
  output_dir: '/p/fab/jlcpcb', zip: '/p/fab/jlcpcb/board-jlcpcb.zip', gate: { passed: true, blocking: [] }, layers: ['F.Cu', 'B.Cu'], files: 3,
  file_list: [{ path: 'gerbers/board-F_Cu.gtl', kind: 'gerber', layer: 'F.Cu' }, { path: 'gerbers/board-PTH.drl', kind: 'drill', layer: null }],
  preview: ['board-top.png', 'board-bottom.png'],
}
const text = (t: string) => [{ type: 'text', text: t }]
const props = (over: Partial<ToolViewProps>): ToolViewProps => ({
  toolName: 'kicad_update_pcb', callId: 'c1', phase: 'result', cwd: '/p',
  block: { argsRaw: '{"schematic":"usb.kicad_sch"}', content: text('Updated /p/usb.kicad_pcb …'), isError: false, meta: syncMeta },
  ...over,
})

beforeEach(() => { resetFollowed(); localStorage.clear() })
afterEach(() => cleanup())

describe('board tool cards', () => {
  it('validates their metadata', () => {
    expect(readSyncMeta(syncMeta)).toBeDefined()
    expect(readAutorouteMeta(routeMeta)).toBeDefined()
    expect(readFabMeta(fabMeta)).toBeDefined()
    expect(readSyncMeta({ kind: 'sync' })).toBeUndefined()
    expect(readAutorouteMeta(syncMeta)).toBeUndefined()
    expect(readFabMeta(null)).toBeUndefined()
  })

  it('summarizes a sync: the changes, its parity count and what waits for placement', () => {
    const { container } = render(<SyncCard {...props({})} />)
    expect(container.querySelector('[data-kicad-card="sync"]')?.getAttribute('data-kicad-parity')).toBe('1')
    expect(screen.getByText('3 changes')).toBeTruthy()
    expect(screen.getByText('1 parity issues').className).toContain('dshk-fail')
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('added 2 · changed 1')).toBeTruthy()
    expect(screen.getByText('value of R1: 1k → 2k2')).toBeTruthy()
    expect(screen.getByText('Staged right of the outline, to be placed: R6, C4')).toBeTruthy()
    expect(screen.getByText('Kept although their symbol is gone: R9')).toBeTruthy()
    expect(screen.getByText('extra_footprint ×1')).toBeTruthy()
  })

  it('says when the sync created the board, only previewed it, or found it in sync', () => {
    const created = { ...syncMeta, created: true, staged: [], flagged: [], parity: { total: 0, by_type: {} } }
    render(<SyncCard {...props({ block: { meta: created, content: text('Created …') } })} />)
    expect(screen.getByText('usb.kicad_pcb created, 17 footprints')).toBeTruthy()
    expect(screen.getByText('parity 0').className).toContain('dshk-pass')
    render(<SyncCard {...props({ block: { meta: { ...syncMeta, dry_run: true, written: false, parity: null }, content: text('Dry run …') } })} />)
    expect(screen.getByText('dry run: 3 changes, nothing written')).toBeTruthy()
    render(<SyncCard {...props({ block: { meta: { ...syncMeta, written: false, changes: [], parity: null }, content: text('in sync') } })} />)
    expect(screen.getByText('already in sync, nothing written')).toBeTruthy()
    render(<SyncCard {...props({ phase: 'start' })} />)
    expect(screen.getByText('Updating the board from usb.kicad_sch…')).toBeTruthy()
    render(<SyncCard {...props({ block: { isError: true, content: text('kicad_update_pcb refused, nothing was written: U1:5 no pad') } })} />)
    expect(screen.getByText(/U1:5 no pad/)).toBeTruthy()
  })

  it('opens the board the sync wrote, once the call settled', async () => {
    const openFile = vi.fn()
    render(<SyncCard {...props({ phase: 'start', openFile, block: { argsRaw: '{"schematic":"usb.kicad_sch"}', time: Date.now() } })} />)
    await act(async () => {})
    expect(openFile).not.toHaveBeenCalled() // a new board does not exist yet
    render(<SyncCard {...props({ callId: 'dry', openFile, block: { argsRaw: '{"schematic":"usb.kicad_sch","dry_run":true}', time: Date.now(), content: text('Dry run'), meta: { ...syncMeta, dry_run: true, written: false } } })} />)
    await act(async () => {})
    expect(openFile).not.toHaveBeenCalled() // nothing written
    render(<SyncCard {...props({ openFile, block: { argsRaw: '{"schematic":"usb.kicad_sch"}', time: Date.now(), content: text('Updated'), meta: syncMeta } })} />)
    await act(async () => {})
    expect(openFile.mock.calls).toEqual([['/p/usb.kicad_pcb']])
  })

  it('reports a routing run by KiCad\'s unrouted count and DRC, and opens the board while it routes', async () => {
    const openFile = vi.fn()
    render(<AutorouteCard {...props({ toolName: 'kicad_autoroute', phase: 'start', openFile, block: { argsRaw: '{"pcb":"rc.kicad_pcb"}', time: Date.now() } })} />)
    await act(async () => {})
    expect(screen.getByText('Routing rc.kicad_pcb with Freerouting…')).toBeTruthy()
    expect(openFile).toHaveBeenCalledWith('rc.kicad_pcb')
    const { container } = render(<AutorouteCard {...props({ toolName: 'kicad_autoroute', block: { argsRaw: '{"pcb":"rc.kicad_pcb"}', content: text('Routed …'), meta: routeMeta } })} />)
    expect(container.querySelector('[data-kicad-card="autoroute"]')?.getAttribute('data-kicad-unrouted')).toBe('2')
    expect(screen.getByText('2 unrouted').className).toContain('dshk-fail')
    expect(screen.getByText('2 DRC errors')).toBeTruthy()
    expect(screen.getByText('+121 segments · +8 vias · 4.5 s')).toBeTruthy()
    fireEvent.click(container.querySelector('button')!)
    expect(screen.getByText('Nets routed: 4 · left out: OUT')).toBeTruthy()
    expect(screen.getByText('Unrouted connections: 6 before, 2 after (KiCad)')).toBeTruthy()
    expect(screen.getByText('Kept as they were: 8 tracks, 0 vias')).toBeTruthy()
    expect(screen.getByText('Freerouting 2.5.0: COMPLETED, 3 passes')).toBeTruthy()
    expect(screen.getByText('Route those by hand, or give the parts more room.')).toBeTruthy()
    render(<AutorouteCard {...props({ toolName: 'kicad_autoroute', block: { content: text('Routed'), meta: { ...routeMeta, unrouted: 0, drc: { ...routeMeta.drc, errors: 0, passed: true } } } })} />)
    expect(screen.getByText('0 unrouted').className).toContain('dshk-pass')
  })

  it('shows a board edit with the automatic DRC', () => {
    render(<EditCard {...props({
      toolName: 'kicad_edit_pcb',
      block: {
        argsRaw: '{"path":"rc.kicad_pcb","operations":[]}', meta: { changes: ['outline 50 × 30 mm'], written: true },
        content: [...text('Wrote rc.kicad_pcb (1 operations).'), ...text('Automatic DRC by KiCad 10.0.7 on rc.kicad_pcb: FAILED — 2 error(s), 0 warning(s), 2 unrouted')],
      },
    })} />)
    expect(screen.getByText('Board edit')).toBeTruthy()
    expect(screen.getByText(/Automatic DRC · failed/)).toBeTruthy()
  })
})

describe('the fab output card', () => {
  function remote(read: () => unknown): ClientRemote {
    return {
      commands: { execute: vi.fn() } as never,
      workspaceFiles: { list: vi.fn() as never, readBytes: vi.fn(async () => read()) as never },
    }
  }
  const fab = (meta: unknown, over: Partial<ToolViewProps> = {}) => props({
    toolName: 'kicad_export_fab', sessionId: 's1', block: { argsRaw: '{"pcb":"board.kicad_pcb"}', content: text('Fab files exported …'), meta }, ...over,
  })

  it('downloads the zip from the workspace and opens the 3D preview', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:zip')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const r = remote(() => ({ ok: true, value: { absolutePath: '/p/fab/jlcpcb/board-jlcpcb.zip', version: 'v', data: new Uint8Array([80, 75, 3, 4]), eof: true } }))
    const FabCard = createFabCard(r)
    const openFile = vi.fn()
    const { container } = render(<FabCard {...fab(fabMeta, { openFile })} />)
    expect(container.querySelector('[data-kicad-card="fab"]')?.getAttribute('data-kicad-fab')).toBe('exported')
    expect(screen.getByText('3 files · JLCPCB standard 1-2 layer, 1 oz')).toBeTruthy()
    await act(async () => { fireEvent.click(container.querySelector('[data-kicad-action="download-zip"]')!) })
    expect(r.workspaceFiles.readBytes).toHaveBeenCalledWith('s1', 'fab/jlcpcb/board-jlcpcb.zip', {})
    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    fireEvent.click(container.querySelector('[data-kicad-action="open-preview"]')!)
    expect(openFile).toHaveBeenCalledWith('/p/fab/jlcpcb/board-top.png')
    fireEvent.click(container.querySelector('.dshk-card-head')!)
    expect(screen.getByText('gerbers/board-F_Cu.gtl')).toBeTruthy()
    expect(screen.getByText('1 more in the tool result')).toBeTruthy()
    click.mockRestore()
  })

  it('says why a download failed', async () => {
    const FabCard = createFabCard(remote(() => ({ ok: false, error: { message: 'outside the workspace', code: 'denied' } })))
    const { container } = render(<FabCard {...fab(fabMeta)} />)
    await act(async () => { fireEvent.click(container.querySelector('[data-kicad-action="download-zip"]')!) })
    await waitFor(() => expect(screen.getByText('Could not read the zip: outside the workspace')).toBeTruthy())
  })

  it('lists what the gate blocked, and marks an export forced past it', () => {
    const FabCard = createFabCard(remote(() => undefined))
    const blocking = ['2 DRC error(s)', '1 unrouted connection(s)']
    const { container } = render(<FabCard {...fab({ ...fabMeta, exported: false, refused: true, zip: null, gate: { passed: false, blocking }, files: 0, file_list: [], preview: [] })} />)
    expect(screen.getByText('refused').className).toContain('dshk-fail')
    expect(screen.getByText('1 unrouted connection(s)')).toBeTruthy()
    expect(container.querySelector('[data-kicad-action="download-zip"]')).toBeNull()
    render(<FabCard {...fab({ ...fabMeta, forced: true, gate: { passed: false, blocking } })} />)
    expect(screen.getByText('exported with force').className).toContain('dshk-caution')
    expect(screen.getByText('2 DRC error(s); 1 unrouted connection(s)')).toBeTruthy()
  })

  it('names workspace files relative to the working directory', () => {
    expect(workspacePath('/p/fab/x.zip', '/p')).toBe('fab/x.zip')
    expect(workspacePath('/p/fab/x.zip', '/p/')).toBe('fab/x.zip')
    expect(workspacePath('/elsewhere/x.zip', '/p')).toBe('/elsewhere/x.zip')
    expect(workspacePath('fab/x.zip', undefined)).toBe('fab/x.zip')
  })
})
