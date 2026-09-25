import { describe, expect, it } from 'vitest'
import { defaultPlantShape } from './plantShape'
import { listSpecies, speciesByKey } from './species'

const EZ_TREE_TREE_PRESETS = [
  'Ash Small',
  'Ash Medium',
  'Ash Large',
  'Aspen Small',
  'Aspen Medium',
  'Aspen Large',
  'Oak Small',
  'Oak Medium',
  'Oak Large',
  'Pine Small',
  'Pine Medium',
  'Pine Large',
] as const

describe('EZ-Tree presets', () => {
  it('exposes every official EZ-Tree tree preset in the roster', () => {
    const presets = new Set(
      listSpecies()
        .map((s) => s.eztreePreset)
        .filter((p): p is string => Boolean(p)),
    )
    for (const name of EZ_TREE_TREE_PRESETS) {
      expect(presets.has(name)).toBe(true)
    }
    expect(presets.has('Bush 1')).toBe(true)
    expect(presets.has('Bush 2')).toBe(true)
    expect(presets.has('Bush 3')).toBe(true)
  })

  it('replaces thuja with yew and juniper', () => {
    expect(listSpecies().some((s) => s.key === 'thuja')).toBe(false)
    expect(speciesByKey('thuja').key).toBe('ezYew')
    expect(speciesByKey('ezYew').name).toBe('Тис')
    expect(speciesByKey('ezJuniper').name).toBe('Можжевельник')
    expect(speciesByKey('ezYew').eztreeTune?.leafTint).toBe(0x2a4a28)
    expect(speciesByKey('ezJuniper').eztreeTune?.leafTint).toBe(0x6a8a78)
    expect(speciesByKey('gardenRose').eztreePreset).toBeUndefined()
  })

  it('keeps EZ-Tree species heights in metres', () => {
    expect(defaultPlantShape('ezOak').height).toBe(12)
    expect(defaultPlantShape('ezOakLarge').height).toBe(16)
    expect(defaultPlantShape('ponderosaPine').height).toBe(14)
    expect(defaultPlantShape('ezYew').height).toBe(5.5)
    expect(defaultPlantShape('ezJuniper').height).toBe(3.4)
  })
})
