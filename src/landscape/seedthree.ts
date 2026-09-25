/**
 * Garden plant generator.
 * Habit-specific grow paths: spruce, pine, thuja, orchard, shrub, flower.
 */
import * as THREE from 'three'
import { applyFoliageWind } from './foliageWind'
import {
  leafAlbedoTexture,
  makeBlossomGeometry,
  makePetalGeometry,
  sharedLeafGeometry,
} from './leafMesh'
import {
  crownRadius,
  plantShapeCacheKey,
  resolvePlantShape,
} from './plantShape'
import { growEzTree } from './eztree'
import { habitRecipe } from './habit'
import {
  listSpecies,
  speciesByKey,
  type LeafKind,
  type SpeciesDef,
} from './species'
import type { PlantShape } from '../engine/types'

export { listSpecies, speciesByKey }
export type { SpeciesDef }

const cache = new Map<string, THREE.Group>()
const fruitGeo = new THREE.SphereGeometry(1, 10, 8)
const coneGeo = new THREE.SphereGeometry(1, 8, 6)
const blossomCard = makeBlossomGeometry()
const petalCard = makePetalGeometry()

function mulberry(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function deg(n: number): number {
  return (n * Math.PI) / 180
}

function barkMat(color: string, roughness = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
  })
}

function leafMat(
  color: string,
  kind: LeafKind,
  alphaTest: number,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: leafAlbedoTexture(kind),
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest,
  })
  mat.defines = { ...mat.defines, USE_UV: '' }
  return applyFoliageWind(mat)
}

function bloomMat(color: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.52,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  return applyFoliageWind(mat)
}

function radius(h: number, ratio: number, min: number): number {
  return Math.max(min, h * ratio)
}

function leafAspect(kind: LeafKind): { sx: number; sy: number } {
  switch (kind) {
    case 'needle':
      return { sx: 0.38, sy: 1.15 }
    case 'spray':
      return { sx: 0.95, sy: 1.05 }
    case 'scale':
      return { sx: 0.72, sy: 1.05 }
    case 'lance':
      return { sx: 0.32, sy: 1.2 }
    case 'heart':
      return { sx: 0.82, sy: 0.95 }
    case 'petal':
      return { sx: 1, sy: 1 }
    default:
      return { sx: 0.72, sy: 1 }
  }
}

/** Limb that pivots at its base so tilt never lifts the joint off the parent. */
function addLimb(
  parent: THREE.Object3D,
  mat: THREE.Material,
  length: number,
  r0: number,
  r1: number,
  opts?: { y0?: number; tilt?: number; yaw?: number; segs?: number },
): THREE.Group {
  const len = Math.max(0.08, length)
  const geo = new THREE.CylinderGeometry(
    Math.max(0.01, r1),
    Math.max(0.012, r0),
    len,
    opts?.segs ?? 10,
  )
  const mesh = new THREE.Mesh(geo, mat)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = false
  mesh.position.y = len / 2
  const pivot = new THREE.Group()
  pivot.position.y = opts?.y0 ?? 0
  pivot.rotation.order = 'YZX'
  pivot.rotation.y = opts?.yaw ?? 0
  pivot.rotation.z = opts?.tilt ?? 0
  pivot.add(mesh)
  parent.add(pivot)
  return pivot
}

/** Multi-segment limb: S-curve, loaded bow, tip lift. */
function addLimbChain(
  parent: THREE.Object3D,
  mat: THREE.Material,
  length: number,
  r0: number,
  r1: number,
  opts: {
    y0?: number
    tilt?: number
    yaw?: number
    segments?: number
    curve?: number
    curveBack?: number
    tipLift?: number
  },
): { root: THREE.Group; tip: THREE.Group } {
  const segs = Math.max(1, opts.segments ?? 1)
  const len = Math.max(0.12, length)
  const segLen = len / segs
  let node: THREE.Object3D = parent
  let root: THREE.Group | null = null
  let tip = parent as THREE.Group
  for (let s = 0; s < segs; s++) {
    const t = segs === 1 ? 0 : s / (segs - 1)
    let extra = 0
    if (s === 1) extra = (opts.curve ?? 0) + (opts.curveBack ?? 0)
    else if (s >= 2) extra = opts.tipLift ?? 0
    const rad0 = r0 * (1 - t * 0.42)
    const rad1 = r1 * (1 - t * 0.28)
    tip = addLimb(node, mat, segLen, rad0, rad1, {
      y0: s === 0 ? (opts.y0 ?? 0) : segLen * 0.98,
      tilt: s === 0 ? (opts.tilt ?? 0) : extra,
      yaw: s === 0 ? (opts.yaw ?? 0) : 0,
    })
    if (!root) root = tip
    node = tip
  }
  return { root: root!, tip }
}

function addLeafCard(
  group: THREE.Object3D,
  mat: THREE.Material,
  kind: LeafKind,
  x: number,
  y: number,
  z: number,
  s: number,
  yaw: number,
  pitch: number,
): void {
  const aspect = leafAspect(kind)
  const mesh = new THREE.Mesh(sharedLeafGeometry(kind), mat)
  mesh.castShadow = true
  mesh.frustumCulled = false
  mesh.userData.foliage = true
  mesh.position.set(x, y, z)
  mesh.scale.set(s * aspect.sx, s * aspect.sy, 1)
  mesh.rotation.set(pitch, yaw, (Math.random() - 0.5) * 0.35)
  group.add(mesh)
}

function addFruit(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  r: number,
): void {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(fruitGeo, mat)
  mesh.castShadow = true
  mesh.frustumCulled = false
  mesh.position.set(x, y, z)
  mesh.scale.setScalar(r)
  parent.add(mesh)
}

function addCone(
  parent: THREE.Object3D,
  color: string,
  x: number,
  y: number,
  z: number,
  r: number,
  long: number,
): void {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(coneGeo, mat)
  mesh.castShadow = true
  mesh.frustumCulled = false
  mesh.position.set(x, y, z)
  mesh.scale.set(r, long, r)
  mesh.rotation.z = 0.15
  parent.add(mesh)
}

function addBlossomCard(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  s: number,
  yaw: number,
): void {
  const mesh = new THREE.Mesh(blossomCard, mat)
  mesh.castShadow = true
  mesh.frustumCulled = false
  mesh.userData.foliage = true
  mesh.position.set(x, y, z)
  mesh.scale.setScalar(s)
  mesh.rotation.set(0.35 + Math.random() * 0.4, yaw, (Math.random() - 0.5) * 0.3)
  parent.add(mesh)
}

/** Layered 3D bloom: rose / peony / tulip cup. */
function addPetalBloom(
  parent: THREE.Object3D,
  petal: THREE.Material,
  center: THREE.Material | null,
  y: number,
  scale: number,
  layers: number,
  perLayer: number,
  cup: number,
): void {
  const bloom = new THREE.Group()
  bloom.position.y = y
  parent.add(bloom)
  for (let layer = 0; layer < layers; layer++) {
    const n = perLayer + layer
    const open = cup + layer * 0.18
    const s = scale * (1 - layer * 0.12)
    for (let i = 0; i < n; i++) {
      const mesh = new THREE.Mesh(petalCard, petal)
      mesh.castShadow = true
      mesh.frustumCulled = false
      mesh.userData.foliage = true
      mesh.rotation.order = 'YZX'
      mesh.rotation.y = (i / n) * Math.PI * 2 + layer * 0.22
      mesh.rotation.z = open
      mesh.position.set(0, layer * scale * 0.08, 0)
      mesh.scale.set(s * 0.55, s, 1)
      bloom.add(mesh)
    }
  }
  if (center) {
    const eye = new THREE.Mesh(fruitGeo, center)
    eye.position.y = scale * 0.12
    eye.scale.setScalar(scale * 0.12)
    bloom.add(eye)
  }
}

function dressBranch(
  br: THREE.Object3D,
  sp: SpeciesDef,
  shape: PlantShape,
  rng: () => number,
  len: number,
  leafA: THREE.Material,
  leafB: THREE.Material,
  leafAlong: number,
  fruit: false | 'apple' | 'cherry',
  blossom: boolean,
  bloom: THREE.Material | null,
): void {
  if (!shape.showLeaves) return
  const kind = sp.leafKind
  const pitch = deg(shape.leafAngle)
  const leafN = Math.max(
    0,
    Math.round(
      shape.leavesPerBranch * (1.15 + len * 0.6) * (0.82 + rng() * 0.36),
    ),
  )
  for (let k = 0; k < leafN; k++) {
    const along =
      1 - rng() * Math.max(0.12, leafAlong) * (1 - shape.leafStart)
    const s =
      shape.leafSize *
      (1 + (rng() - 0.5) * 2 * shape.leafSizeVar) *
      (sp.kind === 'shrub' ? 1.1 : 1)
    const radial = len * (0.08 + (1 - leafAlong) * 0.06 + rng() * 0.16)
    addLeafCard(
      br,
      rng() > 0.28 ? leafA : leafB,
      kind,
      (rng() - 0.5) * radial,
      along * len,
      (rng() - 0.5) * radial,
      s,
      rng() * Math.PI,
      pitch + (rng() - 0.5) * 0.25,
    )
  }
  if (blossom && bloom && rng() > 0.28) {
    const bunches = 1 + Math.floor(rng() * 2)
    for (let i = 0; i < bunches; i++) {
      addBlossomCard(
        br,
        bloom,
        (rng() - 0.5) * 0.1,
        len * (0.62 + rng() * 0.32),
        (rng() - 0.5) * 0.1,
        0.1 + rng() * 0.05,
        rng() * Math.PI,
      )
    }
  }
  if (fruit && rng() > 0.28) {
    const n = fruit === 'apple' ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3)
    for (let i = 0; i < n; i++) {
      addFruit(
        br,
        sp.fruitColor,
        (rng() - 0.5) * 0.14,
        len * (0.5 + rng() * 0.4),
        (rng() - 0.5) * 0.14,
        fruit === 'apple' ? 0.048 + rng() * 0.018 : 0.022 + rng() * 0.01,
      )
    }
  }
}

function growBroadleaf(
  sp: SpeciesDef,
  rng: () => number,
  shape: PlantShape,
): THREE.Group {
  const g = new THREE.Group()
  const rec = habitRecipe(sp.habit)
  const h = shape.height * (0.88 + rng() * 0.15)
  const bark = barkMat(sp.trunkColor, rec.barkRough)
  const leafA = leafMat(sp.leafColor, sp.leafKind, shape.leafAlpha)
  const leafB = leafMat(sp.leafColor2, sp.leafKind, shape.leafAlpha)
  const bloom = rec.blossom ? bloomMat(sp.flowerColor) : null
  const thick = shape.trunkThickness * rec.thin
  const rTrunk = radius(h, 0.036 * thick, rec.thin < 0.6 ? 0.028 : 0.048)
  const bole = Math.max(rec.bole, shape.leafStart * 0.85)
  const leader = rec.decurrent ? h * Math.min(0.55, bole + 0.16) : h
  addLimb(
    g,
    bark,
    leader,
    rTrunk * (1 + rec.flare * 0.22),
    rTrunk * (rec.decurrent ? 0.55 : 0.26),
  )

  const extra = Math.max(0, Math.round(shape.trunks) - 1)
  const forks = rec.fork ? Math.max(1, extra) : extra
  for (let t = 0; t < forks; t++) {
    addLimb(
      g,
      bark,
      h * (rec.decurrent ? 0.42 : 0.55) * (0.85 + rng() * 0.2),
      rTrunk * 0.72,
      rTrunk * 0.22,
      {
        y0: rec.fork ? leader * (0.18 + rng() * 0.08) : 0,
        tilt: 0.18 + rng() * 0.2,
        yaw: (t / Math.max(1, forks)) * Math.PI * 2 + rng() * 0.35,
      },
    )
  }

  const levels = Math.max(2, Math.min(4, Math.round(shape.levels)))
  const branches = Math.max(2, Math.min(45, Math.round(shape.branchDensity)))
  const tilt0 = deg(shape.branchAngle)
  const gnarl = shape.gnarliness / 120
  for (let i = 0; i < branches; i++) {
    const pair = rec.opposite
      ? Math.floor(i / 2) / Math.max(1, Math.ceil(branches / 2) - 1)
      : i / Math.max(1, branches - 1)
    const t = bole + pair * (0.92 - bole)
    const yaw = rec.opposite
      ? Math.floor(i / 2) * rec.rotate + (i % 2) * Math.PI
      : i * rec.rotate + rng() * 0.35
    const spread = crownRadius(shape.crownShape, t)
    const len = Math.max(
      0.35,
      h *
        rec.branchLen *
        (0.82 + rng() * 0.28) *
        (0.45 + spread) *
        (rec.highCrown ? 0.7 + (1 - t) * 0.2 : 1.12 - t * 0.22),
    )
    let tilt = tilt0 * (0.82 + rng() * 0.24) + (rng() - 0.5) * gnarl * 0.55
    tilt -= rec.tipLift * 0.28 * t
    tilt = THREE.MathUtils.clamp(tilt, deg(14), deg(104))
    const r0 = radius(h, 0.016 * thick * (1.08 - t), rec.thin < 0.6 ? 0.014 : 0.02)
    const br = addLimbChain(g, bark, len, r0, r0 * 0.36, {
      y0: (rec.decurrent ? leader : h) * t,
      tilt,
      yaw,
      segments: rec.segments,
      curve: rec.curve * (0.7 + gnarl),
      curveBack: rec.curveBack,
      tipLift: -rec.tipLift * 0.45 + rec.droop,
    })
    dressBranch(
      br.root,
      sp,
      shape,
      rng,
      len,
      leafA,
      leafB,
      rec.leafAlong,
      rec.fruit,
      rec.blossom,
      bloom,
    )
    dressBranch(
      br.tip,
      sp,
      shape,
      rng,
      len / rec.segments,
      leafA,
      leafB,
      rec.leafAlong,
      rec.fruit,
      rec.blossom,
      bloom,
    )
    const twLen = Math.max(0.28, len * rec.twigLen * (1.15 + rng() * 0.35))
    if (levels > 2) {
      const tw = addLimb(br.tip, bark, twLen, r0 * 0.48, r0 * 0.2, {
        y0: (len / rec.segments) * 0.62,
        tilt: 0.28 + gnarl * 0.25 + rec.droop * 0.4,
        yaw: rng() * Math.PI,
      })
      dressBranch(tw, sp, shape, rng, twLen, leafA, leafB, rec.leafAlong, rec.fruit, rec.blossom, bloom)
    }
    if (levels > 3) {
      const tw2 = addLimb(br.root, bark, len * rec.twigLen * 0.8, r0 * 0.38, r0 * 0.16, {
        y0: (len / rec.segments) * 0.42,
        tilt: 0.4 + rng() * 0.2,
        yaw: 1.1 + rng(),
      })
      dressBranch(
        tw2,
        sp,
        shape,
        rng,
        len * rec.twigLen * 0.8,
        leafA,
        leafB,
        rec.leafAlong,
        rec.fruit,
        rec.blossom,
        bloom,
      )
      if (rng() > 0.4) {
        const tw3 = addLimb(br.tip, bark, twLen * 0.65, r0 * 0.28, r0 * 0.12, {
          y0: (len / rec.segments) * 0.35,
          tilt: 0.5,
          yaw: rng() * Math.PI * 2,
        })
        dressBranch(
          tw3,
          sp,
          shape,
          rng,
          twLen * 0.65,
          leafA,
          leafB,
          rec.leafAlong,
          rec.fruit,
          rec.blossom,
          bloom,
        )
      }
    }
  }
  return g
}

function growSpruce(
  sp: SpeciesDef,
  rng: () => number,
  shape: PlantShape,
): THREE.Group {
  const g = new THREE.Group()
  const rec = habitRecipe('spruce')
  const h = shape.height * (0.9 + rng() * 0.1)
  const bark = barkMat(sp.trunkColor, rec.barkRough)
  const leaf = leafMat(sp.leafColor, 'spray', shape.leafAlpha)
  const leafB = leafMat(sp.leafColor2, 'spray', shape.leafAlpha)
  const thick = shape.trunkThickness
  const rTrunk = radius(h, 0.028 * thick, 0.045)
  addLimb(g, bark, h, rTrunk * 1.12, rTrunk * 0.14)
  const start = Math.max(0.06, shape.leafStart)
  const rings = 10 + Math.round(shape.levels) * 2
  const perRing = Math.max(5, Math.round(shape.branchDensity / 5))
  const tilt0 = THREE.MathUtils.clamp(deg(shape.branchAngle), deg(62), deg(92))
  const pitch = deg(shape.leafAngle)
  for (let r = 0; r < rings; r++) {
    const t = start + (r / rings) * (0.94 - start)
    const spread = Math.max(
      0.22,
      h * 0.2 * crownRadius(shape.crownShape, t) + 0.1,
    )
    const r0 = radius(h, 0.009 * thick * (1.08 - t), 0.016)
    for (let i = 0; i < perRing; i++) {
      const yaw = (i / perRing) * Math.PI * 2 + r * 0.19 + rng() * 0.1
      const br = addLimbChain(g, bark, spread, r0, r0 * 0.28, {
        y0: h * t,
        tilt: tilt0,
        yaw,
        segments: 2,
        curve: 0,
        curveBack: rec.droop,
        tipLift: 0.2,
      })
      if (shape.showLeaves) {
        const n = Math.max(3, Math.round(shape.leavesPerBranch * 0.42))
        for (let k = 0; k < n; k++) {
          addLeafCard(
            br.root,
            rng() > 0.3 ? leaf : leafB,
            'spray',
            (rng() - 0.5) * 0.06,
            spread * (0.08 + (k / n) * 0.82),
            0.02,
            spread * shape.leafSize * 0.72,
            yaw + (rng() - 0.5) * 0.35,
            pitch,
          )
        }
      }
      if (r > rings * 0.35 && rng() > 0.72) {
        addCone(
          br.tip,
          sp.fruitColor,
          0,
          spread * 0.12,
          0.02,
          0.028 + rng() * 0.01,
          0.07 + rng() * 0.02,
        )
      }
    }
  }
  return g
}

function growPine(
  sp: SpeciesDef,
  rng: () => number,
  shape: PlantShape,
): THREE.Group {
  const g = new THREE.Group()
  const rec = habitRecipe('pine')
  const h = shape.height * (0.88 + rng() * 0.14)
  const bark = barkMat(sp.trunkColor, rec.barkRough)
  const needles = leafMat(sp.leafColor, 'needle', shape.leafAlpha)
  const needlesB = leafMat(sp.leafColor2, 'needle', shape.leafAlpha)
  const thick = shape.trunkThickness
  const rTrunk = radius(h, 0.034 * thick, 0.06)
  addLimb(g, bark, h, rTrunk * 1.22, rTrunk * 0.2)
  const start = Math.max(0.18, shape.leafStart)
  const rings = 6 + Math.round(shape.levels)
  const perRing = Math.max(3, Math.round(shape.branchDensity / 6))
  const tilt0 = THREE.MathUtils.clamp(deg(shape.branchAngle), deg(48), deg(82))
  const pitch = deg(shape.leafAngle)
  for (let r = 0; r < rings; r++) {
    const t = start + (r / rings) * (0.9 - start)
    const spread = Math.max(
      0.35,
      h * 0.26 * crownRadius(shape.crownShape, t) * (0.85 + rng() * 0.3) + 0.16,
    )
    const r0 = radius(h, 0.012 * thick * (1.1 - t), 0.02)
    const count = r < 2 ? perRing - 1 : perRing
    for (let i = 0; i < count; i++) {
      const yaw = (i / Math.max(1, count)) * Math.PI * 2 + r * 0.31 + rng() * 0.28
      const br = addLimbChain(g, bark, spread, r0, r0 * 0.3, {
        y0: h * t,
        tilt: tilt0 + (rng() - 0.5) * 0.22,
        yaw,
        segments: 3,
        curve: rec.curve,
        curveBack: rec.curveBack,
        tipLift: -0.12,
      })
      const twig = addLimb(br.tip, bark, spread * 0.38, r0 * 0.28, r0 * 0.12, {
        y0: (spread / 3) * 0.7,
        tilt: 0.35 + rng() * 0.25,
        yaw: rng() * Math.PI,
      })
      if (shape.showLeaves) {
        const tufts = 4 + Math.round(shape.leavesPerBranch * 0.45)
        for (let k = 0; k < tufts; k++) {
          const along = 0.35 + (k / tufts) * 0.6
          addLeafCard(
            br.root,
            rng() > 0.25 ? needles : needlesB,
            'needle',
            (rng() - 0.5) * 0.08,
            spread * along,
            (rng() - 0.5) * 0.08,
            shape.leafSize * (0.55 + rng() * 0.2),
            rng() * Math.PI,
            pitch + (rng() - 0.5) * 0.35,
          )
        }
        for (let k = 0; k < 3; k++) {
          addLeafCard(
            twig,
            needles,
            'needle',
            (rng() - 0.5) * 0.05,
            spread * 0.2 * k,
            0,
            shape.leafSize * 0.5,
            rng() * Math.PI,
            pitch,
          )
        }
      }
      if (rng() > 0.45) {
        addCone(
          br.tip,
          sp.fruitColor,
          0.02,
          0.04,
          0.04,
          0.04 + rng() * 0.015,
          0.1 + rng() * 0.03,
        )
      }
    }
  }
  return g
}

function growThuja(
  sp: SpeciesDef,
  rng: () => number,
  shape: PlantShape,
): THREE.Group {
  const g = new THREE.Group()
  const h = shape.height * (0.92 + rng() * 0.1)
  const bark = barkMat(sp.trunkColor, 0.78)
  const fan = leafMat(sp.leafColor, 'scale', shape.leafAlpha)
  const fanB = leafMat(sp.leafColor2, 'scale', shape.leafAlpha)
  const rTrunk = radius(h, 0.022 * shape.trunkThickness, 0.028)
  addLimb(g, bark, h, rTrunk * 1.05, rTrunk * 0.18)
  const rings = 12 + Math.round(shape.levels) * 2
  const perRing = Math.max(6, Math.round(shape.branchDensity / 4))
  const tilt0 = THREE.MathUtils.clamp(deg(shape.branchAngle), deg(12), deg(42))
  for (let r = 0; r < rings; r++) {
    const t = 0.03 + (r / rings) * 0.94
    const spread = Math.max(
      0.12,
      h * 0.16 * crownRadius(shape.crownShape, t) + 0.06,
    )
    const r0 = radius(h, 0.006 * (1.05 - t), 0.01)
    for (let i = 0; i < perRing; i++) {
      const yaw = (i / perRing) * Math.PI * 2 + r * 0.16
      const br = addLimb(g, bark, spread, r0, r0 * 0.4, {
        y0: h * t,
        tilt: tilt0 + (rng() - 0.5) * 0.08,
        yaw,
        segs: 6,
      })
      if (!shape.showLeaves) continue
      const fans = 2 + Math.floor(shape.leavesPerBranch * 0.22)
      for (let k = 0; k < fans; k++) {
        addLeafCard(
          br,
          rng() > 0.35 ? fan : fanB,
          'scale',
          0,
          spread * (0.15 + (k / fans) * 0.8),
          0,
          spread * shape.leafSize * 1.15,
          yaw + (k % 2) * 1.2,
          0.08 + rng() * 0.12,
        )
      }
    }
  }
  return g
}

function addLilacPanicle(
  parent: THREE.Object3D,
  bloom: THREE.Material,
  y: number,
  scale: number,
  rng: () => number,
): void {
  const n = 14 + Math.floor(rng() * 8)
  for (let i = 0; i < n; i++) {
    const t = i / n
    addBlossomCard(
      parent,
      bloom,
      (rng() - 0.5) * scale * 0.35,
      y + t * scale * 0.85,
      (rng() - 0.5) * scale * 0.35,
      scale * 0.16 * (1 - t * 0.35),
      rng() * Math.PI,
    )
  }
}

function addHydrangeaHead(
  parent: THREE.Object3D,
  bloom: THREE.Material,
  y: number,
  scale: number,
  rng: () => number,
): void {
  const n = 16 + Math.floor(rng() * 8)
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2
    const b = rng() * Math.PI
    const r = scale * 0.28 * Math.sqrt(rng())
    addBlossomCard(
      parent,
      bloom,
      Math.cos(a) * Math.sin(b) * r,
      y + Math.cos(b) * r,
      Math.sin(a) * Math.sin(b) * r,
      scale * 0.14,
      a,
    )
  }
}

function growShrub(
  sp: SpeciesDef,
  rng: () => number,
  shape: PlantShape,
): THREE.Group {
  const g = new THREE.Group()
  const rec = habitRecipe('shrub')
  const h = shape.height * (0.88 + rng() * 0.18)
  const bark = barkMat(sp.trunkColor, rec.barkRough)
  const leafA = leafMat(sp.leafColor, sp.leafKind, shape.leafAlpha)
  const leafB = leafMat(sp.leafColor2, sp.leafKind, shape.leafAlpha)
  const bloom = bloomMat(sp.flowerColor)
  const stems = Math.max(4, Math.round(shape.trunks) + 2)
  const r0 = 0.016 * shape.trunkThickness
  const lilac = sp.key === 'lilacBush'
  for (let i = 0; i < stems; i++) {
    const yaw = (i / stems) * Math.PI * 2 + rng() * 0.25
    const tilt = deg(14 + rng() * shape.branchAngle)
    const len = h * (0.7 + rng() * 0.3)
    const stem = addLimb(g, bark, len, r0, r0 * 0.5, { tilt, yaw, segs: 8 })
    const forks = 2 + Math.floor(rng() * 2)
    for (let f = 0; f < forks; f++) {
      const twLen = len * (0.4 + rng() * 0.22)
      const tw = addLimb(stem, bark, twLen, r0 * 0.55, r0 * 0.28, {
        y0: len * (0.38 + rng() * 0.4),
        tilt: 0.32 + rng() * 0.35,
        yaw: rng() * Math.PI * 2,
        segs: 6,
      })
      dressBranch(tw, sp, shape, rng, twLen, leafA, leafB, 0.75, false, false, null)
      if (shape.showLeaves) {
        if (lilac) addLilacPanicle(tw, bloom, twLen * 0.85, 0.28 + rng() * 0.08, rng)
        else addHydrangeaHead(tw, bloom, twLen * 0.9, 0.32 + rng() * 0.08, rng)
      }
    }
    dressBranch(stem, sp, shape, rng, len, leafA, leafB, 0.7, false, false, null)
  }
  return g
}

function addRoseLeaf(
  parent: THREE.Object3D,
  mat: THREE.Material,
  y: number,
  s: number,
  yaw: number,
): void {
  for (let i = -1; i <= 1; i++) {
    addLeafCard(parent, mat, 'ovate', i * s * 0.28, y, 0, s * (i === 0 ? 1 : 0.72), yaw + i * 0.4, 0.35)
  }
}

function growFlower(
  sp: SpeciesDef,
  rng: () => number,
  shape: PlantShape,
): THREE.Group {
  const g = new THREE.Group()
  const h = shape.height * (0.9 + rng() * 0.14)
  const stemMat = barkMat(sp.trunkColor, 0.7)
  const leaf = leafMat(sp.leafColor, sp.leafKind, shape.leafAlpha)
  const petal = bloomMat(sp.flowerColor)
  const eye = new THREE.MeshStandardMaterial({
    color: sp.fruitColor,
    roughness: 0.45,
    metalness: 0,
  })

  if (sp.key === 'gardenTulip') {
    const stem = addLimb(g, stemMat, h, 0.008, 0.006, { segs: 6 })
    const leaves = 2 + Math.floor(rng() * 2)
    for (let i = 0; i < leaves; i++) {
      addLeafCard(
        g,
        leaf,
        'lance',
        0,
        h * (0.08 + i * 0.08),
        0,
        h * 0.85,
        (i / leaves) * Math.PI * 2 + rng() * 0.3,
        0.85 + rng() * 0.2,
      )
    }
    addPetalBloom(stem, petal, eye, h * 0.92, h * 0.38, 1, 6, 0.55)
    return g
  }

  if (sp.key === 'gardenPeony') {
    const stems = Math.max(2, Math.round(shape.trunks))
    for (let i = 0; i < stems; i++) {
      const yaw = (i / stems) * Math.PI * 2 + rng() * 0.4
      const tilt = 0.08 + rng() * 0.18
      const len = h * (0.75 + rng() * 0.25)
      const stem = addLimb(g, stemMat, len, 0.01, 0.006, { tilt, yaw, segs: 6 })
      for (let k = 0; k < 4; k++) {
        addLeafCard(
          stem,
          leaf,
          'ovate',
          (rng() - 0.5) * 0.08,
          len * (0.2 + k * 0.16),
          0,
          0.22 + rng() * 0.06,
          yaw + k,
          0.55,
        )
      }
      addPetalBloom(stem, petal, eye, len * 0.95, 0.2 + rng() * 0.04, 3, 7, 0.72)
    }
    return g
  }

  const canes = Math.max(3, Math.round(shape.trunks) + 1)
  for (let i = 0; i < canes; i++) {
    const yaw = (i / canes) * Math.PI * 2 + rng() * 0.3
    const tilt = 0.12 + rng() * 0.28
    const len = h * (0.7 + rng() * 0.3)
    const cane = addLimb(g, stemMat, len, 0.011, 0.006, { tilt, yaw, segs: 6 })
    const laterals = 1 + Math.floor(rng() * 2)
    for (let f = 0; f < laterals; f++) {
      const twLen = len * 0.35
      const tw = addLimb(cane, stemMat, twLen, 0.007, 0.004, {
        y0: len * (0.4 + rng() * 0.35),
        tilt: 0.4 + rng() * 0.3,
        yaw: rng() * Math.PI * 2,
        segs: 5,
      })
      addRoseLeaf(tw, leaf, twLen * 0.45, 0.16, rng() * Math.PI)
      addPetalBloom(tw, petal, eye, twLen * 0.95, 0.14 + rng() * 0.03, 2, 6, 0.85)
    }
    addRoseLeaf(cane, leaf, len * 0.45, 0.18, yaw)
    addRoseLeaf(cane, leaf, len * 0.7, 0.16, yaw + 0.8)
    addPetalBloom(cane, petal, eye, len * 0.96, 0.16 + rng() * 0.03, 2, 7, 0.82)
  }
  return g
}

export function growPlant(
  species: string,
  seed: number,
  shape?: Partial<PlantShape> | null,
): THREE.Group {
  const resolved = resolvePlantShape(species, shape)
  const key = `habit5:${species}:${seed}:${plantShapeCacheKey(resolved)}`
  const hit = cache.get(key)
  if (hit) return hit.clone(true)

  const sp = speciesByKey(species)
  if (sp.eztreePreset) {
    return growEzTree(sp.eztreePreset, sp.key, seed, resolved)
  }
  const rng = mulberry(seed * 997 + species.length * 13)
  let group: THREE.Group
  switch (sp.habit) {
    case 'spruce':
      group = growSpruce(sp, rng, resolved)
      break
    case 'pine':
      group = growPine(sp, rng, resolved)
      break
    case 'thuja':
      group = growThuja(sp, rng, resolved)
      break
    case 'shrub':
      group = growShrub(sp, rng, resolved)
      break
    case 'flower':
      group = growFlower(sp, rng, resolved)
      break
    default:
      group = growBroadleaf(sp, rng, resolved)
  }
  group.name = `seedthree:${sp.key}`
  group.frustumCulled = false
  group.updateMatrixWorld(true)
  cache.set(key, group)
  return group.clone(true)
}
