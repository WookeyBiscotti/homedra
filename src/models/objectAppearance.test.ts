import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { MaterialRef } from '../engine/types'
import {
  appearanceHasOverrides,
  applyAppearanceToObject,
  listSceneMaterials,
  pruneAppearance,
  setAppearanceMaterial,
} from './objectAppearance'

function meshWithMat(name: string, color: string): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    name,
    color: new THREE.Color(color),
    roughness: 0.4,
    metalness: 0.1,
  })
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat)
}

describe('listSceneMaterials', () => {
  it('lists unique materials by name with PBR sample', () => {
    const root = new THREE.Group()
    root.add(meshWithMat('Wood', '#886644'))
    root.add(meshWithMat('Metal', '#888888'))
    const mats = listSceneMaterials(root)
    expect(mats.length).toBeGreaterThanOrEqual(2)
    expect(mats.some((m) => m.id === 'name:Wood')).toBe(true)
    expect(mats.find((m) => m.id === 'name:Wood')?.sample?.roughness).toBe(0.4)
  })
})

describe('applyAppearanceToObject', () => {
  it('tints materials globally', () => {
    const root = new THREE.Group()
    const mesh = meshWithMat('Seat', '#ffffff')
    root.add(mesh)
    applyAppearanceToObject(root, { tint: '#ff0000' })
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat.color.getHexString()).toBe('ff0000')
  })

  it('applies roughness and metalness', () => {
    const root = new THREE.Group()
    const mesh = meshWithMat('Seat', '#ffffff')
    root.add(mesh)
    applyAppearanceToObject(root, { roughness: 0.05, metalness: 0.9 })
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat.roughness).toBeCloseTo(0.05)
    expect(mat.metalness).toBeCloseTo(0.9)
  })

  it('applies per-slot tint over global', () => {
    const root = new THREE.Group()
    const a = meshWithMat('A', '#ffffff')
    const b = meshWithMat('B', '#ffffff')
    root.add(a, b)
    applyAppearanceToObject(root, {
      tint: '#0000ff',
      slots: { 'name:B': { tint: '#00ff00' } },
    })
    expect((a.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(
      '0000ff',
    )
    expect((b.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(
      '00ff00',
    )
  })

  it('restores original when appearance cleared', () => {
    const root = new THREE.Group()
    const mesh = meshWithMat('Seat', '#abcdef')
    root.add(mesh)
    applyAppearanceToObject(root, { tint: '#ff0000', roughness: 1 })
    applyAppearanceToObject(root, undefined)
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat.color.getHexString()).toBe('abcdef')
    expect(mat.roughness).toBeCloseTo(0.4)
  })

  it('applies albedo plus roughness, metalness, normal and AO maps', () => {
    const root = new THREE.Group()
    const mesh = meshWithMat('Seat', '#ff0000')
    root.add(mesh)
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255]), 1, 1)
    const roughnessMap = new THREE.DataTexture(new Uint8Array([80]), 1, 1)
    const metalnessMap = new THREE.DataTexture(new Uint8Array([200]), 1, 1)
    const normalMap = new THREE.DataTexture(new Uint8Array([128, 128, 255]), 1, 1)
    const aoMap = new THREE.DataTexture(new Uint8Array([180]), 1, 1)
    applyAppearanceToObject(
      root,
      { material: { source: 'ambientcg', assetId: 'Wood048', tileSizeM: 1.5 } },
      new Map([
        [
          'ambientcg:Wood048',
          { map, roughnessMap, metalnessMap, normalMap, aoMap },
        ],
      ]),
    )
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat.map).toBe(map)
    expect(mat.roughnessMap).toBe(roughnessMap)
    expect(mat.metalnessMap).toBe(metalnessMap)
    expect(mat.normalMap).toBe(normalMap)
    expect(mat.aoMap).toBe(aoMap)
    expect(mat.roughness).toBe(1)
    expect(mat.metalness).toBe(1)
    expect(mat.aoMapIntensity).toBe(1)
    expect(mat.color.getHexString()).toBe('ffffff')
  })

  it('upgrades MeshBasicMaterial so PBR channels can apply', () => {
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ name: 'Unlit', color: '#446688' }),
    )
    root.add(mesh)
    const map = new THREE.DataTexture(new Uint8Array([255, 0, 0]), 1, 1)
    const roughnessMap = new THREE.DataTexture(new Uint8Array([40]), 1, 1)
    applyAppearanceToObject(
      root,
      { material: { source: 'polyhaven', assetId: 'wood_floor', tileSizeM: 2 } },
      new Map([
        ['polyhaven:wood_floor', { map, roughnessMap }],
      ]),
    )
    const mat = mesh.material
    expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial)
    if (!(mat instanceof THREE.MeshStandardMaterial)) return
    expect(mat.map).toBe(map)
    expect(mat.roughnessMap).toBe(roughnessMap)
    expect(mat.roughness).toBe(1)
  })

  it('applies displacement map and scale', () => {
    const root = new THREE.Group()
    const mesh = meshWithMat('Stone', '#ffffff')
    root.add(mesh)
    const displacementMap = new THREE.DataTexture(new Uint8Array([128]), 1, 1)
    applyAppearanceToObject(
      root,
      { displacementScale: 0.04, material: { source: 'ambientcg', assetId: 'X', tileSizeM: 1 } },
      new Map([
        [
          'ambientcg:X',
          {
            map: new THREE.DataTexture(new Uint8Array([255, 255, 255]), 1, 1),
            displacementMap,
          },
        ],
      ]),
    )
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat.displacementMap).toBe(displacementMap)
    expect(mat.displacementScale).toBeCloseTo(0.04)
  })

  it('uses MaterialRef.displacementScale when the override has no scalar', () => {
    const root = new THREE.Group()
    const mesh = meshWithMat('Stone', '#ffffff')
    root.add(mesh)
    const displacementMap = new THREE.DataTexture(new Uint8Array([128]), 1, 1)
    applyAppearanceToObject(
      root,
      {
        material: {
          source: 'ambientcg',
          assetId: 'X',
          tileSizeM: 1,
          displacementScale: 0.08,
        },
      },
      new Map([
        [
          'ambientcg:X',
          {
            map: new THREE.DataTexture(new Uint8Array([255, 255, 255]), 1, 1),
            displacementMap,
          },
        ],
      ]),
    )
    expect(
      (mesh.material as THREE.MeshStandardMaterial).displacementScale,
    ).toBeCloseTo(0.08)
  })

  it('applies opacity and emissive', () => {
    const root = new THREE.Group()
    const mesh = meshWithMat('Glass', '#ffffff')
    root.add(mesh)
    applyAppearanceToObject(root, {
      opacity: 0.35,
      emissive: '#ff8800',
      emissiveIntensity: 1.5,
    })
    const mat = mesh.material as THREE.MeshStandardMaterial
    expect(mat.opacity).toBeCloseTo(0.35)
    expect(mat.transparent).toBe(true)
    expect(mat.emissive.getHexString()).toBe('ff8800')
    expect(mat.emissiveIntensity).toBeCloseTo(1.5)
  })
})

describe('pruneAppearance', () => {
  it('drops empty appearance', () => {
    expect(pruneAppearance({})).toBeUndefined()
    expect(pruneAppearance({ slots: {} })).toBeUndefined()
  })

  it('keeps PBR scalars', () => {
    const a = pruneAppearance({
      roughness: 0.2,
      metalness: 0.8,
      displacementScale: 0.04,
      slots: { 'name:X': {} },
    })
    expect(a?.roughness).toBe(0.2)
    expect(a?.metalness).toBe(0.8)
    expect(a?.displacementScale).toBe(0.04)
    expect(a?.slots).toBeUndefined()
  })
})

describe('setAppearanceMaterial', () => {
  const wood: MaterialRef = {
    source: 'ambientcg',
    assetId: 'Wood048',
    tileSizeM: 1.5,
  }

  it('sets a global texture and can clear it', () => {
    const withMat = setAppearanceMaterial(undefined, wood)
    expect(withMat?.material).toEqual(wood)
    expect(setAppearanceMaterial(withMat, null)).toBeUndefined()
  })

  it('sets a per-slot texture without dropping other overrides', () => {
    const next = setAppearanceMaterial(
      { roughness: 0.4, slots: { 'name:Seat': { tint: '#f00' } } },
      wood,
      'name:Seat',
    )
    expect(next?.roughness).toBe(0.4)
    expect(next?.slots?.['name:Seat']).toEqual({
      tint: '#f00',
      material: wood,
    })
  })
})

describe('appearanceHasOverrides', () => {
  it('detects PBR overrides', () => {
    expect(appearanceHasOverrides(undefined)).toBe(false)
    expect(appearanceHasOverrides({})).toBe(false)
    expect(appearanceHasOverrides({ roughness: 0.5 })).toBe(true)
    expect(appearanceHasOverrides({ displacementScale: 0.03 })).toBe(true)
    expect(appearanceHasOverrides({ tint: '#f00' })).toBe(true)
  })
})
