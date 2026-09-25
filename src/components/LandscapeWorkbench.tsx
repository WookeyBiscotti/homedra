import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MaterialRef, SculptMode, Tool } from '../engine/types'
import { TextureSourceTabs } from './CustomTextureLibrary'
import { useMaterialThumb } from './TextureBrowser'
import { LAYER_FALLBACK_HEX } from '../landscape/splatMaterial'
import {
  SPECIES_GROUP_LABELS,
  listSpecies,
  type PlantGroup,
} from '../landscape/species'
import { GrassFields, GrassTypeList, PlantShapeFields } from './LandscapeSettings'
import { grassLayers } from '../landscape/grassLayers'
import {
  childrenOf,
  listFolders,
  listItems,
  type CollectionFolder,
  type CollectionItem,
} from '../models/collection'
import { pendingFromCollectionItem } from '../models/placeCollectionItem'
import { useBuildingStore } from '../store/buildingStore'
import { IconImg, TOOL_ICONS } from './icons'

const tools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', hint: 'V' },
  { id: 'sculptGround', label: 'Рельеф', hint: 'E' },
  { id: 'placeObject', label: 'Объект', hint: 'F' },
  { id: 'paintGround', label: 'Грунт', hint: 'T' },
  { id: 'plant', label: 'Растение', hint: 'P' },
  { id: 'paintGrass', label: 'Трава', hint: 'R' },
]

const sculptModes: { id: SculptMode; label: string }[] = [
  { id: 'raise', label: 'Насыпь' },
  { id: 'lower', label: 'Яма' },
  { id: 'smooth', label: 'Сгладить' },
  { id: 'flatten', label: 'Выровнять' },
]

function LandscapeLayerThumb({ value }: { value: MaterialRef }) {
  const thumb = useMaterialThumb(value)
  if (!thumb) return null
  return <img src={thumb} alt="" referrerPolicy="no-referrer" />
}

export function LandscapeWorkbench() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const sculptMode = useBuildingStore((s) => s.sculptMode)
  const setSculptMode = useBuildingStore((s) => s.setSculptMode)
  const radius = useBuildingStore((s) => s.landscapeBrushRadius)
  const hardness = useBuildingStore((s) => s.landscapeBrushHardness)
  const strength = useBuildingStore((s) => s.landscapeBrushStrength)
  const setBrush = useBuildingStore((s) => s.setLandscapeBrush)
  const layer = useBuildingStore((s) => s.groundPaintLayer)
  const setLayer = useBuildingStore((s) => s.setGroundPaintLayer)
  const setLayerMat = useBuildingStore((s) => s.setGroundPaintLayerMaterial)
  const paint = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.landscapePaint,
  )
  const pendingPlant = useBuildingStore((s) => s.pendingPlantSpecies)
  const plantScale = useBuildingStore((s) => s.pendingPlantScale)
  const plantShape = useBuildingStore((s) => s.pendingPlantShape)
  const setPendingPlant = useBuildingStore((s) => s.setPendingPlant)
  const setPendingPlantShape = useBuildingStore((s) => s.setPendingPlantShape)
  const grassDensity = useBuildingStore((s) => s.grassDensity)
  const grassHeight = useBuildingStore((s) => s.grassTuftHeight)
  const grassWidth = useBuildingStore((s) => s.grassTuftWidth)
  const grassColor = useBuildingStore((s) => s.grassColor)
  const grassSeed = useBuildingStore((s) => s.grassSeed)
  const setGrassParams = useBuildingStore((s) => s.setGrassParams)
  const grassDoc = useBuildingStore(
    (s) => s.building.floors.find((f) => f.kind === 'ground')?.landscapeGrass,
  )
  const grassTypeLayers = grassLayers(grassDoc)
  const activeGrassLayerId = useBuildingStore((s) => s.activeGrassLayerId)
  const setActiveGrassLayer = useBuildingStore((s) => s.setActiveGrassLayer)
  const addGrassLayer = useBuildingStore((s) => s.addGrassLayer)
  const removeGrassLayer = useBuildingStore((s) => s.removeGrassLayer)
  const activeGrass = grassTypeLayers.find((l) => l.id === activeGrassLayerId) ?? grassTypeLayers[0]
  const setPendingModel = useBuildingStore((s) => s.setPendingModel)
  const setModelBrowserOpen = useBuildingStore((s) => s.setModelBrowserOpen)
  const pendingModel = useBuildingStore((s) => s.pendingModel)

  const [folders, setFolders] = useState<CollectionFolder[]>([])
  const [items, setItems] = useState<CollectionItem[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    const [f, all] = await Promise.all([listFolders(), listItems()])
    setFolders(f)
    setItems(all)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const item of items) {
      if (item.thumbBlob) urls[item.id] = URL.createObjectURL(item.thumbBlob)
    }
    setThumbs(urls)
    return () => {
      for (const u of Object.values(urls)) URL.revokeObjectURL(u)
    }
  }, [items])

  const visibleItems = useMemo(
    () => items.filter((i) => i.folderId === folderId),
    [items, folderId],
  )
  const childFolders = useMemo(
    () => childrenOf(folders, folderId),
    [folders, folderId],
  )

  return (
    <aside className="toolbar workbench-rail landscape-rail" aria-label="Ландшафт">
      <h2 className="panel-title">Ландшафт</h2>
      <div className="tool-list">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tool-btn ${tool === t.id ? 'active' : ''}`}
            onClick={() => {
              if (t.id !== 'plant') setPendingPlant(null)
              if (t.id !== 'placeObject') setPendingModel(null)
              setTool(t.id)
            }}
            title={`${t.label} (${t.hint})`}
          >
            <span className="tool-btn-main">
              {TOOL_ICONS[t.id] && (
                <IconImg src={TOOL_ICONS[t.id]!} className="ui-icon tool-icon" />
              )}
              <span>{t.label}</span>
            </span>
            <kbd>{t.hint}</kbd>
          </button>
        ))}
      </div>

      {(tool === 'sculptGround' ||
        tool === 'paintGround' ||
        tool === 'paintGrass') && (
        <div className="landscape-brush">
          <label>
            Радиус, м
            <input
              type="range"
              min={0.4}
              max={12}
              step={0.1}
              value={radius}
              onChange={(e) => setBrush({ radius: Number(e.target.value) })}
            />
            <span>{radius.toFixed(1)}</span>
          </label>
          <label>
            Жёсткость
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={hardness}
              onChange={(e) => setBrush({ hardness: Number(e.target.value) })}
            />
          </label>
          <label>
            Сила
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={strength}
              onChange={(e) => setBrush({ strength: Number(e.target.value) })}
            />
          </label>
        </div>
      )}

      {tool === 'sculptGround' && (
        <div className="furnish-tools" role="group" aria-label="Рельеф">
          {sculptModes.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`tool-btn ${sculptMode === m.id ? 'active' : ''}`}
              onClick={() => setSculptMode(m.id)}
            >
              <span className="tool-btn-main">
                <span>{m.label}</span>
              </span>
            </button>
          ))}
          <p className="hint">ЛКМ по земле. Один жест — одно отменение.</p>
        </div>
      )}

      {tool === 'paintGround' && (
        <>
          <div className="landscape-layers">
            {([0, 1, 2, 3] as const).map((i) => {
              const ref = paint?.layers[i]
              return (
                <button
                  key={i}
                  type="button"
                  className={`landscape-layer ${layer === i ? 'active' : ''}`}
                  onClick={() => setLayer(i)}
                >
                  {ref ? (
                    <LandscapeLayerThumb value={ref} />
                  ) : (
                    <span
                      className="landscape-layer-fallback"
                      style={{ ['--swatch' as string]: LAYER_FALLBACK_HEX[i] }}
                    >
                      {i === 0 ? 'База' : `Слой ${i}`}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="hint">ЛКМ — слой · Alt — стереть в базу</p>
          <TextureSourceTabs
            selected={paint?.layers[layer]}
            onSelect={(ref) => setLayerMat(layer, ref)}
            defaultQuery="grass"
            gridClassName="tex-grid paint-tex-grid"
          />
        </>
      )}

      {tool === 'placeObject' && (
        <>
          <button
            type="button"
            className="tool-btn furnish-add-btn"
            onClick={() => setModelBrowserOpen(true)}
          >
            <span className="tool-btn-main">
              <span>Добавить в коллекцию</span>
            </span>
          </button>
          {pendingModel && (
            <p className="hint">Кликните по земле в 3D.</p>
          )}
          <div className="furnish-collection-list">
            {childFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="furnish-folder-row-btn"
                onClick={() => setFolderId(f.id)}
              >
                {f.name}
              </button>
            ))}
            {visibleItems.map((item) => (
              <article key={item.id} className="furnish-item-card">
                {thumbs[item.id] ? (
                  <img src={thumbs[item.id]} alt="" />
                ) : (
                  <div className="model-thumb-fallback">3D</div>
                )}
                <div className="furnish-item-body">
                  <strong>{item.name}</strong>
                  <button
                    type="button"
                    onClick={() => {
                      const pending = pendingFromCollectionItem(item)
                      if (pending) setPendingModel(pending)
                    }}
                  >
                    Поставить
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {tool === 'plant' && (
        <>
          {(['conifer', 'deciduous', 'fruit', 'shrub', 'trellis', 'flower'] as PlantGroup[]).map((group) => {
            const items = listSpecies().filter((sp) => sp.group === group)
            if (items.length === 0) return null
            return (
              <div key={group} className="landscape-species-group">
                <p className="landscape-species-label">{SPECIES_GROUP_LABELS[group]}</p>
                <div className="landscape-species">
                  {items.map((sp) => (
                    <button
                      key={sp.key}
                      type="button"
                      className={`tex-card ${pendingPlant === sp.key ? 'tex-card-active' : ''}`}
                      onClick={() => setPendingPlant(sp.key, plantScale)}
                    >
                      <span
                        className="landscape-species-swatch"
                        style={{
                          background: `linear-gradient(135deg, ${sp.leafColor}, ${sp.flowerColor})`,
                        }}
                      />
                      <span>{sp.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <PlantShapeFields value={plantShape} onChange={setPendingPlantShape} />
          <p className="hint">Кликните по земле, чтобы посадить</p>
        </>
      )}

      {tool === 'paintGrass' && (
        <>
          <GrassTypeList
            layers={grassTypeLayers}
            activeId={activeGrass?.id ?? activeGrassLayerId}
            onSelect={setActiveGrassLayer}
            onAdd={addGrassLayer}
            onRemove={removeGrassLayer}
          />
          <GrassFields
            name={activeGrass?.name ?? 'Луг'}
            density={grassDensity}
            height={grassHeight}
            width={grassWidth}
            color={grassColor}
            seed={grassSeed}
            onChange={setGrassParams}
          />
          <p className="hint">ЛКМ рисует выбранный тип · Alt стирает только его</p>
        </>
      )}
    </aside>
  )
}
