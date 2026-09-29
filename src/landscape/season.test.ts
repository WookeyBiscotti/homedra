import { describe, expect, it } from 'vitest'
import { hexTint, seasonLook } from './season'

describe('seasonLook', () => {
  it('apple blossoms in May and June and is bare in January', () => {
    const may = seasonLook('cultivatedApple', 5)
    const jun = seasonLook('cultivatedApple', 6)
    const jan = seasonLook('cultivatedApple', 1)
    expect(may.blossom).toBe(true)
    expect(jun.blossom).toBe(true)
    expect(may.showLeaves).toBe(true)
    expect(may.fruit).toBe(false)
    expect(jan.showLeaves).toBe(false)
    expect(jan.blossom).toBe(false)
    expect(jan.fruit).toBe(false)
  })

  it('apple carries fruit in August–October', () => {
    expect(seasonLook('cultivatedApple', 8).fruit).toBe(true)
    expect(seasonLook('cultivatedApple', 10).fruit).toBe(true)
    expect(seasonLook('cultivatedApple', 7).fruit).toBe(false)
  })

  it('keeps spruce needles in January', () => {
    const jan = seasonLook('douglasFir', 1)
    expect(jan.showLeaves).toBe(true)
    expect(jan.blossom).toBe(false)
  })

  it('keeps Gold Rider gold in summer', () => {
    const jun = seasonLook('leylandGoldRider', 6)
    expect(jun.showLeaves).toBe(true)
    expect(jun.leafTint).toBe(0xe0d050)
    expect(jun.leafColor.toLowerCase()).toBe('#d4c038')
  })

  it('keeps Niedzwetzky foliage purple in June', () => {
    const jun = seasonLook('niedzwetzkyApple', 6)
    expect(jun.showLeaves).toBe(true)
    expect(jun.blossom).toBe(true)
    expect(jun.leafColor.toLowerCase()).toBe('#5a2040')
  })

  it('spirea blossoms in April–June', () => {
    const apr = seasonLook('spireaGrefsheim', 4)
    expect(apr.blossom).toBe(true)
    expect(apr.showLeaves).toBe(true)
    expect(seasonLook('spireaGrefsheim', 6).blossom).toBe(true)
    expect(seasonLook('spireaGrefsheim', 7).blossom).toBe(false)
  })

  it('tulip blooms in April and not in August', () => {
    const apr = seasonLook('gardenTulip', 4)
    const aug = seasonLook('gardenTulip', 8)
    expect(apr.blossom).toBe(true)
    expect(apr.showLeaves).toBe(true)
    expect(aug.blossom).toBe(false)
    expect(aug.showLeaves).toBe(false)
  })

  it('rowan can keep berries after leaf fall', () => {
    const nov = seasonLook('sorbusCommixta', 11)
    expect(nov.showLeaves).toBe(false)
    expect(nov.fruit).toBe(true)
  })

  it('clamps invalid months to the calendar', () => {
    expect(seasonLook('cultivatedApple', 0).showLeaves).toBe(
      seasonLook('cultivatedApple', 1).showLeaves,
    )
    expect(seasonLook('cultivatedApple', 99).blossom).toBe(
      seasonLook('cultivatedApple', 12).blossom,
    )
  })

  it('parses leaf hex into an EZ-Tree tint', () => {
    expect(hexTint('#d4c038')).toBe(0xd4c038)
  })

  it('keeps Pendula pear in silver leaf from April through November', () => {
    const jun = seasonLook('pyrusPendula', 6)
    expect(jun.showLeaves).toBe(true)
    expect(jun.blossom).toBe(false)
    expect(jun.leafColor.toLowerCase()).toBe('#c2d0c4')
    expect(seasonLook('pyrusPendula', 4).showLeaves).toBe(true)
    expect(seasonLook('pyrusPendula', 11).showLeaves).toBe(true)
    expect(seasonLook('pyrusPendula', 1).showLeaves).toBe(false)
  })
})
