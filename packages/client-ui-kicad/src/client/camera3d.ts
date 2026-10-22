/**
 * Camera math shared by the interactive 3D view (three.js) and `kicad-cli pcb render`
 * (KiCad's 3D viewer camera), with no three.js dependency so it is testable on its own.
 *
 * Scene ("world") frame: millimetres, origin at the board centre (half-way through its
 * thickness), +X = board X, +Y out of the top face, +Z = board Y (KiCad's Y grows
 * downward, so +Z points to the front of the board). This is the GLB's frame (glTF is
 * Y-up) scaled to mm and centred.
 *
 * KiCad's 3D frame: +X right, +Y up the board (= -board Y), +Z out of the top. kicad-cli's
 * camera (pcbnew_jobs_handler.cpp JobExportRender, common/gal/3d/camera.cpp) starts 16
 * units from the board centre (the outline's centre, mid-thickness) on a board whose
 * larger side is 12.8 units (BOARD_ADAPTER: RANGE_SCALE_3D 8 × 1.6), i.e. 1.25 × that side,
 * with a 45° vertical field of view; ortho shows the same plane. `--side top` leaves the
 * view rotation at identity, `--rotate X,Y,Z` makes it Rx(X)·Ry(Y)·Rz(Z) (degrees),
 * `--zoom` divides the distance and `--pivot` (cm from the board centre, KiCad frame)
 * moves the point it looks at, which stays in the middle of the image.
 */

export type Vec3 = readonly [number, number, number]
type Mat3 = readonly [Vec3, Vec3, Vec3]

export const FOV_DEG = 45
/** Zoom range of the view (kicad-cli clamps its own to the scene's size). */
export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 48

export type ViewName = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'iso'
export const VIEWS: readonly ViewName[] = ['top', 'bottom', 'front', 'back', 'left', 'right', 'iso']

/** Where a view puts the camera, seen from the target (world frame). Poles are nudged so "north" stays up. */
const POLE = 1e-6
const DIRECTIONS: Record<ViewName, Vec3> = {
  top: [0, 1, POLE],
  // KiCad's bottom view turns the board over left to right: the front edge stays at the bottom of the screen.
  bottom: [0, -1, -POLE],
  front: [0, 0, 1],
  back: [0, 0, -1],
  left: [-1, 0, 0],
  right: [1, 0, 0],
  // kicad-cli's isometric example, `--rotate -45,0,45`: from above the front-left corner.
  iso: [-0.5, Math.SQRT1_2, 0.5],
}

export function viewDirection(view: ViewName): Vec3 {
  return normalize(DIRECTIONS[view])
}

/** The camera, independent of the projection: `distance` is the perspective-equivalent one (ortho shows the same plane). */
export interface CameraState {
  target: Vec3
  /** Unit vector from the target to the camera. */
  direction: Vec3
  distance: number
  ortho: boolean
}

/**
 * The board facts the mapping needs: its larger outline side (mm, KiCad's zoom reference) and,
 * for framing, the radius of a sphere around it (half the outline's diagonal plus parts).
 */
export interface BoardFrame { size: number, radius?: number }

/** KiCad's starting distance (zoom 1): 1.25 × the board's larger side. */
export function homeDistance(board: BoardFrame): number {
  return 1.25 * Math.max(board.size, 1)
}

/**
 * Distance at which the whole board fits a view of this aspect (width / height) from any
 * angle. KiCad's zoom 1 assumes a wide window; a sidebar is narrow, so views start here.
 */
export function fitDistance(board: BoardFrame, aspect: number): number {
  const radius = board.radius ?? board.size * Math.SQRT1_2
  const half = (FOV_DEG * Math.PI) / 360
  const narrowest = Math.min(half, Math.atan(Math.tan(half) * (aspect > 0 ? aspect : 1)))
  const home = homeDistance(board)
  return clamp((radius / Math.sin(narrowest)) * 1.04, home / MAX_ZOOM, home / MIN_ZOOM)
}

/** A KiCad view (top, iso, …) of the whole board, looking at its centre. */
export function viewCamera(view: ViewName, board: BoardFrame, ortho: boolean, aspect = 16 / 9): CameraState {
  return { target: [0, 0, 0], direction: viewDirection(view), distance: fitDistance(board, aspect), ortho }
}

export function cameraPosition(state: CameraState): Vec3 {
  return add(state.target, scale(state.direction, state.distance))
}

/** Half the visible height at the target, as KiCad sizes its orthographic view. */
export function orthoHalfHeight(distance: number): number {
  return distance * Math.tan((FOV_DEG * Math.PI) / 360)
}

export interface KiCadCamera {
  side: 'top'
  rotate: Vec3
  zoom: number
  pivot: Vec3
  perspective: boolean
}

/** World vector → KiCad 3D frame. */
function toKiCad(v: Vec3): Vec3 {
  return [v[0], -v[2], v[1]]
}

/** Camera axes in the world (three.js `lookAt` with +Y up): right, up, back. */
export function cameraAxes(direction: Vec3): Mat3 {
  const back = normalize(direction)
  let right = cross([0, 1, 0], back)
  if (length(right) < 1e-12) right = [1, 0, 0]
  right = normalize(right)
  return [right, cross(back, right), back]
}

/** The `kicad-cli pcb render` camera that shows what `state` shows. */
export function kicadCamera(state: CameraState, board: BoardFrame): KiCadCamera {
  const [right, up, back] = cameraAxes(state.direction)
  const view: Mat3 = [toKiCad(right), toKiCad(up), toKiCad(back)]
  const zoom = clamp(homeDistance(board) / state.distance, MIN_ZOOM, MAX_ZOOM)
  const pivot = scale(toKiCad(state.target), 0.1)
  return { side: 'top', rotate: eulerXYZ(view).map(round2) as unknown as Vec3, zoom: round3(zoom), pivot: pivot.map(round3) as unknown as Vec3, perspective: !state.ortho }
}

/** Arguments of `/kicad-render <board> --3d …` for a camera. */
export function kicadRenderFlags(camera: KiCadCamera): string[] {
  const vec = (v: Vec3): string => v.map(n => String(Object.is(n, -0) ? 0 : n)).join(',')
  return [`--side=${camera.side}`, `--rotate=${vec(camera.rotate)}`, `--zoom=${camera.zoom}`, `--pivot=${vec(camera.pivot)}`,
    ...(camera.perspective ? ['--perspective'] : [])]
}

/** Angles (degrees) with m = Rx(a)·Ry(b)·Rz(c), the order KiCad composes them. */
export function eulerXYZ(m: Mat3): Vec3 {
  const m13 = clamp(m[0][2], -1, 1)
  const y = Math.asin(m13)
  let x: number
  let z: number
  if (Math.abs(m13) < 0.9999999) {
    x = Math.atan2(-m[1][2], m[2][2])
    z = Math.atan2(-m[0][1], m[0][0])
  } else {
    x = Math.atan2(m[2][1], m[1][1])
    z = 0
  }
  return [deg(x), deg(y), deg(z)]
}

/** Rx(a)·Ry(b)·Rz(c) for angles in degrees (KiCad's view rotation; used by tests and the inverse mapping). */
export function rotationXYZ(angles: Vec3): Mat3 {
  const [a, b, c] = angles.map(v => (v * Math.PI) / 180) as [number, number, number]
  const rx: Mat3 = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]]
  const ry: Mat3 = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]]
  const rz: Mat3 = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]]
  return mul(mul(rx, ry), rz)
}

/** The view rotation (KiCad frame, world → camera rows) of a camera looking along `direction` back to the target. */
export function kicadViewMatrix(direction: Vec3): Mat3 {
  const [right, up, back] = cameraAxes(direction)
  return [toKiCad(right), toKiCad(up), toKiCad(back)]
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const row = (r: Vec3): Vec3 => [0, 1, 2].map(j => r[0] * b[0][j] + r[1] * b[1][j] + r[2] * b[2][j]) as unknown as Vec3
  return [row(a[0]), row(a[1]), row(a[2])]
}

export function normalize(v: Vec3): Vec3 {
  const l = length(v) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k]
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

const deg = (rad: number): number => (rad * 180) / Math.PI
const round2 = (v: number): number => Math.round(v * 100) / 100 || 0
const round3 = (v: number): number => Math.round(v * 1000) / 1000 || 0
