/**
 * Plugin Manager pages for the bundle's bridge and policy rows
 * (`plugins.row.config`, keyed `<bundle>#<row id>`). Values and writes go
 * through the page owner's `form`; the Host validates and persists them.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { DoctorPanel } from './Doctor.tsx'
import type { ClientRemote, ConfigViewProps } from './dsh.ts'
import { translate, type KiCadLocaleKey } from './locales.ts'
import { CSS } from './styles.ts'

type Field = { key: string, label: KiCadLocaleKey, hint?: KiCadLocaleKey, kind: 'text' } | { key: string, label: KiCadLocaleKey, kind: 'check', on?: unknown, off?: unknown }

export const BRIDGE_FIELDS: Field[] = [
  { key: 'kicadCli', label: 'settings.kicadCli', hint: 'settings.kicadCliHint', kind: 'text' },
  { key: 'python', label: 'settings.python', hint: 'settings.pythonHint', kind: 'text' },
]
export const POLICY_FIELDS: Field[] = [
  { key: 'approval', label: 'settings.approval', kind: 'check', on: 'ask', off: 'allow' },
  { key: 'autoErc', label: 'settings.autoErc', kind: 'check' },
  { key: 'autoRender', label: 'settings.autoRender', kind: 'check' },
]

/** Field edits → settings path operations (empty text clears the field so it re-inherits). */
export function toOps(fields: Field[], draft: Record<string, unknown>, current: Record<string, unknown>) {
  const ops: Array<{ op: 'set', path: string[], value: unknown } | { op: 'unset', path: string[] }> = []
  for (const f of fields) {
    const next = draft[f.key]
    if (next === current[f.key]) continue
    if (f.kind === 'text' && (next === '' || next === undefined)) ops.push({ op: 'unset', path: [f.key] })
    else ops.push({ op: 'set', path: [f.key], value: next })
  }
  return ops
}

export function createSettingsCard(
  fields: Field[],
  summary: (value: Record<string, unknown>, tr: (k: KiCadLocaleKey, v?: Record<string, string | number>) => string) => string,
  extra?: (props: ConfigViewProps) => ReactNode,
) {
  return function KiCadSettings(props: ConfigViewProps): ReactNode {
    const tr = (key: KiCadLocaleKey, vars?: Record<string, string | number>): string => translate(props.t, key, vars)
    const value = props.form?.state.value ?? {}
    const [draft, setDraft] = useState<Record<string, unknown>>(value)
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'rejected'>('idle')
    useEffect(() => setDraft(props.form?.state.value ?? {}), [props.form?.state.revision])
    if (props.view === 'summary') return <span>{summary(value, tr)}</span>
    if (!props.form || props.form.state.status !== 'ready') return null
    const form = props.form
    const ops = toOps(fields, draft, value)
    const save = async (): Promise<void> => {
      setStatus('saving')
      const ok = await form.mutate(ops, form.state.revision).catch(() => false)
      setStatus(ok ? 'saved' : 'rejected')
    }
    return (
      <div className="dshk-form" data-kicad-settings>
        <style>{CSS}</style>
        {fields.map(f => f.kind === 'text'
          ? (
            <label key={f.key} className="dshk-field">
              <span>{tr(f.label)}</span>
              <input type="text" value={String(draft[f.key] ?? '')} disabled={!form.state.writable}
                onChange={e => { setStatus('idle'); setDraft(d => ({ ...d, [f.key]: e.target.value })) }} />
              {f.hint && <span className="dshk-hint">{tr(f.hint)}</span>}
            </label>
          )
          : (
            <label key={f.key} className="dshk-check">
              <input type="checkbox" role="switch" disabled={!form.state.writable}
                checked={'on' in f && f.on !== undefined ? draft[f.key] === f.on : draft[f.key] === true}
                aria-checked={'on' in f && f.on !== undefined ? draft[f.key] === f.on : draft[f.key] === true}
                onChange={e => { setStatus('idle'); setDraft(d => ({ ...d, [f.key]: 'on' in f && f.on !== undefined ? (e.target.checked ? f.on : f.off) : e.target.checked })) }} />
              <span>{tr(f.label)}</span>
            </label>
          ))}
        <div className="dshk-check">
          <button type="button" className="dshk-btn" disabled={ops.length === 0 || status === 'saving' || !form.state.writable} onClick={() => void save()}>{tr('settings.save')}</button>
          {status === 'saved' && <span className="dshk-hint">{tr('settings.saved')}</span>}
          {status === 'rejected' && <span className="dshk-error">{tr('settings.rejected')}</span>}
        </div>
        {extra?.(props)}
      </div>
    )
  }
}

const bridgeSummary = (v: Record<string, unknown>, tr: (k: KiCadLocaleKey, v?: Record<string, string | number>) => string): string =>
  tr('settings.summaryBridge', { cli: String(v.kicadCli || tr('common.default')) })

/** Bridge page: the sidecar fields plus the KiCad environment check and installer. */
export function createBridgeSettings(remote: ClientRemote) {
  // Re-mount the panel after a save so a new kicadCli / python is checked right away.
  return createSettingsCard(BRIDGE_FIELDS, bridgeSummary, props => (
    <DoctorPanel key={props.form?.state.revision ?? 0} remote={remote} t={props.t} fresh />
  ))
}

export const BridgeSettings = createSettingsCard(BRIDGE_FIELDS, bridgeSummary)
export const PolicySettings = createSettingsCard(POLICY_FIELDS, (v, tr) => tr('settings.summaryPolicy', {
  approval: v.approval === 'allow' ? tr('common.off') : tr('common.on'),
  erc: v.autoErc === false ? tr('common.off') : tr('common.on'),
}))
