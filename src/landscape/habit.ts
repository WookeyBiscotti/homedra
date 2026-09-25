/**
 * Morphology recipes for the garden roster.
 * Numbers track Weber–Penn length / downAngle / attractionUp / baseSize.
 */
import type { PlantHabit } from './species'

export type HabitRecipe = {
  /** Clear bole as a fraction of height (baseSize). */
  bole: number
  /** Trunk ends at the crown instead of a full-height leader. */
  decurrent: boolean
  /** Low crotch / extra co-dominant stems. */
  fork: boolean
  /** Primary limb length / height (length[1]). */
  branchLen: number
  /** Secondary twig length / primary (length[2]). */
  twigLen: number
  /** Upward tropism at the tip (attractionUp). */
  tipLift: number
  /** Extra downward bend at the tip. */
  droop: number
  opposite: boolean
  /** Phyllotaxy step, radians. */
  rotate: number
  /** 0 = leaves at the tip, 1 = along the whole limb. */
  leafAlong: number
  fruit: false | 'apple' | 'cherry'
  blossom: boolean
  segments: number
  curve: number
  curveBack: number
  thin: number
  flare: number
  highCrown: boolean
  barkRough: number
}

export function habitRecipe(habit: PlantHabit): HabitRecipe {
  switch (habit) {
    case 'orchard':
      return {
        bole: 0.28,
        decurrent: true,
        fork: true,
        branchLen: 0.64,
        twigLen: 0.38,
        tipLift: 0.32,
        droop: 0.08,
        opposite: false,
        rotate: 2.39,
        leafAlong: 0.48,
        fruit: 'apple',
        blossom: true,
        segments: 3,
        curve: 0.28,
        curveBack: -0.16,
        thin: 1.15,
        flare: 0.62,
        highCrown: false,
        barkRough: 0.82,
      }
    case 'cherry':
      return {
        bole: 0.26,
        decurrent: true,
        fork: false,
        branchLen: 0.54,
        twigLen: 0.34,
        tipLift: 0.42,
        droop: 0.05,
        opposite: false,
        rotate: 2.39,
        leafAlong: 0.38,
        fruit: 'cherry',
        blossom: true,
        segments: 3,
        curve: 0.16,
        curveBack: 0.1,
        thin: 0.92,
        flare: 0.32,
        highCrown: false,
        barkRough: 0.5,
      }
    case 'spruce':
      return {
        bole: 0.08,
        decurrent: false,
        fork: false,
        branchLen: 0.28,
        twigLen: 0.3,
        tipLift: 0,
        droop: 0.22,
        opposite: false,
        rotate: 2.39,
        leafAlong: 0.92,
        fruit: false,
        blossom: false,
        segments: 2,
        curve: 0.08,
        curveBack: 0.18,
        thin: 0.72,
        flare: 0.48,
        highCrown: false,
        barkRough: 0.9,
      }
    case 'pine':
      return {
        bole: 0.16,
        decurrent: false,
        fork: false,
        branchLen: 0.38,
        twigLen: 0.28,
        tipLift: 0.08,
        droop: 0.1,
        opposite: false,
        rotate: 2.51,
        leafAlong: 0.55,
        fruit: false,
        blossom: false,
        segments: 3,
        curve: 0.18,
        curveBack: -0.12,
        thin: 0.85,
        flare: 0.7,
        highCrown: true,
        barkRough: 0.94,
      }
    case 'thuja':
      return {
        bole: 0.04,
        decurrent: false,
        fork: false,
        branchLen: 0.16,
        twigLen: 0.22,
        tipLift: 0.12,
        droop: 0.04,
        opposite: true,
        rotate: Math.PI / 2,
        leafAlong: 1,
        fruit: false,
        blossom: false,
        segments: 1,
        curve: 0.04,
        curveBack: 0,
        thin: 0.55,
        flare: 0.28,
        highCrown: false,
        barkRough: 0.78,
      }
    case 'shrub':
      return {
        bole: 0.06,
        decurrent: false,
        fork: true,
        branchLen: 0.55,
        twigLen: 0.4,
        tipLift: 0.25,
        droop: 0.04,
        opposite: false,
        rotate: 2.4,
        leafAlong: 0.72,
        fruit: false,
        blossom: true,
        segments: 2,
        curve: 0.12,
        curveBack: 0,
        thin: 0.7,
        flare: 0.2,
        highCrown: false,
        barkRough: 0.86,
      }
    case 'eztree':
    case 'flower':
    default:
      return {
        bole: 0.02,
        decurrent: false,
        fork: false,
        branchLen: 0.35,
        twigLen: 0.2,
        tipLift: 0.1,
        droop: 0,
        opposite: false,
        rotate: 2.4,
        leafAlong: 0.4,
        fruit: false,
        blossom: true,
        segments: 1,
        curve: 0.05,
        curveBack: 0,
        thin: 0.45,
        flare: 0.1,
        highCrown: false,
        barkRough: 0.7,
      }
  }
}
