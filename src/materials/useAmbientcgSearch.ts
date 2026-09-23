import { useCallback, useEffect, useState } from 'react'
import {
  CATALOG_PAGE_SIZE,
  searchMaterials,
  type AmbientcgAssetSummary,
} from '../materials/ambientcg'

/** Paginated ambientCG catalog search — load more until all matches are shown. */
export function useAmbientcgSearch(query: string, enabled = true) {
  const [assets, setAssets] = useState<AmbientcgAssetSummary[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setLoading(true)
    setError(null)
    setAssets([])
    void (async () => {
      try {
        const r = await searchMaterials(query, {
          limit: CATALOG_PAGE_SIZE,
          offset: 0,
        })
        if (!alive) return
        setAssets(r.assets)
        setTotal(r.total)
      } catch (e: unknown) {
        if (!alive) return
        setError(e instanceof Error ? e.message : 'Ошибка загрузки')
        setAssets([])
        setTotal(0)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [query, enabled])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || assets.length >= total) return
    setLoadingMore(true)
    setError(null)
    try {
      const r = await searchMaterials(query, {
        limit: CATALOG_PAGE_SIZE,
        offset: assets.length,
      })
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => a.id))
        const next = r.assets.filter((a) => !seen.has(a.id))
        return [...prev, ...next]
      })
      setTotal(r.total)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoadingMore(false)
    }
  }, [assets.length, loading, loadingMore, query, total])

  const hasMore = assets.length < total

  return {
    assets,
    total,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMore,
  }
}
