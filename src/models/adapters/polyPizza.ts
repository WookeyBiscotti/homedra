import type { LibraryAdapter, ModelHit } from '../types'
import { proxiedAssetUrl } from '../proxyUrl'

const POLY_API = '/proxy/poly-api'

/**
 * Poly Pizza — furniture-heavy low-poly GLB catalog.
 * Auth: X-Auth-Token (BYOK). API + CDN go through Vite same-origin proxy.
 */
export const polyPizzaAdapter: LibraryAdapter = {
  id: 'polyPizza',
  label: 'Poly Pizza',
  requiresToken: true,

  async search(q, opts) {
    const token = opts.token?.trim()
    if (!token) throw new Error('Нужен токен Poly Pizza')
    const query = encodeURIComponent(q.trim() || 'furniture')
    const limit = opts.limit ?? 12
    const params = new URLSearchParams({
      limit: String(limit),
      format: 'glb',
    })
    if (opts.cursor) params.set('cursor', opts.cursor)

    const res = await fetch(`${POLY_API}/v1/search/${query}?${params}`, {
      headers: { 'X-Auth-Token': token },
    })
    if (!res.ok) {
      throw new Error(`Poly Pizza: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as {
      results?: Array<Record<string, unknown>>
      Results?: Array<Record<string, unknown>>
      cursor?: string
      nextCursor?: string
    }
    const rows = data.results ?? data.Results ?? []
    const hits: ModelHit[] = rows.map((m) => {
      const id = String(m.ID ?? m.id ?? '')
      const download = String(m.Download ?? m.download ?? '') || undefined
      const thumb = String(m.Thumbnail ?? m.thumbnail ?? '') || undefined
      return {
        library: 'polyPizza',
        id,
        title: String(m.Name ?? m.name ?? m.Title ?? m.title ?? id),
        thumbUrl: thumb ? proxiedAssetUrl(thumb) : undefined,
        license: String(m.License ?? m.license ?? 'CC-BY'),
        author: String(m.Author ?? m.author ?? 'Unknown'),
        glbUrl: download ? proxiedAssetUrl(download) : undefined,
        url: id ? `https://poly.pizza/m/${id}` : undefined,
      }
    })
    return {
      hits,
      nextCursor: data.nextCursor ?? data.cursor,
    }
  },

  async resolveGlb(hit, opts) {
    const token = opts.token?.trim()
    // Prefer API download through same-origin proxy (avoids unknown CDN hosts / CORS).
    if (hit.id && token) {
      const res = await fetch(
        `${POLY_API}/v1/model/${encodeURIComponent(hit.id)}/download?format=glb`,
        { headers: { 'X-Auth-Token': token }, redirect: 'follow' },
      )
      if (res.ok) {
        const ct = res.headers.get('content-type') ?? ''
        // Direct binary
        if (
          ct.includes('model/gltf') ||
          ct.includes('octet-stream') ||
          ct.includes('application/octet-stream')
        ) {
          const blob = await res.blob()
          return {
            url: URL.createObjectURL(blob),
            revokeOnDispose: true,
            attribution: {
              author: hit.author ?? 'Poly Pizza',
              license: hit.license,
              url: hit.url,
            },
          }
        }
        // JSON with URL
        try {
          const data = (await res.clone().json()) as { Download?: string; url?: string }
          const url = data.Download ?? data.url
          if (url) {
            return {
              url: proxiedAssetUrl(url),
              attribution: {
                author: hit.author ?? 'Poly Pizza',
                license: hit.license,
                url: hit.url,
              },
            }
          }
        } catch {
          /* fall through — maybe body is glb despite odd content-type */
          const blob = await res.blob()
          if (blob.size > 100) {
            return {
              url: URL.createObjectURL(blob),
              revokeOnDispose: true,
              attribution: {
                author: hit.author ?? 'Poly Pizza',
                license: hit.license,
                url: hit.url,
              },
            }
          }
        }
      }
    }
    if (!hit.glbUrl) throw new Error('Нет URL модели Poly Pizza')
    return {
      url: proxiedAssetUrl(hit.glbUrl),
      attribution: {
        author: hit.author ?? 'Poly Pizza',
        license: hit.license,
        url: hit.url,
      },
    }
  },
}
