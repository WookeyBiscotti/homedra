import type { LibraryAdapter, ModelHit, ModelVariant } from '../types'
import { proxiedAssetUrl } from '../proxyUrl'

/**
 * Smithsonian Open Access — museum 3D (CC0).
 * Auth: api_key from api.data.gov (BYOK).
 * All requests go through the Vite same-origin proxy (CORS + TLS).
 */
const SI_BASE = 'https://api.si.edu/openaccess/api/v1.0'

type SiRow = {
  id?: string
  title?: string
  content?: {
    descriptiveNonRepeating?: {
      title?: { content?: string }
      online_media?: {
        media?: Array<{
          type?: string
          content?: string
          thumbnail?: string
          resources?: Array<{ url?: string; label?: string }>
        }>
      }
    }
    freetext?: Record<string, Array<{ label?: string; content?: string }>>
  }
}

type GlbCand = { url: string; label?: string }

function rankUrl(u: string): number {
  let s = 0
  if (/draco/i.test(u)) s -= 20
  if (/medium|100k|50k/i.test(u)) s -= 10
  if (/2048/.test(u)) s -= 5
  if (/4096|8k/i.test(u)) s += 10
  return s
}

/** Stem used to group LOD/flavour variants of the same logical model. */
function variantKey(url: string, label?: string): string {
  const file = decodeURIComponent(url.split('/').pop() || 'model')
  const base = file.replace(/\.glb$/i, '')
  const stem = base
    .replace(/[-_]?(150k|100k|50k|4096|2048|1024|8k|4k|2k|1k)/gi, '')
    .replace(/[-_]?(std|draco|medium|high|low)/gi, '')
    .replace(/[-_]+$/g, '')
    .toLowerCase()
  if (stem.length >= 3) return stem
  if (label?.trim()) return label.trim().toLowerCase()
  return base.toLowerCase()
}

function prettyLabel(url: string, label?: string): string {
  if (label?.trim()) return label.trim()
  const file = decodeURIComponent(url.split('/').pop() || 'model.glb')
  return file
    .replace(/\.glb$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractGlbs(row: SiRow): {
  variants: ModelVariant[]
  thumbUrl?: string
} {
  const media =
    row.content?.descriptiveNonRepeating?.online_media?.media ?? []
  const cands: GlbCand[] = []
  let thumbUrl: string | undefined
  for (const m of media) {
    if (m.thumbnail && !thumbUrl) thumbUrl = m.thumbnail
    if (m.content && /\.glb(\?|$)/i.test(m.content)) {
      cands.push({ url: m.content })
    }
    for (const r of m.resources ?? []) {
      if (r.url && /\.glb(\?|$)/i.test(r.url)) {
        cands.push({ url: r.url, label: r.label })
      }
    }
  }

  // Group LODs of the same mesh; keep best (lowest rank) URL per group.
  const best = new Map<string, GlbCand>()
  for (const c of cands) {
    const key = variantKey(c.url, c.label)
    const prev = best.get(key)
    if (!prev || rankUrl(c.url) < rankUrl(prev.url)) best.set(key, c)
  }

  const variants: ModelVariant[] = [...best.entries()].map(([key, c], i) => ({
    id: `${key}-${i}`,
    label: prettyLabel(c.url, c.label),
    glbUrl: proxiedAssetUrl(c.url),
  }))

  return { variants, thumbUrl }
}

function rowToHit(row: SiRow): ModelHit | null {
  const id = row.id ?? ''
  if (!id) return null
  const title =
    row.title ||
    row.content?.descriptiveNonRepeating?.title?.content ||
    id
  const { variants, thumbUrl } = extractGlbs(row)
  if (variants.length === 0) return null
  return {
    library: 'smithsonian',
    id,
    title,
    thumbUrl: thumbUrl ? proxiedAssetUrl(thumbUrl) : undefined,
    license: 'CC0',
    author: 'Smithsonian',
    glbUrl: variants[0]!.glbUrl,
    variants: variants.length > 1 ? variants : undefined,
    url: `https://www.si.edu/object/${encodeURIComponent(id)}`,
  }
}

export const smithsonianAdapter: LibraryAdapter = {
  id: 'smithsonian',
  label: 'Smithsonian',
  requiresToken: true,

  async search(q, opts) {
    const token = opts.token?.trim()
    if (!token) throw new Error('Нужен ключ api.data.gov')
    const limit = opts.limit ?? 12
    const page = Math.max(1, opts.page ?? 1)
    const start = opts.cursor
      ? Number(opts.cursor) || 0
      : (page - 1) * limit
    const needle = q.trim()
    // "online_media_type:3d" is unreliable; AND glb matches Voyager packages with .glb.
    const query = needle ? `${needle} AND glb` : 'glb'
    const params = new URLSearchParams({
      q: query,
      rows: String(limit),
      start: String(start),
      api_key: token,
    })
    const res = await fetch(
      proxiedAssetUrl(`${SI_BASE}/search?${params}`),
    )
    if (!res.ok) {
      throw new Error(`Smithsonian: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as {
      error?: { code?: string; message?: string }
      response?: {
        rows?: SiRow[]
        rowCount?: number
      }
    }
    if (data.error) {
      throw new Error(
        `Smithsonian: ${data.error.message ?? data.error.code ?? 'API error'}`,
      )
    }
    const rows = data.response?.rows ?? []
    const hits = rows
      .map(rowToHit)
      .filter((h): h is ModelHit => h !== null)
    const total = data.response?.rowCount ?? start + hits.length
    const nextStart = start + limit
    return {
      hits,
      total,
      nextCursor: nextStart < total ? String(nextStart) : undefined,
    }
  },

  async resolveGlb(hit) {
    if (hit.glbUrl) {
      return {
        url: proxiedAssetUrl(hit.glbUrl),
        attribution: {
          author: 'Smithsonian Institution',
          license: 'CC0',
          url: hit.url,
        },
      }
    }
    throw new Error(
      'У объекта нет прямого GLB — откройте на 3d.si.edu и загрузите файл вручную',
    )
  },
}
