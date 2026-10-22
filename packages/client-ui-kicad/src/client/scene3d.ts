/**
 * The interactive 3D board scene: KiCad's GLB export in three.js with orbit controls.
 * Built as its own client chunk (lib/client.three.js, see scripts/build-client.mjs) that
 * dsh loads the first time a board opens in 3D mode, so three.js is not part of the
 * main client module. No React here: Board3D.tsx drives it.
 */
import {
  Color, DirectionalLight, Group, HemisphereLight, Mesh, OrthographicCamera, PerspectiveCamera, PMREMGenerator,
  PropertyBinding, Scene, SRGBColorSpace, Vector3, WebGLRenderer, Box3, type Material, type Object3D, type Texture,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  FOV_DEG, MAX_ZOOM, MIN_ZOOM, cameraPosition, homeDistance, normalize, orthoHalfHeight, viewCamera,
  type BoardFrame, type CameraState, type Vec3, type ViewName,
} from './camera3d.ts'

export interface BoardInfo {
  /** Outline centre in board millimetres; null takes the model's bounding box. */
  center: readonly [number, number] | null
  width: number | null
  height: number | null
  thickness: number
  /** Footprint references: the GLB names each footprint's 3D model node after it. */
  references: readonly string[]
}

export interface SceneOptions {
  ortho: boolean
  components: boolean
  /** Camera to start from (e.g. kept from before a mode switch); otherwise `view` at KiCad's zoom 1. */
  camera?: CameraState
  view?: ViewName
  /** The user moved the camera. */
  onChange?: (state: CameraState) => void
}

export interface BoardScene {
  /** Show a new GLB; the camera stays where it is (except for the very first model, which gets the start view). */
  load(glb: ArrayBuffer | Uint8Array, info: BoardInfo): Promise<{ components: number }>
  setView(view: ViewName): void
  setOrtho(ortho: boolean): void
  setComponentsVisible(visible: boolean): void
  camera(): CameraState
  setCamera(state: CameraState): void
  /** The board's larger outline side, mm (KiCad's zoom reference). */
  boardSize(): number
  /** Board size and framing radius. */
  frame(): BoardFrame
  /** Width / height of the view. */
  aspect(): number
  dispose(): void
}

const STEP = Math.PI / 12
/** Close to KiCad's 3D viewer: a dark solder mask, light silkscreen, metallic pads. */
const LIGHT = { environment: 0.6, hemisphere: 0.5, headlight: 1.4 }

export function createBoardScene(host: HTMLElement, options: SceneOptions): BoardScene {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const canvas = renderer.domElement
  canvas.style.display = 'block'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.outline = 'none'
  canvas.tabIndex = 0
  canvas.dataset.kicad3dCanvas = ''
  host.append(canvas)

  const scene = new Scene()
  // Copper and pads are metallic in KiCad's GLB: without an environment they render black.
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment: Texture = pmrem.fromScene(room, 0.04).texture
  room.dispose?.()
  scene.environment = environment
  scene.environmentIntensity = LIGHT.environment
  scene.add(new HemisphereLight(0xffffff, 0x404050, LIGHT.hemisphere))
  const headlight = new DirectionalLight(0xffffff, LIGHT.headlight)
  scene.add(headlight, headlight.target)

  const perspective = new PerspectiveCamera(FOV_DEG, 1, 0.1, 100_000)
  const orthographic = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100_000)
  let ortho = options.ortho
  let camera: PerspectiveCamera | OrthographicCamera = ortho ? orthographic : perspective
  /** Perspective-equivalent distance the orthographic frustum was sized for (zoom 1). */
  let orthoFrame = 100
  let size = 50
  /** Radius of a sphere around the board and its parts (framing). */
  let radius = 36
  let aspect = 1
  const frame = (): BoardFrame => ({ size, radius })
  let model: Group | undefined
  let components: Object3D[] = []
  let componentsVisible = options.components
  let pending: CameraState | undefined = options.camera
  let disposed = false

  const controls = new OrbitControls(camera, canvas)
  controls.screenSpacePanning = true
  controls.zoomToCursor = true

  let animation = 0
  const draw = (): void => {
    animation = 0
    if (disposed) return
    headlight.position.copy(camera.position)
    headlight.target.position.copy(controls.target)
    renderer.render(scene, camera)
  }
  const redraw = (): void => {
    if (!animation) animation = requestAnimationFrame(draw)
  }
  controls.addEventListener('change', () => {
    clip()
    redraw()
    options.onChange?.(state())
  })

  const resize = (): void => {
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    aspect = width / height
    renderer.setSize(width, height, false)
    perspective.aspect = aspect
    perspective.updateProjectionMatrix()
    frameOrtho(orthoFrame)
    redraw()
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : undefined
  observer?.observe(host)

  function frameOrtho(distance: number): void {
    orthoFrame = distance
    const half = orthoHalfHeight(distance)
    orthographic.top = half
    orthographic.bottom = -half
    orthographic.left = -half * aspect
    orthographic.right = half * aspect
    orthographic.updateProjectionMatrix()
  }

  /** Near/far planes and zoom limits for the current distance (KiCad's zoom range). */
  function clip(): void {
    const home = homeDistance({ size })
    const distance = state().distance
    if (camera === perspective) {
      perspective.near = Math.max(distance / 1000, 0.01)
      perspective.far = distance + home * 20
      perspective.updateProjectionMatrix()
      controls.minDistance = home / MAX_ZOOM
      controls.maxDistance = home / MIN_ZOOM
    } else {
      // The orthographic camera sits far back so nothing is clipped; its zoom sets the scale.
      controls.minZoom = orthoFrame / (home / MIN_ZOOM)
      controls.maxZoom = orthoFrame / (home / MAX_ZOOM)
      orthographic.near = 0.01
      orthographic.far = camera.position.distanceTo(controls.target) + home * 20
      orthographic.updateProjectionMatrix()
    }
  }

  function state(): CameraState {
    const target = controls.target
    const offset = new Vector3().subVectors(camera.position, target)
    const distance = camera === orthographic ? orthoFrame / orthographic.zoom : offset.length()
    return {
      target: [target.x, target.y, target.z],
      direction: normalize([offset.x, offset.y, offset.z]),
      distance,
      ortho: camera === orthographic,
    }
  }

  function apply(next: CameraState): void {
    const wanted = next.ortho ? orthographic : perspective
    if (wanted !== camera) {
      camera = wanted
      controls.object = camera
    }
    controls.target.set(...(next.target as [number, number, number]))
    if (camera === orthographic) {
      frameOrtho(next.distance)
      orthographic.zoom = 1
      // Far enough back that the whole board is in front of the near plane.
      const back = Math.max(next.distance, homeDistance({ size }) * 2)
      camera.position.set(...(cameraPosition({ ...next, distance: back }) as [number, number, number]))
    } else {
      perspective.zoom = 1
      camera.position.set(...(cameraPosition(next) as [number, number, number]))
    }
    camera.up.set(0, 1, 0)
    camera.lookAt(controls.target)
    clip()
    controls.update()
    redraw()
  }

  function disposeModel(root: Object3D): void {
    root.traverse((node) => {
      if (!(node instanceof Mesh)) return
      node.geometry.dispose()
      const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material]
      for (const material of materials) {
        for (const value of Object.values(material)) {
          if (value && typeof value === 'object' && 'isTexture' in value) (value as Texture).dispose()
        }
        material.dispose()
      }
    })
  }

  const api: BoardScene = {
    async load(glb, info) {
      const data = glb instanceof Uint8Array ? glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer : glb
      const gltf = await new GLTFLoader().parseAsync(data, '')
      if (disposed) return { components: 0 }
      const inner = gltf.scene
      inner.scale.setScalar(1000) // GLB metres → mm
      inner.updateMatrixWorld(true)
      const box = new Box3().setFromObject(inner)
      const extent = box.getSize(new Vector3())
      let center: Vec3
      if (info.center) {
        center = [info.center[0], info.thickness / 2, info.center[1]]
        size = Math.max(info.width ?? 0, info.height ?? 0) || size
      } else {
        const mid = box.getCenter(new Vector3())
        center = [mid.x, info.thickness / 2, mid.z]
        size = Math.max(extent.x, extent.z) || size
      }
      inner.position.set(-center[0], -center[1], -center[2])
      // Parts may overhang the outline (connectors) or stand tall: frame them too.
      radius = Math.max(Math.hypot(info.width ?? 0, info.height ?? 0) / 2, Math.hypot(extent.x, extent.y, extent.z) / 2, 1)
      // KiCad writes its sRGB colours (mask, silkscreen, copper, model colours) as glTF's linear
      // baseColorFactor; read them as sRGB so the board looks as it does in KiCad's 3D viewer.
      const seen = new Set<Material>()
      inner.traverse((node) => {
        if (!(node instanceof Mesh)) return
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (seen.has(material)) continue
          seen.add(material)
          const color = (material as Material & { color?: Color }).color
          color?.convertSRGBToLinear()
        }
      })
      const root = new Group()
      root.name = 'kicad-board'
      root.add(inner)
      const refs = new Set(info.references.map(r => PropertyBinding.sanitizeNodeName(r)))
      const found: Object3D[] = []
      const visit = (node: Object3D): void => {
        for (const child of node.children) {
          // Footprint bodies are named after their reference; board layers are unnamed ("=>[0:1:1:n]").
          if (refs.size ? refs.has(child.name) : child.name !== '' && !child.name.startsWith('=>')) found.push(child)
          else visit(child)
        }
      }
      visit(inner)
      const old = model
      model = root
      components = found
      api.setComponentsVisible(componentsVisible)
      scene.add(root)
      if (old) {
        scene.remove(old)
        disposeModel(old)
      } else {
        resize()
        apply(pending ?? viewCamera(options.view ?? 'iso', frame(), ortho, aspect))
        pending = undefined
      }
      resize()
      return { components: found.length }
    },
    setView(view) {
      apply(viewCamera(view, frame(), ortho, aspect))
    },
    setOrtho(next) {
      if (next === ortho) return
      ortho = next
      apply({ ...state(), ortho: next })
    },
    setComponentsVisible(visible) {
      componentsVisible = visible
      for (const node of components) node.visible = visible
      redraw()
    },
    camera: state,
    setCamera(next) {
      ortho = next.ortho
      apply(next)
    },
    boardSize: () => size,
    frame,
    aspect: () => aspect,
    dispose() {
      disposed = true
      if (animation) cancelAnimationFrame(animation)
      observer?.disconnect()
      controls.dispose()
      if (model) disposeModel(model)
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
  // Arrow keys orbit around the target, 15° a step.
  canvas.addEventListener('keydown', (event) => {
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const current = state()
    const [x, y, z] = current.direction
    let theta = Math.atan2(x, z)
    let phi = Math.acos(Math.max(-1, Math.min(1, y)))
    if (event.key === 'ArrowLeft') theta -= STEP
    if (event.key === 'ArrowRight') theta += STEP
    if (event.key === 'ArrowUp') phi = Math.max(1e-6, phi - STEP)
    if (event.key === 'ArrowDown') phi = Math.min(Math.PI - 1e-6, phi + STEP)
    apply({ ...current, direction: [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)] })
    options.onChange?.(state())
  })
  if (pending && !model) clip()
  resize()
  return api
}
