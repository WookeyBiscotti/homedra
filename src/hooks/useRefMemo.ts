import { useState } from 'react'

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false
  }
  return true
}

/**
 * useMemo that compares dependency items with Object.is.
 * Useful when the dependency list itself is a freshly allocated array
 * of stable references (walls, vertices, …).
 */
export function useRefMemo<T>(factory: () => T, deps: readonly unknown[]): T {
  const [cache, setCache] = useState(() => ({ deps, value: factory() }))
  if (sameDeps(cache.deps, deps)) return cache.value
  const value = factory()
  setCache({ deps, value })
  return value
}
