/**
 * Central-belt (средняя полоса) phenology for the garden roster.
 * Month is 1 = January … 12 = December.
 */
import { speciesByKey, type SpeciesDef } from './species'

export const DEFAULT_LANDSCAPE_MONTH = 6

export const MONTH_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
] as const

export type PlantSeasonLook = {
  leafColor: string
  leafColor2: string
  flowerColor: string
  fruitColor: string
  showLeaves: boolean
  blossom: boolean
  fruit: boolean
  leafTint?: number
}

type ColorPair = {
  leafColor: string
  leafColor2: string
  leafTint?: number
}

type Phenology = {
  evergreen: boolean
  leafStart: number
  leafEnd: number
  autumnStart: number
  autumnEnd: number
  bloom?: [number, number]
  fruit?: [number, number]
  spring?: ColorPair
  autumn?: ColorPair
  winter?: ColorPair
}

function clampMonth(raw: number): number {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n)) return DEFAULT_LANDSCAPE_MONTH
  return Math.min(12, Math.max(1, n))
}

function inWindow(month: number, start: number, end: number): boolean {
  if (start <= end) return month >= start && month <= end
  return month >= start || month <= end
}

export function hexTint(hex: string): number {
  const h = hex.replace('#', '').trim()
  if (h.length === 3) {
    return parseInt(
      h
        .split('')
        .map((c) => c + c)
        .join(''),
      16,
    )
  }
  const n = parseInt(h, 16)
  return Number.isFinite(n) ? n : 0x3d6b2e
}

function deciduous(
  extra: Partial<Phenology> = {},
): Phenology {
  return {
    evergreen: false,
    leafStart: 4,
    leafEnd: 10,
    autumnStart: 9,
    autumnEnd: 10,
    ...extra,
  }
}

function evergreen(extra: Partial<Phenology> = {}): Phenology {
  return {
    evergreen: true,
    leafStart: 1,
    leafEnd: 12,
    autumnStart: 9,
    autumnEnd: 10,
    ...extra,
  }
}

const OAK_AUTUMN: ColorPair = {
  leafColor: '#8a4a20',
  leafColor2: '#c06828',
  leafTint: 0xb06028,
}
const ASH_AUTUMN: ColorPair = {
  leafColor: '#c8a028',
  leafColor2: '#d8b848',
  leafTint: 0xd0b038,
}
const ASPEN_AUTUMN: ColorPair = {
  leafColor: '#d8a028',
  leafColor2: '#e8c040',
  leafTint: 0xe0b030,
}
const SPRING_GREEN: ColorPair = {
  leafColor: '#5a9a38',
  leafColor2: '#78b848',
  leafTint: 0x6aaa40,
}

const PHENOLOGY: Record<string, Phenology> = {
  douglasFir: evergreen({
    winter: { leafColor: '#1a3220', leafColor2: '#243828', leafTint: 0x2a4a30 },
  }),
  ponderosaPine: evergreen({
    winter: { leafColor: '#243828', leafColor2: '#2e4230', leafTint: 0x3a5234 },
  }),
  ezPineSmall: evergreen({
    winter: { leafColor: '#243828', leafColor2: '#2e4230', leafTint: 0x3a5234 },
  }),
  ezPineLarge: evergreen({
    winter: { leafColor: '#243828', leafColor2: '#2e4230', leafTint: 0x3a5234 },
  }),
  ezYew: evergreen({
    winter: { leafColor: '#3a5a38', leafColor2: '#4a6a40', leafTint: 0x5a7a48 },
  }),
  ezJuniper: evergreen({
    winter: { leafColor: '#2e4840', leafColor2: '#486058', leafTint: 0x5a6a60 },
  }),
  leylandGoldRider: evergreen({
    winter: { leafColor: '#b8a038', leafColor2: '#c8b048', leafTint: 0xb8a040 },
  }),
  ezBush3: evergreen({
    winter: { leafColor: '#223828', leafColor2: '#2e4230', leafTint: 0x3a4a32 },
  }),
  ezOakSmall: deciduous({ spring: SPRING_GREEN, autumn: OAK_AUTUMN }),
  ezOak: deciduous({ spring: SPRING_GREEN, autumn: OAK_AUTUMN }),
  ezOakLarge: deciduous({ spring: SPRING_GREEN, autumn: OAK_AUTUMN }),
  ezAshSmall: deciduous({ spring: SPRING_GREEN, autumn: ASH_AUTUMN }),
  ezAsh: deciduous({ spring: SPRING_GREEN, autumn: ASH_AUTUMN }),
  ezAshLarge: deciduous({ spring: SPRING_GREEN, autumn: ASH_AUTUMN }),
  ezAspenSmall: deciduous({
    spring: { leafColor: '#6aaa30', leafColor2: '#d0b040', leafTint: 0x8aba38 },
    autumn: ASPEN_AUTUMN,
  }),
  ezAspen: deciduous({
    spring: { leafColor: '#6aaa30', leafColor2: '#d0b040', leafTint: 0x8aba38 },
    autumn: ASPEN_AUTUMN,
  }),
  ezAspenLarge: deciduous({
    spring: { leafColor: '#6aaa30', leafColor2: '#d0b040', leafTint: 0x8aba38 },
    autumn: ASPEN_AUTUMN,
  }),
  ezTrellis: deciduous({
    leafStart: 5,
    leafEnd: 10,
    bloom: [6, 7],
    fruit: [8, 10],
    spring: SPRING_GREEN,
    autumn: {
      leafColor: '#c8a028',
      leafColor2: '#d8b040',
      leafTint: 0xd4a830,
    },
  }),
  ezBush1: deciduous({
    bloom: [5, 6],
    spring: SPRING_GREEN,
    autumn: { leafColor: '#b8a030', leafColor2: '#c8b048', leafTint: 0xc0a838 },
  }),
  ezBush2: deciduous({
    bloom: [7, 9],
    spring: SPRING_GREEN,
    autumn: { leafColor: '#a88840', leafColor2: '#b89850', leafTint: 0xb09048 },
  }),
  sorbusCommixta: deciduous({
    bloom: [5, 6],
    fruit: [8, 11],
    spring: SPRING_GREEN,
    autumn: { leafColor: '#c04020', leafColor2: '#e05828' },
  }),
  arcticJadeMaple: deciduous({
    spring: { leafColor: '#b85a48', leafColor2: '#3d8a52' },
    autumn: { leafColor: '#c04028', leafColor2: '#e06830' },
  }),
  pyrusPendula: deciduous({
    leafEnd: 11,
    bloom: [4, 5],
    spring: { leafColor: '#d8e4d8', leafColor2: '#c4d2c6' },
    autumn: { leafColor: '#d0c048', leafColor2: '#c8b040' },
  }),
  cultivatedApple: deciduous({
    bloom: [5, 6],
    fruit: [8, 10],
    spring: SPRING_GREEN,
    autumn: { leafColor: '#c8a028', leafColor2: '#d8b040' },
  }),
  niedzwetzkyApple: deciduous({
    bloom: [5, 6],
    fruit: [8, 9],
    autumn: { leafColor: '#4a1028', leafColor2: '#6a1830' },
  }),
  sweetCherry: deciduous({
    bloom: [4, 5],
    fruit: [6, 7],
    spring: SPRING_GREEN,
    autumn: { leafColor: '#c05028', leafColor2: '#d8a030' },
  }),
  cornusAlba: deciduous({
    bloom: [5, 6],
    fruit: [8, 9],
    spring: SPRING_GREEN,
    autumn: { leafColor: '#7a2848', leafColor2: '#a03858' },
  }),
  spireaGrefsheim: deciduous({
    bloom: [4, 6],
    spring: { leafColor: '#8a9a68', leafColor2: '#aaba80' },
    autumn: { leafColor: '#b8a848', leafColor2: '#c8b858' },
  }),
  physocarpusLadyInRed: deciduous({
    bloom: [6, 7],
    autumn: { leafColor: '#6a1020', leafColor2: '#8a2030' },
  }),
  gardenRose: deciduous({
    bloom: [6, 9],
    spring: SPRING_GREEN,
    autumn: { leafColor: '#8a6a28', leafColor2: '#a88830' },
  }),
  gardenTulip: {
    evergreen: false,
    leafStart: 4,
    leafEnd: 6,
    autumnStart: 6,
    autumnEnd: 6,
    bloom: [4, 5],
  },
  gardenPeony: {
    evergreen: false,
    leafStart: 4,
    leafEnd: 9,
    autumnStart: 8,
    autumnEnd: 9,
    bloom: [5, 6],
    autumn: { leafColor: '#8a6a30', leafColor2: '#a88838' },
  },
}

function phenologyFor(sp: SpeciesDef): Phenology {
  const hit = PHENOLOGY[sp.key]
  if (hit) return hit
  if (sp.kind === 'conifer') return evergreen()
  if (sp.kind === 'flower') {
    return {
      evergreen: false,
      leafStart: 4,
      leafEnd: 9,
      autumnStart: 8,
      autumnEnd: 9,
      bloom: [5, 7],
    }
  }
  return deciduous()
}

export function seasonLook(species: string, month: number): PlantSeasonLook {
  const m = clampMonth(month)
  const sp = speciesByKey(species)
  const ph = phenologyFor(sp)
  const winter = m <= 3 || m >= 11
  const spring = m === 4
  const autumn = inWindow(m, ph.autumnStart, ph.autumnEnd)
  const showLeaves = ph.evergreen || inWindow(m, ph.leafStart, ph.leafEnd)
  const blossom = ph.bloom ? inWindow(m, ph.bloom[0], ph.bloom[1]) : false
  const fruit = ph.fruit ? inWindow(m, ph.fruit[0], ph.fruit[1]) : false

  let leafColor = sp.leafColor
  let leafColor2 = sp.leafColor2
  let leafTint = sp.eztreeTune?.leafTint

  if (ph.evergreen && winter && ph.winter) {
    leafColor = ph.winter.leafColor
    leafColor2 = ph.winter.leafColor2
    leafTint = ph.winter.leafTint ?? leafTint
  } else if (showLeaves && autumn && ph.autumn) {
    leafColor = ph.autumn.leafColor
    leafColor2 = ph.autumn.leafColor2
    leafTint = ph.autumn.leafTint ?? hexTint(ph.autumn.leafColor)
  } else if (showLeaves && spring && ph.spring) {
    leafColor = ph.spring.leafColor
    leafColor2 = ph.spring.leafColor2
    leafTint = ph.spring.leafTint ?? hexTint(ph.spring.leafColor)
  }

  if (!leafTint && sp.eztreePreset) leafTint = hexTint(leafColor)

  return {
    leafColor,
    leafColor2,
    flowerColor: sp.flowerColor,
    fruitColor: sp.fruitColor,
    showLeaves,
    blossom,
    fruit,
    leafTint,
  }
}

export function seasonalSpecies(sp: SpeciesDef, look: PlantSeasonLook): SpeciesDef {
  return {
    ...sp,
    leafColor: look.leafColor,
    leafColor2: look.leafColor2,
    flowerColor: look.flowerColor,
    fruitColor: look.fruitColor,
  }
}
