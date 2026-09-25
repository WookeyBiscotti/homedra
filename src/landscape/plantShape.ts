/**
 * Per-species Weber–Penn / foliage numbers for the garden roster.
 */
import type { PlantShape } from '../engine/types'
import { speciesByKey } from './species'

export const SEEDTHREE_PLANT_DEFAULTS: PlantShape = {
  height: 13,
  levels: 3,
  crownShape: 1,
  branchDensity: 26,
  branchAngle: 68,
  gnarliness: 80,
  trunks: 2,
  trunkThickness: 1,
  leafSize: 0.6,
  leavesPerBranch: 14,
  leafAngle: 52,
  leafStart: 0.1,
  leafSizeVar: 0.3,
  leafAlpha: 0.4,
  showLeaves: true,
}

/** Per-species Weber–Penn / foliage numbers. */
const SPECIES_SHAPE: Record<string, Partial<PlantShape>> = {
  douglasFir: {
    height: 16,
    levels: 4,
    crownShape: 0,
    branchDensity: 42,
    branchAngle: 84,
    gnarliness: 16,
    trunks: 1,
    trunkThickness: 0.75,
    leafSize: 0.55,
    leavesPerBranch: 12,
    leafAngle: 64,
    leafStart: 0.08,
    leafAlpha: 0.3,
  },
  ponderosaPine: {
    height: 14,
    levels: 4,
    crownShape: 0,
    branchDensity: 22,
    branchAngle: 72,
    gnarliness: 28,
    trunks: 1,
    trunkThickness: 0.95,
    leafSize: 0.85,
    leavesPerBranch: 8,
    leafAngle: 55,
    leafStart: 0.22,
    leafAlpha: 0.32,
  },
  ezPineSmall: {
    height: 9,
    levels: 3,
    crownShape: 0,
    branchDensity: 20,
    branchAngle: 68,
    gnarliness: 22,
    trunks: 1,
    trunkThickness: 0.8,
    leafSize: 0.7,
    leavesPerBranch: 8,
    leafAngle: 52,
    leafStart: 0.2,
    leafAlpha: 0.32,
  },
  ezYew: {
    height: 5.5,
    levels: 3,
    crownShape: 7,
    branchDensity: 28,
    branchAngle: 42,
    gnarliness: 10,
    trunks: 1,
    trunkThickness: 0.7,
    leafSize: 0.48,
    leavesPerBranch: 14,
    leafAngle: 48,
    leafStart: 0.06,
    leafAlpha: 0.28,
  },
  ezJuniper: {
    height: 3.4,
    levels: 3,
    crownShape: 5,
    branchDensity: 18,
    branchAngle: 36,
    gnarliness: 10,
    trunks: 1,
    trunkThickness: 0.5,
    leafSize: 0.5,
    leavesPerBranch: 14,
    leafAngle: 40,
    leafStart: 0.1,
    leafAlpha: 0.35,
  },
  cultivatedApple: {
    height: 5.5,
    levels: 4,
    crownShape: 2,
    branchDensity: 16,
    branchAngle: 62,
    gnarliness: 36,
    trunks: 1,
    trunkThickness: 1.15,
    leafSize: 0.32,
    leavesPerBranch: 12,
    leafAngle: 48,
    leafStart: 0.28,
    leafAlpha: 0.32,
  },
  sweetCherry: {
    height: 7,
    levels: 4,
    crownShape: 1,
    branchDensity: 15,
    branchAngle: 50,
    gnarliness: 22,
    trunks: 1,
    trunkThickness: 0.95,
    leafSize: 0.34,
    leavesPerBranch: 11,
    leafAngle: 44,
    leafStart: 0.26,
    leafAlpha: 0.3,
  },
  ezOakSmall: {
    height: 8,
    levels: 3,
    crownShape: 1,
    branchDensity: 18,
    branchAngle: 50,
    gnarliness: 16,
    trunks: 1,
    trunkThickness: 0.9,
    leafSize: 0.55,
    leavesPerBranch: 14,
    leafAngle: 40,
    leafStart: 0.16,
    leafAlpha: 0.5,
  },
  ezOak: {
    height: 12,
    levels: 3,
    crownShape: 1,
    branchDensity: 24,
    branchAngle: 54,
    gnarliness: 20,
    trunks: 1,
    trunkThickness: 1.1,
    leafSize: 0.7,
    leavesPerBranch: 18,
    leafAngle: 42,
    leafStart: 0.16,
    leafAlpha: 0.5,
  },
  ezOakLarge: {
    height: 16,
    levels: 3,
    crownShape: 1,
    branchDensity: 26,
    branchAngle: 56,
    gnarliness: 22,
    trunks: 1,
    trunkThickness: 1.25,
    leafSize: 0.8,
    leavesPerBranch: 20,
    leafAngle: 44,
    leafStart: 0.14,
    leafAlpha: 0.5,
  },
  ezAshSmall: {
    height: 8,
    levels: 3,
    crownShape: 1,
    branchDensity: 18,
    branchAngle: 46,
    gnarliness: 14,
    trunks: 1,
    trunkThickness: 0.75,
    leafSize: 0.45,
    leavesPerBranch: 14,
    leafAngle: 38,
    leafStart: 0.14,
    leafAlpha: 0.45,
  },
  ezAsh: {
    height: 14,
    levels: 3,
    crownShape: 1,
    branchDensity: 22,
    branchAngle: 48,
    gnarliness: 18,
    trunks: 1,
    trunkThickness: 0.9,
    leafSize: 0.55,
    leavesPerBranch: 16,
    leafAngle: 40,
    leafStart: 0.14,
    leafAlpha: 0.45,
  },
  ezAshLarge: {
    height: 18,
    levels: 3,
    crownShape: 1,
    branchDensity: 24,
    branchAngle: 50,
    gnarliness: 18,
    trunks: 1,
    trunkThickness: 1,
    leafSize: 0.6,
    leavesPerBranch: 18,
    leafAngle: 42,
    leafStart: 0.12,
    leafAlpha: 0.45,
  },
  ezAspenSmall: {
    height: 7,
    levels: 3,
    crownShape: 4,
    branchDensity: 14,
    branchAngle: 70,
    gnarliness: 10,
    trunks: 1,
    trunkThickness: 0.45,
    leafSize: 0.38,
    leavesPerBranch: 16,
    leafAngle: 36,
    leafStart: 0.22,
    leafAlpha: 0.4,
  },
  ezAspen: {
    height: 12,
    levels: 3,
    crownShape: 4,
    branchDensity: 18,
    branchAngle: 75,
    gnarliness: 12,
    trunks: 1,
    trunkThickness: 0.55,
    leafSize: 0.45,
    leavesPerBranch: 20,
    leafAngle: 38,
    leafStart: 0.2,
    leafAlpha: 0.4,
  },
  ezAspenLarge: {
    height: 18,
    levels: 3,
    crownShape: 4,
    branchDensity: 20,
    branchAngle: 76,
    gnarliness: 12,
    trunks: 1,
    trunkThickness: 0.6,
    leafSize: 0.5,
    leavesPerBranch: 22,
    leafAngle: 38,
    leafStart: 0.18,
    leafAlpha: 0.4,
  },
  ezBush1: {
    height: 1.8,
    levels: 3,
    crownShape: 2,
    branchDensity: 16,
    branchAngle: 28,
    gnarliness: 14,
    trunks: 3,
    trunkThickness: 0.5,
    leafSize: 0.4,
    leavesPerBranch: 12,
    leafAngle: 55,
    leafStart: 0.05,
    leafAlpha: 0.45,
  },
  ezBush2: {
    height: 2,
    levels: 3,
    crownShape: 2,
    branchDensity: 14,
    branchAngle: 32,
    gnarliness: 12,
    trunks: 3,
    trunkThickness: 0.48,
    leafSize: 0.42,
    leavesPerBranch: 10,
    leafAngle: 50,
    leafStart: 0.08,
    leafAlpha: 0.42,
  },
  gardenRose: {
    height: 1.05,
    levels: 3,
    crownShape: 2,
    branchDensity: 8,
    branchAngle: 28,
    gnarliness: 18,
    trunks: 4,
    trunkThickness: 0.4,
    leafSize: 0.28,
    leavesPerBranch: 6,
    leafAngle: 22,
    leafStart: 0.15,
    leafAlpha: 0.28,
  },
  gardenTulip: {
    height: 0.42,
    levels: 2,
    crownShape: 5,
    branchDensity: 3,
    branchAngle: 18,
    gnarliness: 4,
    trunks: 1,
    trunkThickness: 0.4,
    leafSize: 0.55,
    leavesPerBranch: 3,
    leafAngle: 35,
    leafStart: 0,
    leafAlpha: 0.22,
  },
  gardenPeony: {
    height: 0.7,
    levels: 2,
    crownShape: 2,
    branchDensity: 5,
    branchAngle: 24,
    gnarliness: 8,
    trunks: 3,
    trunkThickness: 0.42,
    leafSize: 0.4,
    leavesPerBranch: 6,
    leafAngle: 28,
    leafStart: 0.08,
    leafAlpha: 0.26,
  },
}

export const CROWN_SHAPE_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Коническая' },
  { value: 1, label: 'Сферическая' },
  { value: 2, label: 'Полусфера' },
  { value: 3, label: 'Цилиндр' },
  { value: 4, label: 'Конус-цилиндр' },
  { value: 5, label: 'Пламя' },
  { value: 6, label: 'Обратный конус' },
  { value: 7, label: 'Узкое пламя' },
]

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, v))
}

export function defaultPlantShape(species: string): PlantShape {
  const sp = speciesByKey(species)
  return {
    ...SEEDTHREE_PLANT_DEFAULTS,
    height: sp.height,
    ...SPECIES_SHAPE[sp.key],
  }
}

export function resolvePlantShape(
  species: string,
  raw?: Partial<PlantShape> | null,
): PlantShape {
  const d = defaultPlantShape(species)
  if (!raw) return d
  return {
    height: clamp(raw.height ?? d.height, 0.4, 30, d.height),
    levels: Math.round(clamp(raw.levels ?? d.levels, 2, 4, d.levels)),
    crownShape: Math.round(
      clamp(raw.crownShape ?? d.crownShape, 0, 7, d.crownShape),
    ),
    branchDensity: Math.round(
      clamp(raw.branchDensity ?? d.branchDensity, 2, 45, d.branchDensity),
    ),
    branchAngle: clamp(raw.branchAngle ?? d.branchAngle, 15, 95, d.branchAngle),
    gnarliness: clamp(raw.gnarliness ?? d.gnarliness, 0, 120, d.gnarliness),
    trunks: Math.round(clamp(raw.trunks ?? d.trunks, 1, 4, d.trunks)),
    trunkThickness: clamp(
      raw.trunkThickness ?? d.trunkThickness,
      0.4,
      2.2,
      d.trunkThickness,
    ),
    leafSize: clamp(raw.leafSize ?? d.leafSize, 0.2, 1.5, d.leafSize),
    leavesPerBranch: Math.round(
      clamp(
        raw.leavesPerBranch ?? d.leavesPerBranch,
        0,
        30,
        d.leavesPerBranch,
      ),
    ),
    leafAngle: clamp(raw.leafAngle ?? d.leafAngle, 0, 100, d.leafAngle),
    leafStart: clamp(raw.leafStart ?? d.leafStart, 0, 1, d.leafStart),
    leafSizeVar: clamp(raw.leafSizeVar ?? d.leafSizeVar, 0, 1, d.leafSizeVar),
    leafAlpha: clamp(raw.leafAlpha ?? d.leafAlpha, 0, 1, d.leafAlpha),
    showLeaves: raw.showLeaves ?? d.showLeaves,
  }
}

export function plantShapeCacheKey(shape: PlantShape): string {
  return [
    shape.height.toFixed(2),
    shape.levels,
    shape.crownShape,
    shape.branchDensity,
    shape.branchAngle.toFixed(1),
    shape.gnarliness.toFixed(1),
    shape.trunks,
    shape.trunkThickness.toFixed(2),
    shape.leafSize.toFixed(2),
    shape.leavesPerBranch,
    shape.leafAngle.toFixed(1),
    shape.leafStart.toFixed(2),
    shape.leafSizeVar.toFixed(2),
    shape.leafAlpha.toFixed(2),
    shape.showLeaves ? 1 : 0,
  ].join(',')
}

/** Weber–Penn crown profiles (CROWN_SHAPES in SeedThree controls.js). */
export function crownRadius(shape: number, t: number): number {
  const u = Math.min(1, Math.max(0, t))
  switch (shape) {
    case 0:
      return 1 - u * 0.85
    case 1:
      return Math.sin(u * Math.PI)
    case 2:
      return Math.sin(u * Math.PI * 0.5)
    case 3:
      return 0.82
    case 4:
      return 1 - u * 0.5
    case 5:
      return (1 - u) * (0.35 + u * 1.1)
    case 6:
      return 0.2 + u * 0.85
    case 7:
      return (1 - u) * (0.2 + u * 0.7)
    default:
      return Math.sin(u * Math.PI)
  }
}
