import { describe, expect, it } from 'vitest'
import { defaultPlantShape } from './plantShape'
import {
  EZ_TREE_PRESETS,
  listSpecies,
  speciesByKey,
  type EzTreePresetName,
} from './species'

describe('EZ-Tree presets', () => {
  it('exposes every official EZ-Tree plant type in the roster', () => {
    const presets = new Set(
      listSpecies()
        .map((s) => s.eztreePreset)
        .filter((p): p is EzTreePresetName => p != null),
    )
    for (const name of EZ_TREE_PRESETS) {
      expect(presets.has(name)).toBe(true)
    }
    expect(speciesByKey('ezBush3').name).toBe('Куст 3')
    expect(speciesByKey('ezTrellis').eztreePreset).toBe('Trellis')
    expect(speciesByKey('ezPineLarge').eztreePreset).toBe('Pine Large')
  })

  it('replaces thuja with yew and juniper', () => {
    expect(listSpecies().some((s) => s.key === 'thuja')).toBe(false)
    expect(speciesByKey('thuja').key).toBe('ezYew')
    expect(speciesByKey('ezYew').name).toBe('Тис')
    expect(speciesByKey('ezJuniper').name).toBe('Можжевельник')
    expect(speciesByKey('ezYew').eztreeTune?.leafTint).toBe(0x7aaa58)
    expect(speciesByKey('ezJuniper').eztreeTune?.leafTint).toBe(0x6a8a78)
    expect(speciesByKey('leylandGoldRider').eztreePreset).toBe('Pine Medium')
    expect(speciesByKey('gardenRose').eztreePreset).toBeUndefined()
  })

  it('keeps EZ-Tree species heights in metres', () => {
    expect(defaultPlantShape('ezOak').height).toBe(12)
    expect(defaultPlantShape('ezOakLarge').height).toBe(16)
    expect(defaultPlantShape('ponderosaPine').height).toBe(14)
    expect(defaultPlantShape('ezYew').height).toBe(5.5)
    expect(defaultPlantShape('ezJuniper').height).toBe(3.4)
    expect(defaultPlantShape('leylandGoldRider').height).toBe(9)
    expect(defaultPlantShape('ezBush3').height).toBe(2.2)
    expect(defaultPlantShape('ezTrellis').height).toBe(3.8)
    expect(defaultPlantShape('ezPineLarge').height).toBe(18)
  })
})
