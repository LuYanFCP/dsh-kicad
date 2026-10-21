/**
 * dsh-client-ui-kicad, browser half. Registers:
 * - a right-sidebar tab type for *.kicad_sch / *.kicad_pcb (extension band, so it
 *   outranks the plain-text document preview),
 * - conversation rows for kicad_erc / kicad_drc / kicad_edit_schematic,
 * - Plugin Manager pages for the bundle's bridge and policy rows.
 */
import type { ComponentType } from 'react'
import { basename, isDesignFile, parseFileAddress } from './address.ts'
import { CheckCard, EditCard } from './Cards.tsx'
import type { ClientContext } from './dsh.ts'
import { en, NS, zh } from './locales.ts'
import { BridgeSettings, PolicySettings } from './Settings.tsx'
import { createViewer } from './Viewer.tsx'

export { parseFileAddress, renderDir, orderPages, sessionFileAddress } from './address.ts'
export { readCheckMeta } from './Cards.tsx'
export { toOps } from './Settings.tsx'

export const TAB_ID = 'dsh-client-ui-kicad'
export const BUNDLE = 'dsh-kicad-bundle'

// Remote namespaces are services of their own and must be injected explicitly.
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'remote.commands']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'kicad: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: TAB_ID,
    kind: 'kicad',
    patterns: ['*.kicad_sch', '*.kicad_pcb'],
    priority: 'extension',
    canOpen: address => parseFileAddress(address)?.scope === 'session' && isDesignFile(address),
    title: address => basename(parseFileAddress(address)?.path ?? address),
  }), 'kicad: tab type')
  const Viewer = createViewer(ctx.remote) as ComponentType<never>
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, Viewer,
  )), 'kicad: viewer body')
  for (const [tool, view] of [['kicad_erc', CheckCard], ['kicad_drc', CheckCard], ['kicad_edit_schematic', EditCard]] as const) {
    ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      { name: 'tool.call.toolview', key: tool, locale: NS }, view as ComponentType<never>,
    )), `kicad: ${tool} row`)
  }
  for (const [row, view] of [['kicad-bridge', BridgeSettings], ['kicad-policy', PolicySettings]] as const) {
    ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register(
      { name: 'plugins.row.config', key: `${BUNDLE}#${row}`, locale: NS }, view as ComponentType<never>,
    )), `kicad: ${row} settings`)
  }
}
