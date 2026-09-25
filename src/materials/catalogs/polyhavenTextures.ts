/** Poly Haven texture catalog — CC0, no API key. */

import { proxiedAssetUrl } from '../../models/proxyUrl'
import type { TextureHit, TextureSearchOpts, TextureSearchResult } from '../textureCatalog'

const PH_BASE = 'https://api.polyhaven.com'
const UA_NOTE = 'InteriorCADPlanner/1.0'

type PhAsset = {
  name?: string
  categories?: string[]
  tags?: string[]
}

type PhFile = { url?: string; size?: number }
type PhResFormats = Record<string, PhFile>
type PhMap = Record<string, PhResFormats>
export type PhFiles = Record<string, PhMap | unknown>

const RES_ORDER = ['1k', '2k', '4k', '8k']
const SKIP_KEYS = new Set(['blend', 'gltf', 'mtlx'])

let assetsCache: Promise<Record<string, PhAsset>> | null = null

async function loadAssets(): Promise<Record<string, PhAsset>> {
  if (!assetsCache) {
    assetsCache = fetch(proxiedAssetUrl(`${PH_BASE}/assets?t=textures`), {
      headers: { 'User-Agent': UA_NOTE },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Poly Haven: ${res.status}`)
        return (await res.json()) as Record<string, PhAsset>
      })
      .catch((err) => {
        assetsCache = null
        throw err
      })
  }
  return assetsCache
}

function matches(id: string, a: PhAsset, q: string): boolean {
  if (!q) return true
  const hay = [id, a.name ?? '', ...(a.categories ?? []), ...(a.tags ?? [])]
    .join(' ')
    .toLowerCase()
  const tokens = q.toLowerCase().split(/[\s,]+/).filter(Boolean)
  return tokens.every((t) => hay.includes(t))
}

export async function searchPolyHavenTextures(
  q: string,
  opts: TextureSearchOpts = {},
): Promise<TextureSearchResult> {
  const all = Object.entries(await loadAssets()).filter(([id, a]) =>
    matches(id, a, q.trim()),
  )
  const offset = Math.max(0, opts.offset ?? 0)
  const limit = Math.max(1, opts.limit ?? 60)
  const assets: TextureHit[] = all.slice(offset, offset + limit).map(([id, a]) => ({
    library: 'polyhaven',
    id,
    title: a.name ?? id,
    thumbnailUrl: proxiedAssetUrl(
      `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256`,
    ),
    tileSizeM: 2,
  }))
  return { total: all.length, assets }
}

export function pickPolyHavenJpg(
  files: PhFiles,
  names: string[],
): string | undefined {
  for (const name of names) {
    const map = files[name]
    if (!map || typeof map !== 'object' || SKIP_KEYS.has(name)) continue
    const byRes = map as PhMap
    for (const res of RES_ORDER) {
      const url = byRes[res]?.jpg?.url ?? byRes[res]?.png?.url
      if (url) return url
    }
    for (const formats of Object.values(byRes)) {
      const url = formats?.jpg?.url ?? formats?.png?.url
      if (url) return url
    }
  }
  return undefined
}

export async function resolvePolyHavenMaps(assetId: string): Promise<{
  color: string
  normal?: string
  roughness?: string
  metalness?: string
  ao?: string
  displacement?: string
}> {
  const res = await fetch(proxiedAssetUrl(`${PH_BASE}/files/${assetId}`), {
    headers: { 'User-Agent': UA_NOTE },
  })
  if (!res.ok) throw new Error(`Poly Haven files: ${res.status}`)
  const files = (await res.json()) as PhFiles
  const color = pickPolyHavenJpg(files, [
    'Diffuse',
    'diff',
    'col',
    'Color',
    'albedo',
  ])
  if (!color) throw new Error(`Poly Haven: нет Diffuse у ${assetId}`)
  return {
    color,
    normal: pickPolyHavenJpg(files, ['nor_gl', 'nor_dx', 'Normal', 'normal']),
    // Separate maps first; `arm` / `orm` pack AO / roughness / metalness.
    roughness: pickPolyHavenJpg(files, [
      'Rough',
      'rough',
      'roughness',
      'arm',
      'ARM',
      'orm',
      'ORM',
    ]),
    metalness: pickPolyHavenJpg(files, [
      'Metal',
      'metal',
      'metalness',
      'arm',
      'ARM',
      'orm',
      'ORM',
    ]),
    ao: pickPolyHavenJpg(files, ['AO', 'ao', 'arm', 'ARM', 'orm', 'ORM']),
    displacement: pickPolyHavenJpg(files, [
      'Displacement',
      'disp',
      'Disp',
      'height',
      'Height',
    ]),
  }
}
