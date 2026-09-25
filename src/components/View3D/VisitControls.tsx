import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const EYE_HEIGHT = 1.65
const MOVE_SPEED = 4.2
const SPRINT_MULT = 1.75
const LOOK_SENS = 0.002
const PITCH_LIMIT = Math.PI / 2 - 0.05
const FOV = 80

export type VisitActiveState = {
  engaged: boolean
  pointerLocked: boolean
}

/**
 * Shooter-style FPS: fullscreen + Pointer Lock, relative mouse look, WASD.
 */
export function VisitControls({
  spawn,
  floorY,
  heightAtWorld,
  onActiveChange,
}: {
  spawn: [number, number, number]
  floorY: number
  heightAtWorld?: (x: number, z: number) => number
  onActiveChange?: (state: VisitActiveState) => void
}) {
  const { camera, gl } = useThree()
  const spawnX = spawn[0]
  const spawnZ = spawn[2]
  const keys = useRef({
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
  })
  const pointerLocked = useRef(false)
  const forward = useRef(new THREE.Vector3())
  const rightVec = useRef(new THREE.Vector3())
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))
  const lookDelta = useRef({ x: 0, y: 0 })
  const onActiveChangeRef = useRef(onActiveChange)

  useEffect(() => {
    onActiveChangeRef.current = onActiveChange
  }, [onActiveChange])

  const emit = () => {
    onActiveChangeRef.current?.({
      engaged: pointerLocked.current,
      pointerLocked: pointerLocked.current,
    })
  }

  useEffect(() => {
    camera.rotation.order = 'YXZ'
    camera.position.set(
      spawnX,
      (heightAtWorld?.(spawnX, spawnZ) ?? floorY) + EYE_HEIGHT,
      spawnZ,
    )
    camera.rotation.set(0, 0, 0)
    euler.current.set(0, 0, 0, 'YXZ')
    camera.quaternion.setFromEuler(euler.current)
    if ('fov' in camera) {
      ;(camera as THREE.PerspectiveCamera).fov = FOV
      ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix()
    }
  }, [camera, spawnX, spawnZ, floorY, heightAtWorld])

  useEffect(() => {
    const el = gl.domElement
    const host =
      (el.closest('.view3d-body') as HTMLElement | null) ??
      el.parentElement ??
      el

    const setLocked = (next: boolean) => {
      if (pointerLocked.current === next) return
      pointerLocked.current = next
      emit()
    }

    const syncLock = () => {
      setLocked(document.pointerLockElement === el)
    }

    const exitCapture = () => {
      if (document.pointerLockElement === el) document.exitPointerLock()
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {})
      }
      setLocked(false)
    }

    const requestLock = async () => {
      // Fullscreen helps Wayland/Hyprland grant exclusive pointer.
      if (!document.fullscreenElement && host.requestFullscreen) {
        try {
          await host.requestFullscreen()
        } catch {
          /* pointer lock may still work without FS */
        }
      }
      if (document.pointerLockElement === el) return
      try {
        const result = el.requestPointerLock({
          unadjustedMovement: true,
        } as PointerLockOptions)
        if (result != null && typeof (result as Promise<void>).then === 'function') {
          await result
        }
      } catch {
        try {
          const result = el.requestPointerLock()
          if (result != null && typeof (result as Promise<void>).then === 'function') {
            await (result as Promise<void>)
          }
        } catch {
          /* click again */
        }
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      e.preventDefault()
      void requestLock()
    }

    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== el) return
      lookDelta.current.y -= e.movementX * LOOK_SENS
      lookDelta.current.x -= e.movementY * LOOK_SENS
    }

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.code === 'Escape' && down) {
        exitCapture()
        return
      }
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
        case 'ShiftLeft':
        case 'ShiftRight':
          keys.current.sprint = down
          break
        default:
          return
      }
      if (pointerLocked.current) e.preventDefault()
    }
    const down = (e: KeyboardEvent) => onKey(e, true)
    const up = (e: KeyboardEvent) => onKey(e, false)

    const onFullscreenChange = () => {
      // If user exits fullscreen, drop lock too.
      if (!document.fullscreenElement && document.pointerLockElement === el) {
        document.exitPointerLock()
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerlockchange', syncLock)
    document.addEventListener('pointerlockerror', syncLock)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    syncLock()

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerlockchange', syncLock)
      document.removeEventListener('pointerlockerror', syncLock)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      if (document.pointerLockElement === el) document.exitPointerLock()
      if (document.fullscreenElement === host) {
        void document.exitFullscreen().catch(() => {})
      }
      pointerLocked.current = false
      onActiveChangeRef.current?.({ engaged: false, pointerLocked: false })
    }
  }, [camera, gl])

  useFrame((_, dt) => {
    const t = Math.min(dt, 0.05)

    // Apply buffered look (shooter-style relative mouse).
    if (pointerLocked.current) {
      const dx = lookDelta.current.x
      const dy = lookDelta.current.y
      if (dx !== 0 || dy !== 0) {
        lookDelta.current.x = 0
        lookDelta.current.y = 0
        euler.current.x = Math.max(
          -PITCH_LIMIT,
          Math.min(PITCH_LIMIT, euler.current.x + dx),
        )
        euler.current.y += dy
        camera.quaternion.setFromEuler(euler.current)
      }
    }

    const surfaceY =
      heightAtWorld?.(camera.position.x, camera.position.z) ?? floorY

    if (!pointerLocked.current) {
      camera.position.y = surfaceY + EYE_HEIGHT
      return
    }

    const k = keys.current
    if (k.forward || k.back || k.left || k.right) {
      camera.getWorldDirection(forward.current)
      forward.current.y = 0
      if (forward.current.lengthSq() > 1e-8) {
        forward.current.normalize()
        rightVec.current.set(-forward.current.z, 0, forward.current.x)
        const step =
          MOVE_SPEED * (k.sprint ? SPRINT_MULT : 1) * t
        if (k.forward) camera.position.addScaledVector(forward.current, step)
        if (k.back) camera.position.addScaledVector(forward.current, -step)
        if (k.left) camera.position.addScaledVector(rightVec.current, -step)
        if (k.right) camera.position.addScaledVector(rightVec.current, step)
      }
    }

    camera.position.y = surfaceY + EYE_HEIGHT
  })

  return null
}
