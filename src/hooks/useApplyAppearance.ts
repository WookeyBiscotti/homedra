/** Apply ObjectAppearance to a cloned GLB root (tint + PBR + ambientCG maps). */

import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type { Object3D } from 'three'
import type {
  ObjectAppearance,
  ObjectMaterialOverride,
} from '../engine/types'
import {
  appearanceHasOverrides,
  applyAppearanceToObject,
  loadAppearanceMaps,
} from '../models/objectAppearance'

function slotKey(v: ObjectMaterialOverride): string {
  return [
    v.tint ?? '',
    v.material?.source ?? '',
    v.material?.assetId ?? '',
    v.material?.url ?? '',
    v.material?.tileSizeM ?? '',
    v.material?.displacementScale ?? '',
    v.roughness ?? '',
    v.metalness ?? '',
    v.emissive ?? '',
    v.emissiveIntensity ?? '',
    v.opacity ?? '',
    v.envMapIntensity ?? '',
    v.normalScale ?? '',
    v.aoMapIntensity ?? '',
    v.displacementScale ?? '',
  ].join(',')
}

function appearanceKey(a: ObjectAppearance | undefined): string {
  if (!a) return ''
  const { slots, ...global } = a
  const slotParts = slots
    ? Object.entries(slots)
        .map(([k, v]) => `${k}:${slotKey(v)}`)
        .sort()
        .join('|')
    : ''
  return `${slotKey(global)};${slotParts}`
}

/**
 * Mutates `root` materials in place when appearance changes.
 * Expects a privately cloned scene (not the shared useGLTF cache root).
 */
export function useApplyAppearance(
  root: Object3D | null,
  appearance: ObjectAppearance | undefined,
): { status: 'idle' | 'loading' | 'ok' | 'error' } {
  const invalidate = useThree((s) => s.invalidate)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle',
  )
  const key = appearanceKey(appearance)

  useEffect(() => {
    if (!root) {
      setStatus('idle')
      return
    }
    if (!appearanceHasOverrides(appearance)) {
      applyAppearanceToObject(root, undefined)
      setStatus('idle')
      invalidate()
      return
    }

    let alive = true
    setStatus('loading')
    void loadAppearanceMaps(appearance)
      .then((maps) => {
        if (!alive) return
        applyAppearanceToObject(root, appearance, maps)
        setStatus('ok')
        invalidate()
      })
      .catch(() => {
        if (!alive) return
        applyAppearanceToObject(root, appearance, new Map())
        setStatus('error')
        invalidate()
      })

    return () => {
      alive = false
    }
    // appearance serialized via key — avoid re-running on new object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, key, invalidate])

  return { status }
}
