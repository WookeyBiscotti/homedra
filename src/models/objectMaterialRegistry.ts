/** Live material slots published by mounted 3D objects for the properties editor. */

import { useEffect, useState } from 'react'
import type { SceneMaterialInfo } from './objectAppearance'

const byId = new Map<string, SceneMaterialInfo[]>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const fn of listeners) fn()
}

export function publishObjectMaterials(
  id: string,
  mats: SceneMaterialInfo[],
): void {
  byId.set(id, mats)
  notify()
}

export function forgetObjectMaterials(id: string): void {
  if (!byId.delete(id)) return
  notify()
}

export function getObjectMaterials(id: string): SceneMaterialInfo[] {
  return byId.get(id) ?? []
}

export function subscribeObjectMaterials(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useObjectMaterials(id: string | undefined): SceneMaterialInfo[] {
  const [mats, setMats] = useState<SceneMaterialInfo[]>(() =>
    id ? getObjectMaterials(id) : [],
  )

  useEffect(() => {
    if (!id) {
      setMats([])
      return
    }
    const sync = () => setMats(getObjectMaterials(id))
    sync()
    return subscribeObjectMaterials(sync)
  }, [id])

  return mats
}
