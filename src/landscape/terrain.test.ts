import { describe, expect, it } from 'vitest'
import {
  createEmptyBuilding,
  createEmptyFloor,
  normalizeLandscapeGrass,
} from '../engine/types'
import {
  decodeHeights,
  encodeHeights,
  HEIGHT_LIMIT_M,
  planToUv,
  sampleBilinear,
} from './maps'
import { stampSplat, stampCoverage } from './paintMaps'
import { layoutGrass } from './grassField'
import { listSpecies, speciesByKey } from './species'
import {
  applyHeightsToPositions,
  buildLockMask,
  defaultLandscapeFrame,
  heightAt,
  sculptStamp,
  shouldShowOutdoorLandscape,
} from './terrain'
import {
  defaultPlantShape,
  plantShapeCacheKey,
  resolvePlantShape,
} from './plantShape'

describe('height encode', () => {
  it('round-trips millimetres', () => {
    const src = new Float32Array([0, 1.25, -0.5, HEIGHT_LIMIT_M, -HEIGHT_LIMIT_M])
    const back = decodeHeights(encodeHeights(src), src.length)
    expect(back[1]).toBeCloseTo(1.25, 3)
    expect(back[2]).toBeCloseTo(-0.5, 3)
    expect(back[3]).toBeCloseTo(HEIGHT_LIMIT_M, 3)
    expect(back[4]).toBeCloseTo(-HEIGHT_LIMIT_M, 3)
  })

  it('clamps beyond ±3 m', () => {
    const src = new Float32Array([8, -9])
    const back = decodeHeights(encodeHeights(src), 2)
    expect(back[0]).toBeCloseTo(HEIGHT_LIMIT_M, 5)
    expect(back[1]).toBeCloseTo(-HEIGHT_LIMIT_M, 5)
  })
})

describe('heightAt bilinear', () => {
  it('samples the centre of a peaked grid', () => {
    const res = 3
    const h = new Float32Array(res * res)
    h[4] = 2
    const u = 0.5
    const v = 0.5
    expect(sampleBilinear(h, res, u, v)).toBeCloseTo(2, 5)
  })

  it('returns 0 outside the frame', () => {
    const terrain = {
      resolution: 128 as const,
      size: 40,
      originX: 0,
      originY: 0,
    }
    expect(heightAt(terrain, 40, 0)).toBe(0)
  })
})

describe('sculpt stamp', () => {
  const frame = { size: 20, originX: 0, originY: 0 }
  const res = 17

  it('raises the centre', () => {
    const heights = new Float32Array(res * res)
    const lock = new Uint8Array(res * res)
    sculptStamp(heights, res, frame, 0, 0, 4, 0.2, 0.8, 'raise', lock, 0)
    const { u, v } = planToUv(0, 0, frame)
    expect(sampleBilinear(heights, res, u, v)).toBeGreaterThan(0.4)
  })

  it('lowers after a raise', () => {
    const heights = new Float32Array(res * res)
    heights.fill(1)
    const lock = new Uint8Array(res * res)
    sculptStamp(heights, res, frame, 0, 0, 3, 0.4, 0.5, 'lower', lock, 0)
    const { u, v } = planToUv(0, 0, frame)
    expect(sampleBilinear(heights, res, u, v)).toBeLessThan(1)
  })

  it('flatten pulls toward the target', () => {
    const heights = new Float32Array(res * res)
    heights.fill(2)
    const lock = new Uint8Array(res * res)
    sculptStamp(heights, res, frame, 0, 0, 8, 0.1, 1, 'flatten', lock, 0.25)
    const { u, v } = planToUv(0, 0, frame)
    expect(sampleBilinear(heights, res, u, v)).toBeLessThan(1.2)
  })

  it('does not move locked footprint cells', () => {
    const heights = new Float32Array(res * res)
    const lock = new Uint8Array(res * res)
    lock.fill(1)
    sculptStamp(heights, res, frame, 0, 0, 10, 0, 1, 'raise', lock, 0)
    expect(heights.every((v) => v === 0)).toBe(true)
  })

  it('locks cells inside a hole ring', () => {
    const mask = buildLockMask(9, frame, [
      [
        { x: -2, z: -2 },
        { x: 2, z: -2 },
        { x: 2, z: 2 },
        { x: -2, z: 2 },
      ],
    ])
    expect(mask[4 * 9 + 4]).toBe(1)
    expect(mask[0]).toBe(0)
  })
})

describe('splat and coverage', () => {
  const frame = { size: 10, originX: 0, originY: 0 }

  it('paints layer 1 into red', () => {
    const data = new Uint8Array(8 * 8 * 4)
    stampSplat(data, 8, frame, 0, 0, 4, 0.2, 1, 1, false)
    const mid = (3 * 8 + 3) * 4
    expect(data[mid] ?? 0).toBeGreaterThan(20)
  })

  it('erase returns toward layer 0', () => {
    const data = new Uint8Array(8 * 8 * 4)
    stampSplat(data, 8, frame, 0, 0, 5, 0, 1, 1, false)
    stampSplat(data, 8, frame, 0, 0, 5, 0, 1, 0, true)
    const mid = (3 * 8 + 3) * 4
    expect(data[mid] ?? 0).toBeLessThan(40)
  })

  it('coverage brush increases then decreases', () => {
    const cov = new Uint8Array(8 * 8)
    stampCoverage(cov, 8, frame, 0, 0, 3, 0.3, 1, false)
    const before = cov[3 * 8 + 3] ?? 0
    expect(before).toBeGreaterThan(10)
    stampCoverage(cov, 8, frame, 0, 0, 3, 0.3, 1, true)
    expect(cov[3 * 8 + 3] ?? 0).toBeLessThan(before)
  })
})

describe('grass layout', () => {
  it('places tufts where coverage is high and skips holes', () => {
    const coverage = new Uint8Array(16 * 16)
    coverage.fill(255)
    const tufts = layoutGrass({
      grass: {
        resolution: 16,
        density: 4,
        height: 0.5,
        seed: 3,
      },
      coverage,
      groundY: 0,
      frame: { size: 8, originX: 0, originY: 0 },
      holes: [
        [
          { x: -4, z: -4 },
          { x: 4, z: -4 },
          { x: 4, z: 4 },
          { x: -4, z: 4 },
        ],
      ],
    })
    expect(tufts.length).toBe(0)
  })

  it('emits instances on a full field', () => {
    const coverage = new Uint8Array(8 * 8)
    coverage.fill(255)
    const tufts = layoutGrass({
      grass: { resolution: 8, density: 2, height: 0.4, seed: 1 },
      coverage,
      groundY: 1,
      frame: { size: 8, originX: 0, originY: 0 },
      holes: [],
    })
    expect(tufts.length).toBeGreaterThan(8)
    expect(tufts[0]!.y).toBeCloseTo(0.98, 2)
  })

  it('still emits tufts on a 256² / 40 m field', () => {
    const res = 256
    const coverage = new Uint8Array(res * res)
    for (let j = 112; j < 144; j++) {
      for (let i = 112; i < 144; i++) coverage[j * res + i] = 220
    }
    const tufts = layoutGrass({
      grass: { resolution: res, density: 3, height: 0.55, seed: 2 },
      coverage,
      groundY: 0,
      frame: { size: 40, originX: 0, originY: 0 },
      holes: [],
    })
    expect(tufts.length).toBeGreaterThan(30)
  })

  it('scales tuft width from meadow spread', () => {
    const coverage = new Uint8Array(8 * 8)
    coverage.fill(255)
    const narrow = layoutGrass({
      grass: { resolution: 8, density: 2, height: 1, width: 1, seed: 1 },
      coverage,
      groundY: 0,
      frame: { size: 8, originX: 0, originY: 0 },
      holes: [],
    })
    const wide = layoutGrass({
      grass: { resolution: 8, density: 2, height: 1, width: 2.5, seed: 1 },
      coverage,
      groundY: 0,
      frame: { size: 8, originX: 0, originY: 0 },
      holes: [],
    })
    expect(wide[0]!.sx).toBeGreaterThan(narrow[0]!.sx)
  })
})

describe('grass layers', () => {
  it('migrates a single-layer SeedThree meadow', () => {
    const grass = normalizeLandscapeGrass({
      resolution: 256,
      coveragePng: 'abc',
      density: 8,
      height: 0.85,
      width: 1.75,
      color: '#6fa83c',
      seed: 1,
    })
    expect(grass?.layers).toHaveLength(1)
    expect(grass?.layers[0]?.name).toBe('Луг')
    expect(grass?.layers[0]?.coveragePng).toBe('abc')
    expect(grass?.layers[0]?.height).toBe(0.85)
  })
})

describe('outdoor landscape visibility', () => {
  it('hides dirt inside an interior story (basement)', () => {
    expect(
      shouldShowOutdoorLandscape({
        groundVisible: true,
        sceneMode: 'interior',
        workbench: 'draft',
        activeFloorKind: 'story',
      }),
    ).toBe(false)
  })

  it('keeps dirt in exterior, visit, landscape, and ground floor', () => {
    expect(
      shouldShowOutdoorLandscape({
        groundVisible: true,
        sceneMode: 'exterior',
        workbench: 'draft',
        activeFloorKind: 'story',
      }),
    ).toBe(true)
    expect(
      shouldShowOutdoorLandscape({
        groundVisible: true,
        sceneMode: 'visit',
        workbench: 'draft',
        activeFloorKind: 'story',
      }),
    ).toBe(true)
    expect(
      shouldShowOutdoorLandscape({
        groundVisible: true,
        sceneMode: 'interior',
        workbench: 'landscape',
        activeFloorKind: 'story',
      }),
    ).toBe(true)
    expect(
      shouldShowOutdoorLandscape({
        groundVisible: true,
        sceneMode: 'interior',
        workbench: 'draft',
        activeFloorKind: 'ground',
      }),
    ).toBe(true)
  })
})

describe('plant shape', () => {
  it('uses apple orchard defaults', () => {
    const s = defaultPlantShape('cultivatedApple')
    expect(s.height).toBe(5.5)
    expect(s.levels).toBe(4)
    expect(s.crownShape).toBe(2)
    expect(s.branchDensity).toBe(16)
    expect(s.branchAngle).toBe(62)
    expect(s.gnarliness).toBe(36)
    expect(s.trunks).toBe(1)
    expect(s.leafSize).toBe(0.32)
    expect(s.leavesPerBranch).toBe(12)
    expect(s.showLeaves).toBe(true)
  })

  it('clamps and changes the cache key', () => {
    const a = resolvePlantShape('cultivatedApple', { leafSize: 99 })
    const b = resolvePlantShape('cultivatedApple', { leafSize: 0.2 })
    expect(a.leafSize).toBe(1.5)
    expect(plantShapeCacheKey(a)).not.toBe(plantShapeCacheKey(b))
  })

  it('keeps garden habits architecturally distinct', async () => {
    const { habitRecipe } = await import('./habit')
    const apple = habitRecipe('orchard')
    const cherry = habitRecipe('cherry')
    const spruce = habitRecipe('spruce')
    const pine = habitRecipe('pine')
    const thuja = habitRecipe('thuja')
    expect(apple.fruit).toBe('apple')
    expect(apple.blossom).toBe(true)
    expect(cherry.fruit).toBe('cherry')
    expect(cherry.barkRough).toBeLessThan(apple.barkRough)
    expect(spruce.droop).toBeGreaterThan(pine.droop)
    expect(pine.highCrown).toBe(true)
    expect(thuja.bole).toBeLessThan(0.1)
    expect(thuja.opposite).toBe(true)
    const maple = habitRecipe('maple')
    const weeping = habitRecipe('weeping')
    expect(maple.opposite).toBe(true)
    expect(weeping.droop).toBeGreaterThan(cherry.droop)
    expect(weeping.droop).toBeGreaterThan(0.5)
    expect(weeping.leafAlong).toBeGreaterThan(0.85)
    expect(weeping.bole).toBeGreaterThan(0.4)
  })

  it('gives each garden species its own crown defaults', () => {
    const spruce = defaultPlantShape('douglasFir')
    const apple = defaultPlantShape('cultivatedApple')
    const pine = defaultPlantShape('ponderosaPine')
    const yew = defaultPlantShape('ezYew')
    const tulip = defaultPlantShape('gardenTulip')
    expect(spruce.crownShape).toBe(0)
    expect(spruce.branchAngle).toBe(84)
    expect(pine.branchDensity).toBe(22)
    expect(yew.height).toBe(5.5)
    expect(tulip.height).toBe(0.42)
    expect(plantShapeCacheKey(spruce)).not.toBe(plantShapeCacheKey(apple))
    expect(plantShapeCacheKey(spruce)).not.toBe(plantShapeCacheKey(pine))
  })
})

describe('species', () => {
  it('lists the garden roster', () => {
    const keys = listSpecies().map((s) => s.key)
    expect(keys).toEqual([
      'douglasFir',
      'ponderosaPine',
      'ezPineSmall',
      'ezPineLarge',
      'ezYew',
      'ezJuniper',
      'leylandGoldRider',
      'ezOakSmall',
      'ezOak',
      'ezOakLarge',
      'ezAshSmall',
      'ezAsh',
      'ezAshLarge',
      'ezAspenSmall',
      'ezAspen',
      'ezAspenLarge',
      'sorbusCommixta',
      'arcticJadeMaple',
      'pyrusPendula',
      'cultivatedApple',
      'niedzwetzkyApple',
      'sweetCherry',
      'ezBush1',
      'ezBush2',
      'ezBush3',
      'cornusAlba',
      'spireaGrefsheim',
      'physocarpusLadyInRed',
      'ezTrellis',
      'gardenRose',
      'gardenTulip',
      'gardenPeony',
    ])
    expect(keys).not.toContain('thuja')
    expect(keys).not.toContain('whiteOak')
    expect(speciesByKey('missing').key).toBe('douglasFir')
    expect(speciesByKey('whiteOak').key).toBe('ezOak')
    expect(speciesByKey('thuja').key).toBe('ezYew')
    expect(speciesByKey('ponderosaPine').eztreePreset).toBe('Pine Medium')
    expect(speciesByKey('ezOakLarge').eztreePreset).toBe('Oak Large')
    expect(speciesByKey('ezYew').eztreePreset).toBe('Pine Small')
    expect(speciesByKey('ezJuniper').eztreePreset).toBe('Bush 3')
    expect(speciesByKey('gardenRose').kind).toBe('flower')
    expect(speciesByKey('niedzwetzkyApple').name).toBe('Яблоня декоративная Недзвецкого')
    expect(speciesByKey('cornusAlba').latin).toBe('Cornus alba')
    expect(speciesByKey('spireaGrefsheim').name).toBe('Спирея серая Грефшейм v2 Lav')
    expect(speciesByKey('leylandGoldRider').eztreeTune?.leafTint).toBe(0xe0d050)
    expect(speciesByKey('sorbusCommixta').latin).toBe('Sorbus commixta')
    expect(speciesByKey('arcticJadeMaple').leafKind).toBe('maple')
    expect(speciesByKey('pyrusPendula').habit).toBe('weeping')
    expect(speciesByKey('pyrusPendula').leafKind).toBe('lance')
    expect(defaultPlantShape('pyrusPendula').leafSize).toBeGreaterThan(0.45)
    expect(defaultPlantShape('pyrusPendula').leavesPerBranch).toBeGreaterThan(14)
    expect(speciesByKey('physocarpusLadyInRed').group).toBe('shrub')
  })
})

describe('applyHeightsToPositions', () => {
  it('maps high plan-Y cells onto the first PlaneGeometry row', () => {
    const res = 3
    const heights = new Float32Array(res * res)
    heights[res * (res - 1)] = 1.5
    const positions = new Float32Array(res * res * 3)
    applyHeightsToPositions(positions, heights, res, 0)
    expect(positions[1]).toBeCloseTo(1.5, 5)
    expect(positions[((res - 1) * res) * 3 + 1]).toBeCloseTo(0, 5)
  })
})

describe('default frame', () => {
  it('grows from building bounds', () => {
    const b = createEmptyBuilding()
    const story = createEmptyFloor('s', 0, 2.8)
    story.vertices = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 10, y: 0 },
      { id: 'c', x: 10, y: 6 },
    ]
    b.floors[1] = story
    const frame = defaultLandscapeFrame(b)
    expect(frame.size).toBeGreaterThanOrEqual(40)
    expect(frame.originX).toBeCloseTo(5, 5)
  })
})

describe('splat shader bind', () => {
  it('injects world splat sampling into the compiled chunks', async () => {
    const THREE = await import('three')
    const { bindSplatShader, createSplatUniforms } = await import('./splatMaterial')
    const mat = new THREE.MeshStandardMaterial()
    const uniforms = createSplatUniforms()
    bindSplatShader(mat, uniforms)
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: [
        '#include <common>',
        '#include <map_fragment>',
        '#include <color_fragment>',
        '#include <roughnessmap_fragment>',
        '#include <metalnessmap_fragment>',
        '#include <normal_fragment_maps>',
      ].join('\n'),
    }
    mat.onBeforeCompile(shader as never, null as never)
    expect(shader.fragmentShader).toContain('uSplat')
    expect(shader.fragmentShader).toContain('vSplatWorld')
    expect(shader.fragmentShader).toContain('hexSample')
    expect(shader.fragmentShader).toContain('uN0')
    expect(shader.fragmentShader).toContain('uR0')
    expect(shader.fragmentShader).toContain('uHexSize')
    expect(shader.vertexShader).toContain('vSplatWorld')
    expect(shader.uniforms).toHaveProperty('uSplat')
    expect(shader.uniforms).toHaveProperty('uN0')
    expect(shader.fragmentShader).toContain('#include <map_fragment>')
    expect(shader.fragmentShader.split('diffuseColor.rgb = splatAlbedo').length - 1).toBe(1)
  })
})

describe('leaf silhouette', () => {
  it('ovate leaf is a tapered blade, not a quad', async () => {
    const { makeOvateLeafGeometry, makeNeedleGeometry, makeTulipLeafGeometry, makeMapleLeafGeometry } =
      await import('./leafMesh')
    const ovate = makeOvateLeafGeometry()
    const needle = makeNeedleGeometry()
    const tulip = makeTulipLeafGeometry()
    const maple = makeMapleLeafGeometry()
    expect(ovate.getAttribute('position')!.count).toBeGreaterThan(8)
    expect(needle.getAttribute('position')!.count).toBeGreaterThan(8)
    expect(tulip.getAttribute('position')!.count).toBeGreaterThan(8)
    expect(maple.getAttribute('position')!.count).toBeGreaterThan(ovate.getAttribute('position')!.count * 0.4)
    ovate.computeBoundingBox()
    const bb = ovate.boundingBox!
    const width = bb.max.x - bb.min.x
    const height = bb.max.y - bb.min.y
    expect(height).toBeGreaterThan(width)
    expect(width).toBeGreaterThan(0.4)
    expect(width).toBeLessThan(0.95)
  })
})
