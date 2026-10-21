/**
 * "Follow the agent": when a live tool call creates or edits a KiCad design, open it
 * in the right sidebar so the user watches the drawing grow. Pure decision helpers plus
 * a hook used by the conversation rows; preferences live in this browser.
 */
import { useEffect } from 'react'
import { isDesignFile } from './address.ts'
import type { ToolViewProps } from './dsh.ts'

export const FOLLOW_KEY = 'dsh-kicad:follow-agent'
/** Calls older than this are history being replayed, not work happening now. */
export const LIVE_WINDOW_MS = 120_000

export function followEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(FOLLOW_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setFollowEnabled(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(FOLLOW_KEY, on ? 'on' : 'off')
  } catch {
    // storage unavailable: the default (on) applies
  }
}

/** Designs already opened on this page, so later edits refresh the tab without stealing focus. */
const opened = new Set<string>()

export function resetFollowed(): void {
  opened.clear()
}

/** Whether this tool row should open `path` now. */
export function shouldFollow(input: { toolName: string, phase: string, time?: number, isError?: boolean, path: string, now: number }): boolean {
  if (!input.path || !isDesignFile(input.path)) return false
  if (input.time === undefined || input.now - input.time > LIVE_WINDOW_MS) return false
  if (input.isError) return false
  // A new file exists only once its creation settled; an edited file already exists when the call starts.
  if (input.toolName === 'kicad_create_schematic') return input.phase === 'result'
  return input.phase === 'start' || input.phase === 'result'
}

export function useFollowAgent(props: ToolViewProps, path: string): void {
  const { toolName, phase, block, openFile } = props
  useEffect(() => {
    if (!openFile || !followEnabled()) return
    if (!shouldFollow({ toolName, phase, time: block.time, isError: block.isError, path, now: Date.now() })) return
    const key = `${props.cwd ?? ''}::${path}`
    if (opened.has(key)) return
    opened.add(key)
    openFile(path)
  }, [toolName, phase, block.time, block.isError, path, openFile])
}
