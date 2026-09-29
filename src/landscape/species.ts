/** Garden roster: every EZ-Tree woody preset, plus fruit trees and flowers. */

export type PlantBiome = 'temperate'

export type PlantGroup =
  | 'conifer'
  | 'deciduous'
  | 'fruit'
  | 'shrub'
  | 'trellis'
  | 'flower'

export type PlantHabit =
  | 'spruce'
  | 'pine'
  | 'thuja'
  | 'orchard'
  | 'cherry'
  | 'maple'
  | 'weeping'
  | 'shrub'
  | 'flower'
  | 'eztree'

export type LeafKind =
  | 'ovate'
  | 'needle'
  | 'spray'
  | 'scale'
  | 'heart'
  | 'petal'
  | 'lance'
  | 'maple'

export type EzTreeTune = {
  leafTint?: number
  barkTint?: number
}

export type SpeciesDef = {
  key: string
  name: string
  latin: string
  group: PlantGroup
  biome: PlantBiome
  /** Approximate mature height, metres. */
  height: number
  trunkColor: string
  leafColor: string
  leafColor2: string
  flowerColor: string
  fruitColor: string
  kind: 'broadleaf' | 'conifer' | 'shrub' | 'flower'
  habit: PlantHabit
  leafKind: LeafKind
  /** Built-in @dgreenheck/ez-tree preset name. */
  eztreePreset?: EzTreePresetName
  eztreeTune?: EzTreeTune
}

export const DEFAULT_SPECIES = 'ponderosaPine'

export const SPECIES_GROUP_LABELS: Record<PlantGroup, string> = {
  conifer: 'Хвойные',
  deciduous: 'Лиственные',
  fruit: 'Плодовые',
  shrub: 'Кусты',
  trellis: 'Шпалера',
  flower: 'Цветы',
}

/** Every built-in @dgreenheck/ez-tree preset. */
export const EZ_TREE_PRESETS = [
  'Ash Small',
  'Ash Medium',
  'Ash Large',
  'Aspen Small',
  'Aspen Medium',
  'Aspen Large',
  'Bush 1',
  'Bush 2',
  'Bush 3',
  'Oak Small',
  'Oak Medium',
  'Oak Large',
  'Pine Small',
  'Pine Medium',
  'Pine Large',
  'Trellis',
] as const

export type EzTreePresetName = (typeof EZ_TREE_PRESETS)[number]

function ez(
  partial: Omit<SpeciesDef, 'biome' | 'habit' | 'flowerColor' | 'fruitColor'> &
    Partial<Pick<SpeciesDef, 'habit' | 'flowerColor' | 'fruitColor'>>,
): SpeciesDef {
  return {
    biome: 'temperate',
    habit: 'eztree',
    flowerColor: '#c8b46a',
    fruitColor: '#6a5a30',
    ...partial,
  }
}

export const GARDEN_SPECIES: SpeciesDef[] = [
  ez({
    key: 'douglasFir',
    name: 'Ель',
    latin: 'Picea abies',
    group: 'conifer',
    height: 16,
    trunkColor: '#4a3424',
    leafColor: '#1e3e22',
    leafColor2: '#2a4e2a',
    kind: 'conifer',
    leafKind: 'spray',
    eztreePreset: 'Pine Large',
  }),
  ez({
    key: 'ponderosaPine',
    name: 'Сосна',
    latin: 'Pinus sylvestris',
    group: 'conifer',
    height: 14,
    trunkColor: '#8a5a30',
    leafColor: '#2a4a28',
    leafColor2: '#3a5a30',
    kind: 'conifer',
    leafKind: 'needle',
    eztreePreset: 'Pine Medium',
  }),
  ez({
    key: 'ezPineSmall',
    name: 'Сосна малая',
    latin: 'Pinus sylvestris',
    group: 'conifer',
    height: 9,
    trunkColor: '#8a5a30',
    leafColor: '#2a4a28',
    leafColor2: '#3a5a30',
    kind: 'conifer',
    leafKind: 'needle',
    eztreePreset: 'Pine Small',
  }),
  ez({
    key: 'ezPineLarge',
    name: 'Сосна крупная',
    latin: 'Pinus sylvestris',
    group: 'conifer',
    height: 18,
    trunkColor: '#8a5a30',
    leafColor: '#2a4a28',
    leafColor2: '#3a5a30',
    kind: 'conifer',
    leafKind: 'needle',
    eztreePreset: 'Pine Large',
  }),
  ez({
    key: 'ezYew',
    name: 'Тис',
    latin: 'Taxus baccata',
    group: 'conifer',
    height: 5.5,
    trunkColor: '#6a4a32',
    leafColor: '#4a7a40',
    leafColor2: '#5a8a4a',
    flowerColor: '#6a3a28',
    fruitColor: '#8a1430',
    kind: 'conifer',
    leafKind: 'needle',
    eztreePreset: 'Pine Small',
    eztreeTune: { leafTint: 0x7aaa58, barkTint: 0x9a7a52 },
  }),
  ez({
    key: 'ezJuniper',
    name: 'Можжевельник',
    latin: 'Juniperus communis',
    group: 'conifer',
    height: 3.4,
    trunkColor: '#3a3020',
    leafColor: '#3a5a48',
    leafColor2: '#5a7a68',
    flowerColor: '#6a7a58',
    fruitColor: '#3a4a38',
    kind: 'conifer',
    leafKind: 'spray',
    eztreePreset: 'Bush 3',
    eztreeTune: { leafTint: 0x6a8a78, barkTint: 0x5a4a38 },
  }),
  ez({
    key: 'leylandGoldRider',
    name: 'Кипарисовик Лейланда Голд Райдер',
    latin: "× Cuprocyparis leylandii 'Gold Rider'",
    group: 'conifer',
    height: 9,
    trunkColor: '#5a4a32',
    leafColor: '#d4c038',
    leafColor2: '#e8d858',
    flowerColor: '#c8b030',
    fruitColor: '#8a7a30',
    kind: 'conifer',
    leafKind: 'scale',
    eztreePreset: 'Pine Medium',
    eztreeTune: { leafTint: 0xe0d050, barkTint: 0x8a7050 },
  }),
  ez({
    key: 'ezOakSmall',
    name: 'Дуб малый',
    latin: 'Quercus robur',
    group: 'deciduous',
    height: 8,
    trunkColor: '#6b4a2e',
    leafColor: '#3d6b2e',
    leafColor2: '#5a8a3a',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Oak Small',
  }),
  ez({
    key: 'ezOak',
    name: 'Дуб',
    latin: 'Quercus robur',
    group: 'deciduous',
    height: 12,
    trunkColor: '#6b4a2e',
    leafColor: '#3d6b2e',
    leafColor2: '#5a8a3a',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Oak Medium',
  }),
  ez({
    key: 'ezOakLarge',
    name: 'Дуб крупный',
    latin: 'Quercus robur',
    group: 'deciduous',
    height: 16,
    trunkColor: '#6b4a2e',
    leafColor: '#3d6b2e',
    leafColor2: '#5a8a3a',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Oak Large',
  }),
  ez({
    key: 'ezAshSmall',
    name: 'Ясень малый',
    latin: 'Fraxinus excelsior',
    group: 'deciduous',
    height: 8,
    trunkColor: '#5a4030',
    leafColor: '#3a7028',
    leafColor2: '#5a8a38',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Ash Small',
  }),
  ez({
    key: 'ezAsh',
    name: 'Ясень',
    latin: 'Fraxinus excelsior',
    group: 'deciduous',
    height: 14,
    trunkColor: '#5a4030',
    leafColor: '#3a7028',
    leafColor2: '#5a8a38',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Ash Medium',
  }),
  ez({
    key: 'ezAshLarge',
    name: 'Ясень крупный',
    latin: 'Fraxinus excelsior',
    group: 'deciduous',
    height: 18,
    trunkColor: '#5a4030',
    leafColor: '#3a7028',
    leafColor2: '#5a8a38',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Ash Large',
  }),
  ez({
    key: 'ezAspenSmall',
    name: 'Осина малая',
    latin: 'Populus tremula',
    group: 'deciduous',
    height: 7,
    trunkColor: '#d8c8a0',
    leafColor: '#5a8a28',
    leafColor2: '#c8b030',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Aspen Small',
  }),
  ez({
    key: 'ezAspen',
    name: 'Осина',
    latin: 'Populus tremula',
    group: 'deciduous',
    height: 12,
    trunkColor: '#d8c8a0',
    leafColor: '#5a8a28',
    leafColor2: '#c8b030',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Aspen Medium',
  }),
  ez({
    key: 'ezAspenLarge',
    name: 'Осина крупная',
    latin: 'Populus tremula',
    group: 'deciduous',
    height: 18,
    trunkColor: '#d8c8a0',
    leafColor: '#5a8a28',
    leafColor2: '#c8b030',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Aspen Large',
  }),
  {
    key: 'sorbusCommixta',
    name: 'Рябина смешанная',
    latin: 'Sorbus commixta',
    group: 'deciduous',
    biome: 'temperate',
    height: 9,
    trunkColor: '#5a4030',
    leafColor: '#3a7a28',
    leafColor2: '#c05028',
    flowerColor: '#fff8ee',
    fruitColor: '#e04020',
    kind: 'broadleaf',
    habit: 'cherry',
    leafKind: 'ovate',
  },
  {
    key: 'arcticJadeMaple',
    name: 'Клён ложнозибольдов Арктик Джейд',
    latin: "Acer pseudosieboldianum 'Arctic Jade'",
    group: 'deciduous',
    biome: 'temperate',
    height: 5,
    trunkColor: '#6a5850',
    leafColor: '#3d8a52',
    leafColor2: '#b85a48',
    flowerColor: '#d8c8a0',
    fruitColor: '#c07040',
    kind: 'broadleaf',
    habit: 'maple',
    leafKind: 'maple',
  },
  {
    key: 'pyrusPendula',
    name: 'Груша декоративная иволистная Пендула',
    latin: "Pyrus salicifolia 'Pendula'",
    group: 'deciduous',
    biome: 'temperate',
    height: 5,
    trunkColor: '#6a5a48',
    leafColor: '#c2d0c4',
    leafColor2: '#8a9c8c',
    flowerColor: '#fff6e0',
    fruitColor: '#c8b060',
    kind: 'broadleaf',
    habit: 'weeping',
    leafKind: 'lance',
  },
  {
    key: 'cultivatedApple',
    name: 'Яблоня',
    latin: 'Malus domestica',
    group: 'fruit',
    biome: 'temperate',
    height: 5.5,
    trunkColor: '#6a4a32',
    leafColor: '#3a7a2a',
    leafColor2: '#4a8a32',
    flowerColor: '#ffb6d0',
    fruitColor: '#c03030',
    kind: 'broadleaf',
    habit: 'orchard',
    leafKind: 'ovate',
  },
  {
    key: 'niedzwetzkyApple',
    name: 'Яблоня декоративная Недзвецкого',
    latin: 'Malus niedzwetzkyana',
    group: 'fruit',
    biome: 'temperate',
    height: 6,
    trunkColor: '#4a3028',
    leafColor: '#5a2040',
    leafColor2: '#8a3048',
    flowerColor: '#e84888',
    fruitColor: '#6a1028',
    kind: 'broadleaf',
    habit: 'orchard',
    leafKind: 'ovate',
  },
  {
    key: 'sweetCherry',
    name: 'Вишня',
    latin: 'Prunus avium',
    group: 'fruit',
    biome: 'temperate',
    height: 7,
    trunkColor: '#5a3020',
    leafColor: '#3a6a28',
    leafColor2: '#4a7a30',
    flowerColor: '#ffc0d4',
    fruitColor: '#8a1430',
    kind: 'broadleaf',
    habit: 'cherry',
    leafKind: 'ovate',
  },
  ez({
    key: 'ezBush1',
    name: 'Куст',
    latin: 'Syringa',
    group: 'shrub',
    height: 1.8,
    trunkColor: '#4a3828',
    leafColor: '#3a6a28',
    leafColor2: '#4a7a30',
    flowerColor: '#c070d0',
    fruitColor: '#6a3a7a',
    kind: 'shrub',
    leafKind: 'heart',
    eztreePreset: 'Bush 1',
  }),
  ez({
    key: 'ezBush2',
    name: 'Куст 2',
    latin: 'Hydrangea',
    group: 'shrub',
    height: 2,
    trunkColor: '#4a3a28',
    leafColor: '#3a6a32',
    leafColor2: '#4a7a38',
    flowerColor: '#dce8ff',
    fruitColor: '#a8b8e0',
    kind: 'shrub',
    leafKind: 'ovate',
    eztreePreset: 'Bush 2',
  }),
  ez({
    key: 'ezBush3',
    name: 'Куст 3',
    latin: 'Juniperus',
    group: 'shrub',
    height: 2.2,
    trunkColor: '#3a3020',
    leafColor: '#2a4a28',
    leafColor2: '#3a5a30',
    flowerColor: '#6a7a30',
    fruitColor: '#5a4a28',
    kind: 'shrub',
    leafKind: 'spray',
    eztreePreset: 'Bush 3',
  }),
  {
    key: 'cornusAlba',
    name: 'Дерен белый обыкновенный',
    latin: 'Cornus alba',
    group: 'shrub',
    biome: 'temperate',
    height: 2.4,
    trunkColor: '#c42830',
    leafColor: '#3a7a32',
    leafColor2: '#5a9a48',
    flowerColor: '#fffaf0',
    fruitColor: '#e8e4d0',
    kind: 'shrub',
    habit: 'shrub',
    leafKind: 'ovate',
  },
  {
    key: 'spireaGrefsheim',
    name: 'Спирея серая Грефшейм v2 Lav',
    latin: "Spiraea × cinerea 'Grefsheim'",
    group: 'shrub',
    biome: 'temperate',
    height: 1.7,
    trunkColor: '#5a4a38',
    leafColor: '#7a8a58',
    leafColor2: '#9aaa70',
    flowerColor: '#fff8f0',
    fruitColor: '#c8b890',
    kind: 'shrub',
    habit: 'shrub',
    leafKind: 'lance',
  },
  {
    key: 'physocarpusLadyInRed',
    name: 'Пузыреплодник калинолистный Леди ин Ред',
    latin: "Physocarpus opulifolius 'Lady in Red'",
    group: 'shrub',
    biome: 'temperate',
    height: 1.8,
    trunkColor: '#4a3028',
    leafColor: '#8a2030',
    leafColor2: '#a83840',
    flowerColor: '#ffd8de',
    fruitColor: '#a04048',
    kind: 'shrub',
    habit: 'shrub',
    leafKind: 'ovate',
  },
  ez({
    key: 'ezTrellis',
    name: 'Шпалера',
    latin: 'Vitis',
    group: 'trellis',
    height: 3.8,
    trunkColor: '#5a4030',
    leafColor: '#3a6a28',
    leafColor2: '#4a7a30',
    flowerColor: '#c8d8a0',
    fruitColor: '#6a5a30',
    kind: 'broadleaf',
    leafKind: 'ovate',
    eztreePreset: 'Trellis',
  }),
  {
    key: 'gardenRose',
    name: 'Роза',
    latin: 'Rosa',
    group: 'flower',
    biome: 'temperate',
    height: 1.05,
    trunkColor: '#3a3020',
    leafColor: '#2a5a28',
    leafColor2: '#3a6a30',
    flowerColor: '#e83850',
    fruitColor: '#c02838',
    kind: 'flower',
    habit: 'flower',
    leafKind: 'ovate',
  },
  {
    key: 'gardenTulip',
    name: 'Тюльпан',
    latin: 'Tulipa',
    group: 'flower',
    biome: 'temperate',
    height: 0.42,
    trunkColor: '#3a6a28',
    leafColor: '#3a7a30',
    leafColor2: '#4a8a38',
    flowerColor: '#ee3048',
    fruitColor: '#e8c040',
    kind: 'flower',
    habit: 'flower',
    leafKind: 'lance',
  },
  {
    key: 'gardenPeony',
    name: 'Пион',
    latin: 'Paeonia',
    group: 'flower',
    biome: 'temperate',
    height: 0.7,
    trunkColor: '#3a5a28',
    leafColor: '#2a5a28',
    leafColor2: '#3a6a30',
    flowerColor: '#ff9ab4',
    fruitColor: '#f0d0a0',
    kind: 'flower',
    habit: 'flower',
    leafKind: 'ovate',
  },
]

/** Old SeedThree / garden keys still found in saved buildings. */
const LEGACY_SPECIES: Record<string, string> = {
  whiteOak: 'ezOak',
  redMaple: 'ezOak',
  tulipPoplar: 'ezAsh',
  sweetgum: 'ezOak',
  americanBeech: 'ezOak',
  loblollyPine: 'ponderosaPine',
  paperBirch: 'ezAspen',
  quakingAspen: 'ezAspen',
  americanSycamore: 'ezAsh',
  floweringDogwood: 'sweetCherry',
  weepingWillow: 'ezAsh',
  joshuaTree: 'ezJuniper',
  saguaro: 'ezJuniper',
  thuja: 'ezYew',
  creosoteBush: 'ezBush1',
  blackbrush: 'ezBush1',
  bigSagebrush: 'ezBush2',
  lilacBush: 'ezBush1',
  hydrangea: 'ezBush2',
}

export function listSpecies(): SpeciesDef[] {
  return GARDEN_SPECIES
}

export function speciesByKey(key: string): SpeciesDef {
  const mapped = LEGACY_SPECIES[key] ?? key
  return GARDEN_SPECIES.find((s) => s.key === mapped) ?? GARDEN_SPECIES[0]!
}
