import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as THREE from 'three'
import {
  cloneSceneSelection,
  buildSceneTree,
  listSceneParts,
  type ScenePart,
  type SceneTreeNode,
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

/** Load glTF hierarchy outside the Canvas so picking a part does not remount the tree. */
function SceneGraphSync({
  url,
  onSceneTree,
}: {
  url: string
  onSceneTree: (tree: SceneTreeNode[], suggested: ScenePart[]) => void
}) {
  const gltf = useGLTF(url)
  const suggested = useMemo(() => listSceneParts(gltf.scene), [gltf.scene])
  const tree = useMemo(() => buildSceneTree(gltf.scene), [gltf.scene])

  useEffect(() => {
    onSceneTree(tree, suggested)
  }, [suggested, tree, onSceneTree])

  return null
}

function PreviewMesh({
  url,
  objectId,
  playAnimation,
  distanceMul,
}: {
  url: string
  objectId?: string
  playAnimation: boolean
  distanceMul: number
}) {
  const gltf = useGLTF(url)
  const { camera, controls, invalidate } = useThree()
  const baseDist = useRef(2)

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

  const clips = gltf.animations
  const { mixer, actions } = useMemo(() => {
    if (!clips?.length) {
      return {
        mixer: null as THREE.AnimationMixer | null,
        actions: [] as THREE.AnimationAction[],
      }
    }
    const m = new THREE.AnimationMixer(scene)
    const acts = clips.map((clip) => {
      const action = m.clipAction(clip)
      action.play()
      action.paused = true
      return action
    })
    return { mixer: m, actions: acts }
  }, [scene, clips])

  const hasAnimation = actions.length > 0

  useLayoutEffect(() => {
    if (!mixer || !hasAnimation) return
    if (!playAnimation) {
      for (const action of actions) {
        action.time = 0
        action.paused = true
      }
      mixer.update(0)
      invalidate()
    }
  }, [playAnimation, mixer, actions, hasAnimation, invalidate])

  useFrame((_, dt) => {
    if (!mixer || !playAnimation) return
    for (const action of actions) action.paused = false
    mixer.update(dt)
  })

  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.2)
    baseDist.current = maxDim * 2.2
    const dist = baseDist.current * distanceMul
    const cam = camera as THREE.PerspectiveCamera
    cam.position.set(
      center.x + dist * 0.75,
      center.y + dist * 0.55,
      center.z + dist * 0.75,
    )
    cam.near = Math.max(0.01, maxDim / 100)
    cam.far = Math.max(200, maxDim * 80 * distanceMul)
    cam.updateProjectionMatrix()
    cam.lookAt(center)
    const ctrl = controls as
      | { target?: THREE.Vector3; update?: () => void }
      | null
    if (ctrl?.target) {
      ctrl.target.copy(center)
      ctrl.update?.()
    }
    invalidate()
  }, [scene, camera, controls, distanceMul, invalidate])

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

function PreviewHasAnimation({
  url,
  onChange,
}: {
  url: string
  onChange: (has: boolean) => void
}) {
  const gltf = useGLTF(url)
  useEffect(() => {
    onChange((gltf.animations?.length ?? 0) > 0)
  }, [gltf.animations, onChange])
  return null
}

/**
 * Interactive GLB preview with fixed-size canvas and auto-framing.
 * Supports picking a sub-object when the file contains several models.
 */
export function ModelPreview({
  url,
  objectId,
  onSceneTree,
  className,
  onError,
}: {
  url: string
  objectId?: string
  onSceneTree?: (tree: SceneTreeNode[], suggested: ScenePart[]) => void
  className?: string
  onError?: (msg: string) => void
}) {
  const [playAnimation, setPlayAnimation] = useState(false)
  const [hasAnimation, setHasAnimation] = useState(false)
  const [distanceMul, setDistanceMul] = useState(1)

  useEffect(() => {
    setPlayAnimation(false)
    setDistanceMul(1)
    setHasAnimation(false)
  }, [url])

  return (
    <div className={className ?? 'model-preview'}>
      {onSceneTree && (
        <Suspense fallback={null}>
          <SceneGraphSync url={url} onSceneTree={onSceneTree} />
        </Suspense>
      )}
      <div className="model-preview-toolbar">
        {hasAnimation && (
          <button
            type="button"
            className={playAnimation ? 'active' : undefined}
            aria-pressed={playAnimation}
            title={playAnimation ? 'Остановить анимацию' : 'Включить анимацию'}
            onClick={() => setPlayAnimation((p) => !p)}
          >
            {playAnimation ? 'Стоп' : 'Анимация'}
          </button>
        )}
        <button
          type="button"
          title="Отдалить"
          aria-label="Отдалить"
          onClick={() => setDistanceMul((d) => Math.min(12, +(d * 1.45).toFixed(2)))}
        >
          −
        </button>
        <button
          type="button"
          title="Приблизить"
          aria-label="Приблизить"
          onClick={() => setDistanceMul((d) => Math.max(0.45, +(d / 1.45).toFixed(2)))}
        >
          +
        </button>
        {distanceMul !== 1 && (
          <button
            type="button"
            className="ghost"
            title="Сбросить дистанцию"
            onClick={() => setDistanceMul(1)}
          >
            Сброс
          </button>
        )}
      </div>
      <PreviewErrorBoundary key={url} onError={onError}>
        <Canvas
          camera={{ position: [2, 1.5, 2], fov: 40, near: 0.01, far: 500 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false }}
          style={{ width: '100%', height: '100%' }}
        >
          <PreviewLights />
          <Suspense fallback={null}>
            <PreviewHasAnimation url={url} onChange={setHasAnimation} />
            <PreviewMesh
              url={url}
              objectId={objectId}
              playAnimation={playAnimation}
              distanceMul={distanceMul}
            />
          </Suspense>
          <OrbitControls
            makeDefault
            enablePan
            minDistance={0.15}
            maxDistance={400}
            autoRotate={!playAnimation}
            autoRotateSpeed={1.4}
          />
        </Canvas>
      </PreviewErrorBoundary>
    </div>
  )
}
