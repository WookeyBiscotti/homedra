import { useCallback, useEffect, useState } from 'react'
import {
  searchTextureCatalog,
  textureLibraryMeta,
  type TextureHit,
  type TextureLibraryId,
} from './textureCatalog'

const LOCAL_PAGE = 60
const REMOTE_PAGE = 20

export function useTextureCatalogSearch(
  library: TextureLibraryId,
  query: string,
  token: string | undefined,
  enabled = true,
) {
  const meta = textureLibraryMeta(library)
  const [assets, setAssets] = useState<TextureHit[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsToken = meta.requiresToken && !token?.trim()

  useEffect(() => {
    if (!enabled) return
    if (needsToken) {
      setAssets([])
      setTotal(0)
      setError(null)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    setAssets([])
    setPage(1)
    const limit = library === 'ambientcg' || library === 'polyhaven' ? LOCAL_PAGE : REMOTE_PAGE
    void (async () => {
      try {
        const r = await searchTextureCatalog(library, query, {
          token,
          limit,
          offset: 0,
          page: 1,
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
  }, [library, query, token, enabled, needsToken])

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || assets.length >= total || needsToken) return
    setLoadingMore(true)
    setError(null)
    const nextPage = page + 1
    const local = library === 'ambientcg' || library === 'polyhaven'
    try {
      const r = await searchTextureCatalog(library, query, {
        token,
        limit: local ? LOCAL_PAGE : REMOTE_PAGE,
        offset: assets.length,
        page: nextPage,
      })
      setAssets((prev) => {
        const seen = new Set(prev.map((a) => `${a.library}:${a.id}`))
        const extra = r.assets.filter((a) => !seen.has(`${a.library}:${a.id}`))
        return [...prev, ...extra]
      })
      setTotal(r.total)
      setPage(nextPage)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoadingMore(false)
    }
  }, [
    assets.length,
    library,
    loading,
    loadingMore,
    needsToken,
    page,
    query,
    token,
    total,
  ])

  return {
    assets,
    total,
    loading,
    loadingMore,
    error,
    hasMore: assets.length < total,
    loadMore,
    needsToken,
    meta,
  }
}
