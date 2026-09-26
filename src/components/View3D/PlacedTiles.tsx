import { Edges, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import {
  isStoryFloor,
  isTileSelected,
  selectedTileIds,
  type BoxFace,
  type Floor,
  type PlacedTile,
  type TileSurface,
  type Wall,
  type WallSide,
} from '../../engine/types'
import { buildPlacedTileGeometry } from '../../engine/geometry/tileMesh'
import { fillTilesOnSurface, layoutTile } from '../../engine/geometry/tileFill'
import { tileLocalPolygon } from '../../engine/geometry/tiles'
import {
  boxTileFrame,
  floorTileFrame,
  tileSurfaceFrame,
  uvToWorld,
  wallTileFrame,
  worldToUv,
  type TileSurfaceFrame,
} from '../../engine/geometry/tileSurfaces'
import {
  buildRoomFloorGeometry,
  buildWallPaintHitGeometry,
  FLOOR_FINISH_Y_OFFSET,
} from '../../engine/geometry/wallFaces'
import { floorPaintRegions } from '../../engine/geometry/floorPaint'
import { useBuildingStore } from '../../store/buildingStore'
import { PbrStandardMaterial } from './PbrStandardMaterial'

const BOX_FACES: BoxFace[] = ['posX', 'negX', 'posY', 'negY', 'top', 'bottom']

function frameGeometry(frame: TileSurfaceFrame): THREE.BufferGeometry {
  const a = uvToWorld(frame, 0, 0, 0.003)
  const b = uvToWorld(frame, frame.uSize, 0, 0.003)
  const c = uvToWorld(frame, frame.uSize, frame.vSize, 0.003)
  const d = uvToWorld(frame, 0, frame.vSize, 0.003)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z],
      3,
    ),
  )
  geo.computeVertexNormals()
  return geo
}

function surfacePlane(frame: TileSurfaceFrame): THREE.Plane {
  return new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(frame.nDir.x, frame.nDir.y, frame.nDir.z),
    new THREE.Vector3(frame.origin.x, frame.origin.y, frame.origin.z),
  )
}

function TileMesh({
  floor,
  tile,
  selected,
  dimmed,
  shadowsEnabled,
  pickable,
}: {
  floor: Floor
  tile: PlacedTile
  selected: boolean
  dimmed: boolean
  shadowsEnabled: boolean
  pickable: boolean
}) {
  const selectTile = useBuildingStore((s) => s.selectTile)
  const dragTile = useBuildingStore((s) => s.dragTile)
  const pushHistory = useBuildingStore((s) => s.pushHistory)
  const beginTileCut = useBuildingStore((s) => s.beginTileCut)
  const finishTileCut = useBuildingStore((s) => s.finishTileCut)
  const updateTileCut = useBuildingStore((s) => s.updateTileCut)
  const tool = useBuildingStore((s) => s.tool)
  const tileCutDraft = useBuildingStore((s) => s.tileCutDraft)
  const geometry = useMemo(() => buildPlacedTileGeometry(floor, tile), [floor, tile])
  const drag = useRef<{
    ids: string[]
    startUv: { u: number; v: number }
    origin: { u: number; v: number }
    moved: boolean
  } | null>(null)

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  if (!geometry) return null

  const uvAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const frame = tileSurfaceFrame(floor, tile.surface)
    if (!frame) return { u: tile.u, v: tile.v }
    const hit = new THREE.Vector3()
    if (e.ray.intersectPlane(surfacePlane(frame), hit)) {
      return worldToUv(frame, { x: hit.x, y: hit.y, z: hit.z })
    }
    return worldToUv(frame, { x: e.point.x, y: e.point.y, z: e.point.z })
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const uv = uvAt(e)
    if (tool === 'cutTile') {
      if (!tileCutDraft || tileCutDraft.tileId !== tile.id) {
        beginTileCut(tile.id, uv.u, uv.v)
        return
      }
      finishTileCut(uv.u, uv.v, !e.nativeEvent.shiftKey)
      return
    }
    if (drag.current?.moved) return
    selectTile(floor.id, tile.id, e.nativeEvent.shiftKey)
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!pickable || tool !== 'select' || e.button !== 0) return
    if (e.nativeEvent.shiftKey) return
    e.stopPropagation()
    const already = isTileSelected(useBuildingStore.getState().selection, tile.id)
    const ids = already
      ? selectedTileIds(useBuildingStore.getState().selection)
      : [tile.id]
    if (!already) selectTile(floor.id, tile.id, false)
    const uv = uvAt(e)
    drag.current = {
      ids,
      startUv: uv,
      origin: { u: tile.u, v: tile.v },
      moved: false,
    }
    const target = e.target as { setPointerCapture?: (id: number) => void } | null
    target?.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (tool === 'cutTile' && tileCutDraft?.a && tileCutDraft.tileId === tile.id) {
      const uv = uvAt(e)
      updateTileCut(uv.u, uv.v)
      return
    }
    const state = drag.current
    if (!state) return
    e.stopPropagation()
    const uv = uvAt(e)
    const du = uv.u - state.startUv.u
    const dv = uv.v - state.startUv.v
    if (!state.moved && Math.hypot(du, dv) < 0.01) return
    if (!state.moved) {
      state.moved = true
      pushHistory()
    }
    dragTile(tile.id, state.origin.u + du, state.origin.v + dv, state.ids)
  }

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    e.stopPropagation()
    drag.current = null
  }

  return (
    <group>
      <mesh
        geometry={geometry}
        castShadow={shadowsEnabled}
        receiveShadow={shadowsEnabled}
        onClick={pickable ? onClick : undefined}
        onPointerDown={pickable ? onPointerDown : undefined}
        onPointerMove={pickable ? onPointerMove : undefined}
        onPointerUp={pickable ? onPointerUp : undefined}
        userData={{ pickKind: 'tile', tileId: tile.id }}
        renderOrder={6}
      >
        <PbrStandardMaterial
          material={tile.material}
          color={selected ? '#f0c8a0' : '#d2c2b0'}
          worldWidthM={tile.material.tileSizeM}
          worldHeightM={tile.material.tileSizeM}
          polygonOffset
          polygonOffsetFactor={-2}
        />
        {selected && !dimmed && <Edges threshold={15} color="#c45c26" />}
      </mesh>
      {selected && !dimmed && (
        <mesh geometry={geometry} renderOrder={7} raycast={() => null}>
          <meshBasicMaterial
            color="#c45c26"
            transparent
            opacity={0.32}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

function GhostTiles({
  floor,
  tiles,
}: {
  floor: Floor
  tiles: PlacedTile[]
}) {
  const geos = useMemo(() => {
    return tiles
      .map((tile) => {
        const geo = buildPlacedTileGeometry(floor, tile)
        return geo ? { id: tile.id, geo, tile } : null
      })
      .filter(
        (x): x is { id: string; geo: THREE.BufferGeometry; tile: PlacedTile } =>
          x !== null,
      )
  }, [floor, tiles])

  useEffect(() => {
    return () => {
      for (const g of geos) g.geo.dispose()
    }
  }, [geos])

  return (
    <group>
      {geos.map(({ id, geo, tile }) => (
        <mesh key={id} geometry={geo} renderOrder={8} userData={{ tileTarget: true }}>
          <PbrStandardMaterial
            material={tile.material}
            color="#d2c2b0"
            transparent
            opacity={0.72}
            worldWidthM={tile.material.tileSizeM}
            worldHeightM={tile.material.tileSizeM}
          />
        </mesh>
      ))}
    </group>
  )
}

export function FloorPlacedTiles({
  floor,
  dimmed,
  shadowsEnabled,
  pickable,
}: {
  floor: Floor
  dimmed: boolean
  shadowsEnabled: boolean
  pickable: boolean
}) {
  const selection = useBuildingStore((s) => s.selection)
  const tileCutDraft = useBuildingStore((s) => s.tileCutDraft)
  const cutLine = useMemo(() => {
    if (!tileCutDraft?.a) return null
    const tile = (floor.tiles ?? []).find((t) => t.id === tileCutDraft.tileId)
    if (!tile) return null
    const frame = tileSurfaceFrame(floor, tile.surface)
    if (!frame) return null
    const a = uvToWorld(frame, tileCutDraft.a.u, tileCutDraft.a.v, 0.012)
    const bPt = tileCutDraft.b ?? tileCutDraft.a
    const b = uvToWorld(frame, bPt.u, bPt.v, 0.012)
    return [a.x, a.y, a.z, b.x, b.y, b.z] as const
  }, [floor, tileCutDraft])
  if (!isStoryFloor(floor)) return null
  return (
    <group>
      {(floor.tiles ?? []).map((tile) => (
        <TileMesh
          key={tile.id}
          floor={floor}
          tile={tile}
          selected={isTileSelected(selection, tile.id)}
          dimmed={dimmed}
          shadowsEnabled={shadowsEnabled}
          pickable={pickable}
        />
      ))}
      {cutLine && (
        <Line
          points={[
            [cutLine[0], cutLine[1], cutLine[2]],
            [cutLine[3], cutLine[4], cutLine[5]],
          ]}
          color="#c45c26"
          lineWidth={2}
        />
      )}
    </group>
  )
}

function useTileHoverGhost(floor: Floor, hit: { surface: TileSurface; u: number; v: number } | null) {
  const pendingTile = useBuildingStore((s) => s.pendingTile)
  const tool = useBuildingStore((s) => s.tool)
  const grout = useBuildingStore((s) => s.tileGroutM)
  const rotation = useBuildingStore((s) => s.tileRotation)
  const snap = useBuildingStore((s) => s.tileSnapEnabled)
  const pattern = useBuildingStore((s) => s.tileFillPattern)

  return useMemo(() => {
    if (!hit || !pendingTile) return []
    if (tool === 'fillTile') {
      return fillTilesOnSurface(
        pendingTile,
        hit.surface,
        hit.u,
        hit.v,
        grout,
        rotation,
        pattern,
        floor,
      ).slice(0, 400)
    }
    if (tool === 'placeTile') {
      const tile = layoutTile(
        pendingTile,
        hit.surface,
        hit.u,
        hit.v,
        grout,
        rotation,
        floor,
        { snap },
      )
      return tile ? [tile] : []
    }
    return []
  }, [floor, hit, pendingTile, tool, grout, rotation, snap, pattern])
}

function SurfaceHit({
  floor,
  surface,
  geometry,
  onHover,
  onLeave,
}: {
  floor: Floor
  surface: TileSurface
  geometry: THREE.BufferGeometry
  onHover: (hit: { surface: TileSurface; u: number; v: number }) => void
  onLeave: () => void
}) {
  const placeTileOnHit = useBuildingStore((s) => s.placeTileOnHit)
  const fillTilesOnHit = useBuildingStore((s) => s.fillTilesOnHit)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const tool = useBuildingStore((s) => s.tool)
  const frame = useMemo(() => {
    if (surface.type === 'floor') return floorTileFrame(floor)
    if (surface.type === 'wall') return wallTileFrame(floor, surface.wallId, surface.side)
    const box = (floor.boxes ?? []).find((b) => b.id === surface.boxId)
    return box ? boxTileFrame(floor, box, surface.face) : null
  }, [floor, surface])

  const toUv = (e: ThreeEvent<MouseEvent>) => {
    if (!frame) return null
    return worldToUv(frame, { x: e.point.x, y: e.point.y, z: e.point.z })
  }

  return (
    <mesh
      geometry={geometry}
      onPointerMove={(e) => {
        e.stopPropagation()
        const uv = toUv(e)
        if (uv) onHover({ surface, u: uv.u, v: uv.v })
      }}
      onPointerOut={() => onLeave()}
      onClick={(e) => {
        e.stopPropagation()
        const uv = toUv(e)
        if (!uv) return
        setActiveFloor(floor.id)
        if (tool === 'fillTile') fillTilesOnHit(surface, uv.u, uv.v)
        else placeTileOnHit(surface, uv.u, uv.v)
      }}
      userData={{ tileTarget: true, pickKind: 'tile' }}
      renderOrder={12}
    >
      <meshBasicMaterial
        transparent
        opacity={0}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function WallTileHit({
  floor,
  wall,
  side,
  onHover,
  onLeave,
}: {
  floor: Floor
  wall: Wall
  side: WallSide
  onHover: (hit: { surface: TileSurface; u: number; v: number }) => void
  onLeave: () => void
}) {
  const geometry = useMemo(
    () => buildWallPaintHitGeometry(floor, wall, side),
    [floor, wall, side],
  )
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return (
    <SurfaceHit
      floor={floor}
      surface={{ type: 'wall', wallId: wall.id, side }}
      geometry={geometry}
      onHover={onHover}
      onLeave={onLeave}
    />
  )
}

export function TileLayPickables({ floor }: { floor: Floor }) {
  const [hit, setHit] = useState<{ surface: TileSurface; u: number; v: number } | null>(null)
  const pendingTile = useBuildingStore((s) => s.pendingTile)
  const tool = useBuildingStore((s) => s.tool)
  const ghosts = useTileHoverGhost(floor, hit)

  const floorRegions = useMemo(() => {
    return floorPaintRegions(floor)
      .map((region) => {
        const geometry = buildRoomFloorGeometry(region.polygon, floor.elevation, {
          yOffset: FLOOR_FINISH_Y_OFFSET + 0.004,
        })
        return geometry ? { key: region.key, geometry } : null
      })
      .filter((x): x is { key: string; geometry: THREE.BufferGeometry } => x !== null)
  }, [floor])

  useEffect(() => {
    return () => {
      for (const r of floorRegions) r.geometry.dispose()
    }
  }, [floorRegions])

  const boxGeos = useMemo(() => {
    const out: Array<{
      key: string
      surface: TileSurface
      geometry: THREE.BufferGeometry
    }> = []
    for (const box of floor.boxes ?? []) {
      for (const face of BOX_FACES) {
        const frame = boxTileFrame(floor, box, face)
        out.push({
          key: `${box.id}:${face}`,
          surface: { type: 'box', boxId: box.id, face },
          geometry: frameGeometry(frame),
        })
      }
    }
    return out
  }, [floor])

  useEffect(() => {
    return () => {
      for (const b of boxGeos) b.geometry.dispose()
    }
  }, [boxGeos])

  if (!pendingTile || (tool !== 'placeTile' && tool !== 'fillTile')) return null
  if (!isStoryFloor(floor)) return null

  return (
    <group>
      {floorRegions.map((r) => (
        <SurfaceHit
          key={r.key}
          floor={floor}
          surface={{ type: 'floor' }}
          geometry={r.geometry}
          onHover={setHit}
          onLeave={() => setHit(null)}
        />
      ))}
      {floor.walls.map((wall) => (
        <group key={wall.id}>
          <WallTileHit
            floor={floor}
            wall={wall}
            side="pos"
            onHover={setHit}
            onLeave={() => setHit(null)}
          />
          <WallTileHit
            floor={floor}
            wall={wall}
            side="neg"
            onHover={setHit}
            onLeave={() => setHit(null)}
          />
        </group>
      ))}
      {boxGeos.map((b) => (
        <SurfaceHit
          key={b.key}
          floor={floor}
          surface={b.surface}
          geometry={b.geometry}
          onHover={setHit}
          onLeave={() => setHit(null)}
        />
      ))}
      <GhostTiles floor={floor} tiles={ghosts} />
    </group>
  )
}

export function tilePlanPoints(tile: PlacedTile): number[] {
  const poly = tileLocalPolygon(tile)
  const pts: number[] = []
  for (const p of poly) {
    pts.push(p.x, p.y)
  }
  return pts
}
