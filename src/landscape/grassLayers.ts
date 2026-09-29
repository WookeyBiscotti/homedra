import {
  createId,
  LANDSCAPE_GRASS_DEFAULTS,
  type LandscapeGrass,
  type LandscapeGrassLayer,
} from '../engine/types'

export const MAX_GRASS_LAYERS = 6

export const GRASS_TYPE_PRESETS: Array<
  Pick<LandscapeGrassLayer, 'name' | 'density' | 'height' | 'width' | 'color'>
> = [
  {
    name: 'Луг',
    density: LANDSCAPE_GRASS_DEFAULTS.density,
    height: LANDSCAPE_GRASS_DEFAULTS.height,
    width: LANDSCAPE_GRASS_DEFAULTS.width,
    color: LANDSCAPE_GRASS_DEFAULTS.color,
  },
  { name: 'Газон', density: 12, height: 0.35, width: 1.2, color: '#4f9d32' },
  { name: 'Сухая', density: 5, height: 1.15, width: 2.1, color: '#c4a24a' },
  { name: 'Тень', density: 7, height: 0.5, width: 1.45, color: '#2f5a28' },
  { name: 'Высокая', density: 4, height: 1.35, width: 1.9, color: '#7bb04a' },
  { name: 'Редкая', density: 2.4, height: 0.7, width: 1.6, color: '#8a9a3c' },
]

function clampColor(raw?: string): string {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw)
    ? raw
    : LANDSCAPE_GRASS_DEFAULTS.color
}

export function createGrassLayer(
  preset?: Partial<LandscapeGrassLayer> & { name?: string },
): LandscapeGrassLayer {
  const d = GRASS_TYPE_PRESETS[0]!
  return {
    id: preset?.id ?? createId('grs'),
    name: (preset?.name ?? d.name).trim() || d.name,
    coveragePng:
      typeof preset?.coveragePng === 'string' ? preset.coveragePng : undefined,
    density: Math.max(0.2, Math.min(18, Number(preset?.density) || d.density)),
    height: Math.max(0.15, Math.min(1.8, Number(preset?.height) || d.height)),
    width: Math.max(0.6, Math.min(3.2, Number(preset?.width) || d.width)),
    color: clampColor(preset?.color),
    seed: Math.max(1, Math.round(Number(preset?.seed) || 1)),
  }
}

export function nextGrassPreset(
  existing: LandscapeGrassLayer[],
): (typeof GRASS_TYPE_PRESETS)[number] {
  const used = new Set(existing.map((l) => l.name))
  return (
    GRASS_TYPE_PRESETS.find((p) => !used.has(p.name)) ?? {
      ...GRASS_TYPE_PRESETS[existing.length % GRASS_TYPE_PRESETS.length]!,
      name: `Трава ${existing.length + 1}`,
    }
  )
}

export function emptyGrassDoc(resolution: 256 | 512 = 256): LandscapeGrass {
  return {
    resolution,
    layers: [createGrassLayer(GRASS_TYPE_PRESETS[0])],
  }
}

export function grassLayers(grass?: LandscapeGrass | null): LandscapeGrassLayer[] {
  return grass?.layers ?? []
}

export function findGrassLayer(
  grass: LandscapeGrass | null | undefined,
  id?: string | null,
): LandscapeGrassLayer | undefined {
  const layers = grassLayers(grass)
  return layers.find((l) => l.id === id) ?? layers[0]
}

export function replaceGrassLayer(
  grass: LandscapeGrass,
  id: string,
  patch: Partial<LandscapeGrassLayer>,
): LandscapeGrass {
  return {
    ...grass,
    layers: grass.layers.map((l) =>
      l.id === id ? createGrassLayer({ ...l, ...patch, id: l.id }) : l,
    ),
  }
}
