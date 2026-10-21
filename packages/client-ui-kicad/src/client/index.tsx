/**
 * dsh-client-ui-kicad, browser half. Registers:
 * - a right-sidebar tab type for *.kicad_sch / *.kicad_pcb (extension band, so it
 *   outranks the plain-text document preview),
 * - conversation rows for kicad_doctor / kicad_erc / kicad_drc / kicad_edit_schematic
 *   (with an "Install KiCad" path when a call failed because KiCad is missing),
 * - Plugin Manager pages for the bundle's bridge and policy rows; the bridge page
 *   also shows the KiCad environment check and installer.
 */
import type { ComponentType } from 'react'
import { basename, isDesignFile, parseFileAddress } from './address.ts'
import { CheckCard, CreateCard, createDoctorCard, EditCard, withKiCadHint } from './Cards.tsx'
import type { ClientContext } from './dsh.ts'
import { en, NS, zh } from './locales.ts'
import { createBridgeSettings, PolicySettings } from './Settings.tsx'
import { createViewer } from './Viewer.tsx'

export { parseFileAddress, renderDir, orderPages, sessionFileAddress } from './address.ts'
export { readCheckMeta } from './Cards.tsx'
export { KICAD_MISSING, pickSession, readReport } from './Doctor.tsx'
export { toOps } from './Settings.tsx'

export const TAB_ID = 'dsh-client-ui-kicad'
/** Package names the bundle ships under: the monorepo bundle and the single-package distribution. */
export const BUNDLES = ['dsh-kicad-bundle', 'dsh-kicad'] as const

// Remote namespaces are services of their own and must be injected explicitly.
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'remote.commands', 'remote.session']

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
  const cards = [
    ['kicad_doctor', createDoctorCard(ctx.remote)],
    ['kicad_erc', withKiCadHint(ctx.remote, CheckCard)],
    ['kicad_drc', withKiCadHint(ctx.remote, CheckCard)],
    ['kicad_edit_schematic', withKiCadHint(ctx.remote, EditCard)],
    ['kicad_create_schematic', withKiCadHint(ctx.remote, CreateCard)],
  ] as const
  for (const [tool, view] of cards) {
    ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
      { name: 'tool.call.toolview', key: tool, locale: NS }, view as ComponentType<never>,
    )), `kicad: ${tool} row`)
  }
  const BridgeSettings = createBridgeSettings(ctx.remote)
  for (const bundle of BUNDLES) {
    for (const [row, view] of [['kicad-bridge', BridgeSettings], ['kicad-policy', PolicySettings]] as const) {
      ctx.effect(() => ctx.slots.inject('plugins.row.config', () => ctx.slots.register(
        { name: 'plugins.row.config', key: `${bundle}#${row}`, locale: NS }, view as ComponentType<never>,
      )), `kicad: ${bundle}#${row} settings`)
    }
  }
}
