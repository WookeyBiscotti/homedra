import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  buildSceneTree,
  cloneSceneSelection,
  findPartRoots,
  listSceneParts,
  nameClusterKey,
  resolvePart,
} from './sceneParts'

function mesh(name: string, pos?: [number, number, number]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  m.name = name
  if (pos) m.position.set(...pos)
  return m
}

function group(name: string, ...kids: THREE.Object3D[]) {
  const g = new THREE.Group()
  g.name = name
  for (const k of kids) g.add(k)
  return g
}

describe('listSceneParts', () => {
  it('returns empty for a single mesh', () => {
    const scene = new THREE.Group()
    scene.add(mesh('Only'))
    expect(listSceneParts(scene)).toEqual([])
  })

  it('does not split adjacent meshes of one model', () => {
    const scene = new THREE.Group()
    const root = group('Chair', mesh('Leg'), mesh('Seat'), mesh('Back'))
    scene.add(root)
    expect(listSceneParts(scene)).toEqual([])
    expect(findPartRoots(scene)).toEqual([])
  })

  it('finds sibling container groups as parts', () => {
    const scene = new THREE.Group()
    scene.add(group('Chair', mesh('c')))
    scene.add(group('Table', mesh('t')))
    const parts = listSceneParts(scene)
    expect(parts.map((p) => p.label)).toEqual(['Chair', 'Table'])
    expect(parts.every((p) => p.id.startsWith('path:'))).toBe(true)
  })

  it('suggests window groups, not glass/frame children', () => {
    const scene = new THREE.Group()
    scene.add(
      group(
        'Pack',
        group('Window1', mesh('Frame1'), mesh('Glass1')),
        group('Window2', mesh('Frame2'), mesh('Glass2')),
      ),
    )
    const parts = listSceneParts(scene)
    expect(parts.map((p) => p.label)).toEqual(['Window1', 'Window2'])
  })

  it('unwraps a single wrapper to container groups', () => {
    const scene = new THREE.Group()
    const root = group(
      'Root',
      group('A', mesh('a')),
      group('B', mesh('b')),
      group('C', mesh('c')),
    )
    scene.add(root)
    const parts = listSceneParts(scene)
    expect(parts).toHaveLength(3)
    expect(findPartRoots(scene).map((n) => n.name)).toEqual(['A', 'B', 'C'])
  })

  it('does not explode a kit of dozens of mesh fragments', () => {
    const scene = new THREE.Group()
    const root = group('Root')
    for (const name of [
      'fixed',
      'fixed_lattice',
      'Jalousie_narrow_fincontrol',
      'Jalousie_narrow_frame',
      'Jalousie_narrow_fin1',
      'Jalousie_narrow_fin2',
      'Jalousie_wide_frame',
      'Jalousie_wide_fin1',
      'sliding_vertical_frame',
      'sliding_vertical_windowT',
      'sliding_vertical_windowB',
      'casement_frame',
      'casement_panelL',
      'casement_panelR',
      'casement_bridged_frame',
      'casement_bridged_panelL',
      'pivoting_panel',
      'pivoting_frame',
      'pivoting_lattice_window',
      'pivoting_lattice_panel',
    ]) {
      root.add(mesh(name))
    }
    scene.add(root)
    const parts = listSceneParts(scene)
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(parts.length).toBeLessThan(12)
    expect(parts.map((p) => p.label)).toEqual(
      expect.arrayContaining([
        'fixed',
        'Jalousie_narrow',
        'Jalousie_wide',
        'sliding_vertical',
        'casement',
        'casement_bridged',
        'pivoting',
        'pivoting_lattice',
      ]),
    )
    expect(parts.some((p) => p.label.includes('fin1'))).toBe(false)
  })
})

describe('nameClusterKey', () => {
  it('groups fins under the window type prefix', () => {
    const names = [
      'Jalousie_narrow_fin1',
      'Jalousie_narrow_frame',
      'Jalousie_wide_fin1',
      'Jalousie_wide_frame',
      'fixed',
      'fixed_lattice',
    ]
    expect(nameClusterKey('Jalousie_narrow_fin1', names)).toBe(
      'Jalousie_narrow',
    )
    expect(nameClusterKey('fixed_lattice', names)).toBe('fixed')
    expect(nameClusterKey('Jalousie_wide_fin1', names)).toBe('Jalousie_wide')
  })
})

describe('buildSceneTree + resolvePart', () => {
  it('builds a path tree and resolves intermediate nodes', () => {
    const scene = new THREE.Group()
    scene.add(
      group(
        'Pack',
        group('Window1', mesh('Frame1'), mesh('Glass1')),
        group('Window2', mesh('Frame2'), mesh('Glass2')),
      ),
    )
    const tree = buildSceneTree(scene)
    expect(tree).toHaveLength(1)
    expect(tree[0]!.label).toBe('Pack')
    expect(tree[0]!.children.map((c) => c.label)).toEqual([
      'Window1',
      'Window2',
    ])
    expect(tree[0]!.children[0]!.children.map((c) => c.label)).toEqual([
      'Frame1',
      'Glass1',
    ])

    const w1 = tree[0]!.children[0]!
    const resolved = resolvePart(scene, w1.id)
    expect(resolved?.name).toBe('Window1')

    const glass = w1.children[1]!
    expect(resolvePart(scene, glass.id)?.name).toBe('Glass1')
  })

  it('clusters flat kit siblings and clones a prefix as one object', () => {
    const scene = new THREE.Group()
    const root = group(
      'Root',
      mesh('Jalousie_narrow_frame'),
      mesh('Jalousie_narrow_fin1'),
      mesh('Jalousie_narrow_fin2'),
      mesh('casement_frame'),
      mesh('casement_panelL'),
    )
    scene.add(root)
    const tree = buildSceneTree(scene)
    const layer = tree[0]!.children
    expect(layer.map((c) => c.label).sort()).toEqual([
      'Jalousie_narrow',
      'casement',
    ])
    const jal = layer.find((c) => c.label === 'Jalousie_narrow')!
    expect(jal.id.startsWith('cluster:')).toBe(true)
    const clone = cloneSceneSelection(scene, jal.id)
    const names: string[] = []
    clone.traverse((c) => {
      if ((c as THREE.Mesh).isMesh && c.name.startsWith('Jalousie_narrow')) {
        names.push(c.name)
      }
    })
    expect(names.sort()).toEqual([
      'Jalousie_narrow_fin1',
      'Jalousie_narrow_fin2',
      'Jalousie_narrow_frame',
    ])
  })
})
