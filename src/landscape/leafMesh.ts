import * as THREE from 'three'
import type { LeafKind } from './species'

function remapLeafUvs(geo: THREE.BufferGeometry): void {
  const pos = geo.getAttribute('position')
  let uv = geo.getAttribute('uv')
  if (!pos) return
  if (!uv) {
    uv = new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2)
    geo.setAttribute('uv', uv)
  }
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  if (!bb) return
  const sx = bb.max.x - bb.min.x || 1
  const sy = bb.max.y - bb.min.y || 1
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / sx, (pos.getY(i) - bb.min.y) / sy)
  }
  uv.needsUpdate = true
}

/** Ovate leaf: stem at y=-0.5, tip at y=0.5. */
export function makeOvateLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.bezierCurveTo(-0.06, -0.48, -0.4, -0.22, -0.38, 0.04)
  shape.bezierCurveTo(-0.34, 0.3, -0.14, 0.44, 0, 0.5)
  shape.bezierCurveTo(0.14, 0.44, 0.34, 0.3, 0.38, 0.04)
  shape.bezierCurveTo(0.4, -0.22, 0.06, -0.48, 0, -0.5)
  const geo = new THREE.ShapeGeometry(shape, 12)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Palmate maple / sycamore lobe. */
export function makeMapleLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.48)
  shape.lineTo(-0.08, -0.2)
  shape.bezierCurveTo(-0.42, -0.05, -0.5, 0.12, -0.22, 0.18)
  shape.bezierCurveTo(-0.38, 0.32, -0.22, 0.48, 0, 0.52)
  shape.bezierCurveTo(0.22, 0.48, 0.38, 0.32, 0.22, 0.18)
  shape.bezierCurveTo(0.5, 0.12, 0.42, -0.05, 0.08, -0.2)
  shape.lineTo(0, -0.48)
  const geo = new THREE.ShapeGeometry(shape, 14)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Sweetgum star leaf. */
export function makeStarLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const lobes = 5
  for (let i = 0; i <= lobes * 2; i++) {
    const a = -Math.PI / 2 + (i / (lobes * 2)) * Math.PI * 2
    const r = i % 2 === 0 ? 0.5 : 0.18
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape, 2)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Willow / creosote lance. */
export function makeLanceLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.bezierCurveTo(-0.05, -0.2, -0.07, 0.15, -0.03, 0.4)
  shape.bezierCurveTo(-0.01, 0.48, 0, 0.5, 0, 0.5)
  shape.bezierCurveTo(0, 0.5, 0.01, 0.48, 0.03, 0.4)
  shape.bezierCurveTo(0.07, 0.15, 0.05, -0.2, 0, -0.5)
  const geo = new THREE.ShapeGeometry(shape, 8)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Conifer needle spray — one woody axis with needles on both sides. */
export function makeSprayGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.lineTo(-0.04, -0.48)
  for (let i = 0; i < 7; i++) {
    const y = -0.4 + i * 0.13
    shape.lineTo(-0.06, y)
    shape.lineTo(-0.28 - (i % 2) * 0.06, y + 0.1)
    shape.lineTo(-0.05, y + 0.06)
  }
  shape.lineTo(0, 0.5)
  for (let i = 6; i >= 0; i--) {
    const y = -0.4 + i * 0.13
    shape.lineTo(0.05, y + 0.06)
    shape.lineTo(0.28 + (i % 2) * 0.06, y + 0.1)
    shape.lineTo(0.06, y)
  }
  shape.lineTo(0.04, -0.48)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape, 1)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Dogwood four-bract flower. */
export function makeBractGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const cx = Math.cos(a) * 0.22
    const cy = Math.sin(a) * 0.22
    const ox = -Math.sin(a)
    const oy = Math.cos(a)
    if (i === 0) shape.moveTo(cx + ox * 0.08, cy + oy * 0.08)
    shape.bezierCurveTo(
      cx + ox * 0.28 + Math.cos(a) * 0.2,
      cy + oy * 0.28 + Math.sin(a) * 0.2,
      cx - ox * 0.28 + Math.cos(a) * 0.2,
      cy - oy * 0.28 + Math.sin(a) * 0.2,
      cx - ox * 0.08,
      cy - oy * 0.08,
    )
  }
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape, 8)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Yucca / Joshua rosette blade. */
export function makeBladeGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.lineTo(-0.05, -0.46)
  shape.lineTo(-0.035, 0.2)
  shape.lineTo(0, 0.5)
  shape.lineTo(0.035, 0.2)
  shape.lineTo(0.05, -0.46)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape, 2)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Liriodendron leaf: broad blade with a square notch at the tip. */
export function makeTulipLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.48)
  shape.bezierCurveTo(-0.1, -0.4, -0.42, -0.12, -0.46, 0.08)
  shape.bezierCurveTo(-0.4, 0.28, -0.22, 0.34, -0.16, 0.28)
  shape.lineTo(-0.08, 0.18)
  shape.lineTo(0, 0.28)
  shape.lineTo(0.08, 0.18)
  shape.lineTo(0.16, 0.28)
  shape.bezierCurveTo(0.22, 0.34, 0.4, 0.28, 0.46, 0.08)
  shape.bezierCurveTo(0.42, -0.12, 0.1, -0.4, 0, -0.48)
  const geo = new THREE.ShapeGeometry(shape, 12)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Aspen round leaf. */
export function makeRoundLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.42)
  shape.bezierCurveTo(-0.28, -0.38, -0.4, -0.08, -0.32, 0.18)
  shape.bezierCurveTo(-0.18, 0.42, 0.18, 0.42, 0.32, 0.18)
  shape.bezierCurveTo(0.4, -0.08, 0.28, -0.38, 0, -0.42)
  const geo = new THREE.ShapeGeometry(shape, 12)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Narrow needle / conifer scale. */
export function makeNeedleGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.bezierCurveTo(-0.04, -0.3, -0.07, 0.05, -0.035, 0.28)
  shape.bezierCurveTo(-0.015, 0.42, 0, 0.5, 0, 0.5)
  shape.bezierCurveTo(0, 0.5, 0.015, 0.42, 0.035, 0.28)
  shape.bezierCurveTo(0.07, 0.05, 0.04, -0.3, 0, -0.5)
  const geo = new THREE.ShapeGeometry(shape, 8)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Pine fascicle: two–three needles from one woody sheath. */
export function makeNeedleFascicleGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-0.04, -0.5)
  shape.lineTo(-0.02, -0.42)
  shape.bezierCurveTo(-0.12, -0.1, -0.18, 0.22, -0.1, 0.48)
  shape.lineTo(-0.02, 0.36)
  shape.bezierCurveTo(-0.04, 0.1, -0.02, -0.1, 0, -0.38)
  shape.bezierCurveTo(0.02, -0.1, 0.04, 0.1, 0.02, 0.36)
  shape.lineTo(0.1, 0.48)
  shape.bezierCurveTo(0.18, 0.22, 0.12, -0.1, 0.02, -0.42)
  shape.lineTo(0.04, -0.5)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape, 6)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Thuja flattened scale fan. */
export function makeScaleFanGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.lineTo(-0.08, -0.42)
  for (let i = 0; i < 5; i++) {
    const y = -0.36 + i * 0.16
    const w = 0.14 + (i % 2) * 0.1 + (1 - i / 5) * 0.06
    shape.lineTo(-w, y)
    shape.lineTo(-w * 0.45, y + 0.07)
  }
  shape.lineTo(0, 0.5)
  for (let i = 4; i >= 0; i--) {
    const y = -0.36 + i * 0.16
    const w = 0.14 + (i % 2) * 0.1 + (1 - i / 5) * 0.06
    shape.lineTo(w * 0.45, y + 0.07)
    shape.lineTo(w, y)
  }
  shape.lineTo(0.08, -0.42)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape, 2)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Lilac heart leaf. */
export function makeHeartLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.bezierCurveTo(-0.08, -0.42, -0.42, -0.18, -0.44, 0.08)
  shape.bezierCurveTo(-0.42, 0.32, -0.18, 0.4, 0, 0.18)
  shape.bezierCurveTo(0.18, 0.4, 0.42, 0.32, 0.44, 0.08)
  shape.bezierCurveTo(0.42, -0.18, 0.08, -0.42, 0, -0.5)
  const geo = new THREE.ShapeGeometry(shape, 12)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Single flower petal, stem at y=-0.5. */
export function makePetalGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.bezierCurveTo(-0.08, -0.38, -0.32, -0.08, -0.3, 0.12)
  shape.bezierCurveTo(-0.22, 0.38, -0.06, 0.48, 0, 0.5)
  shape.bezierCurveTo(0.06, 0.48, 0.22, 0.38, 0.3, 0.12)
  shape.bezierCurveTo(0.32, -0.08, 0.08, -0.38, 0, -0.5)
  const geo = new THREE.ShapeGeometry(shape, 10)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

/** Five-petal apple / cherry blossom card. */
export function makeBlossomGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2
    const cx = Math.cos(a) * 0.2
    const cy = Math.sin(a) * 0.2
    const ox = -Math.sin(a)
    const oy = Math.cos(a)
    if (i === 0) shape.moveTo(cx + ox * 0.06, cy + oy * 0.06)
    shape.bezierCurveTo(
      cx + ox * 0.26 + Math.cos(a) * 0.22,
      cy + oy * 0.26 + Math.sin(a) * 0.22,
      cx - ox * 0.26 + Math.cos(a) * 0.22,
      cy - oy * 0.26 + Math.sin(a) * 0.22,
      cx - ox * 0.06,
      cy - oy * 0.06,
    )
  }
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape, 8)
  remapLeafUvs(geo)
  geo.computeVertexNormals()
  return geo
}

const leafAlbedoCache = new Map<string, THREE.CanvasTexture>()

/** White leaf card with midrib / veins so material color tints the blade. */
export function leafAlbedoTexture(kind: LeafKind): THREE.CanvasTexture {
  const hit = leafAlbedoCache.get(kind)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, 128, 128)
  ctx.translate(64, 64)
  ctx.beginPath()
  if (kind === 'needle') {
    ctx.moveTo(0, 62)
    ctx.bezierCurveTo(-8, 20, -6, -20, 0, -62)
    ctx.bezierCurveTo(6, -20, 8, 20, 0, 62)
  } else if (kind === 'spray') {
    ctx.moveTo(0, 62)
    ctx.lineTo(-6, 50)
    ctx.lineTo(-28, 20)
    ctx.lineTo(-6, 16)
    ctx.lineTo(-32, -10)
    ctx.lineTo(-5, -8)
    ctx.lineTo(0, -62)
    ctx.lineTo(5, -8)
    ctx.lineTo(32, -10)
    ctx.lineTo(6, 16)
    ctx.lineTo(28, 20)
    ctx.lineTo(6, 50)
  } else if (kind === 'scale') {
    ctx.moveTo(0, 60)
    ctx.lineTo(-10, 48)
    ctx.lineTo(-22, 20)
    ctx.lineTo(-8, 16)
    ctx.lineTo(-26, -8)
    ctx.lineTo(-6, -6)
    ctx.lineTo(0, -60)
    ctx.lineTo(6, -6)
    ctx.lineTo(26, -8)
    ctx.lineTo(8, 16)
    ctx.lineTo(22, 20)
    ctx.lineTo(10, 48)
  } else if (kind === 'heart') {
    ctx.moveTo(0, 50)
    ctx.bezierCurveTo(-28, 38, -48, 8, 0, -52)
    ctx.bezierCurveTo(48, 8, 28, 38, 0, 50)
  } else if (kind === 'petal') {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2
      const x = Math.cos(a) * 18
      const y = Math.sin(a) * 18
      ctx.moveTo(0, 0)
      ctx.bezierCurveTo(
        x - Math.sin(a) * 16,
        y + Math.cos(a) * 16,
        x + Math.cos(a) * 28 - Math.sin(a) * 16,
        y + Math.sin(a) * 28 + Math.cos(a) * 16,
        x + Math.cos(a) * 36,
        y + Math.sin(a) * 36,
      )
      ctx.bezierCurveTo(
        x + Math.cos(a) * 28 + Math.sin(a) * 16,
        y + Math.sin(a) * 28 - Math.cos(a) * 16,
        x + Math.sin(a) * 16,
        y - Math.cos(a) * 16,
        0,
        0,
      )
    }
  } else if (kind === 'lance') {
    ctx.moveTo(0, 60)
    ctx.bezierCurveTo(-10, 20, -8, -24, 0, -60)
    ctx.bezierCurveTo(8, -24, 10, 20, 0, 60)
  } else {
    ctx.moveTo(0, 62)
    ctx.bezierCurveTo(-28, 36, -40, -8, 0, -62)
    ctx.bezierCurveTo(40, -8, 28, 36, 0, 62)
  }
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, 62, 0, -62)
  fill.addColorStop(0, '#e8eedc')
  fill.addColorStop(0.45, '#ffffff')
  fill.addColorStop(1, '#dfe8c8')
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = 'rgba(40, 55, 28, 0.35)'
  ctx.lineWidth = kind === 'needle' ? 1.2 : 2
  ctx.beginPath()
  ctx.moveTo(0, 58)
  ctx.lineTo(0, -56)
  ctx.stroke()
  if (kind === 'ovate') {
    ctx.strokeStyle = 'rgba(40, 55, 28, 0.22)'
    ctx.lineWidth = 1
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const y0 = 40 - i * 18
        ctx.beginPath()
        ctx.moveTo(0, y0)
        ctx.quadraticCurveTo(side * 12, y0 - 8, side * 22, y0 - 16)
        ctx.stroke()
      }
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  leafAlbedoCache.set(kind, tex)
  return tex
}

const geoCache = new Map<LeafKind, THREE.BufferGeometry>()

export function sharedLeafGeometry(kind: LeafKind): THREE.BufferGeometry {
  const hit = geoCache.get(kind)
  if (hit) return hit
  let geo: THREE.BufferGeometry
  switch (kind) {
    case 'needle':
      geo = makeNeedleFascicleGeometry()
      break
    case 'lance':
      geo = makeLanceLeafGeometry()
      break
    case 'spray':
      geo = makeSprayGeometry()
      break
    case 'scale':
      geo = makeScaleFanGeometry()
      break
    case 'heart':
      geo = makeHeartLeafGeometry()
      break
    case 'petal':
      geo = makeBlossomGeometry()
      break
    default:
      geo = makeOvateLeafGeometry()
  }
  geoCache.set(kind, geo)
  return geo
}
