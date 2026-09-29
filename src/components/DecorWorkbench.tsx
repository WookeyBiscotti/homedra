import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconImg, TOOL_ICONS, UI_ICONS } from './icons'
import { useBuildingStore } from '../store/buildingStore'
import {
  defaultMoldingSpec,
  isGroundFloor,
  moldingKindLabel,
  selectedMoldingIds,
  type MoldingSpec,
  type Tool,
} from '../engine/types'
import { childrenOf, folderPath } from '../models/collection'
import {
  createMoldingFolderId,
  deleteMoldingFolder,
  deleteMoldingItem,
  ensureStarterMoldings,
  listMoldingFolders,
  listMoldingItems,
  newMoldingItem,
  putMoldingFolder,
  putMoldingItem,
  type MoldingCollectionFolder,
  type MoldingCollectionItem,
} from '../materials/moldingCollection'
import { MoldingEditor } from './MoldingEditor'
import { TileThumb } from './TileThumb'
import { profileBounds } from '../engine/geometry/moldingProfile'

const tools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', hint: 'V' },
  { id: 'placeMolding', label: 'Класть', hint: 'T' },
  { id: 'fillMolding', label: 'Залить комнату', hint: 'F' },
]

export function DecorWorkbench() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const pendingMolding = useBuildingStore((s) => s.pendingMolding)
  const setPendingMolding = useBuildingStore((s) => s.setPendingMolding)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const selection = useBuildingStore((s) => s.selection)
  const floor = useBuildingStore((s) => s.activeFloor())
  const ground = isGroundFloor(floor)
  const hasMolding = selectedMoldingIds(selection).length > 0

  const [folders, setFolders] = useState<MoldingCollectionFolder[]>([])
  const [items, setItems] = useState<MoldingCollectionItem[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [editing, setEditing] = useState<MoldingCollectionItem | null>(null)
  const [creating, setCreating] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [f, all] = await Promise.all([
        listMoldingFolders(),
        ensureStarterMoldings().then(() => listMoldingItems()),
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
    await putMoldingFolder({
      id: createMoldingFolderId(),
      parentId: folderId,
      name,
      order: siblings.length,
    })
    setNewFolderName('')
    await reload()
  }

  return (
    <aside className="toolbar workbench-rail furnish-rail" aria-label="Декор">
      <h2 className="panel-title">Декор</h2>

      {ground ? (
        <p className="hint">
          Плинтуса и галтели ставят на этаж. Переключитесь на этаж.
        </p>
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
                    <IconImg src={TOOL_ICONS[t.id]!} className="ui-icon" />
                  )}
                  <span>{t.label}</span>
                </span>
              </button>
            ))}
          </div>

          {pendingMolding && (
            <div className="tile-pending-preview">
              <TileThumb
                material={pendingMolding.material}
                alt={pendingMolding.name}
                width={0.08}
                length={0.12}
              />
              <div className="tile-pending-meta">
                <strong>{pendingMolding.name}</strong>
                <span className="muted">
                  {moldingKindLabel(pendingMolding.kind)}
                  {(() => {
                    const b = profileBounds(pendingMolding.profile)
                    return ` · ${Math.round(b.maxX * 1000)}×${Math.round(b.maxY * 1000)} мм`
                  })()}
                </span>
              </div>
            </div>
          )}

          {tool === 'placeMolding' && pendingMolding && (
            <p className="hint">
              Наведите на низ стены (плинтус) или верх (галтель) — ghost покажет
              планку. Клик ставит (старый на этом участке снимается). Клик по
              установленному — удаляет.
            </p>
          )}
          {tool === 'fillMolding' && pendingMolding && (
            <p className="hint">
              Клик по полу комнаты ставит профиль по периметру с митрами (двери
              вырезаются у плинтуса; старые на тех же гранях заменяются). Клик по
              планке — удалить.
            </p>
          )}
          {tool === 'select' && (
            <p className="hint">
              Клик по планке — выбрать, Delete — удалить.
            </p>
          )}

          <button
            type="button"
            className="tool-btn furnish-add-btn"
            onClick={() => setCreating(true)}
          >
            <span className="tool-btn-main">
              <span>Новый профиль</span>
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
            <button
              type="button"
              className="ghost"
              onClick={() => void onCreateFolder()}
            >
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
                  await deleteMoldingFolder(folderId)
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

            {visibleItems.map((item) => {
              const b = profileBounds(item.spec.profile)
              return (
                <article key={item.id} className="furnish-item-card">
                  <TileThumb
                    material={item.spec.material}
                    alt={item.spec.name}
                    width={0.08}
                    length={0.12}
                  />
                  <div className="furnish-item-body">
                    <strong title={item.spec.name}>{item.spec.name}</strong>
                    <span className="muted">
                      {moldingKindLabel(item.spec.kind)} ·{' '}
                      {Math.round(b.maxX * 1000)}×{Math.round(b.maxY * 1000)} мм
                    </span>
                    <div className="furnish-item-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setPendingMolding({
                            ...item.spec,
                            material: { ...item.spec.material },
                            profile: {
                              vertices: item.spec.profile.vertices.map((p) => ({
                                ...p,
                              })),
                              segments: item.spec.profile.segments.map((s) => ({
                                ...s,
                              })),
                            },
                          })
                          setTool('placeMolding')
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
                          await deleteMoldingItem(item.id)
                          await reload()
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          {(creating || editing) && (
            <MoldingEditor
              title={creating ? 'Новый профиль' : 'Профиль'}
              spec={creating ? defaultMoldingSpec('skirting') : editing!.spec}
              onClose={() => {
                setCreating(false)
                setEditing(null)
              }}
              onSave={async (spec: MoldingSpec) => {
                if (creating) {
                  await putMoldingItem(newMoldingItem(spec, folderId))
                } else if (editing) {
                  await putMoldingItem({ ...editing, spec })
                }
                setCreating(false)
                setEditing(null)
                await reload()
              }}
            />
          )}

          <div className="tool-actions">
            <button
              type="button"
              onClick={deleteSelection}
              disabled={!hasMolding}
              title="Delete"
            >
              <IconImg src={UI_ICONS.delete} className="ui-icon" />
              Удалить плинтус
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
