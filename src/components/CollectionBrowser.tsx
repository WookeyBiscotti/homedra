import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useBuildingStore } from '../store/buildingStore'
import { CollectionItemEditor } from './CollectionItemEditor'

export function CollectionBrowser() {
  const open = useBuildingStore((s) => s.collectionBrowserOpen)
  const setOpen = useBuildingStore((s) => s.setCollectionBrowserOpen)
  const setModelBrowserOpen = useBuildingStore((s) => s.setModelBrowserOpen)
  const setPendingModel = useBuildingStore((s) => s.setPendingModel)

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
    if (!open) return
    void reload()
  }, [open, reload])

  useEffect(() => {
    const urls: Record<string, string> = {}
    for (const item of items) {
      if (item.thumbBlob) {
        urls[item.id] = URL.createObjectURL(item.thumbBlob)
      }
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

  if (!open) return null

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

  const onPlace = (item: CollectionItem) => {
    const pending = pendingFromCollectionItem(item)
    if (!pending) {
      setError('Не удалось определить модель')
      return
    }
    setPendingModel(pending)
  }

  return (
    <div className="tex-modal-backdrop" role="dialog" aria-modal>
      <div className="tex-modal model-browser collection-browser">
        <header className="tex-modal-header">
          <h3>Коллекция</h3>
          <div className="model-browser-header-actions">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setModelBrowserOpen(true)
              }}
            >
              Добавить из библиотек
            </button>
            <button type="button" className="ghost" onClick={() => setOpen(false)}>
              Закрыть
            </button>
          </div>
        </header>

        <nav className="collection-breadcrumb" aria-label="Папки">
          <button
            type="button"
            className={!folderId ? 'active' : undefined}
            onClick={() => setFolderId(null)}
          >
            Корень
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

        <div className="collection-toolbar">
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
            Создать папку
          </button>
          {folderId && (
            <button
              type="button"
              className="ghost"
              onClick={async () => {
                const parent =
                  folders.find((f) => f.id === folderId)?.parentId ?? null
                await deleteFolder(folderId)
                setFolderId(parent)
                await reload()
              }}
            >
              Удалить папку
            </button>
          )}
        </div>

        {error && <p className="tex-error">{error}</p>}

        <div className="collection-body">
          {childFolders.length > 0 && (
            <div className="collection-folders">
              {childFolders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="collection-folder-card"
                  onClick={() => setFolderId(f.id)}
                >
                  <span className="collection-folder-icon" aria-hidden>
                    ▢
                  </span>
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="tex-grid">
            {visibleItems.length === 0 && childFolders.length === 0 && (
              <p className="muted">
                Пусто. Добавьте объекты из библиотек — они появятся здесь после
                калибровки размера.
              </p>
            )}
            {visibleItems.map((item) => (
              <article key={item.id} className="tex-card">
                {thumbUrls[item.id] ? (
                  <img src={thumbUrls[item.id]} alt="" />
                ) : (
                  <div className="model-thumb-fallback">3D</div>
                )}
                <div className="tex-card-body">
                  <strong title={item.name}>
                    {item.name}
                    {appearanceHasOverrides(item.appearance) ? ' · ✎' : ''}
                  </strong>
                  <span className="muted">
                    scale {item.defaultScale.toFixed(2)} ·{' '}
                    {(item.bbox.x * item.defaultScale).toFixed(2)}×
                    {(item.bbox.y * item.defaultScale).toFixed(2)}×
                    {(item.bbox.z * item.defaultScale).toFixed(2)} м
                  </span>
                  <div className="collection-card-actions">
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
        </div>

        <footer className="tex-modal-footer muted">
          F — открыть коллекцию. Размещение только из коллекции.
        </footer>
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
    </div>
  )
}
