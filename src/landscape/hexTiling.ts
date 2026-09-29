/** World-space hex cell size so every splat layer shares the same lattice. */
export const HEX_SIZE_M = 2

const SKEW_B = 0.57735026919 // 1/sqrt(3)
const SKEW_D = 1.15470053838 // 2/sqrt(3)
const WEIGHT_GAIN = 4

/**
 * Mikkelsen triangle/hex barycentric weights at `st` (world metres / hex size).
 * Matches the GLSL in splatMaterial — keep them in lockstep.
 */
export function hexTriangleWeights(stX: number, stY: number): [number, number, number] {
  const skewedX = stX - SKEW_B * stY
  const skewedY = SKEW_D * stY
  const fx = skewedX - Math.floor(skewedX)
  const fy = skewedY - Math.floor(skewedY)
  const z = 1 - fx - fy
  let w0: number
  let w1: number
  let w2: number
  if (z > 0) {
    w0 = z
    w1 = fy
    w2 = fx
  } else {
    w0 = -z
    w1 = 1 - fy
    w2 = 1 - fx
  }
  w0 = w0 ** WEIGHT_GAIN
  w1 = w1 ** WEIGHT_GAIN
  w2 = w2 ** WEIGHT_GAIN
  const sum = Math.max(w0 + w1 + w2, 1e-5)
  return [w0 / sum, w1 / sum, w2 / sum]
}
