/**
 * Conversation rows for the board tools: kicad_update_pcb, kicad_autoroute and kicad_export_fab
 * (kicad_edit_pcb uses the edit row in Cards.tsx). Like the other rows they read the tool's
 * presentation metadata and fall back to the result text; the sync and routing rows open the
 * board in the sidebar while the agent works on it, and the fab row downloads the zip.
 */
import { useState, type ReactNode } from 'react'
import { basename } from './address.ts'
import { argOf, resultText } from './Cards.tsx'
import type { ClientRemote, ToolViewProps } from './dsh.ts'
import { useFollowAgent } from './follow.ts'
import { translate, type KiCadLocaleKey } from './locales.ts'
import { CSS } from './styles.ts'

type Tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>) => string

export interface SyncMeta {
  kind: 'sync'
  schematic: string
  pcb: string
  created: boolean
  dry_run: boolean
  written: boolean
  counts: Record<string, number>
  changes: string[]
  more_changes: number
  staged: string[]
  flagged: string[]
  footprints: number
  copper_layers: number
  parity: { total: number, by_type: Record<string, number> } | null
}

export interface AutorouteMeta {
  kind: 'autoroute'
  pcb: string
  written: boolean
  nets: { routed: number, left_out: string[] }
  added: { segments: number, vias: number, length_mm: number }
  kept: { tracks: number, vias: number }
  zones_filled: boolean
  unrouted: number
  unrouted_before: number | null
  freerouting: { version: string | null, state: string | null, passes: number, seconds: number, timed_out: boolean }
  drc: { passed: boolean, errors: number, warnings: number, parity: number | null }
  notes: string[]
}

export interface FabMeta {
  kind: 'fab'
  pcb?: string
  exported: boolean
  refused: boolean
  forced: boolean
  preset: string | null
  preset_label?: string | null
  output_dir: string
  zip: string | null
  gate: { passed: boolean, blocking: string[] }
  files: number
  file_list?: Array<{ path: string, kind: string, layer: string | null }>
  preview: string[]
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Validate presentation metadata from the wire; undefined for anything unexpected. */
export function readSyncMeta(meta: unknown): SyncMeta | undefined {
  if (!isRecord(meta) || meta.kind !== 'sync' || typeof meta.pcb !== 'string' || !Array.isArray(meta.changes) || !isRecord(meta.counts)) return undefined
  return meta as unknown as SyncMeta
}

export function readAutorouteMeta(meta: unknown): AutorouteMeta | undefined {
  if (!isRecord(meta) || meta.kind !== 'autoroute' || typeof meta.unrouted !== 'number' || !isRecord(meta.added) || !isRecord(meta.drc)
    || !isRecord(meta.freerouting) || !isRecord(meta.nets)) return undefined
  return meta as unknown as AutorouteMeta
}

export function readFabMeta(meta: unknown): FabMeta | undefined {
  if (!isRecord(meta) || meta.kind !== 'fab' || typeof meta.exported !== 'boolean' || !isRecord(meta.gate) || typeof meta.output_dir !== 'string') return undefined
  return meta as unknown as FabMeta
}

function Pending({ text }: { text: string }): ReactNode {
  return <div className="dshk-card"><style>{CSS}</style><div className="dshk-card-head dshk-muted">{text}</div></div>
}

function TextCard({ kind, title, text }: { kind: string, title: string, text: string }): ReactNode {
  return (
    <div className="dshk-card" data-kicad-card={kind}>
      <style>{CSS}</style>
      <div className="dshk-card-head">{title}</div>
      <pre className="dshk-list dshk-code" style={{ whiteSpace: 'pre-wrap' }}>{text}</pre>
    </div>
  )
}

function FileLink({ path, props }: { path: string, props: ToolViewProps }): ReactNode {
  if (!path) return null
  return <span className="dshk-muted dshk-code" role="link" onClick={(e) => { e.stopPropagation(); props.openFile?.(path) }}>{basename(path)}</span>
}

/** Row for kicad_update_pcb: what the sync changed, what waits for placement, and KiCad's parity count. */
export function SyncCard(props: ToolViewProps): ReactNode {
  const tr: Tr = (key, vars) => translate(props.t, key, vars)
  const [open, setOpen] = useState(false)
  const meta = props.phase === 'result' && !props.block.isError ? readSyncMeta(props.block.meta) : undefined
  const schematic = argOf(props, 'schematic')
  const board = meta?.pcb || argOf(props, 'pcb') || schematic.replace(/\.kicad_sch$/, '.kicad_pcb')
  useFollowAgent(props, meta?.dry_run ? '' : board)
  if (props.phase !== 'result') return <Pending text={tr('card.syncing', { file: basename(schematic) })} />
  if (!meta) return <TextCard kind="sync-text" title={tr('card.sync')} text={resultText(props)} />
  const total = meta.changes.length + meta.more_changes
  const summary = meta.dry_run ? tr('card.syncDry', { count: total })
    : !meta.written ? tr('card.inSync')
      : meta.created ? tr('card.syncCreated', { file: basename(meta.pcb), count: meta.footprints }) : tr('card.changes', { count: total })
  const counts = Object.entries(meta.counts).map(([kind, n]) => `${kind} ${n}`).join(' · ')
  return (
    <div className="dshk-card" data-kicad-card="sync" data-kicad-parity={meta.parity?.total ?? ''}>
      <style>{CSS}</style>
      <button type="button" className="dshk-card-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <strong>{tr('card.sync')}</strong>
        <span className="dshk-muted">{summary}</span>
        {meta.parity && (
          <span className={`dshk-badge ${meta.parity.total === 0 ? 'dshk-pass' : 'dshk-fail'}`}>
            {meta.parity.total === 0 ? tr('card.parityOk') : tr('card.parityIssues', { count: meta.parity.total })}
          </span>
        )}
        <span className="dshk-spacer" />
        {!meta.dry_run && <FileLink path={meta.pcb} props={props} />}
      </button>
      {open && (
        <ul className="dshk-list">
          {counts && <li className="dshk-muted">{counts}</li>}
          {meta.changes.map((c, i) => <li key={i} className="dshk-code">{c}</li>)}
          {meta.more_changes > 0 && <li className="dshk-muted">{tr('card.more', { count: meta.more_changes })}</li>}
          {meta.staged.length > 0 && <li>{tr('card.staged', { refs: meta.staged.join(', ') })}</li>}
          {meta.flagged.length > 0 && <li>{tr('card.flagged', { refs: meta.flagged.join(', ') })}</li>}
          {meta.parity && meta.parity.total > 0 && (
            <li className="dshk-sev-error">{Object.entries(meta.parity.by_type).map(([type, n]) => `${type} ×${n}`).join(', ')}</li>
          )}
        </ul>
      )}
    </div>
  )
}

/** Row for kicad_autoroute: what Freerouting added, and KiCad's unrouted count and DRC on the result. */
export function AutorouteCard(props: ToolViewProps): ReactNode {
  const tr: Tr = (key, vars) => translate(props.t, key, vars)
  const [open, setOpen] = useState(false)
  const meta = props.phase === 'result' && !props.block.isError ? readAutorouteMeta(props.block.meta) : undefined
  const board = meta?.pcb || argOf(props, 'pcb')
  useFollowAgent(props, board)
  if (props.phase !== 'result') return <Pending text={tr('card.routing', { file: basename(board) })} />
  if (!meta) return <TextCard kind="autoroute-text" title={tr('card.autoroute')} text={resultText(props)} />
  const fr = meta.freerouting
  return (
    <div className="dshk-card" data-kicad-card="autoroute" data-kicad-unrouted={meta.unrouted}>
      <style>{CSS}</style>
      <button type="button" className="dshk-card-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <strong>{tr('card.autoroute')}</strong>
        <span className={`dshk-badge ${meta.unrouted === 0 ? 'dshk-pass' : 'dshk-fail'}`}>
          {meta.unrouted === 0 ? tr('card.routed') : tr('card.unrouted', { count: meta.unrouted })}
        </span>
        {meta.drc.errors > 0 && <span className="dshk-badge dshk-fail">{tr('card.drcErrors', { count: meta.drc.errors })}</span>}
        <span className="dshk-muted">{tr('card.routeAdded', { segments: meta.added.segments, vias: meta.added.vias, seconds: round(fr.seconds) })}</span>
        <span className="dshk-spacer" />
        <FileLink path={meta.pcb} props={props} />
      </button>
      {open && (
        <ul className="dshk-list">
          <li>{tr('card.routeNets', { routed: meta.nets.routed })}{meta.nets.left_out.length > 0 ? ` · ${tr('card.routeLeftOut', { nets: meta.nets.left_out.join(', ') })}` : ''}</li>
          {meta.unrouted_before !== null && <li>{tr('card.routeBefore', { before: meta.unrouted_before, after: meta.unrouted })}</li>}
          {(meta.kept.tracks > 0 || meta.kept.vias > 0) && <li>{tr('card.routeKept', { tracks: meta.kept.tracks, vias: meta.kept.vias })}</li>}
          <li className="dshk-muted">
            {tr('card.routeRouter', { version: fr.version ?? '?', state: fr.state ?? '?', passes: fr.passes })}{fr.timed_out ? ` · ${tr('card.routeTimedOut')}` : ''}
          </li>
          {meta.zones_filled && <li className="dshk-muted">{tr('card.zonesFilled')}</li>}
          {meta.notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </div>
  )
}

/** A path the session's workspace calls by its relative name when it lies under the working directory. */
export function workspacePath(path: string, cwd: string | undefined): string {
  const root = cwd?.replace(/\/+$/, '')
  return root && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

function saveBytes(name: string, data: Uint8Array, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Row for kicad_export_fab: KiCad's gate, the files, the zip to download and the 3D preview. */
export function createFabCard(remote: ClientRemote) {
  return function FabCard(props: ToolViewProps): ReactNode {
    const tr: Tr = (key, vars) => translate(props.t, key, vars)
    const [open, setOpen] = useState(false)
    const [download, setDownload] = useState<{ state: 'idle' | 'reading' } | { state: 'failed', message: string }>({ state: 'idle' })
    if (props.phase !== 'result') return <Pending text={tr('card.exporting', { file: basename(argOf(props, 'pcb')) })} />
    const meta = props.block.isError ? undefined : readFabMeta(props.block.meta)
    if (!meta) return <TextCard kind="fab-text" title={tr('card.fab')} text={resultText(props)} />
    const status = meta.exported ? (meta.forced ? 'forced' : 'exported') : 'refused'
    const badge = status === 'exported' ? 'dshk-pass' : status === 'forced' ? 'dshk-caution' : 'dshk-fail'
    const fab = meta.preset_label || meta.preset || tr('card.fabKiCad')
    const zip = meta.zip
    const sessionId = props.sessionId
    const fetchZip = async (): Promise<void> => {
      if (!zip || !sessionId) return
      setDownload({ state: 'reading' })
      try {
        const read = await remote.workspaceFiles.readBytes(sessionId, workspacePath(zip, props.cwd), {})
        if (!read.ok) throw new Error(read.error.message)
        if (!read.value.eof) throw new Error(tr('card.downloadTooLarge'))
        saveBytes(basename(zip), read.value.data, 'application/zip')
        setDownload({ state: 'idle' })
      } catch (error) {
        setDownload({ state: 'failed', message: (error as Error).message })
      }
    }
    return (
      <div className="dshk-card" data-kicad-card="fab" data-kicad-fab={status}>
        <style>{CSS}</style>
        <button type="button" className="dshk-card-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <strong>{tr('card.fab')}</strong>
          <span className={`dshk-badge ${badge}`}>{tr(status === 'exported' ? 'card.fabExported' : status === 'forced' ? 'card.fabForced' : 'card.fabRefused')}</span>
          <span className="dshk-muted">{meta.exported ? tr('card.fabFiles', { count: meta.files, fab }) : fab}</span>
          <span className="dshk-spacer" />
          {meta.pcb && <FileLink path={meta.pcb} props={props} />}
        </button>
        {!meta.exported && (
          <ul className="dshk-list">
            {meta.gate.blocking.map((b, i) => <li key={i} className="dshk-sev-error">{b}</li>)}
          </ul>
        )}
        {meta.exported && (
          <div className="dshk-list">
            <div className="dshk-check">
              {zip && sessionId && (
                <button type="button" className="dshk-btn" disabled={download.state === 'reading'} onClick={() => void fetchZip()} data-kicad-action="download-zip">
                  {download.state === 'reading' ? tr('card.downloading') : tr('card.download')}
                </button>
              )}
              {meta.preview.length > 0 && (
                <button type="button" className="dshk-btn" onClick={() => props.openFile?.(`${meta.output_dir}/${meta.preview[0]}`)} data-kicad-action="open-preview">
                  {tr('card.preview')}
                </button>
              )}
              {zip && <span className="dshk-muted dshk-code">{basename(zip)}</span>}
            </div>
            {download.state === 'failed' && <div className="dshk-error">{tr('card.downloadFailed', { message: download.message })}</div>}
            {meta.forced && <div className="dshk-warn">{meta.gate.blocking.join('; ')}</div>}
          </div>
        )}
        {open && meta.exported && (
          <ul className="dshk-list">
            {(meta.file_list ?? []).map((f, i) => (
              <li key={i}><span className="dshk-code">{f.path}</span> <span className="dshk-muted">{f.layer ?? f.kind}</span></li>
            ))}
            {meta.files > (meta.file_list ?? []).length && <li className="dshk-muted">{tr('card.more', { count: meta.files - (meta.file_list ?? []).length })}</li>}
          </ul>
        )}
      </div>
    )
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10
}
