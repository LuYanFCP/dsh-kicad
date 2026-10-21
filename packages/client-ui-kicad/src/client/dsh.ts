/**
 * The dsh Web Client surface this plugin uses, typed structurally. dsh asks
 * third-party Client plugins not to import its Client packages, so the shapes
 * live here: when dsh changes one of them, this file is the adaptation point.
 * Verified against dsh 0.2.1-rc.2.
 */
import type { ComponentType } from 'react'

export interface RemoteFailure { message: string, code: string }
export type RemoteResult<T> = { ok: true, value: T } | { ok: false, error: RemoteFailure }

export interface WorkspaceFileBytes { absolutePath: string, version: string, data: Uint8Array, eof: boolean }
export interface WorkspaceDirectoryListing {
  absolutePath: string
  entries: Array<{ name: string, type: 'file' | 'directory' | 'other', size?: number }>
  truncated?: boolean
}
export interface CommandExecution { result: { kind: 'success', text?: string } | { kind: 'error', text: string } }

export interface ClientRemote {
  workspaceFiles: {
    readBytes(sessionId: string, path: string, options: object, signal?: AbortSignal): Promise<RemoteResult<WorkspaceFileBytes>>
    list(sessionId: string, path: string, signal?: AbortSignal): Promise<RemoteResult<WorkspaceDirectoryListing>>
  }
  commands: {
    execute(sessionId: string, line: string, attachments: unknown[]): Promise<RemoteResult<CommandExecution | undefined>>
  }
}

export interface SlotRegistration {
  name: string
  key?: string
  id?: string
  order?: number
  locale?: string
  inject?: (...args: never[]) => unknown
}

export interface ClientContext {
  effect(factory: () => () => void, label?: string): void
  slots: {
    inject(owner: string, register: () => () => void): () => void
    register(options: SlotRegistration, component: ComponentType<never>): () => void
  }
  sidebarRightTabs: {
    register(definition: {
      id: string
      kind: string
      patterns?: string[]
      priority?: 'extension' | 'builtin' | 'fallback'
      canOpen?(address: string): boolean
      title(address: string): string
    }): () => void
  }
  locale: { register(ns: string, dictionaries: Record<string, Record<string, string>>): () => void }
  remote: ClientRemote
}

/** Live value of a `dsh-resource://` address (the `useResource` standard prop). */
export interface ResourceState<V> { status: 'none' | 'loading' | 'live' | 'failed', value?: V }
export type UseResource = <V = { absolutePath: string, version: string }>(address: string) => ResourceState<V>

export interface TabInfo {
  tab: { id: string, contentId?: string, visible?: boolean, signal: AbortSignal }
}

/** Props the right-sidebar keyed tab seat passes to a body. */
export interface TabBodyProps {
  useTabInfo: () => TabInfo
  useResource?: UseResource
  sessionId?: string
  t?: (key: string, vars?: Record<string, string | number>) => string
}

/** Props of one atomic tool view in `tool.call.toolview`. */
export interface ToolViewProps {
  toolName: string
  callId: string
  phase: 'preparing' | 'start' | 'result'
  block: {
    /** Lazy argument view (dsh PartialArguments): `text(key)` reads a string field, even while arguments stream in. */
    args?: { text?(key: string): string | undefined }
    call?: { name: string, argsRaw: string } | null
    content?: ReadonlyArray<{ type: string, text?: string }>
    isError?: boolean
    meta?: unknown
  }
  cwd?: string
  openFile?: (path: string, options?: { line?: number }) => void
  t?: (key: string, vars?: Record<string, string | number>) => string
}

/** Props of a `plugins.row.config` page. */
export interface ConfigViewProps {
  view: 'summary' | 'page'
  form?: {
    state: { status: 'loading' | 'ready' | 'unavailable', value: Record<string, unknown> | undefined, revision: number | undefined, writable: boolean }
    mutate(ops: ReadonlyArray<{ op: 'set', path: string[], value: unknown } | { op: 'unset', path: string[] }>, expectedRevision?: number): Promise<boolean>
  }
  t?: (key: string, vars?: Record<string, string | number>) => string
}
