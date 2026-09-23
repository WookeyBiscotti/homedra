import { PointerLockControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib'
import * as THREE from 'three'

const EYE_HEIGHT = 1.65
const MOVE_SPEED = 3.2

/**
 * First-person walkthrough: click to lock pointer, WASD / arrows to move.
 * No collision — free movement through walls.
 */
export function VisitControls({
  spawn,
  floorY,
  onLockChange,
}: {
  spawn: [number, number, number]
  floorY: number
  onLockChange?: (locked: boolean) => void
}) {
  const { camera, gl } = useThree()
  const spawnX = spawn[0]
  const spawnZ = spawn[2]
  const keys = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
  })
  const forward = useRef(new THREE.Vector3())
  const rightVec = useRef(new THREE.Vector3())
  const controlsRef = useRef<PointerLockControlsImpl | null>(null)

  useEffect(() => {
    camera.position.set(spawnX, floorY + EYE_HEIGHT, spawnZ)
    camera.rotation.set(0, 0, 0)
    if ('fov' in camera) {
      ;(camera as THREE.PerspectiveCamera).fov = 70
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
  }, [camera, spawnX, spawnZ, floorY])

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keys.current.forward = down
          break
        case 'KeyS':
        case 'ArrowDown':
          keys.current.back = down
          break
        case 'KeyA':
        case 'ArrowLeft':
          keys.current.left = down
          break
        case 'KeyD':
        case 'ArrowRight':
          keys.current.right = down
          break
        default:
          return
      }
      e.preventDefault()
    }
    const down = (e: KeyboardEvent) => onKey(e, true)
    const up = (e: KeyboardEvent) => onKey(e, false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((_, dt) => {
    const locked = controlsRef.current?.isLocked ?? false
    if (!locked) return

    const k = keys.current
    if (!k.forward && !k.back && !k.left && !k.right) return

    camera.getWorldDirection(forward.current)
    forward.current.y = 0
    if (forward.current.lengthSq() < 1e-8) return
    forward.current.normalize()
    rightVec.current.set(-forward.current.z, 0, forward.current.x)

    const step = MOVE_SPEED * Math.min(dt, 0.05)
    if (k.forward) camera.position.addScaledVector(forward.current, step)
    if (k.back) camera.position.addScaledVector(forward.current, -step)
    if (k.left) camera.position.addScaledVector(rightVec.current, -step)
    if (k.right) camera.position.addScaledVector(rightVec.current, step)

    camera.position.y = floorY + EYE_HEIGHT
  })

  return (
    <PointerLockControls
      ref={controlsRef}
      makeDefault
      onLock={() => onLockChange?.(true)}
      onUnlock={() => onLockChange?.(false)}
      domElement={gl.domElement}
    />
  )
}
