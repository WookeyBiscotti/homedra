import { useState } from 'react'
import {
  CONSTRAINT_ICONS,
  hasAxisConstraint,
  hasFixedLength,
  hasFixedPosition,
  hasPointOnWall,
  hasPointsAligned,
} from '../engine/constraints/solver'
import type { CopyFloorOptions } from '../engine/copyFloor'
import {
  centerDistance,
  centerToFaceDistance,
  vertexCenterDistance,
  vertexWallThickness,
  wallsShareAxis,
  type WallFace,
} from '../engine/geometry/wallSolid'
import { selectedVertexIds, selectedWallIds, openingKindLabel, slabOpeningKindLabel, isGroundFloor, isStoryFloor, wallLength } from '../engine/types'
import { useBuildingStore } from '../store/buildingStore'
import { ConstraintsList } from './ConstraintsList'
import { CopyFloorOptionsForm } from './CopyFloorOptionsForm'
import { MaterialSlot } from './TextureBrowser'
import {
  detectRooms,
  roomsForWallSides,
} from '../engine/geometry/wallSolid'

export function PropertiesPanel() {
  const floor = useBuildingStore((s) => s.activeFloor())
  const selection = useBuildingStore((s) => s.selection)
  const building = useBuildingStore((s) => s.building)
  const activeFloorId = useBuildingStore((s) => s.activeFloorId)
  const toggleFixedLength = useBuildingStore((s) => s.toggleFixedLength)
  const toggleFixedPosition = useBuildingStore((s) => s.toggleFixedPosition)
  const toggleAxis = useBuildingStore((s) => s.toggleAxis)
  const setWallThickness = useBuildingStore((s) => s.setWallThickness)
  const setWallSideMaterial = useBuildingStore((s) => s.setWallSideMaterial)
  const setWallCutMaterial = useBuildingStore((s) => s.setWallCutMaterial)
  const setWallBothMaterials = useBuildingStore((s) => s.setWallBothMaterials)
  const setRoomFloorMaterial = useBuildingStore((s) => s.setRoomFloorMaterial)
  const setRoomWallsMaterial = useBuildingStore((s) => s.setRoomWallsMaterial)
  const setFixedLengthValue = useBuildingStore((s) => s.setFixedLengthValue)
  const setWallDistance = useBuildingStore((s) => s.setWallDistance)
  const clearWallDistance = useBuildingStore((s) => s.clearWallDistance)
  const setVertexDistance = useBuildingStore((s) => s.setVertexDistance)
  const clearVertexDistance = useBuildingStore((s) => s.clearVertexDistance)
  const setPointsAligned = useBuildingStore((s) => s.setPointsAligned)
  const clearPointsAligned = useBuildingStore((s) => s.clearPointsAligned)
  const setPointOnWall = useBuildingStore((s) => s.setPointOnWall)
  const clearPointOnWall = useBuildingStore((s) => s.clearPointOnWall)
  const mergeSelectedVertices = useBuildingStore((s) => s.mergeSelectedVertices)
  const renameFloor = useBuildingStore((s) => s.renameFloor)
  const setFloorHeight = useBuildingStore((s) => s.setFloorHeight)
  const setFloorSlabThickness = useBuildingStore((s) => s.setFloorSlabThickness)
  const setFloorElevation = useBuildingStore((s) => s.setFloorElevation)
  const setBuildingName = useBuildingStore((s) => s.setBuildingName)
  const updateOpening = useBuildingStore((s) => s.updateOpening)
  const updateSlabOpening = useBuildingStore((s) => s.updateSlabOpening)
  const setSlabOpeningMaterial = useBuildingStore((s) => s.setSlabOpeningMaterial)
  const updateFloorPlate = useBuildingStore((s) => s.updateFloorPlate)
  const setFloorPlateMaterial = useBuildingStore((s) => s.setFloorPlateMaterial)
  const updatePlacedObject = useBuildingStore((s) => s.updatePlacedObject)
  const copyFromPreviousFloor = useBuildingStore((s) => s.copyFromPreviousFloor)
  const conflict = useBuildingStore((s) => s.conflict)
  const statusMessage = useBuildingStore((s) => s.statusMessage)
  const workbench = useBuildingStore((s) => s.workbench)
  const [showCopyFromPrev, setShowCopyFromPrev] = useState(false)

  const isDraft = workbench === 'draft'
  const isPaint = workbench === 'paint'
  const isFurnish = workbench === 'furnish'

  const stories = building.floors.filter(isStoryFloor)
  const ground = building.floors.find(isGroundFloor)
  const storyIndex = stories.findIndex((f) => f.id === activeFloorId)
  const previousFloor = storyIndex > 0 ? stories[storyIndex - 1] : null
  const isFirstStory = storyIndex === 0
  const isGround = isGroundFloor(floor)
  const riseAboveGround =
    ground && isFirstStory ? floor.elevation - ground.elevation : null

  const wallIds = selectedWallIds(selection)
  const vertexIds = selectedVertexIds(selection)
  const wall =
    selection?.kind === 'wall' ? floor.walls.find((w) => w.id === selection.id) : null
  const vertex =
    selection?.kind === 'vertex'
      ? floor.vertices.find((v) => v.id === selection.id)
      : null
  const opening =
    selection?.kind === 'opening'
      ? (floor.openings ?? []).find((o) => o.id === selection.id)
      : null
  const slabOpening =
    selection?.kind === 'slabOpening'
      ? (floor.slabOpenings ?? []).find((o) => o.id === selection.id)
      : null
  const floorPlate =
    selection?.kind === 'floorPlate'
      ? (floor.plates ?? []).find((p) => p.id === selection.id)
      : null
  const placedObject =
    selection?.kind === 'object'
      ? (floor.objects ?? []).find((o) => o.id === selection.id)
      : null
  const room =
    selection?.kind === 'room'
      ? detectRooms(floor).find((r) => r.key === selection.key) ?? null
      : null
  const wallSideRooms = wall
    ? roomsForWallSides(floor, wall.id)
    : { pos: null, neg: null }
  const multi = selection?.kind === 'multi' ? selection : null

  const pointsAlign =
    vertexIds.length >= 2
      ? {
          ids: vertexIds,
          horizontal: hasPointsAligned(
            floor.constraints,
            vertexIds,
            'pointsHorizontal',
          ),
          vertical: hasPointsAligned(
            floor.constraints,
            vertexIds,
            'pointsVertical',
          ),
        }
      : null

  const distancePair = (() => {
    if (wallIds.length !== 2) return null
    const [idA, idB] = wallIds
    const wa = floor.walls.find((w) => w.id === idA)
    const wb = floor.walls.find((w) => w.id === idB)
    if (!wa || !wb) return null
    const axis = wallsShareAxis(floor, idA, idB)
    if (!axis) return null
    const existing = floor.constraints.find(
      (c) =>
        c.type === 'wallDistance' &&
        ((c.wallA === idA && c.wallB === idB) ||
          (c.wallA === idB && c.wallB === idA)),
    )
    const face: WallFace =
      existing && existing.type === 'wallDistance' ? existing.face : 'inner'
    const center = centerDistance(floor, wa, wb)
    const current =
      existing && existing.type === 'wallDistance'
        ? existing.distance
        : centerToFaceDistance(face, center, wa.thickness, wb.thickness)
    return { idA, idB, wa, wb, axis, existing, face, current }
  })()

  const vertexDistancePair = (() => {
    if (vertexIds.length !== 2) return null
    const [idA, idB] = vertexIds
    const existing = floor.constraints.find(
      (c) =>
        c.type === 'vertexDistance' &&
        ((c.vertexA === idA && c.vertexB === idB) ||
          (c.vertexA === idB && c.vertexB === idA)),
    )
    const face: WallFace =
      existing && existing.type === 'vertexDistance' ? existing.face : 'inner'
    const tA = vertexWallThickness(floor, idA)
    const tB = vertexWallThickness(floor, idB)
    const center = vertexCenterDistance(floor, idA, idB)
    const current =
      existing && existing.type === 'vertexDistance'
        ? existing.distance
        : centerToFaceDistance(face, center, tA, tB)
    return { idA, idB, tA, tB, existing, face, current, center }
  })()

  const pointOnWallPair = (() => {
    if (vertexIds.length !== 1 || wallIds.length !== 1) return null
    const vertexId = vertexIds[0]
    const wallId = wallIds[0]
    const wall = floor.walls.find((w) => w.id === wallId)
    if (!wall) return null
    const isEndpoint = wall.a === vertexId || wall.b === vertexId
    const attached = hasPointOnWall(floor.constraints, vertexId, wallId)
    return { vertexId, wallId, isEndpoint, attached }
  })()

  const handleCopyConfirm = (options: CopyFloorOptions) => {
    copyFromPreviousFloor(options)
    setShowCopyFromPrev(false)
  }

  return (
    <aside className="properties">
      <h2 className="panel-title">
        {isPaint ? 'Текстуры' : isFurnish ? 'Объект' : 'Свойства'}
      </h2>

      {(conflict || statusMessage) && (
        <div className={`status ${conflict ? 'conflict' : ''}`}>
          {statusMessage ?? 'Конфликт ограничений'}
        </div>
      )}

      {isDraft && (
      <section className="prop-section">
        <label>
          Проект
          <input
            value={building.name}
            onChange={(e) => setBuildingName(e.target.value)}
          />
        </label>
        {isGround ? (
          <>
            <label>
              Уровень земли, м
              <input
                type="number"
                min={-50}
                max={100}
                step={0.05}
                value={floor.elevation}
                onChange={(e) =>
                  setFloorElevation(activeFloorId, Number(e.target.value))
                }
              />
            </label>
            <p className="muted">
              Непрозрачная плоскость; вырез — по контуру этажа, который
              пересекает уровень земли. Видимость — галочка на вкладке этажа.
            </p>
          </>
        ) : (
          <>
            <label>
              Этаж
              <input
                value={floor.name}
                onChange={(e) => renameFloor(activeFloorId, e.target.value)}
              />
            </label>
            {isFirstStory && (
              <>
                <label>
                  Уровень пола, м
                  <input
                    type="number"
                    min={-50}
                    max={100}
                    step={0.05}
                    value={floor.elevation}
                    onChange={(e) =>
                      setFloorElevation(activeFloorId, Number(e.target.value))
                    }
                  />
                </label>
                {riseAboveGround !== null && (
                  <p className="muted">
                    Над землёй:{' '}
                    {riseAboveGround >= 0 ? '+' : ''}
                    {riseAboveGround.toFixed(2)} м
                  </p>
                )}
              </>
            )}
            {!isFirstStory && (
              <p className="muted">
                Уровень пола: {floor.elevation.toFixed(2)} м
              </p>
            )}
            <label>
              Высота этажа, м
              <input
                type="number"
                min={2}
                max={5}
                step={0.1}
                value={floor.height}
                onChange={(e) => setFloorHeight(activeFloorId, Number(e.target.value))}
              />
            </label>
            <label>
              Толщина пола, м
              <input
                type="number"
                min={0.05}
                max={1}
                step={0.05}
                value={floor.slabThickness}
                onChange={(e) =>
                  setFloorSlabThickness(activeFloorId, Number(e.target.value))
                }
              />
            </label>
            <p className="muted">
              Зазор между потолком этажа ниже и полом текущего
            </p>
            {previousFloor && !showCopyFromPrev && (
              <button
                type="button"
                className="prop-action"
                onClick={() => setShowCopyFromPrev(true)}
              >
                Копировать с «{previousFloor.name}»
              </button>
            )}
            {previousFloor && showCopyFromPrev && (
              <CopyFloorOptionsForm
                title={`Копировать с «${previousFloor.name}»`}
                confirmLabel="Скопировать"
                onConfirm={handleCopyConfirm}
                onCancel={() => setShowCopyFromPrev(false)}
              />
            )}
          </>
        )}
      </section>
      )}

      {isDraft && !isGround && <ConstraintsList />}

      {isPaint && (
        <p className="hint">
          Палитра слева · ЛКМ — нанести · Alt — стереть · Shift+пол — стены
          комнаты. Слоты ниже — для выделенной поверхности.
        </p>
      )}

      {isFurnish && !placedObject && (
        <p className="muted">
          Выберите объект на плане или в 3D, либо поставьте новый из каталога.
        </p>
      )}

      {!isGround && (isDraft || isPaint || isFurnish) && (
        <>
      {isDraft && slabOpening && (
        <section className="prop-section">
          <h3>{slabOpeningKindLabel(slabOpening.kind)}</h3>
          <p className="muted">Прямоугольный вырез в плите пола</p>
          <label>
            Ширина (X), м
            <input
              type="number"
              min={0.8}
              max={20}
              step={0.05}
              value={slabOpening.width}
              onChange={(e) =>
                updateSlabOpening(slabOpening.id, {
                  width: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Глубина (Y), м
            <input
              type="number"
              min={0.8}
              max={20}
              step={0.05}
              value={slabOpening.depth}
              onChange={(e) =>
                updateSlabOpening(slabOpening.id, {
                  depth: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Центр X, м
            <input
              type="number"
              step={0.05}
              value={slabOpening.x}
              onChange={(e) =>
                updateSlabOpening(slabOpening.id, { x: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Центр Y, м
            <input
              type="number"
              step={0.05}
              value={slabOpening.y}
              onChange={(e) =>
                updateSlabOpening(slabOpening.id, { y: Number(e.target.value) })
              }
            />
          </label>
        </section>
      )}

      {isPaint && slabOpening && (
        <section className="prop-section">
          <h3>{slabOpeningKindLabel(slabOpening.kind)}</h3>
          <MaterialSlot
            label="Срезы (стенки выреза)"
            value={slabOpening.material}
            onChange={(ref) => setSlabOpeningMaterial(slabOpening.id, ref)}
            onClear={() => setSlabOpeningMaterial(slabOpening.id, null)}
          />
        </section>
      )}

      {isDraft && floorPlate && (
        <section className="prop-section">
          <h3>Пол без стен</h3>
          <p className="muted">Прямоугольная плита пола без контура стен</p>
          <label>
            Ширина (X), м
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.05}
              value={floorPlate.width}
              onChange={(e) =>
                updateFloorPlate(floorPlate.id, {
                  width: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Глубина (Y), м
            <input
              type="number"
              min={0.5}
              max={50}
              step={0.05}
              value={floorPlate.depth}
              onChange={(e) =>
                updateFloorPlate(floorPlate.id, {
                  depth: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Центр X, м
            <input
              type="number"
              step={0.05}
              value={floorPlate.x}
              onChange={(e) =>
                updateFloorPlate(floorPlate.id, { x: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Центр Y, м
            <input
              type="number"
              step={0.05}
              value={floorPlate.y}
              onChange={(e) =>
                updateFloorPlate(floorPlate.id, { y: Number(e.target.value) })
              }
            />
          </label>
        </section>
      )}

      {isPaint && floorPlate && (
        <section className="prop-section">
          <h3>Пол без стен</h3>
          <MaterialSlot
            label="Покрытие пола"
            value={floorPlate.material}
            onChange={(ref) => setFloorPlateMaterial(floorPlate.id, ref)}
            onClear={() => setFloorPlateMaterial(floorPlate.id, null)}
          />
        </section>
      )}

      {isFurnish && placedObject && (
        <section className="prop-section">
          <h3>3D объект</h3>
          <p className="muted">
            {placedObject.model.source === 'catalog' &&
              `Каталог: ${placedObject.model.assetId}`}
            {placedObject.model.source === 'nasa' &&
              `NASA: ${placedObject.model.assetId}`}
            {placedObject.model.source === 'local' &&
              `Локальный: ${placedObject.model.localId}`}
            {placedObject.model.source === 'library' &&
              `${placedObject.model.library}: ${placedObject.model.id}`}
            {placedObject.model.source === 'url' && 'URL'}
          </p>
          {placedObject.attribution && (
            <p className="muted">
              {placedObject.attribution.author} · {placedObject.attribution.license}
            </p>
          )}
          <label>
            X, м
            <input
              type="number"
              step={0.05}
              value={placedObject.x}
              onChange={(e) =>
                updatePlacedObject(placedObject.id, {
                  x: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Y (план), м
            <input
              type="number"
              step={0.05}
              value={placedObject.y}
              onChange={(e) =>
                updatePlacedObject(placedObject.id, {
                  y: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Высота над полом, м
            <input
              type="number"
              step={0.05}
              min={0}
              value={placedObject.elevation}
              onChange={(e) =>
                updatePlacedObject(placedObject.id, {
                  elevation: Math.max(0, Number(e.target.value)),
                })
              }
            />
          </label>
          <label>
            Поворот Y, °
            <input
              type="number"
              step={5}
              value={Math.round((placedObject.rotationY * 180) / Math.PI)}
              onChange={(e) =>
                updatePlacedObject(placedObject.id, {
                  rotationY: (Number(e.target.value) * Math.PI) / 180,
                })
              }
            />
          </label>
          <label>
            Масштаб X
            <input
              type="number"
              min={0.05}
              max={20}
              step={0.05}
              value={placedObject.scaleX}
              onChange={(e) =>
                updatePlacedObject(placedObject.id, {
                  scaleX: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Масштаб Y
            <input
              type="number"
              min={0.05}
              max={20}
              step={0.05}
              value={placedObject.scaleY}
              onChange={(e) =>
                updatePlacedObject(placedObject.id, {
                  scaleY: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Масштаб Z
            <input
              type="number"
              min={0.05}
              max={20}
              step={0.05}
              value={placedObject.scaleZ}
              onChange={(e) =>
                updatePlacedObject(placedObject.id, {
                  scaleZ: Number(e.target.value),
                })
              }
            />
          </label>
          <p className="muted">
            Drag — перемещение. Двойной клик по объекту — смена режима gizmo
            (двигать / вращать / масштаб).
          </p>
        </section>
      )}

      {isDraft && opening && (
        <section className="prop-section">
          <h3>{openingKindLabel(opening.kind)}</h3>
          <label>
            Тип
            <select
              value={opening.kind}
              onChange={(e) =>
                updateOpening(opening.id, {
                  kind: e.target.value as typeof opening.kind,
                })
              }
            >
              <option value="door">Дверь</option>
              <option value="passage">Проём</option>
              <option value="window">Окно</option>
            </select>
          </label>
          <label>
            Ширина, м
            <input
              type="number"
              min={0.4}
              max={5}
              step={0.05}
              value={opening.width}
              onChange={(e) =>
                updateOpening(opening.id, { width: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Высота, м
            <input
              type="number"
              min={0.3}
              max={floor.height}
              step={0.05}
              value={opening.height}
              onChange={(e) =>
                updateOpening(opening.id, { height: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Подоконник / порог, м
            <input
              type="number"
              min={0}
              max={floor.height - 0.2}
              step={0.05}
              value={opening.sillHeight}
              onChange={(e) =>
                updateOpening(opening.id, { sillHeight: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Смещение от начала стены, м
            <input
              type="number"
              min={0}
              step={0.05}
              value={opening.offset}
              onChange={(e) =>
                updateOpening(opening.id, { offset: Number(e.target.value) })
              }
            />
          </label>
        </section>
      )}

      {isDraft && wall && (
        <section className="prop-section">
          <h3>Стена</h3>
          <p className="muted">Длина: {wallLength(floor, wall).toFixed(2)} м</p>
          <label>
            Толщина, м
            <input
              type="number"
              min={0.1}
              max={0.6}
              step={0.05}
              value={wall.thickness}
              onChange={(e) => setWallThickness(wall.id, Number(e.target.value))}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={hasFixedLength(floor.constraints, wall.id)}
              onChange={() => toggleFixedLength(wall.id)}
            />
            <img
              src={CONSTRAINT_ICONS.fixedLength}
              alt=""
              width={16}
              height={16}
            />
            Фиксировать длину
          </label>
          {(() => {
            const fixed = floor.constraints.find(
              (c): c is Extract<typeof c, { type: 'fixedLength' }> =>
                c.type === 'fixedLength' && c.wallId === wall.id,
            )
            if (!fixed) return null
            return (
              <label>
                Заданная длина, м
                <input
                  type="number"
                  min={0.5}
                  step={0.1}
                  value={fixed.length}
                  onChange={(e) => setFixedLengthValue(wall.id, Number(e.target.value))}
                />
              </label>
            )
          })()}
          <label className="check">
            <input
              type="checkbox"
              checked={hasAxisConstraint(floor.constraints, wall.id, 'horizontal')}
              onChange={() => toggleAxis(wall.id, 'horizontal')}
            />
            <img
              src={CONSTRAINT_ICONS.horizontal}
              alt=""
              width={16}
              height={16}
            />
            Горизонтальная
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={hasAxisConstraint(floor.constraints, wall.id, 'vertical')}
              onChange={() => toggleAxis(wall.id, 'vertical')}
            />
            <img
              src={CONSTRAINT_ICONS.vertical}
              alt=""
              width={16}
              height={16}
            />
            Вертикальная
          </label>
        </section>
      )}

      {isPaint && wall && (
        <section className="prop-section">
          <h3>Стена</h3>
          <MaterialSlot
            label="Обе стороны"
            value={
              wall.materials?.pos?.assetId === wall.materials?.neg?.assetId
                ? wall.materials?.pos
                : null
            }
            onChange={(ref) => setWallBothMaterials(wall.id, ref)}
            onClear={() => setWallBothMaterials(wall.id, null)}
          />
          <MaterialSlot
            label={
              wallSideRooms.pos
                ? `Сторона + (комната)`
                : 'Сторона + (снаружи)'
            }
            value={wall.materials?.pos}
            onChange={(ref) => setWallSideMaterial(wall.id, 'pos', ref)}
            onClear={() => setWallSideMaterial(wall.id, 'pos', null)}
          />
          <MaterialSlot
            label={
              wallSideRooms.neg
                ? `Сторона − (комната)`
                : 'Сторона − (снаружи)'
            }
            value={wall.materials?.neg}
            onChange={(ref) => setWallSideMaterial(wall.id, 'neg', ref)}
            onClear={() => setWallSideMaterial(wall.id, 'neg', null)}
          />
          <MaterialSlot
            label="Срезы (торцы и проёмы)"
            value={wall.materials?.cut}
            onChange={(ref) => setWallCutMaterial(wall.id, ref)}
            onClear={() => setWallCutMaterial(wall.id, null)}
          />
          <p className="muted">
            Срезы — свободные торцы стены и грани вырезов (дверь, окно, проём).
          </p>
        </section>
      )}

      {isPaint && room && (
        <section className="prop-section">
          <h3>Комната</h3>
          <p className="muted">Стен в контуре: {room.wallIds.length}</p>
          <MaterialSlot
            label="Пол"
            value={floor.roomFloorMaterials?.[room.key]}
            onChange={(ref) => setRoomFloorMaterial(room.key, ref)}
            onClear={() => setRoomFloorMaterial(room.key, null)}
          />
          <MaterialSlot
            label="Все стены (внутренняя сторона)"
            value={null}
            applyOnly
            onChange={(ref) => setRoomWallsMaterial(room.key, ref)}
            onClear={() => setRoomWallsMaterial(room.key, null)}
          />
          <p className="muted">
            «Все стены» задаёт текстуру на внутреннюю сторону каждой стены
            контура. Стороны соседних комнат не затираются.
          </p>
        </section>
      )}

      {isDraft && room && (
        <section className="prop-section">
          <h3>Комната</h3>
          <p className="muted">
            Стен в контуре: {room.wallIds.length}. Текстуры — в верстаке
            «Покраска».
          </p>
        </section>
      )}

      {isDraft && vertex && (
        <section className="prop-section">
          <h3>Вершина</h3>
          <p className="muted">
            X: {vertex.x.toFixed(2)} м · Y: {vertex.y.toFixed(2)} м
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={hasFixedPosition(floor.constraints, vertex.id)}
              onChange={() => toggleFixedPosition(vertex.id)}
            />
            <img
              src={CONSTRAINT_ICONS.fixedPosition}
              alt=""
              width={16}
              height={16}
            />
            Закрепить позицию
          </label>
        </section>
      )}

      {isDraft && multi && (
        <section className="prop-section">
          <h3>Выделение</h3>
          <p className="muted">
            Вершин: {multi.vertexIds.length} · стен: {multi.wallIds.length}
          </p>
          <p className="muted">
            Shift+клик: стены и точки выбираются независимо.
            Alt+клик по ребру — точка на стене.
          </p>
          {vertexIds.length === 2 && (
            <button type="button" className="prop-action" onClick={mergeSelectedVertices}>
              Слить 2 точки в одну
            </button>
          )}
        </section>
      )}

      {isDraft && pointOnWallPair && (
        <section className="prop-section">
          <h3>Точка на стене</h3>
          {pointOnWallPair.isEndpoint ? (
            <p className="muted">Точка уже является концом этой стены.</p>
          ) : (
            <>
              <label className="check">
                <input
                  type="checkbox"
                  checked={pointOnWallPair.attached}
                  onChange={() => {
                    if (pointOnWallPair.attached) {
                      clearPointOnWall(
                        pointOnWallPair.vertexId,
                        pointOnWallPair.wallId,
                      )
                    } else {
                      setPointOnWall(
                        pointOnWallPair.vertexId,
                        pointOnWallPair.wallId,
                      )
                    }
                  }}
                />
                <img
                  src={CONSTRAINT_ICONS.pointOnWall}
                  alt=""
                  width={16}
                  height={16}
                />
                Прикрепить точку к стене
              </label>
              <p className="muted">
                Точка остаётся на осевой линии выбранной стены.
              </p>
            </>
          )}
        </section>
      )}

      {isDraft && pointsAlign && (
        <section className="prop-section">
          <h3>Выравнивание точек</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={pointsAlign.horizontal}
              onChange={() => {
                if (pointsAlign.horizontal) {
                  clearPointsAligned(pointsAlign.ids, 'horizontal')
                } else {
                  setPointsAligned(pointsAlign.ids, 'horizontal')
                }
              }}
            />
            <img
              src={CONSTRAINT_ICONS.horizontal}
              alt=""
              width={16}
              height={16}
            />
            На одной горизонтали
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={pointsAlign.vertical}
              onChange={() => {
                if (pointsAlign.vertical) {
                  clearPointsAligned(pointsAlign.ids, 'vertical')
                } else {
                  setPointsAligned(pointsAlign.ids, 'vertical')
                }
              }}
            />
            <img
              src={CONSTRAINT_ICONS.vertical}
              alt=""
              width={16}
              height={16}
            />
            На одной вертикали
          </label>
        </section>
      )}

      {isDraft && vertexDistancePair && (
        <section className="prop-section">
          <h3>Расстояние между вершинами</h3>
          <p className="muted">
            Толщины у точек: {vertexDistancePair.tA.toFixed(2)} /{' '}
            {vertexDistancePair.tB.toFixed(2)} м
          </p>
          <label>
            Грань
            <select
              value={vertexDistancePair.face}
              onChange={(e) => {
                const face = e.target.value as WallFace
                const d = centerToFaceDistance(
                  face,
                  vertexDistancePair.center,
                  vertexDistancePair.tA,
                  vertexDistancePair.tB,
                )
                setVertexDistance(
                  vertexDistancePair.idA,
                  vertexDistancePair.idB,
                  d,
                  face,
                )
              }}
            >
              <option value="inner">Внутренние грани</option>
              <option value="outer">Внешние грани</option>
              <option value="center">Осевые точки</option>
            </select>
          </label>
          <label>
            Расстояние, м
            <input
              type="number"
              min={0.05}
              step={0.05}
              defaultValue={Number(vertexDistancePair.current.toFixed(3))}
              key={`${vertexDistancePair.idA}-${vertexDistancePair.idB}-${vertexDistancePair.face}-${vertexDistancePair.existing?.id ?? 'new'}`}
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                setVertexDistance(
                  vertexDistancePair.idA,
                  vertexDistancePair.idB,
                  n,
                  vertexDistancePair.face,
                )
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
          </label>
          {vertexDistancePair.existing ? (
            <button
              type="button"
              className="linkish"
              onClick={() =>
                clearVertexDistance(
                  vertexDistancePair.idA,
                  vertexDistancePair.idB,
                )
              }
            >
              Снять ограничение
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                setVertexDistance(
                  vertexDistancePair.idA,
                  vertexDistancePair.idB,
                  vertexDistancePair.current,
                  vertexDistancePair.face,
                )
              }
            >
              Задать ограничение
            </button>
          )}
        </section>
      )}

      {isDraft && distancePair && (
        <section className="prop-section">
          <h3>Расстояние между стенами</h3>
          <p className="muted">
            Обе стены {distancePair.axis === 'horizontal' ? 'горизонтальные' : 'вертикальные'}
          </p>
          <label>
            Грань
            <select
              value={distancePair.face}
              onChange={(e) => {
                const face = e.target.value as WallFace
                const center = centerDistance(
                  floor,
                  distancePair.wa,
                  distancePair.wb,
                )
                const d = centerToFaceDistance(
                  face,
                  center,
                  distancePair.wa.thickness,
                  distancePair.wb.thickness,
                )
                setWallDistance(distancePair.idA, distancePair.idB, d, face)
              }}
            >
              <option value="inner">Внутренние грани</option>
              <option value="outer">Внешние грани</option>
              <option value="center">Осевые линии</option>
            </select>
          </label>
          <label>
            Расстояние, м
            <input
              type="number"
              min={0.05}
              step={0.05}
              defaultValue={Number(distancePair.current.toFixed(3))}
              key={`${distancePair.idA}-${distancePair.idB}-${distancePair.face}-${distancePair.existing?.id ?? 'new'}`}
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (!Number.isFinite(n)) return
                setWallDistance(
                  distancePair.idA,
                  distancePair.idB,
                  n,
                  distancePair.face,
                )
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
          </label>
          {distancePair.existing ? (
            <button
              type="button"
              className="linkish"
              onClick={() =>
                clearWallDistance(distancePair.idA, distancePair.idB)
              }
            >
              Снять ограничение
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                setWallDistance(
                  distancePair.idA,
                  distancePair.idB,
                  distancePair.current,
                  distancePair.face,
                )
              }
            >
              Задать ограничение
            </button>
          )}
        </section>
      )}

      {isDraft && wallIds.length === 2 && !distancePair && (
        <section className="prop-section">
          <p className="muted">
            Для расстояния обе стены должны быть горизонтальными или обе
            вертикальными (ограничения H/V).
          </p>
        </section>
      )}

      {isDraft &&
        !wall &&
        !vertex &&
        !multi &&
        !opening &&
        !slabOpening &&
        !floorPlate &&
        !distancePair &&
        !pointsAlign &&
        !vertexDistancePair &&
        !pointOnWallPair && (
        <p className="muted">
          Выберите стену, вершину, проём или пол. Инструмент «Пол» (B) — плита
          без стен. Shift+клик — несколько.
        </p>
      )}
        </>
      )}
    </aside>
  )
}
