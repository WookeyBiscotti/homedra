import { useEffect, useState, type ReactElement } from 'react'
import { Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva'
import {
  CONSTRAINT_ICONS,
  hasFixedPosition,
  wallConstraintTypes,
} from '../../engine/constraints/solver'
import { wallDistanceDimension, vertexDistanceDimension } from '../../engine/geometry/wallSolid'
import type { Floor } from '../../engine/types'
import { wallMidpoint } from '../../engine/geometry/walls'

const SIZE = 18
const TICK = 6

function useSvgImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    const image = new window.Image()
    image.src = src
    image.onload = () => setImg(image)
    return () => {
      image.onload = null
    }
  }, [src])
  return img
}

function Badge({
  x,
  y,
  src,
}: {
  x: number
  y: number
  src: string
}) {
  const img = useSvgImage(src)
  return (
    <Group x={x - SIZE / 2} y={y - SIZE / 2} listening={false}>
      <Rect
        width={SIZE}
        height={SIZE}
        fill="#f7f3eb"
        stroke="#3d3429"
        strokeWidth={1}
        cornerRadius={3}
        opacity={0.95}
      />
      {img && (
        <KonvaImage image={img} x={2} y={2} width={SIZE - 4} height={SIZE - 4} />
      )}
    </Group>
  )
}

function DimensionAnnotation({
  s0,
  s1,
  label,
  text,
  horizontalMeasure,
}: {
  s0: { x: number; y: number }
  s1: { x: number; y: number }
  label: { x: number; y: number }
  text: string
  /** true when measuring along X (vertical walls) */
  horizontalMeasure: boolean
}) {
  const tick = horizontalMeasure
    ? [
        [0, -TICK, 0, TICK],
        [0, -TICK, 0, TICK],
      ]
    : [
        [-TICK, 0, TICK, 0],
        [-TICK, 0, TICK, 0],
      ]

  return (
    <Group listening={false}>
      <Line
        points={[s0.x, s0.y, s1.x, s1.y]}
        stroke="#2a6f6a"
        strokeWidth={1.25}
      />
      <Line
        points={[
          s0.x + tick[0][0],
          s0.y + tick[0][1],
          s0.x + tick[0][2],
          s0.y + tick[0][3],
        ]}
        stroke="#2a6f6a"
        strokeWidth={1.25}
      />
      <Line
        points={[
          s1.x + tick[1][0],
          s1.y + tick[1][1],
          s1.x + tick[1][2],
          s1.y + tick[1][3],
        ]}
        stroke="#2a6f6a"
        strokeWidth={1.25}
      />
      <Rect
        x={label.x - 28}
        y={label.y - 10}
        width={56}
        height={18}
        fill="#f7f3eb"
        opacity={0.92}
        cornerRadius={3}
      />
      <Text
        x={label.x - 28}
        y={label.y - 8}
        width={56}
        align="center"
        text={text}
        fontSize={11}
        fontFamily="IBM Plex Sans, sans-serif"
        fill="#1f4e4a"
      />
    </Group>
  )
}

export function ConstraintPictograms({
  floor,
  toScreen,
}: {
  floor: Floor
  toScreen: (x: number, y: number) => { x: number; y: number }
}) {
  const badges: ReactElement[] = []
  const distanceShown = new Set<string>()

  for (const wall of floor.walls) {
    const types = wallConstraintTypes(floor.constraints, wall.id).filter(
      (t) => t !== 'wallDistance',
    )
    if (types.length === 0) continue
    const mid = wallMidpoint(floor, wall)
    if (!mid) continue
    const a = floor.vertices.find((v) => v.id === wall.a)
    const b = floor.vertices.find((v) => v.id === wall.b)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const ox = (-dy / len) * 0.35
    const oy = (dx / len) * 0.35
    const base = toScreen(mid.x + ox, mid.y + oy)
    types.forEach((t, i) => {
      badges.push(
        <Badge
          key={`${wall.id}-${t}`}
          x={base.x + i * (SIZE + 4)}
          y={base.y}
          src={CONSTRAINT_ICONS[t]}
        />,
      )
    })
  }

  for (const c of floor.constraints) {
    if (c.type !== 'wallDistance') continue
    const key = [c.wallA, c.wallB].sort().join('|')
    if (distanceShown.has(key)) continue
    distanceShown.add(key)
    const wa = floor.walls.find((w) => w.id === c.wallA)
    const wb = floor.walls.find((w) => w.id === c.wallB)
    if (!wa || !wb) continue
    const dim = wallDistanceDimension(floor, wa, wb, c.face, c.distance)
    if (!dim) continue
    const s0 = toScreen(dim.p0.x, dim.p0.y)
    const s1 = toScreen(dim.p1.x, dim.p1.y)
    const label = toScreen(dim.label.x, dim.label.y)
    badges.push(
      <DimensionAnnotation
        key={`dist-${key}`}
        s0={s0}
        s1={s1}
        label={label}
        text={dim.text}
        horizontalMeasure={dim.axis === 'vertical'}
      />,
    )
  }

  for (const c of floor.constraints) {
    if (c.type !== 'vertexDistance') continue
    const key = [c.vertexA, c.vertexB].sort().join('|')
    const dim = vertexDistanceDimension(
      floor,
      c.vertexA,
      c.vertexB,
      c.face,
      c.distance,
    )
    if (!dim) continue
    const s0 = toScreen(dim.p0.x, dim.p0.y)
    const s1 = toScreen(dim.p1.x, dim.p1.y)
    const label = toScreen(dim.label.x, dim.label.y)
    const dx = Math.abs(s1.x - s0.x)
    const dy = Math.abs(s1.y - s0.y)
    badges.push(
      <DimensionAnnotation
        key={`vdist-${key}`}
        s0={s0}
        s1={s1}
        label={label}
        text={dim.text}
        horizontalMeasure={dx >= dy}
      />,
    )
  }

  for (const c of floor.constraints) {
    if (c.type !== 'pointsHorizontal' && c.type !== 'pointsVertical') continue
    const pts = c.vertexIds
      .map((id) => floor.vertices.find((v) => v.id === id))
      .filter((v): v is NonNullable<typeof v> => Boolean(v))
    if (pts.length < 2) continue
    if (c.type === 'pointsHorizontal') {
      const y = pts.reduce((s, p) => s + p.y, 0) / pts.length
      const xs = pts.map((p) => p.x)
      const x0 = Math.min(...xs)
      const x1 = Math.max(...xs)
      const a = toScreen(x0, y)
      const b = toScreen(x1, y)
      const mid = toScreen((x0 + x1) / 2, y)
      badges.push(
        <Group key={c.id} listening={false}>
          <Line
            points={[a.x, a.y, b.x, b.y]}
            stroke="#2a6f6a"
            strokeWidth={1}
            dash={[6, 4]}
          />
          <Badge x={mid.x} y={mid.y - 14} src={CONSTRAINT_ICONS.pointsHorizontal} />
        </Group>,
      )
    } else {
      const x = pts.reduce((s, p) => s + p.x, 0) / pts.length
      const ys = pts.map((p) => p.y)
      const y0 = Math.min(...ys)
      const y1 = Math.max(...ys)
      const a = toScreen(x, y0)
      const b = toScreen(x, y1)
      const mid = toScreen(x, (y0 + y1) / 2)
      badges.push(
        <Group key={c.id} listening={false}>
          <Line
            points={[a.x, a.y, b.x, b.y]}
            stroke="#2a6f6a"
            strokeWidth={1}
            dash={[6, 4]}
          />
          <Badge x={mid.x + 14} y={mid.y} src={CONSTRAINT_ICONS.pointsVertical} />
        </Group>,
      )
    }
  }

  for (const v of floor.vertices) {
    if (!hasFixedPosition(floor.constraints, v.id)) continue
    const s = toScreen(v.x, v.y)
    badges.push(
      <Badge
        key={`v-${v.id}-lock`}
        x={s.x + 14}
        y={s.y - 14}
        src={CONSTRAINT_ICONS.fixedPosition}
      />,
    )
  }

  for (const c of floor.constraints) {
    if (c.type !== 'pointOnWall') continue
    const v = floor.vertices.find((x) => x.id === c.vertexId)
    if (!v) continue
    const s = toScreen(v.x, v.y)
    badges.push(
      <Badge
        key={`pol-${c.id}`}
        x={s.x + 14}
        y={s.y + 14}
        src={CONSTRAINT_ICONS.pointOnWall}
      />,
    )
  }

  return <>{badges}</>
}
