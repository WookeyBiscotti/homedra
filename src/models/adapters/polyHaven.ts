import { paginateHits } from '../catalog'
import type { LibraryAdapter, ModelHit, SearchResult } from '../types'
import { proxiedAssetUrl } from '../proxyUrl'

/**
 * Poly Haven models — CC0, no API key.
 * Models ship as multi-file glTF (gltf + bin + textures on dl.polyhaven.org).
 * We rewrite relative URIs to proxied absolute URLs and serve a blob.
 */
const PH_BASE = 'https://api.polyhaven.com'
const UA_NOTE = 'InteriorCADPlanner/1.0'

type PhAsset = {
  name?: string
  type?: number
  categories?: string[]
  tags?: string[]
  authors?: Record<string, unknown>
}

type PhInclude = { url?: string; size?: number }

type PhGltfRes = {
  gltf?: { url?: string; include?: Record<string, PhInclude> }
}

let assetsCache: Promise<Record<string, PhAsset>> | null = null

function loadAssets(): Promise<Record<string, PhAsset>> {
  if (!assetsCache) {
    assetsCache = fetch(proxiedAssetUrl(`${PH_BASE}/assets?t=models`), {
      headers: { 'User-Agent': UA_NOTE },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Poly Haven: ${res.status} ${res.statusText}`)
        }
        return (await res.json()) as Record<string, PhAsset>
      })
      .catch((err) => {
        assetsCache = null
        throw err
      })
  }
  return assetsCache
}

/** Origin-absolute proxy URL — GLTFLoader won't resolve `/proxy/…` against a blob: base. */
function absoluteProxied(url: string): string {
  const path = proxiedAssetUrl(url)
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path
  }
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
  return path.startsWith('/') ? `${origin}${path}` : path
}

function rewriteGltfUris(
  gltf: Record<string, unknown>,
  mainUrl: string,
  include: Record<string, PhInclude>,
): void {
  const map = new Map<string, string>()
  for (const [rel, info] of Object.entries(include)) {
    if (!info.url) continue
    const proxied = absoluteProxied(info.url)
    map.set(rel, proxied)
    map.set(rel.replace(/^\.\//, ''), proxied)
    const base = rel.split('/').pop()
    if (base) map.set(base, proxied)
  }

  const resolveUri = (uri: string): string => {
    if (uri.startsWith('data:') || uri.startsWith('blob:')) return uri
    if (uri.startsWith('http://') || uri.startsWith('https://')) return uri
    const hit = map.get(uri) ?? map.get(uri.replace(/^\.\//, ''))
    if (hit) return hit
    try {
      return absoluteProxied(new URL(uri, mainUrl).href)
    } catch {
      return uri
    }
  }

  const buffers = gltf.buffers as Array<{ uri?: string }> | undefined
  for (const b of buffers ?? []) {
    if (b.uri) b.uri = resolveUri(b.uri)
  }
  const images = gltf.images as Array<{ uri?: string }> | undefined
  for (const img of images ?? []) {
    if (img.uri) img.uri = resolveUri(img.uri)
  }
}

export const polyHavenAdapter: LibraryAdapter = {
  id: 'polyHaven',
  label: 'Poly Haven',
  requiresToken: false,

  async search(q, opts): Promise<SearchResult> {
    const data = await loadAssets()
    const needle = q.trim().toLowerCase()
    const entries = Object.entries(data).filter(([id, a]) => {
      if (!needle) return true
      const hay = [
        id,
        a.name ?? '',
        ...(a.categories ?? []),
        ...(a.tags ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(needle)
    })
    const all: ModelHit[] = entries.map(([id, a]) => {
      const authors = Object.keys(a.authors ?? {})
      return {
        library: 'polyHaven',
        id,
        title: a.name ?? id,
        thumbUrl: proxiedAssetUrl(
          `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256`,
        ),
        license: 'CC0',
        author: authors[0] ?? 'Poly Haven',
        url: `https://polyhaven.com/a/${id}`,
      }
    })
    return paginateHits(all, opts)
  },

  async resolveGlb(hit) {
    const res = await fetch(proxiedAssetUrl(`${PH_BASE}/files/${hit.id}`), {
      headers: { 'User-Agent': UA_NOTE },
    })
    if (!res.ok) throw new Error(`Poly Haven files: ${res.status}`)
    const data = (await res.json()) as { gltf?: Record<string, PhGltfRes> }
    const gltfByRes = data.gltf
    if (!gltfByRes) throw new Error('Нет glTF для ассета Poly Haven')

    // Prefer smallest resolution for preview/placement
    const resolutions = Object.keys(gltfByRes).sort((a, b) => {
      const na = parseInt(a, 10) || 0
      const nb = parseInt(b, 10) || 0
      return na - nb
    })
    const pick = gltfByRes[resolutions[0] ?? '']?.gltf
    const mainUrl = pick?.url
    if (!mainUrl) throw new Error('Не найден URL glTF Poly Haven')

    const include = pick.include ?? {}
    const gltfRes = await fetch(proxiedAssetUrl(mainUrl), {
      headers: { 'User-Agent': UA_NOTE },
    })
    if (!gltfRes.ok) {
      throw new Error(`Poly Haven glTF: ${gltfRes.status} ${gltfRes.statusText}`)
    }
    const gltfJson = (await gltfRes.json()) as Record<string, unknown>
    rewriteGltfUris(gltfJson, mainUrl, include)

    const blob = new Blob([JSON.stringify(gltfJson)], {
      type: 'model/gltf+json',
    })
    return {
      url: URL.createObjectURL(blob),
      revokeOnDispose: true,
      attribution: {
        author: hit.author ?? 'Poly Haven',
        license: 'CC0',
        url: hit.url,
      },
    }
  },
}
