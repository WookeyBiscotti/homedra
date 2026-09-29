import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyCeramicTileRepeat, applyTileRepeat, type LoadedPbrMaps } from './ambientcg'

function fakeMaps(width: number, height: number): LoadedPbrMaps {
  const map = new THREE.Texture()
  map.image = { width, height }
  return { map }
}

describe('applyTileRepeat', () => {
  it('keeps a square image isotropic in meters', () => {
    const maps = fakeMaps(1024, 1024)
    applyTileRepeat(maps, 0.3)
    expect(maps.map.wrapS).toBe(THREE.RepeatWrapping)
    expect(maps.map.wrapT).toBe(THREE.RepeatWrapping)
    expect(maps.map.repeat.x).toBeCloseTo(1 / 0.3, 5)
    expect(maps.map.repeat.y).toBeCloseTo(1 / 0.3, 5)
    expect(maps.map.offset.x).toBeCloseTo(0, 5)
    expect(maps.map.offset.y).toBeCloseTo(0, 5)
  })

  it('does not squash a wide photo into a square cell', () => {
    const maps = fakeMaps(2000, 1000)
    applyTileRepeat(maps, 0.4)
    expect(maps.map.repeat.x).toBeCloseTo(1 / 0.4, 5)
    expect(maps.map.repeat.y).toBeCloseTo(2 / 0.4, 5)
  })

  it('stamps a square photo onto a 30 cm tile without shrinking to tileSizeM', () => {
    const maps = fakeMaps(1024, 1024)
    applyCeramicTileRepeat(maps, 0.3, 0.3)
    expect(maps.map.repeat.x).toBeCloseTo(1, 5)
    expect(maps.map.repeat.y).toBeCloseTo(1, 5)
  })

  it('keeps aspect on a rectangular ceramic tile', () => {
    const maps = fakeMaps(1024, 1024)
    applyCeramicTileRepeat(maps, 1.2, 0.6)
    expect(maps.map.repeat.x).toBeCloseTo(1, 5)
    expect(maps.map.repeat.y).toBeCloseTo(0.5, 5)
  })

  it('resets offset when tiling a full (already cropped) image', () => {
    const maps = fakeMaps(1000, 1000)
    maps.map.offset.set(0.2, 0.5)
    applyTileRepeat(maps, 1, 1, 1)
    expect(maps.map.repeat.x).toBeCloseTo(1, 5)
    expect(maps.map.repeat.y).toBeCloseTo(1, 5)
    expect(maps.map.offset.x).toBeCloseTo(0, 5)
    expect(maps.map.offset.y).toBeCloseTo(0, 5)
  })
})
