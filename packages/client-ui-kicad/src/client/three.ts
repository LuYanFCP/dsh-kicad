/**
 * Lazy loader for the 3D scene (three.js), which ships as a separate client chunk,
 * lib/client.three.js. dsh's module loader serves `client.<name>.js` files that sit next
 * to the plugin's client module and hands every module factory a `require` with
 * `require.async('./client.<name>.js')`; the chunk downloads on the first call only.
 */
import type * as SceneModule from './scene3d.ts'

export type Scene3D = typeof SceneModule
export const SCENE_CHUNK = 'client.three.js'

// The module factory's `require` (scripts/build-client.mjs); absent outside dsh.
declare const require: undefined | { async?: (spec: string) => Promise<unknown> }

let loading: Promise<Scene3D> | undefined

export function loadScene(): Promise<Scene3D> {
  loading ??= (async () => {
    const load = typeof require === 'undefined' ? undefined : require.async
    if (typeof load !== 'function') throw new Error('this dsh version cannot load plugin chunks (require.async is missing)')
    return await load(`./${SCENE_CHUNK}`) as Scene3D
  })()
  // A failed download (network, server restart) may work next time.
  loading.catch(() => { loading = undefined })
  return loading
}

/** Whether this browser can create a WebGL context (the 3D view needs one; otherwise KiCad renders images). */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
