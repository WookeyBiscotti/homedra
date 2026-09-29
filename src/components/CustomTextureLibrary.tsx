import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { materialRefsEqual } from '../engine/geometry/replacePaintMaterial'
import type { MaterialRef } from '../engine/types'
import {
  IMAGE_ACCEPT,
  getLocalTexture,
  materialCacheKey,
  TextureImportError,
} from '../materials/customTextures'
import {
  addFileToTextureCollection,
  addMaterialToTextureCollection,
  addUrlToTextureCollection,
  createTextureFolderId,
  deleteTextureFolder,
  deleteTextureItem,
  duplicateTextureItem,
  listTextureFolders,
  listTextureItems,
  migrateLocalTexturesToCollection,
  putTextureFolder,
  putTextureItem,
  subscribeTextureCollection,
  type TextureCollectionFolder,
  type TextureCollectionItem,
} from '../materials/textureCollection'
import {
  materialRefFromHit,
  materialThumbnailUrl,
  tabForMaterial,
  TEXTURE_LIBRARIES,
  type TextureHit,
  type TextureLibraryId,
} from '../materials/textureCatalog'
import { useTextureCatalogSearch } from '../materials/useTextureCatalogSearch'
import { childrenOf, folderPath } from '../models/collection'
import {
  getLibraryToken,
  subscribeLibraryTokens,
} from '../models/tokens'
import { useBuildingStore } from '../store/buildingStore'
import { IconImg, UI_ICONS } from './icons'
import { MaterialPbrFields } from './PbrMaterialEditor'

function useTextureCollection(): {
  folders: TextureCollectionFolder[]
  items: TextureCollectionItem[]
  ready: boolean
  reload: () => Promise<void>
} {
  const [folders, setFolders] = useState<TextureCollectionFolder[]>([])
  const [items, setItems] = useState<TextureCollectionItem[]>([])
  const [ready, setReady] = useState(false)

  const reload = useCallback(async () => {
    await migrateLocalTexturesToCollection()
    const [nextFolders, nextItems] = await Promise.all([
      listTextureFolders(),
      listTextureItems(),
    ])
    setFolders(nextFolders)
    setItems(nextItems)
    setReady(true)
  }, [])

  useEffect(() => {
    void reload()
    return subscribeTextureCollection(() => {
      void reload()
    })
  }, [reload])

  return { folders, items, ready, reload }
}

function useTextureItemThumbs(
  items: TextureCollectionItem[],
): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    const revoke: string[] = []
    const urls: Record<string, string> = {}

    void (async () => {
      for (const item of items) {
        if (item.thumbBlob) {
          const url = URL.createObjectURL(item.thumbBlob)
          revoke.push(url)
          urls[item.id] = url
          continue
        }
        const remote = materialThumbnailUrl(item.material)
        if (remote) {
          urls[item.id] = remote
          continue
        }
        if (item.material.source === 'custom') {
          const rec = await getLocalTexture(item.material.assetId)
          if (!alive) return
          if (rec) {
            const url = URL.createObjectURL(rec.blob)
            revoke.push(url)
            urls[item.id] = url
          } else if (item.material.url) {
            urls[item.id] = item.material.url
          }
        }
      }
      if (alive) setThumbs(urls)
    })()

    return () => {
      alive = false
      for (const url of revoke) URL.revokeObjectURL(url)
    }
  }, [items])

  return thumbs
}

function TextureThumb({
  src,
  tint,
}: {
  src?: string
  tint?: string
}) {
  if (!src) return <span className="mat-slot-empty">img</span>
  return (
    <span className="custom-tex-thumb">
      <img src={src} alt="" referrerPolicy="no-referrer" />
      {tint && tint.toLowerCase() !== '#ffffff' && (
        <span
          className="custom-tex-tint"
          style={{ background: tint }}
          aria-hidden
        />
      )}
    </span>
  )
}

function TextureCollectionItemEditor({
  item,
  thumbUrl,
  onClose,
  onSaved,
}: {
  item: TextureCollectionItem
  thumbUrl?: string
  onClose: () => void
  onSaved: (item: TextureCollectionItem) => void
}) {
  const [name, setName] = useState(item.name)
  const [material, setMaterial] = useState<MaterialRef>(() => ({
    ...item.material,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blobThumb, setBlobThumb] = useState<string | null>(null)

  useEffect(() => {
    if (!item.thumbBlob) {
      setBlobThumb(null)
      return
    }
    const url = URL.createObjectURL(item.thumbBlob)
    setBlobThumb(url)
    return () => URL.revokeObjectURL(url)
  }, [item.thumbBlob])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const next: TextureCollectionItem = {
        ...item,
        name: name.trim() || item.name,
        material: { ...material, name: name.trim() || material.name },
      }
      await putTextureItem(next)
      onSaved(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="tex-modal-backdrop tex-collection-edit-backdrop"
      role="dialog"
      aria-modal
      aria-label="Редактирование материала"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="tex-modal tex-collection-edit-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="tex-modal-header">
          <h3>Материал</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div className="tex-collection-edit-body">
          <div className="tex-collection-edit-preview">
            <TextureThumb
              src={blobThumb ?? thumbUrl}
              tint={material.tint}
            />
            <p className="muted">
              Цвет умножается на albedo — белый кирпич можно сделать синим.
            </p>
          </div>
          <div className="tex-collection-edit-controls">
            <label className="collection-edit-field">
              Название
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </label>
            <p className="tool-group-title">Цветокоррекция / PBR</p>
            <MaterialPbrFields
              value={material}
              onChange={setMaterial}
              ariaLabel="Цветокоррекция материала"
            />
            {error && <p className="conflict">{error}</p>}
            <div className="tex-collection-edit-actions">
              <button type="button" disabled={busy} onClick={() => void save()}>
                {busy ? '…' : 'Сохранить'}
              </button>
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={onClose}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function TextureFolderPick({
  title,
  folders,
  folderId,
  onFolderId,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string
  folders: TextureCollectionFolder[]
  folderId: string | null
  onFolderId: (id: string | null) => void
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
}) {
  return (
    <div className="collection-folder-pick-body tex-collection-pick">
      <p className="muted">Куда добавить «{title}»?</p>
      <label>
        <span className="muted">Папка</span>
        <select
          value={folderId ?? ''}
          onChange={(e) => onFolderId(e.target.value || null)}
          disabled={busy}
        >
          <option value="">Корень</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.parentId
                ? `${folders.find((p) => p.id === folder.parentId)?.name ?? '…'} / ${folder.name}`
                : folder.name}
            </option>
          ))}
        </select>
      </label>
      <div className="tex-collection-pick-actions">
        <button type="button" disabled={busy} onClick={onConfirm}>
          {busy ? '…' : 'В коллекцию'}
        </button>
        <button type="button" className="ghost" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}

function TextureCollectionPanel({
  onSelect,
  selected,
  folders,
  items,
  ready,
  reload,
  gridClassName,
}: {
  onSelect: (ref: MaterialRef) => void
  selected?: MaterialRef | null
  folders: TextureCollectionFolder[]
  items: TextureCollectionItem[]
  ready: boolean
  reload: () => Promise<void>
  gridClassName: string
}) {
  const [folderId, setFolderId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<TextureCollectionItem | null>(null)
  const thumbs = useTextureItemThumbs(items)

  const visibleItems = useMemo(
    () => items.filter((item) => item.folderId === folderId),
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

  const run = async (work: () => Promise<TextureCollectionItem>) => {
    setBusy(true)
    setError(null)
    try {
      const item = await work()
      onSelect(item.material)
      await reload()
    } catch (e) {
      setError(
        e instanceof TextureImportError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Не удалось добавить текстуру',
      )
    } finally {
      setBusy(false)
    }
  }

  const onCreateFolder = async () => {
    const name = newFolderName.trim() || 'Папка'
    const siblings = childrenOf(folders, folderId)
    await putTextureFolder({
      id: createTextureFolderId(),
      parentId: folderId,
      name,
      order: siblings.length,
    })
    setNewFolderName('')
    await reload()
  }

  const onDuplicate = async (item: TextureCollectionItem) => {
    setBusy(true)
    setError(null)
    try {
      const copy = await duplicateTextureItem(item.id)
      if (!copy) return
      await reload()
      setEditing(copy)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скопировать')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="custom-tex tex-collection">
      <nav className="collection-breadcrumb" aria-label="Папки текстур">
        <button
          type="button"
          className={!folderId ? 'active' : undefined}
          onClick={() => setFolderId(null)}
        >
          Корень
        </button>
        {breadcrumb.map((folder) => (
          <span key={folder.id} className="collection-crumb">
            <span className="muted">/</span>
            <button
              type="button"
              className={folderId === folder.id ? 'active' : undefined}
              onClick={() => setFolderId(folder.id)}
            >
              {folder.name}
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
                folders.find((folder) => folder.id === folderId)?.parentId ?? null
              await deleteTextureFolder(folderId)
              setFolderId(parent)
              await reload()
            }}
          >
            Удалить папку
          </button>
        )}
      </div>

      <form
        className="tex-search"
        onSubmit={(e) => {
          e.preventDefault()
          if (!urlDraft.trim() || busy) return
          void run(() => addUrlToTextureCollection(urlDraft.trim(), folderId))
        }}
      >
        <input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          placeholder="https://… ссылка на JPG/PNG/WebP"
          disabled={busy}
          inputMode="url"
        />
        <button type="submit" disabled={busy || !urlDraft.trim()}>
          {busy ? '…' : 'Добавить'}
        </button>
      </form>
      <label className="custom-tex-file">
        <input
          type="file"
          accept={IMAGE_ACCEPT}
          hidden
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void run(() => addFileToTextureCollection(file, folderId))
          }}
        />
        <span className="tool-btn">{busy ? 'Загрузка…' : 'Из файла'}</span>
      </label>
      {error && <p className="conflict">{error}</p>}
      {ready && visibleItems.length === 0 && childFolders.length === 0 && !error && (
        <p className="muted">
          Пусто. Добавьте из каталогов кнопкой «+», ссылкой или файлом.
        </p>
      )}

      {childFolders.length > 0 && (
        <div className="collection-folders">
          {childFolders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="collection-folder-card"
              onClick={() => setFolderId(folder.id)}
            >
              <span className="collection-folder-icon" aria-hidden>
                ▢
              </span>
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className={gridClassName}>
        {visibleItems.map((item) => {
          const active = materialRefsEqual(item.material, selected)
          return (
            <div
              key={item.id}
              className={`tex-card custom-tex-card${active ? ' tex-card-active' : ''}`}
            >
              <button
                type="button"
                className="custom-tex-pick"
                onClick={() => onSelect(item.material)}
              >
                <TextureThumb
                  src={thumbs[item.id]}
                  tint={item.material.tint}
                />
                <span>{item.name}</span>
              </button>
              <div className="custom-tex-actions">
                <button
                  type="button"
                  className="ghost small"
                  title="Сделать копию"
                  disabled={busy}
                  onClick={() => void onDuplicate(item)}
                >
                  <IconImg src={UI_ICONS.copy} className="ui-icon" />
                </button>
                <button
                  type="button"
                  className="ghost small"
                  title="Цвет / PBR"
                  onClick={() => setEditing(item)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="ghost small"
                  title="Удалить из коллекции"
                  onClick={() =>
                    void deleteTextureItem(item.id).then(() => reload())
                  }
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <TextureCollectionItemEditor
          item={editing}
          thumbUrl={thumbs[editing.id]}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setEditing(null)
            onSelect(next.material)
            void reload()
          }}
        />
      )}
    </div>
  )
}

function TextureCatalogPanel({
  library,
  onSelect,
  selected,
  defaultQuery = '',
  gridClassName = 'tex-grid',
  savedKeys,
  onAddToCollection,
}: {
  library: TextureLibraryId
  onSelect: (ref: MaterialRef) => void
  selected?: MaterialRef | null
  defaultQuery?: string
  gridClassName?: string
  savedKeys: Set<string>
  onAddToCollection: (hit: TextureHit) => void
}) {
  const setTokensOpen = useBuildingStore((s) => s.setLibraryTokensOpen)
  const meta = TEXTURE_LIBRARIES.find((l) => l.id === library)!
  const [tokenTick, setTokenTick] = useState(0)
  useEffect(() => subscribeLibraryTokens(() => setTokenTick((n) => n + 1)), [])
  const token = meta.tokenKey ? getLibraryToken(meta.tokenKey) : undefined
  void tokenTick

  const [draft, setDraft] = useState(defaultQuery)
  const [query, setQuery] = useState(defaultQuery)
  const { assets, total, loading, loadingMore, error, hasMore, loadMore, needsToken } =
    useTextureCatalogSearch(library, query, token)

  if (needsToken) {
    return (
      <div className="model-token-cta">
        <p>
          Для «{meta.label}» нужен бесплатный API-ключ. Он хранится только в
          этом браузере.
        </p>
        <button type="button" onClick={() => setTokensOpen(true)}>
          Открыть настройки ключей
        </button>
      </div>
    )
  }

  return (
    <div className="tex-catalog">
      <form
        className="tex-search"
        onSubmit={(e) => {
          e.preventDefault()
          setQuery(draft.trim())
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={meta.placeholder}
        />
        <button type="submit">Найти</button>
      </form>
      {loading && <p className="muted">Загрузка…</p>}
      {error && <p className="conflict">{error}</p>}
      {!loading && !error && (
        <p className="muted tex-count">
          {assets.length} из {total}
        </p>
      )}
      <div className={gridClassName}>
        {assets.map((a) => {
          const active =
            selected?.source === a.library && selected.assetId === a.id
          const saved = savedKeys.has(`${a.library}:${a.id}`)
          return (
            <div
              key={`${a.library}:${a.id}`}
              className={`tex-card custom-tex-card${active ? ' tex-card-active' : ''}`}
            >
              <button
                type="button"
                className="custom-tex-pick"
                onClick={() => onSelect(materialRefFromHit(a))}
              >
                <img
                  src={a.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const el = e.currentTarget
                    if (a.library === 'ambientcg' && !el.dataset.fallback) {
                      el.dataset.fallback = '1'
                      el.src = `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${a.id}/${a.id}_SQ_Color.jpg`
                      return
                    }
                    el.style.opacity = '0.25'
                  }}
                />
                <span>{a.title}</span>
              </button>
              <button
                type="button"
                className={`ghost small custom-tex-del tex-card-save${saved ? ' in-collection' : ''}`}
                title={saved ? 'Уже в коллекции' : 'Добавить в коллекцию'}
                onClick={() => onAddToCollection(a)}
              >
                {saved ? '✓' : '+'}
              </button>
            </div>
          )
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          className="tex-load-more"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore
            ? 'Загрузка…'
            : `Ещё материалы (${total - assets.length})`}
        </button>
      )}
      {meta.footer && (
        <footer className="tex-modal-footer muted">{meta.footer}</footer>
      )}
    </div>
  )
}

export function TextureSourceTabs({
  onSelect,
  selected,
  defaultQuery = '',
  gridClassName = 'tex-grid',
  preferCollection = false,
}: {
  onSelect: (ref: MaterialRef) => void
  selected?: MaterialRef | null
  defaultQuery?: string
  gridClassName?: string
  preferCollection?: boolean
}) {
  const [tab, setTab] = useState<TextureLibraryId | 'collection'>(() => {
    if (preferCollection) return 'collection'
    const source = tabForMaterial(selected)
    if (source === 'custom' || !selected) return 'collection'
    return source
  })
  const collection = useTextureCollection()
  const [adding, setAdding] = useState<TextureHit | null>(null)
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null)
  const [addingBusy, setAddingBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const savedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const item of collection.items) {
      keys.add(materialCacheKey(item.material))
    }
    return keys
  }, [collection.items])

  const confirmAdd = async () => {
    if (!adding) return
    setAddingBusy(true)
    setAddError(null)
    try {
      await addMaterialToTextureCollection(
        materialRefFromHit(adding),
        targetFolderId,
        { name: adding.title, thumbUrl: adding.thumbnailUrl },
      )
      setAdding(null)
    } catch (e) {
      setAddError(
        e instanceof Error ? e.message : 'Не удалось добавить в коллекцию',
      )
    } finally {
      setAddingBusy(false)
    }
  }

  return (
    <div className="tex-source-tabs">
      <div className="tex-tabs" role="tablist" aria-label="Источник текстуры">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'collection'}
          className={tab === 'collection' ? 'active' : ''}
          onClick={() => setTab('collection')}
        >
          Коллекция
        </button>
        {TEXTURE_LIBRARIES.map((lib) => (
          <button
            key={lib.id}
            type="button"
            role="tab"
            aria-selected={tab === lib.id}
            className={tab === lib.id ? 'active' : ''}
            onClick={() => setTab(lib.id)}
          >
            {lib.label}
          </button>
        ))}
      </div>
      {adding && (
        <TextureFolderPick
          title={adding.title}
          folders={collection.folders}
          folderId={targetFolderId}
          onFolderId={setTargetFolderId}
          onConfirm={() => void confirmAdd()}
          onCancel={() => {
            setAdding(null)
            setAddError(null)
          }}
          busy={addingBusy}
        />
      )}
      {addError && <p className="conflict">{addError}</p>}
      {tab === 'collection' ? (
        <TextureCollectionPanel
          onSelect={onSelect}
          selected={selected}
          folders={collection.folders}
          items={collection.items}
          ready={collection.ready}
          reload={collection.reload}
          gridClassName={gridClassName}
        />
      ) : (
        <TextureCatalogPanel
          key={tab}
          library={tab}
          onSelect={onSelect}
          selected={selected}
          defaultQuery={defaultQuery}
          gridClassName={gridClassName}
          savedKeys={savedKeys}
          onAddToCollection={(hit) => {
            setTargetFolderId(null)
            setAddError(null)
            setAdding(hit)
          }}
        />
      )}
    </div>
  )
}
