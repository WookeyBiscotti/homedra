import type { LibraryAdapter, ModelHit } from '../types'
import { proxiedAssetUrl } from '../proxyUrl'

/**
 * Sketchfab Download API — BYOK with user API token.
 * Search is public; download requires Authorization: Token …
 * GLB links are short-lived signed S3 URLs — never persist them.
 */
const SF_BASE = 'https://api.sketchfab.com/v3'

type SfModel = {
  uid?: string
  name?: string
  viewerUrl?: string
  thumbnails?: { images?: Array<{ url?: string; width?: number }> }
  license?: { label?: string; slug?: string }
  user?: { displayName?: string; username?: string }
  isDownloadable?: boolean
}

export const sketchfabAdapter: LibraryAdapter = {
  id: 'sketchfab',
  label: 'Sketchfab',
  requiresToken: true,

  async search(q, opts) {
    const limit = opts.limit ?? 12
    const params = new URLSearchParams({
      type: 'models',
      q: q.trim() || 'furniture',
      downloadable: 'true',
      archives_flavours: 'false',
      count: String(limit),
    })
    if (opts.cursor) params.set('cursor', opts.cursor)

    const headers: HeadersInit = {}
    if (opts.token?.trim()) {
      headers.Authorization = `Token ${opts.token.trim()}`
    }

    const res = await fetch(proxiedAssetUrl(`${SF_BASE}/search?${params}`), {
      headers,
    })
    if (!res.ok) {
      let detail = ''
      try {
        const body = (await res.json()) as { detail?: unknown }
        if (body.detail != null) {
          detail =
            typeof body.detail === 'string'
              ? body.detail
              : JSON.stringify(body.detail)
        }
      } catch {
        /* ignore */
      }
      throw new Error(
        detail
          ? `Sketchfab: ${res.status} — ${detail}`
          : `Sketchfab: ${res.status} ${res.statusText}`,
      )
    }
    const data = (await res.json()) as {
      results?: SfModel[]
      cursors?: { next?: string }
      next?: string
    }
    const hits: ModelHit[] = (data.results ?? []).map((m) => {
      const thumbs = m.thumbnails?.images ?? []
      const thumb = [...thumbs].sort(
        (a, b) => (a.width ?? 0) - (b.width ?? 0),
      )[Math.min(1, thumbs.length - 1)]
      return {
        library: 'sketchfab',
        id: m.uid ?? '',
        title: m.name ?? m.uid ?? 'model',
        thumbUrl: thumb?.url ? proxiedAssetUrl(thumb.url) : undefined,
        license: m.license?.label ?? m.license?.slug ?? 'CC',
        author: m.user?.displayName ?? m.user?.username,
        url: m.viewerUrl,
      }
    })
    return {
      hits: hits.filter((h) => h.id),
      nextCursor: data.cursors?.next ?? data.next,
    }
  },

  async resolveGlb(hit, opts) {
    const token = opts.token?.trim()
    if (!token) throw new Error('Нужен токен Sketchfab для скачивания')
    const res = await fetch(
      proxiedAssetUrl(`${SF_BASE}/models/${hit.id}/download`),
      { headers: { Authorization: `Token ${token}` } },
    )
    if (!res.ok) {
      throw new Error(`Sketchfab download: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as {
      glb?: { url?: string }
      gltf?: { url?: string }
    }
    // Prefer direct GLB; glTF archive is a ZIP — skip for MVP if no glb.
    const url = data.glb?.url
    if (!url) {
      throw new Error(
        'У модели нет GLB через API (только glTF ZIP). Выберите другую или загрузите GLB вручную.',
      )
    }
    // Fetch through proxy into a blob so GLTFLoader is same-origin and
    // we never rely on a cached signed URL (expires ~5 min).
    const glbRes = await fetch(proxiedAssetUrl(url))
    if (!glbRes.ok) {
      throw new Error(
        `Sketchfab GLB: ${glbRes.status} ${glbRes.statusText}`,
      )
    }
    const blob = await glbRes.blob()
    return {
      url: URL.createObjectURL(blob),
      revokeOnDispose: true,
      attribution: {
        author: hit.author ?? 'Sketchfab',
        license: hit.license,
        url: hit.url,
      },
    }
  },
}
