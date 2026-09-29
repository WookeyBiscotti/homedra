import type { LandscapeGrassLayer, PlantShape } from '../engine/types'
import { LANDSCAPE_GRASS_DEFAULTS } from '../engine/types'
import { EZ_GRASS_WIND } from '../landscape/ezGrass'
import { MAX_GRASS_LAYERS } from '../landscape/grassLayers'
import { CROWN_SHAPE_OPTIONS } from '../landscape/plantShape'
import { frameSizeX, frameSizeY } from '../landscape/maps'
import {
  PLOT_MAX_M,
  PLOT_MIN_M,
  houseOffsetOnPlot,
  plotFrame,
} from '../landscape/site'
import { useBuildingStore } from '../store/buildingStore'

export function SitePlotFields() {
  const building = useBuildingStore((s) => s.building)
  const terrain = building.floors.find((f) => f.kind === 'ground')?.landscapeTerrain
  const frame = plotFrame(terrain)
  const offset = houseOffsetOnPlot(building, frame)
  const setLandscapePlot = useBuildingStore((s) => s.setLandscapePlot)
  const setHouseOffsetOnPlot = useBuildingStore((s) => s.setHouseOffsetOnPlot)
  const centerHouseOnPlot = useBuildingStore((s) => s.centerHouseOnPlot)
  const preview = useBuildingStore((s) => s.siteHousePreview)
  const liveOffset = {
    x: offset.x + (preview?.dx ?? 0),
    y: offset.y + (preview?.dy ?? 0),
  }

  return (
    <div className="landscape-fields site-plot-fields">
      <label>
        Ширина участка, м
        <input
          type="number"
          min={PLOT_MIN_M}
          max={PLOT_MAX_M}
          step={0.5}
          value={Number(frameSizeX(frame).toFixed(2))}
          onChange={(e) =>
            setLandscapePlot({ sizeX: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Длина участка, м
        <input
          type="number"
          min={PLOT_MIN_M}
          max={PLOT_MAX_M}
          step={0.5}
          value={Number(frameSizeY(frame).toFixed(2))}
          onChange={(e) =>
            setLandscapePlot({ sizeY: Number(e.target.value) })
          }
        />
      </label>
      <label>
        Дом от центра X, м
        <input
          type="number"
          step={0.1}
          value={Number(liveOffset.x.toFixed(2))}
          onChange={(e) =>
            setHouseOffsetOnPlot(Number(e.target.value), liveOffset.y)
          }
        />
      </label>
      <label>
        Дом от центра Y, м
        <input
          type="number"
          step={0.1}
          value={Number(liveOffset.y.toFixed(2))}
          onChange={(e) =>
            setHouseOffsetOnPlot(liveOffset.x, Number(e.target.value))
          }
        />
      </label>
      <button type="button" className="tool-btn site-center-btn" onClick={centerHouseOnPlot}>
        <span className="tool-btn-main">
          <span>Дом по центру</span>
        </span>
      </button>
      <p className="hint">
        В 3D: тяните край участка или сам дом. Рельеф и растения остаются на
        месте.
      </p>
    </div>
  )
}

export function PlantShapeFields({
  value,
  onChange,
}: {
  value: PlantShape
  onChange: (patch: Partial<PlantShape>) => void
}) {
  return (
    <div className="landscape-fields">
      <label>
        Высота, м
        <input
          type="range"
          min={0.4}
          max={30}
          step={0.1}
          value={value.height}
          onChange={(e) => onChange({ height: Number(e.target.value) })}
        />
        <span>{value.height.toFixed(1)}</span>
      </label>
      <label>
        Уровни ветвей
        <input
          type="range"
          min={2}
          max={4}
          step={1}
          value={value.levels}
          onChange={(e) => onChange({ levels: Number(e.target.value) })}
        />
        <span>{value.levels}</span>
      </label>
      <label>
        Форма кроны
        <select
          value={value.crownShape}
          onChange={(e) => onChange({ crownShape: Number(e.target.value) })}
        >
          {CROWN_SHAPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Плотность ветвей
        <input
          type="range"
          min={2}
          max={45}
          step={1}
          value={value.branchDensity}
          onChange={(e) => onChange({ branchDensity: Number(e.target.value) })}
        />
        <span>{value.branchDensity}</span>
      </label>
      <label>
        Угол ветвей
        <input
          type="range"
          min={15}
          max={95}
          step={1}
          value={value.branchAngle}
          onChange={(e) => onChange({ branchAngle: Number(e.target.value) })}
        />
        <span>{value.branchAngle}</span>
      </label>
      <label>
        Извилистость
        <input
          type="range"
          min={0}
          max={120}
          step={1}
          value={value.gnarliness}
          onChange={(e) => onChange({ gnarliness: Number(e.target.value) })}
        />
        <span>{value.gnarliness}</span>
      </label>
      <label>
        Стволы
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={value.trunks}
          onChange={(e) => onChange({ trunks: Number(e.target.value) })}
        />
        <span>{value.trunks}</span>
      </label>
      <label>
        Толщина ствола
        <input
          type="range"
          min={0.4}
          max={2.2}
          step={0.05}
          value={value.trunkThickness}
          onChange={(e) => onChange({ trunkThickness: Number(e.target.value) })}
        />
        <span>{value.trunkThickness.toFixed(2)}</span>
      </label>
      <label>
        Размер листа
        <input
          type="range"
          min={0.2}
          max={1.5}
          step={0.05}
          value={value.leafSize}
          onChange={(e) => onChange({ leafSize: Number(e.target.value) })}
        />
        <span>{value.leafSize.toFixed(2)}</span>
      </label>
      <label>
        Листьев на ветке
        <input
          type="range"
          min={0}
          max={30}
          step={1}
          value={value.leavesPerBranch}
          onChange={(e) =>
            onChange({ leavesPerBranch: Number(e.target.value) })
          }
        />
        <span>{value.leavesPerBranch}</span>
      </label>
      <label>
        Угол листа
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value.leafAngle}
          onChange={(e) => onChange({ leafAngle: Number(e.target.value) })}
        />
        <span>{value.leafAngle}</span>
      </label>
      <label>
        Начало листвы
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.leafStart}
          onChange={(e) => onChange({ leafStart: Number(e.target.value) })}
        />
        <span>{value.leafStart.toFixed(2)}</span>
      </label>
      <label>
        Разброс размера
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.leafSizeVar}
          onChange={(e) => onChange({ leafSizeVar: Number(e.target.value) })}
        />
        <span>{value.leafSizeVar.toFixed(2)}</span>
      </label>
      <label>
        Альфа листьев
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.leafAlpha}
          onChange={(e) => onChange({ leafAlpha: Number(e.target.value) })}
        />
        <span>{value.leafAlpha.toFixed(2)}</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={value.showLeaves}
          onChange={(e) => onChange({ showLeaves: e.target.checked })}
        />
        Показать листья
      </label>
    </div>
  )
}

export function GrassTypeList({
  layers,
  activeId,
  onSelect,
  onAdd,
  onRemove,
}: {
  layers: LandscapeGrassLayer[]
  activeId: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="grass-types">
      {layers.map((layer) => (
        <div
          key={layer.id}
          className={`grass-type ${activeId === layer.id ? 'active' : ''}`}
        >
          <button
            type="button"
            className="grass-type-pick"
            onClick={() => onSelect(layer.id)}
          >
            <span
              className="landscape-species-swatch"
              style={{ background: layer.color }}
            />
            <span>{layer.name}</span>
          </button>
          {layers.length > 1 && (
            <button
              type="button"
              className="grass-type-del"
              aria-label={`Удалить ${layer.name}`}
              onClick={() => onRemove(layer.id)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {layers.length < MAX_GRASS_LAYERS && (
        <button type="button" className="grass-type-add" onClick={onAdd}>
          + Другая трава
        </button>
      )}
    </div>
  )
}

export function GrassFields({
  name,
  density,
  height,
  width,
  color,
  seed,
  onChange,
}: {
  name?: string
  density: number
  height: number
  width: number
  color: string
  seed: number
  onChange: (patch: {
    name?: string
    density?: number
    height?: number
    width?: number
    color?: string
    seed?: number
  }) => void
}) {
  return (
    <div className="landscape-fields">
      {name != null && (
        <label>
          Название
          <input
            type="text"
            value={name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
      )}
      <label>
        Плотность
        <input
          type="range"
          min={0.4}
          max={18}
          step={0.2}
          value={density}
          onChange={(e) => onChange({ density: Number(e.target.value) })}
        />
        <span>{density.toFixed(1)}</span>
      </label>
      <label>
        Высота, м
        <input
          type="range"
          min={0.2}
          max={1.6}
          step={0.05}
          value={height}
          onChange={(e) => onChange({ height: Number(e.target.value) })}
        />
        <span>{height.toFixed(2)}</span>
      </label>
      <label>
        Ширина пучка
        <input
          type="range"
          min={0.8}
          max={3}
          step={0.05}
          value={width}
          onChange={(e) => onChange({ width: Number(e.target.value) })}
        />
        <span>{width.toFixed(2)}</span>
      </label>
      <label>
        Цвет
        <input
          type="color"
          value={color}
          onChange={(e) => onChange({ color: e.target.value })}
        />
        <span>{color}</span>
      </label>
      <label>
        Seed
        <input
          type="number"
          min={1}
          max={9999}
          step={1}
          value={seed}
          onChange={(e) =>
            onChange({
              seed: Math.max(1, Math.round(Number(e.target.value) || 1)),
            })
          }
        />
      </label>
      <p className="hint">
        Пучок EZ-Tree (`grass.glb`): высота {LANDSCAPE_GRASS_DEFAULTS.height} м, ширина{' '}
        {LANDSCAPE_GRASS_DEFAULTS.width}, alpha {EZ_GRASS_WIND.alphaTest}.
      </p>
    </div>
  )
}
