import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconImg, TOOL_ICONS, UI_ICONS } from './icons'
import { useBuildingStore } from '../store/buildingStore'
import { isGroundFloor, type TransformGizmoMode } from '../engine/types'
import {
  childrenOf,
  createFolderId,
  deleteFolder,
  deleteItem,
  folderPath,
  listFolders,
  listItems,
  putFolder,
  type CollectionFolder,
  type CollectionItem,
} from '../models/collection'
import { pendingFromCollectionItem } from '../models/placeCollectionItem'
import { appearanceHasOverrides } from '../models/objectAppearance'
import { CollectionItemEditor } from './CollectionItemEditor'

const gizmoModes: { id: TransformGizmoMode; label: string; hint: string }[] = [
  { id: 'translate', label: 'Двигать', hint: 'G' },
  { id: 'rotate', label: 'Вращать', hint: 'R' },
  { id: 'scale', label: 'Масштаб', hint: 'T' },
]

export function FurnishWorkbench() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const pendingModel = useBuildingStore((s) => s.pendingModel)
  const setPendingModel = useBuildingStore((s) => s.setPendingModel)
  const setModelBrowserOpen = useBuildingStore((s) => s.setModelBrowserOpen)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const gizmoMode = useBuildingStore((s) => s.transformGizmoMode)
  const setGizmoMode = useBuildingStore((s) => s.setTransformGizmoMode)
  const objectSnapEnabled = useBuildingStore((s) => s.objectSnapEnabled)
  const toggleObjectSnap = useBuildingStore((s) => s.toggleObjectSnap)
  const selection = useBuildingStore((s) => s.selection)
  const floor = useBuildingStore((s) => s.activeFloor())
  const ground = isGroundFloor(floor)
  const hasObject = selection?.kind === 'object'

  const [folders, setFolders] = useState<CollectionFolder[]>([])
  const [items, setItems] = useState<CollectionItem[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<CollectionItem | null>(null)

  const reload = useCallback(async () => {
    try {
      const [f, all] = await Promise.all([listFolders(), listItems()])
      setFolders(f)
      setItems(all)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка коллекции')
    }
  }, [])

  useEffect(() => {
    void reload()
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  // Refresh when model browser closes (items may have been added)
  const modelBrowserOpen = useBuildingStore((s) => s.modelBrowserOpen)
  useEffect(() => {
    if (!modelBrowserOpen) void reload()
  }, [modelBrowserOpen, reload])

  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const item of items) {
      if (item.thumbBlob) urls[item.id] = URL.createObjectURL(item.thumbBlob)
    }
    setThumbUrls(urls)
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
  const breadcrumb = useMemo(
    () => folderPath(folders, folderId),
    [folders, folderId],
  )

  const onPlace = (item: CollectionItem) => {
    const pending = pendingFromCollectionItem(item)
    if (!pending) {
      setError('Не удалось определить модель')
      return
    }
    setPendingModel(pending)
  }

  const onCreateFolder = async () => {
    const name = newFolderName.trim() || 'Папка'
    const siblings = childrenOf(folders, folderId)
    await putFolder({
      id: createFolderId(),
      parentId: folderId,
      name,
      order: siblings.length,
    })
    setNewFolderName('')
    await reload()
  }

  return (
    <aside className="toolbar workbench-rail furnish-rail" aria-label="Объекты">
      <h2 className="panel-title">Объекты</h2>

      {ground ? (
        <p className="hint">
          Земля — модели ставятся на этаж. Переключитесь на этаж.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="tool-btn furnish-add-btn"
            onClick={() => setModelBrowserOpen(true)}
          >
            <span className="tool-btn-main">
              <IconImg
                src={TOOL_ICONS.placeObject!}
                className="ui-icon tool-icon"
              />
              <span>Добавить в коллекцию</span>
            </span>
          </button>

          <div className="furnish-tools" role="group" aria-label="Инструменты">
            <button
              type="button"
              className={`tool-btn ${tool === 'select' && !pendingModel ? 'active' : ''}`}
              onClick={() => {
                setPendingModel(null)
                setTool('select')
              }}
              title="Выбор (V / Esc)"
            >
              <span className="tool-btn-main">
                {TOOL_ICONS.select && (
                  <IconImg
                    src={TOOL_ICONS.select}
                    className="ui-icon tool-icon"
                  />
                )}
                <span>Выбор</span>
              </span>
              <kbd>Esc</kbd>
            </button>
            <button
              type="button"
              className={`tool-btn ${objectSnapEnabled ? 'active' : ''}`}
              onClick={() => toggleObjectSnap()}
              title="Привязка к стенам и объектам"
            >
              <span className="tool-btn-main">
                <span>Привязка</span>
              </span>
            </button>
          </div>

          {pendingModel && (
            <div className="furnish-pending">
              <p className="hint">
                Кликните по полу в 3D или плану, чтобы поставить
                {objectSnapEnabled ? ' (с привязкой)' : ''}.
              </p>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setPendingModel(null)
                  setTool('select')
                }}
              >
                Отменить (Esc)
              </button>
            </div>
          )}

          <div className="furnish-gizmo" role="group" aria-label="Gizmo">
            {gizmoModes.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`tool-btn ${gizmoMode === m.id && hasObject ? 'active' : ''}`}
                disabled={!hasObject}
                onClick={() => {
                  setPendingModel(null)
                  setTool('select')
                  setGizmoMode(m.id)
                }}
                title={`${m.label} (${m.hint})`}
              >
                <span className="tool-btn-main">
                  <span>{m.label}</span>
                </span>
                <kbd>{m.hint}</kbd>
              </button>
            ))}
          </div>

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
                  await deleteFolder(folderId)
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

            {visibleItems.length === 0 && childFolders.length === 0 && (
              <p className="muted furnish-empty">
                Пусто. Нажмите «Добавить в коллекцию».
              </p>
            )}

            {visibleItems.map((item) => (
              <article key={item.id} className="furnish-item-card">
                {thumbUrls[item.id] ? (
                  <img src={thumbUrls[item.id]} alt="" />
                ) : (
                  <div className="model-thumb-fallback">3D</div>
                )}
                <div className="furnish-item-body">
                  <strong title={item.name}>
                    {item.name}
                    {appearanceHasOverrides(item.appearance) ? ' · ✎' : ''}
                  </strong>
                  <span className="muted">
                    {(item.bbox.x * item.defaultScale).toFixed(1)}×
                    {(item.bbox.z * item.defaultScale).toFixed(1)} м
                  </span>
                  <div className="furnish-item-actions">
                    <button type="button" onClick={() => onPlace(item)}>
                      Поставить
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
                        await deleteItem(item.id)
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

          {editing && (
            <CollectionItemEditor
              item={editing}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                void reload()
              }}
            />
          )}

          <div className="tool-actions">
            <button type="button" onClick={deleteSelection}>
              <IconImg src={UI_ICONS.delete} className="ui-icon" />
              Удалить выделение
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
