import { Canvas, useThree } from '@react-three/fiber'
import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import { cloneSceneSelection } from '../models/sceneParts'

function normalizeRoot(root: THREE.Object3D): {
  bbox: { x: number; y: number; z: number }
} {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = new THREE.Vector3()
  box.getSize(size)
  const center = new THREE.Vector3()
  box.getCenter(center)
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
  root.updateMatrixWorld(true)
  return { bbox: { x: size.x, y: size.y, z: size.z } }
}

function formatMeters(m: number): string {
  if (m < 0.01) return `${(m * 1000).toFixed(0)} мм`
  if (m < 1) return `${(m * 100).toFixed(1)} см`
  return `${m.toFixed(2)} м`
}

/** Standing adult reference next to AABB. */
const HUMAN_HEIGHT_M = 1.75

/** Floor grid sized to the object (1 m cells). */
function MeterGrid({ extent }: { extent: number }) {
  const floorLines = useMemo(() => {
    const pts: number[] = []
    const e = Math.ceil(extent)
    for (let i = -e; i <= e; i++) {
      pts.push(-e, 0, i, e, 0, i)
      pts.push(i, 0, -e, i, 0, e)
    }
    return new Float32Array(pts)
  }, [extent])

  const plane = Math.max(2, Math.ceil(extent) * 2)

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.001, 0]}
        receiveShadow
      >
        <planeGeometry args={[plane, plane]} />
        <meshStandardMaterial color="#d4cbb8" />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[floorLines, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#8a7f6e" transparent opacity={0.45} />
      </lineSegments>
    </group>
  )
}

const LABEL_STYLE: CSSProperties = {
  pointerEvents: 'none',
  userSelect: 'none',
  color: '#2c2822',
  fontSize: '12px',
  fontWeight: 650,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
  padding: '1px 5px',
  borderRadius: 3,
  background: 'color-mix(in srgb, #ebe4d6 82%, transparent)',
  border: '1px solid color-mix(in srgb, #3d3830 35%, transparent)',
  textShadow: '0 0 2px #ebe4d6',
}

/** One AABB face dimension: extension ticks + outer line + label. */
function FaceDimension({
  from,
  to,
  offset,
  label,
  color = '#3d3830',
}: {
  from: THREE.Vector3
  to: THREE.Vector3
  offset: THREE.Vector3
  label: string
  color?: string
}) {
  const geom = useMemo(() => {
    const a = from.clone().add(offset)
    const b = to.clone().add(offset)
    const pts = new Float32Array([
      // extensions
      from.x,
      from.y,
      from.z,
      a.x,
      a.y,
      a.z,
      to.x,
      to.y,
      to.z,
      b.x,
      b.y,
      b.z,
      // main
      a.x,
      a.y,
      a.z,
      b.x,
      b.y,
      b.z,
      // end ticks (perpendicular-ish short stubs along offset)
      a.x - offset.x * 0.15,
      a.y - offset.y * 0.15,
      a.z - offset.z * 0.15,
      a.x + offset.x * 0.15,
      a.y + offset.y * 0.15,
      a.z + offset.z * 0.15,
      b.x - offset.x * 0.15,
      b.y - offset.y * 0.15,
      b.z - offset.z * 0.15,
      b.x + offset.x * 0.15,
      b.y + offset.y * 0.15,
      b.z + offset.z * 0.15,
    ])
    return pts
  }, [from, to, offset])

  const mid = useMemo(() => {
    const a = from.clone().add(offset)
    const b = to.clone().add(offset)
    return a.add(b).multiplyScalar(0.5)
  }, [from, to, offset])

  return (
    <group>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geom, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} />
      </lineSegments>
      <Html position={mid} center style={LABEL_STYLE} zIndexRange={[40, 0]}>
        {label}
      </Html>
    </group>
  )
}

/**
 * Dimension lines on AABB faces (W / D / H) in meters, close to the mesh.
 * Model is assumed centered on XZ and sitting on Y=0.
 */
function AabbDimensionLines({
  size,
}: {
  size: { x: number; y: number; z: number }
}) {
  const { x: sx, y: sy, z: sz } = size
  if (!(sx > 0) || !(sy > 0) || !(sz > 0)) return null

  const gap = Math.max(0.06, Math.max(sx, sy, sz) * 0.1)
  const hx = sx / 2
  const hz = sz / 2

  // Wireframe box corners
  const boxPts = useMemo(() => {
    const c = [
      [-hx, 0, -hz],
      [hx, 0, -hz],
      [hx, 0, hz],
      [-hx, 0, hz],
      [-hx, sy, -hz],
      [hx, sy, -hz],
      [hx, sy, hz],
      [-hx, sy, hz],
    ] as const
    const edges: [number, number][] = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ]
    const pts: number[] = []
    for (const [i, j] of edges) {
      pts.push(...c[i]!, ...c[j]!)
    }
    return new Float32Array(pts)
  }, [hx, hz, sy])

  // Width along +Z face (front), at mid height of low band
  const widthFrom = useMemo(() => new THREE.Vector3(-hx, 0, hz), [hx, hz])
  const widthTo = useMemo(() => new THREE.Vector3(hx, 0, hz), [hx, hz])
  const widthOff = useMemo(() => new THREE.Vector3(0, 0, gap), [gap])

  // Depth along +X face
  const depthFrom = useMemo(() => new THREE.Vector3(hx, 0, -hz), [hx, hz])
  const depthTo = useMemo(() => new THREE.Vector3(hx, 0, hz), [hx, hz])
  const depthOff = useMemo(() => new THREE.Vector3(gap, 0, 0), [gap])

  // Height at +X/+Z corner
  const heightFrom = useMemo(() => new THREE.Vector3(hx, 0, hz), [hx, hz])
  const heightTo = useMemo(() => new THREE.Vector3(hx, sy, hz), [hx, hz, sy])
  const heightOff = useMemo(
    () => new THREE.Vector3(gap * 0.85, 0, gap * 0.85),
    [gap],
  )

  // Human reference on the free (−X) side of the AABB
  const humanX = -hx - gap - 0.4

  return (
    <group>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[boxPts, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#c45c26" transparent opacity={0.55} />
      </lineSegments>
      <FaceDimension
        from={widthFrom}
        to={widthTo}
        offset={widthOff}
        label={`Ш ${formatMeters(sx)}`}
      />
      <FaceDimension
        from={depthFrom}
        to={depthTo}
        offset={depthOff}
        label={`Г ${formatMeters(sz)}`}
      />
      <FaceDimension
        from={heightFrom}
        to={heightTo}
        offset={heightOff}
        label={`В ${formatMeters(sy)}`}
        color="#5a4a38"
      />
      <HumanScaleFigure position={[humanX, 0, 0]} height={HUMAN_HEIGHT_M} />
    </group>
  )
}

/**
 * Stylized standing person (front silhouette) for scale reference.
 * Drawn in local XY, slight yaw toward the camera.
 */
function HumanScaleFigure({
  position,
  height = HUMAN_HEIGHT_M,
}: {
  position: [number, number, number]
  height?: number
}) {
  const s = height / HUMAN_HEIGHT_M

  const bodyShape = useMemo(() => {
    const sh = new THREE.Shape()
    const p = (x: number, y: number): [number, number] => [x * s, y * s]
    // Torso + legs (no head — separate circle)
    sh.moveTo(...p(-0.11, 0))
    sh.lineTo(...p(-0.13, 0.02))
    sh.lineTo(...p(-0.1, 0.52))
    sh.lineTo(...p(-0.14, 0.92))
    sh.lineTo(...p(-0.2, 1.08))
    sh.lineTo(...p(-0.23, 1.42))
    sh.lineTo(...p(-0.07, 1.5))
    sh.lineTo(...p(0.07, 1.5))
    sh.lineTo(...p(0.23, 1.42))
    sh.lineTo(...p(0.2, 1.08))
    sh.lineTo(...p(0.14, 0.92))
    sh.lineTo(...p(0.1, 0.52))
    sh.lineTo(...p(0.13, 0.02))
    sh.lineTo(...p(0.11, 0))
    sh.lineTo(...p(0.04, 0))
    sh.lineTo(...p(0.05, 0.5))
    sh.lineTo(...p(0, 0.9))
    sh.lineTo(...p(-0.05, 0.5))
    sh.lineTo(...p(-0.04, 0))
    sh.closePath()
    return sh
  }, [s])

  const outline = useMemo(() => {
    const pts: number[] = []
    const line = (ax: number, ay: number, bx: number, by: number) => {
      pts.push(ax, ay, 0, bx, by, 0)
    }
    line(0, 1.5 * s, 0, 0.95 * s)
    line(-0.23 * s, 1.42 * s, 0.23 * s, 1.42 * s)
    line(-0.23 * s, 1.42 * s, -0.3 * s, 0.88 * s)
    line(0.23 * s, 1.42 * s, 0.3 * s, 0.88 * s)
    line(-0.12 * s, 0.95 * s, 0.12 * s, 0.95 * s)
    line(-0.1 * s, 0.95 * s, -0.12 * s, 0)
    line(0.1 * s, 0.95 * s, 0.12 * s, 0)
    return new Float32Array(pts)
  }, [s])

  return (
    <group position={position} rotation={[0, Math.PI * 0.18, 0]}>
      <mesh position={[0, 0, -0.001]}>
        <shapeGeometry args={[bodyShape]} />
        <meshBasicMaterial
          color="#6a5e52"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 1.61 * s, 0]}>
        <circleGeometry args={[0.115 * s, 20]} />
        <meshBasicMaterial
          color="#6a5e52"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 1.61 * s, 0.001]}>
        <ringGeometry args={[0.1 * s, 0.115 * s, 20]} />
        <meshBasicMaterial color="#3d3830" side={THREE.DoubleSide} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[outline, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#3d3830" />
      </lineSegments>
      <Html
        position={[0, height + 0.1, 0]}
        center
        style={LABEL_STYLE}
        zIndexRange={[40, 0]}
      >
        {height.toFixed(2)} м
      </Html>
    </group>
  )
}

function FitCamera({ size }: { size: { x: number; y: number; z: number } }) {
  const { camera, controls } = useThree()
  useLayoutEffect(() => {
    const maxDim = Math.max(size.x, size.y, size.z, HUMAN_HEIGHT_M * 0.55, 0.35)
    const dist = maxDim * 2.35
    const cam = camera as THREE.PerspectiveCamera
    cam.position.set(dist * 0.85, dist * 0.55, dist * 0.9)
    cam.near = Math.max(0.01, maxDim / 80)
    cam.far = Math.max(80, maxDim * 40)
    cam.updateProjectionMatrix()
    const lookY = Math.max(size.y, HUMAN_HEIGHT_M) * 0.38
    cam.lookAt(0, lookY, 0)
    const ctrl = controls as
      | { target: THREE.Vector3; update: () => void }
      | null
    if (ctrl?.target) {
      ctrl.target.set(0, lookY, 0)
      ctrl.update()
    }
  }, [size.x, size.y, size.z, camera, controls])
  return null
}

function CalibrateMesh({
  url,
  objectId,
  scale,
  onBbox,
}: {
  url: string
  objectId?: string
  scale: number
  onBbox: (bbox: { x: number; y: number; z: number }) => void
}) {
  const gltf = useGLTF(url)
  const scene = useMemo(() => {
    const clone = cloneSceneSelection(gltf.scene, objectId)
    const { bbox } = normalizeRoot(clone)
    clone.userData = { ...clone.userData, nativeBbox: bbox }
    return clone
  }, [gltf.scene, objectId])

  useEffect(() => {
    const bbox = scene.userData.nativeBbox as
      | { x: number; y: number; z: number }
      | undefined
    if (bbox) onBbox(bbox)
  }, [scene, onBbox])

  return (
    <group scale={scale}>
      <primitive object={scene} />
    </group>
  )
}

export type SizeCalibrateResult = {
  defaultScale: number
  bbox: { x: number; y: number; z: number }
  /** Target max horizontal span in meters (for UI). */
  targetHorizontalM: number
}

/**
 * Modal 3D scene with AABB face dimensions to pick a default placement scale.
 * Portaled to document.body so parent library backdrop clicks cannot close it.
 */
export function SizeCalibrateScene({
  url,
  objectId,
  initialTargetM = 1,
  onConfirm,
  onCancel,
}: {
  url: string
  objectId?: string
  /** Desired max(width, depth) in meters at confirm. */
  initialTargetM?: number
  onConfirm: (result: SizeCalibrateResult) => void
  onCancel: () => void
}) {
  const [nativeBbox, setNativeBbox] = useState({ x: 1, y: 1, z: 1 })
  const [targetM, setTargetM] = useState(initialTargetM)

  const nativeHoriz = Math.max(nativeBbox.x, nativeBbox.z, 1e-6)
  const scale = targetM / nativeHoriz
  const sized = {
    x: nativeBbox.x * scale,
    y: nativeBbox.y * scale,
    z: nativeBbox.z * scale,
  }

  const gridExtent = Math.max(
    1.5,
    Math.ceil(Math.max(sized.x, sized.z, 1.2) / 2 + 1.1),
  )

  const modal = (
    <div
      className="tex-modal-backdrop size-calibrate-backdrop"
      role="dialog"
      aria-modal
      aria-label="Размер объекта"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="tex-modal size-calibrate-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tex-modal-header">
          <h3>Размер объекта</h3>
          <button type="button" className="ghost" onClick={onCancel}>
            Закрыть
          </button>
        </header>
        <div className="size-calibrate-body">
          <div className="size-calibrate-canvas">
            <Canvas
              camera={{
                position: [2.2, 1.4, 2.4],
                fov: 40,
                near: 0.01,
                far: 200,
              }}
              dpr={[1, 1.5]}
              gl={{ antialias: true, alpha: false }}
            >
              <color attach="background" args={['#ebe4d6']} />
              <ambientLight intensity={0.8} />
              <directionalLight position={[4, 8, 3]} intensity={1.1} />
              <MeterGrid extent={gridExtent} />
              <AabbDimensionLines size={sized} />
              <FitCamera size={sized} />
              <Suspense fallback={null}>
                <CalibrateMesh
                  url={url}
                  objectId={objectId}
                  scale={scale}
                  onBbox={setNativeBbox}
                />
              </Suspense>
              <OrbitControls
                makeDefault
                minDistance={0.3}
                maxDistance={30}
              />
            </Canvas>
            <div className="size-calibrate-ruler-hint" aria-hidden>
              Размеры AABB · человек 1.75 м · сетка 1 м
            </div>
          </div>
          <aside className="size-calibrate-controls">
            <p className="muted">
              Слева — фигура человека 1.75 м для сравнения. Линии Ш / Г / В —
              габариты у объекта (стул ≈ 0.5–0.6 м, стол ≈ 0.8–1.2 м).
            </p>
            <label className="size-calibrate-slider">
              <span>
                Макс. сторона (м): <strong>{targetM.toFixed(2)}</strong>
              </span>
              <input
                type="range"
                min={0.05}
                max={12}
                step={0.01}
                value={targetM}
                onChange={(e) => setTargetM(Number(e.target.value))}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              />
            </label>
            <p className="size-calibrate-readout">
              {sized.x.toFixed(2)} × {sized.y.toFixed(2)} × {sized.z.toFixed(2)}{' '}
              м
              <span className="muted"> · высота {sized.y.toFixed(2)} м</span>
            </p>
            <div className="size-calibrate-presets">
              {[
                { label: '0.5 м', v: 0.5 },
                { label: '1 м', v: 1 },
                { label: '2 м', v: 2 },
                { label: '3 м', v: 3 },
              ].map((p) => (
                <button
                  key={p.v}
                  type="button"
                  className="ghost"
                  onClick={() => setTargetM(p.v)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="model-preview-actions">
              <button
                type="button"
                onClick={() =>
                  onConfirm({
                    defaultScale: scale,
                    bbox: nativeBbox,
                    targetHorizontalM: targetM,
                  })
                }
              >
                Далее
              </button>
              <button type="button" className="ghost" onClick={onCancel}>
                Отмена
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return modal
  return createPortal(modal, document.body)
}
