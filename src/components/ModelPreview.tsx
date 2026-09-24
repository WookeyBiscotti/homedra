import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react'
import * as THREE from 'three'
import {
  cloneSceneSelection,
  listSceneParts,
  type ScenePart,
} from '../models/sceneParts'

function normalizeRoot(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const center = new THREE.Vector3()
  box.getCenter(center)
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
  root.updateMatrixWorld(true)
}

function PreviewMesh({
  url,
  objectId,
  onParts,
}: {
  url: string
  objectId?: string
  onParts?: (parts: ScenePart[]) => void
}) {
  const gltf = useGLTF(url)
  const { camera, controls } = useThree()

  const parts = useMemo(() => listSceneParts(gltf.scene), [gltf.scene])

  useEffect(() => {
    onParts?.(parts)
  }, [parts, onParts])

  const scene = useMemo(() => {
    const clone = cloneSceneSelection(gltf.scene, objectId)
    normalizeRoot(clone)
    clone.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) {
        const m = c as THREE.Mesh
        m.castShadow = false
        m.receiveShadow = false
        const mat = m.material
        if (
          mat &&
          !Array.isArray(mat) &&
          (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial
        ) {
          const std = mat as THREE.MeshStandardMaterial
          if (std.metalness > 0.8 && std.roughness < 0.2) {
            std.metalness = 0.2
            std.roughness = 0.6
          }
        }
      }
    })
    return clone
  }, [gltf.scene, objectId])

  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.2)
    const dist = maxDim * 2.2
    const cam = camera as THREE.PerspectiveCamera
    cam.position.set(
      center.x + dist * 0.75,
      center.y + dist * 0.55,
      center.z + dist * 0.75,
    )
    cam.near = Math.max(0.01, maxDim / 100)
    cam.far = Math.max(100, maxDim * 50)
    cam.updateProjectionMatrix()
    cam.lookAt(center)
    const ctrl = controls as
      | { target?: THREE.Vector3; update?: () => void }
      | null
    if (ctrl?.target) {
      ctrl.target.copy(center)
      ctrl.update?.()
    }
  }, [scene, camera, controls])

  return <primitive object={scene} />
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode; onError?: (msg: string) => void },
  { error: string | null }
> {
  state: { error: string | null } = { error: null }

  static getDerivedStateFromError(err: unknown) {
    return {
      error: err instanceof Error ? err.message : 'Ошибка загрузки модели',
    }
  }

  componentDidCatch(err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки модели'
    this.props.onError?.(msg)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="model-preview-error">
          <p>Не удалось показать модель</p>
          <p className="muted">{this.state.error}</p>
        </div>
      )
    }
    return this.props.children
  }
}

function PreviewLights() {
  return (
    <>
      <color attach="background" args={['#e8e0d4']} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 3]} intensity={1.15} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      <hemisphereLight args={['#f0e8da', '#8a7a65', 0.35]} />
    </>
  )
}

/**
 * Interactive GLB preview with fixed-size canvas and auto-framing.
 * Supports picking a sub-object when the file contains several models.
 */
export function ModelPreview({
  url,
  objectId,
  onParts,
  className,
  onError,
}: {
  url: string
  objectId?: string
  onParts?: (parts: ScenePart[]) => void
  className?: string
  onError?: (msg: string) => void
}) {
  return (
    <div className={className ?? 'model-preview'}>
      <PreviewErrorBoundary key={`${url}::${objectId ?? ''}`} onError={onError}>
        <Canvas
          camera={{ position: [2, 1.5, 2], fov: 40, near: 0.01, far: 200 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false }}
          style={{ width: '100%', height: '100%' }}
        >
          <PreviewLights />
          <Suspense fallback={null}>
            <PreviewMesh url={url} objectId={objectId} onParts={onParts} />
          </Suspense>
          <OrbitControls
            makeDefault
            enablePan={false}
            minDistance={0.3}
            maxDistance={80}
            autoRotate
            autoRotateSpeed={1.4}
          />
        </Canvas>
      </PreviewErrorBoundary>
    </div>
  )
}
