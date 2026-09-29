import { describe, expect, it } from 'vitest'
import { hexTriangleWeights } from './hexTiling'

describe('hex triangle weights', () => {
  it('normalizes to one and stays non-negative', () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [0.5, 0.5],
      [1.3, -0.7],
      [3.1, 2.4],
      [-4.2, 8.8],
      [0.001, 0.999],
    ]
    for (const [x, y] of samples) {
      const w = hexTriangleWeights(x, y)
      expect(w[0] + w[1] + w[2]).toBeCloseTo(1, 5)
      expect(w[0]).toBeGreaterThanOrEqual(0)
      expect(w[1]).toBeGreaterThanOrEqual(0)
      expect(w[2]).toBeGreaterThanOrEqual(0)
    }
  })
})
