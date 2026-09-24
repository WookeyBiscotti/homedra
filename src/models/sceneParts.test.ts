import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { findPartRoots, listSceneParts } from './sceneParts'

function mesh(name: string) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  m.name = name
  return m
}

describe('listSceneParts', () => {
  it('returns empty for a single mesh', () => {
    const scene = new THREE.Group()
    scene.add(mesh('Only'))
    expect(listSceneParts(scene)).toEqual([])
  })

  it('finds top-level siblings', () => {
    const scene = new THREE.Group()
    scene.add(mesh('Chair'))
    scene.add(mesh('Table'))
    const parts = listSceneParts(scene)
    expect(parts.map((p) => p.label)).toEqual(['Chair', 'Table'])
  })

  it('unwraps a single wrapper group', () => {
    const scene = new THREE.Group()
    const root = new THREE.Group()
    root.name = 'Root'
    root.add(mesh('A'))
    root.add(mesh('B'))
    root.add(mesh('C'))
    scene.add(root)
    const parts = listSceneParts(scene)
    expect(parts).toHaveLength(3)
    expect(findPartRoots(scene).map((n) => n.name)).toEqual(['A', 'B', 'C'])
  })
})
