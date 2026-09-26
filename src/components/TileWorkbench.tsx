import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconImg, TOOL_ICONS, UI_ICONS } from './icons'
import { useBuildingStore } from '../store/buildingStore'
import { defaultTileSpec, isGroundFloor, selectedTileIds, type TileSpec, type Tool } from '../engine/types'
import {
  childrenOf,
  folderPath,
} from '../models/collection'
import {
  createTileFolderId,
  deleteTileFolder,
  deleteTileItem,
  ensureStarterTiles,
  listTileFolders,
  listTileItems,
  newTileItem,
  putTileFolder,
  putTileItem,
  type TileCollectionFolder,
  type TileCollectionItem,
} from '../materials/tileCollection'
import { TileEditor } from './TileEditor'
import { TileThumb } from './TileThumb'

const tools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', hint: 'V' },
  { id: 'placeTile', label: 'Класть', hint: 'T' },
  { id: 'fillTile', label: 'Залить', hint: 'F' },
  { id: 'cutTile', label: 'Подрезать', hint: 'C' },
]

export function TileWorkbench() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const pendingTile = useBuildingStore((s) => s.pendingTile)
  const setPendingTile = useBuildingStore((s) => s.setPendingTile)
  const tileGroutM = useBuildingStore((s) => s.tileGroutM)
  const setTileGroutM = useBuildingStore((s) => s.setTileGroutM)
  const tileSnapEnabled = useBuildingStore((s) => s.tileSnapEnabled)
  const toggleTileSnap = useBuildingStore((s) => s.toggleTileSnap)
  const tileFillPattern = useBuildingStore((s) => s.tileFillPattern)
  const setTileFillPattern = useBuildingStore((s) => s.setTileFillPattern)
  const rotateTileOrPending = useBuildingStore((s) => s.rotateTileOrPending)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const selection = useBuildingStore((s) => s.selection)
  const floor = useBuildingStore((s) => s.activeFloor())
  const ground = isGroundFloor(floor)
  const hasTile = selectedTileIds(selection).length > 0

  const [folders, setFolders] = useState<TileCollectionFolder[]>([])
  const [items, setItems] = useState<TileCollectionItem[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [editing, setEditing] = useState<TileCollectionItem | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [f, all] = await Promise.all([
        listTileFolders(),
        ensureStarterTiles().then(() => listTileItems()),
      ])
      setFolders(f)
      setItems(all)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка коллекции')
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const visibleItems = useMemo(
    () => items.filter((i) => i.folderId === folderId),
    [items, folderId],
  )
  const childFolders = useMemo(
    () => childrenOf(folders, folderId),
    [folders, folderId],
  )
  const breadcrumb = useMemo(
    () => folderPath(folders, folderId),
    [folders, folderId],
  )

  const onCreateFolder = async () => {
    const name = newFolderName.trim() || 'Папка'
    const siblings = childrenOf(folders, folderId)
    await putTileFolder({
      id: createTileFolderId(),
      parentId: folderId,
      name,
      order: siblings.length,
    })
    setNewFolderName('')
    await reload()
  }

  return (
    <aside className="toolbar workbench-rail furnish-rail" aria-label="Плитка">
      <h2 className="panel-title">Плитка</h2>

      {ground ? (
        <p className="hint">Плитку кладут на этаж. Переключитесь на этаж.</p>
      ) : (
        <>
          <div className="furnish-tools" role="group" aria-label="Инструменты">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tool-btn ${tool === t.id ? 'active' : ''}`}
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.hint})`}
              >
                <span className="tool-btn-main">
                  {TOOL_ICONS[t.id] && (
                    <IconImg
                      src={TOOL_ICONS[t.id]!}
                      className="ui-icon tool-icon"
                    />
                  )}
                  <span>{t.label}</span>
                </span>
                <kbd>{t.hint}</kbd>
              </button>
            ))}
          </div>

          <div className="furnish-tools" role="group" aria-label="Укладка">
            <button
              type="button"
              className={`tool-btn ${tileSnapEnabled ? 'active' : ''}`}
              onClick={() => toggleTileSnap()}
              title="Прилипание к соседним плиткам"
            >
              <span className="tool-btn-main">
                <span>Прилипание</span>
              </span>
            </button>
            <button
              type="button"
              className="tool-btn"
              onClick={() => rotateTileOrPending()}
              title="Поворот 90° (R)"
            >
              <span className="tool-btn-main">
                <span>Поворот 90°</span>
              </span>
              <kbd>R</kbd>
            </button>
          </div>

          <label className="tile-grout">
            Шов, мм
            <input
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={Math.round(tileGroutM * 1000 * 10) / 10}
              onChange={(e) => setTileGroutM(Number(e.target.value) / 1000)}
            />
          </label>

          <div className="furnish-tools" role="group" aria-label="Рисунок заливки">
            <button
              type="button"
              className={`tool-btn ${tileFillPattern === 'straight' ? 'active' : ''}`}
              onClick={() => setTileFillPattern('straight')}
            >
              <span className="tool-btn-main">
                <span>Прямо</span>
              </span>
            </button>
            <button
              type="button"
              className={`tool-btn ${tileFillPattern === 'offset' ? 'active' : ''}`}
              onClick={() => setTileFillPattern('offset')}
            >
              <span className="tool-btn-main">
                <span>Сдвиг 1/2</span>
              </span>
            </button>
          </div>

          {pendingTile && (
            <div className="tile-pending-preview">
              <TileThumb
                material={pendingTile.material}
                alt={pendingTile.name}
                width={pendingTile.width}
                length={pendingTile.length}
                texRegion={pendingTile.texRegion}
              />
              <div className="tile-pending-meta">
                <strong>{pendingTile.name}</strong>
                <span className="muted">
                  {pendingTile.width.toFixed(2)}×{pendingTile.length.toFixed(2)} м
                </span>
              </div>
            </div>
          )}

          {tool === 'placeTile' && pendingTile && (
            <p className="hint">
              Клик кладёт плитку. У стены или в узком зазоре она сама
              подрежется — серый контур показывает форму.
            </p>
          )}
          {tool === 'fillTile' && pendingTile && (
            <p className="hint">
              Клик по грани заливает пустые места сеткой и подрезает плитки у
              стен и проёмов. Если плитки уже лежат, сетка к ним привяжется.
            </p>
          )}
          {tool === 'cutTile' && (
            <p className="hint">
              Два клика по плитке — линия реза. Остаются обе части, ненужную
              удалите. Shift на втором клике — оставить только одну часть.
            </p>
          )}

          <button
            type="button"
            className="tool-btn furnish-add-btn"
            onClick={() => setCreating(true)}
          >
            <span className="tool-btn-main">
              <span>Новая плитка</span>
            </span>
          </button>

          <nav className="furnish-breadcrumb" aria-label="Папки коллекции">
            <button
              type="button"
              className={!folderId ? 'active' : undefined}
              onClick={() => setFolderId(null)}
            >
              Коллекция
            </button>
            {breadcrumb.map((f) => (
              <span key={f.id} className="collection-crumb">
                <span className="muted">/</span>
                <button
                  type="button"
                  className={folderId === f.id ? 'active' : undefined}
                  onClick={() => setFolderId(f.id)}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </nav>

          <div className="furnish-folder-row">
            <input
              type="text"
              placeholder="Новая папка"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onCreateFolder()
              }}
            />
            <button type="button" className="ghost" onClick={() => void onCreateFolder()}>
              +
            </button>
            {folderId && (
              <button
                type="button"
                className="ghost"
                title="Удалить папку"
                onClick={async () => {
                  const parent =
                    folders.find((f) => f.id === folderId)?.parentId ?? null
                  await deleteTileFolder(folderId)
                  setFolderId(parent)
                  await reload()
                }}
              >
                ×
              </button>
            )}
          </div>

          {error && <p className="conflict">{error}</p>}

          <div className="furnish-collection-list">
            {childFolders.map((f) => (
              <button
                key={f.id}
                type="button"
                className="furnish-folder-row-btn"
                onClick={() => setFolderId(f.id)}
              >
                <span className="collection-folder-icon" aria-hidden>
                  ▢
                </span>
                <span>{f.name}</span>
              </button>
            ))}

            {visibleItems.map((item) => (
              <article key={item.id} className="furnish-item-card">
                <TileThumb
                  material={item.spec.material}
                  alt={item.spec.name}
                  width={item.spec.width}
                  length={item.spec.length}
                  texRegion={item.spec.texRegion}
                />
                <div className="furnish-item-body">
                  <strong title={item.spec.name}>{item.spec.name}</strong>
                  <span className="muted">
                    {item.spec.width.toFixed(2)}×{item.spec.length.toFixed(2)} м ·{' '}
                    {Math.round(item.spec.thickness * 1000)} мм
                  </span>
                  <div className="furnish-item-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingTile({ ...item.spec, material: { ...item.spec.material } })
                        setTool('placeTile')
                      }}
                    >
                      Класть
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setEditing(item)}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={async () => {
                        await deleteTileItem(item.id)
                        await reload()
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {(creating || editing) && (
            <TileEditor
              title={creating ? 'Новая плитка' : 'Плитка'}
              spec={creating ? defaultTileSpec() : editing!.spec}
              onClose={() => {
                setCreating(false)
                setEditing(null)
              }}
              onSave={async (spec: TileSpec) => {
                if (creating) {
                  await putTileItem(newTileItem(spec, folderId))
                } else if (editing) {
                  await putTileItem({ ...editing, spec })
                }
                setCreating(false)
                setEditing(null)
                await reload()
              }}
            />
          )}

          <div className="tool-actions">
            <button type="button" onClick={deleteSelection} disabled={!hasTile}>
              <IconImg src={UI_ICONS.delete} className="ui-icon" />
              Удалить плитку
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
