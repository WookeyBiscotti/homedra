import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  localGeometrySize,
  measuredSizeLooksPlausible,
  recoverExplodedInstance,
  worldSizeLooksExploded,
} from './modelSize'

describe('localGeometrySize', () => {
  it('reads geometry AABB and ignores a scaled parent', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2, 0.6))
    const group = new THREE.Group()
    group.scale.set(4, 4, 4)
    group.add(mesh)
    group.updateMatrixWorld(true)

    const baked = new THREE.Box3().setFromObject(mesh)
    expect(baked.max.x - baked.min.x).toBeCloseTo(3.2)

    const local = localGeometrySize(group)
    expect(local?.x).toBeCloseTo(0.8, 5)
    expect(local?.y).toBeCloseTo(2, 5)
    expect(local?.z).toBeCloseTo(0.6, 5)
  })

  it('skips pick helper meshes', () => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    const pick = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20))
    pick.userData.pickKind = 'object'
    const root = new THREE.Group()
    root.add(model)
    root.add(pick)
    expect(localGeometrySize(root)).toEqual({ x: 1, y: 1, z: 1 })
  })
})

describe('exploded world size', () => {
  it('flags huge baked AABBs', () => {
    expect(worldSizeLooksExploded({ x: 12, y: 1, z: 1 })).toBe(true)
    expect(worldSizeLooksExploded({ x: 0.9, y: 2, z: 0.9 })).toBe(false)
    expect(measuredSizeLooksPlausible({ x: 0.9, y: 2, z: 0.9 })).toBe(true)
    expect(measuredSizeLooksPlausible({ x: 40, y: 2, z: 0.9 })).toBe(false)
  })
})

describe('recoverExplodedInstance', () => {
  it('restores cm-authored scale when store scale was baked to 1', () => {
    const next = recoverExplodedInstance(
      {
        sizeX: 0.9,
        sizeY: 2.2,
        sizeZ: 0.9,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
      },
      { x: 90, y: 220, z: 90 },
    )
    expect(next?.scaleX).toBeCloseTo(0.01)
    expect(next?.scaleY).toBeCloseTo(0.01)
    expect(next?.scaleZ).toBeCloseTo(0.01)
    expect(next?.sizeX).toBe(90)
    expect(next?.sizeY).toBe(220)
    expect(next?.sizeZ).toBe(90)
  })

  it('restores 0.01 scale when size already matches a huge cm mesh', () => {
    const next = recoverExplodedInstance(
      {
        sizeX: 90,
        sizeY: 220,
        sizeZ: 90,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
      },
      { x: 90, y: 220, z: 90 },
    )
    expect(next?.scaleX).toBeCloseTo(0.01)
    expect(next?.sizeX).toBe(90)
  })

  it('leaves a healthy instance alone', () => {
    expect(
      recoverExplodedInstance(
        {
          sizeX: 90,
          sizeY: 220,
          sizeZ: 90,
          scaleX: 0.01,
          scaleY: 0.01,
          scaleZ: 0.01,
        },
        { x: 90, y: 220, z: 90 },
      ),
    ).toBeNull()
  })
})
