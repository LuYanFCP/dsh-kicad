/**
 * Conversation rows for kicad_erc / kicad_drc and kicad_edit_schematic, registered
 * in the keyed `tool.call.toolview` slot. They read only the persisted wire data
 * (`result.meta` from the tool's presentationMeta and the result text) and fall
 * back to plain text for anything they do not recognize.
 */
import { useState, type ReactNode } from 'react'
import { basename } from './address.ts'
import type { ToolViewProps } from './dsh.ts'
import { translate, type KiCadLocaleKey } from './locales.ts'
import { CSS } from './styles.ts'

export interface CheckMeta {
  kind: 'erc' | 'drc'
  passed: boolean
  counts: { error: number, warning: number, total: number }
  violations: Array<{ severity: string, type: string, description: string, items: Array<{ description: string, pos?: { x: number, y: number } }> }>
}

/** Validate presentation metadata from the wire; undefined for anything unexpected. */
export function readCheckMeta(meta: unknown): CheckMeta | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const m = meta as Partial<CheckMeta>
  if ((m.kind !== 'erc' && m.kind !== 'drc') || typeof m.passed !== 'boolean' || typeof m.counts !== 'object' || !Array.isArray(m.violations)) return undefined
  return m as CheckMeta
}

function argPath(props: ToolViewProps): string {
  try {
    const raw = props.block.call?.argsRaw
    const args = raw ? JSON.parse(raw) as { path?: unknown } : undefined
    return typeof args?.path === 'string' ? args.path : ''
  } catch {
    return ''
  }
}

function resultText(props: ToolViewProps): string {
  return (props.block.content ?? []).map(b => b.text ?? '').join('\n')
}

export function CheckCard(props: ToolViewProps): ReactNode {
  const tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>): string => translate(props.t, key, vars)
  const [open, setOpen] = useState(false)
  const kind = props.toolName === 'kicad_drc' ? 'drc' : 'erc'
  const label = tr(kind === 'drc' ? 'card.drc' : 'card.erc')
  const file = basename(argPath(props))
  if (props.phase !== 'result') {
    return <div className="dshk-card"><style>{CSS}</style><div className="dshk-card-head dshk-muted">{tr('card.running', { kind: label })} {file}</div></div>
  }
  const meta = readCheckMeta(props.block.meta)
  if (props.block.isError || !meta) {
    return (
      <div className="dshk-card" data-kicad-card="check-text">
        <style>{CSS}</style>
        <div className="dshk-card-head">{label} {file}</div>
        <pre className="dshk-list dshk-code" style={{ whiteSpace: 'pre-wrap' }}>{resultText(props)}</pre>
      </div>
    )
  }
  const hidden = meta.counts.total - meta.violations.length
  return (
    <div className="dshk-card" data-kicad-card={kind} data-kicad-passed={meta.passed}>
      <style>{CSS}</style>
      <button type="button" className="dshk-card-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <strong>{label}</strong>
        <span className={`dshk-badge ${meta.passed ? 'dshk-pass' : 'dshk-fail'}`}>{tr(meta.passed ? 'card.passed' : 'card.failed')}</span>
        <span className="dshk-muted">{tr('card.counts', { errors: meta.counts.error, warnings: meta.counts.warning })}</span>
        <span className="dshk-spacer" />
        <span className="dshk-muted dshk-code">{file}</span>
      </button>
      {open && meta.violations.length > 0 && (
        <ul className="dshk-list">
          {meta.violations.map((v, i) => (
            <li key={i}>
              <span className={`dshk-code dshk-sev-${v.severity}`}>{v.severity}</span>{' '}
              <span className="dshk-code">{v.type}</span> — {v.description}
              {v.items.map((item, j) => (
                <div key={j} className="dshk-muted">
                  {item.description}{item.pos ? ` @ (${round(item.pos.x)}, ${round(item.pos.y)}) mm` : ''}
                </div>
              ))}
            </li>
          ))}
          {hidden > 0 && <li className="dshk-muted">{tr('card.more', { count: hidden })}</li>}
        </ul>
      )}
    </div>
  )
}

export function EditCard(props: ToolViewProps): ReactNode {
  const tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>): string => translate(props.t, key, vars)
  const [open, setOpen] = useState(false)
  const path = argPath(props)
  if (props.phase !== 'result') {
    return <div className="dshk-card"><style>{CSS}</style><div className="dshk-card-head dshk-muted">{tr('card.editing', { file: basename(path) })}</div></div>
  }
  const text = resultText(props)
  const meta = props.block.meta as { changes?: unknown } | undefined
  const changes = Array.isArray(meta?.changes) ? meta.changes.filter((c): c is string => typeof c === 'string') : []
  const erc = /^Automatic (ERC by KiCad[^\n]*)$/m.exec(text)?.[1]
  const passed = erc ? /: PASSED/.test(erc) : undefined
  return (
    <div className="dshk-card" data-kicad-card="edit">
      <style>{CSS}</style>
      <button type="button" className="dshk-card-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <strong>{tr('card.edit')}</strong>
        <span className="dshk-muted">{props.block.isError ? text.split('\n')[0] : tr('card.changes', { count: changes.length })}</span>
        {passed !== undefined && (
          <span className={`dshk-badge ${passed ? 'dshk-pass' : 'dshk-fail'}`} title={erc}>
            {tr('card.autoErc')} · {tr(passed ? 'card.passed' : 'card.failed')}
          </span>
        )}
        <span className="dshk-spacer" />
        {path && (
          <span className="dshk-muted dshk-code" role="link" onClick={(e) => { e.stopPropagation(); props.openFile?.(path) }}>{basename(path)}</span>
        )}
      </button>
      {open && (
        <ul className="dshk-list">
          {changes.map((c, i) => <li key={i} className="dshk-code">{c}</li>)}
          {erc && <li className="dshk-code" style={{ whiteSpace: 'pre-wrap' }}>{text.slice(text.indexOf('Automatic ERC'))}</li>}
        </ul>
      )}
    </div>
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
