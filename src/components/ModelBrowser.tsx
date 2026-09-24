import { useCallback, useEffect, useMemo, useState } from 'react'
import { adapterFor, BROWSER_TABS } from '../models/adapters'
import {
  getLibraryToken,
  subscribeLibraryTokens,
  type LibraryTokenKey,
} from '../models/tokens'
import type { LibraryId, ModelHit, ModelVariant } from '../models/types'
import { hitAttribution, hitToModelRef } from '../models/types'
import type { ModelAttribution, ModelRef } from '../engine/types'
import { uploadGlbFile, UploadValidationError } from '../models/upload'
import type { ScenePart } from '../models/sceneParts'
import { useBuildingStore } from '../store/buildingStore'
import { ModelPreview } from './ModelPreview'

const TOKEN_KEYS: Partial<Record<LibraryId, LibraryTokenKey>> = {
  polyPizza: 'polyPizza',
  smithsonian: 'smithsonian',
  sketchfab: 'sketchfab',
}

const PAGE_SIZE = 8

/** Sources that use opaque cursors (not offset pages). */
const CURSOR_SOURCES = new Set<LibraryId>(['polyPizza', 'sketchfab'])

function toAbsoluteUrl(url: string): string {
  if (
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:')
  ) {
    return url
  }
  try {
    return new URL(url, window.location.origin).href
  } catch {
    return url
  }
}

function withObjectId(ref: ModelRef, objectId?: string): ModelRef {
  return { ...ref, objectId }
}

type PreviewState = {
  hit: ModelHit
  ref: ModelRef
  url: string
  attribution?: ModelAttribution
  revokeOnDispose?: boolean
  variantId?: string
  objectId?: string
  sceneParts: ScenePart[]
}

/** Build a short list of page buttons around the current page. */
function pageWindow(current: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages = new Set<number>()
  pages.add(1)
  pages.add(totalPages)
  for (let p = current - 1; p <= current + 1; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p)
  }
  const sorted = [...pages].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) out.push('…')
    out.push(sorted[i]!)
  }
  return out
}

export function ModelBrowser() {
  const open = useBuildingStore((s) => s.modelBrowserOpen)
  const setOpen = useBuildingStore((s) => s.setModelBrowserOpen)
  const setPendingModel = useBuildingStore((s) => s.setPendingModel)
  const setLibraryTokensOpen = useBuildingStore((s) => s.setLibraryTokensOpen)

  const [tab, setTab] = useState<LibraryId>('catalog')
  const [draft, setDraft] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ModelHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState<number | undefined>()
  const [hasNext, setHasNext] = useState(false)
  /** Opaque cursor to fetch each page (page 1 → undefined). */
  const [cursorForPage, setCursorForPage] = useState<
    Record<number, string | undefined>
  >({ 1: undefined })
  const [tokenTick, setTokenTick] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => subscribeLibraryTokens(() => setTokenTick((n) => n + 1)), [])

  const clearPreview = useCallback(() => {
    setPreview((prev) => {
      if (prev?.revokeOnDispose) URL.revokeObjectURL(prev.url)
      return null
    })
  }, [])

  useEffect(() => {
    if (!open) clearPreview()
  }, [open, clearPreview])

  const tokenKey = TOKEN_KEYS[tab]
  const token = tokenKey ? getLibraryToken(tokenKey) : undefined
  const adapter = adapterFor(tab)
  const needsToken = adapter.requiresToken && !token
  const usesCursor = CURSOR_SOURCES.has(tab)

  const resetPaging = useCallback(() => {
    setPage(1)
    setTotal(undefined)
    setHasNext(false)
    setCursorForPage({ 1: undefined })
    setHits([])
  }, [])

  const runSearch = useCallback(
    async (q: string, pageNum: number) => {
      if (needsToken) {
        setHits([])
        setError(null)
        setTotal(undefined)
        setHasNext(false)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const cursor = usesCursor ? cursorForPage[pageNum] : undefined
        const result = await adapter.search(q, {
          token,
          page: pageNum,
          cursor,
          limit: PAGE_SIZE,
        })
        setHits(result.hits)
        setTotal(result.total)
        setHasNext(!!result.nextCursor)
        if (result.nextCursor) {
          setCursorForPage((prev) => ({
            ...prev,
            [pageNum + 1]: result.nextCursor,
          }))
        }
        setPage(pageNum)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Ошибка поиска')
        setHits([])
        setHasNext(false)
      } finally {
        setLoading(false)
      }
    },
    [adapter, needsToken, token, usesCursor, cursorForPage],
  )

  useEffect(() => {
    if (!open) return
    resetPaging()
    void runSearch(query, 1)
    // Only re-run when tab/query/token/open change — not when cursor map updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, query, tokenTick, needsToken])

  const totalPages = useMemo(() => {
    if (total != null) return Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (usesCursor) {
      // Known pages = those we've visited; +1 if hasNext
      const known = Math.max(page, ...Object.keys(cursorForPage).map(Number))
      return hasNext ? known : Math.max(1, page)
    }
    return 1
  }, [total, usesCursor, page, cursorForPage, hasNext])

  const goToPage = (p: number) => {
    if (p < 1 || loading) return
    if (usesCursor) {
      if (p > page + 1 && !cursorForPage[p]) return
      if (p > page && !hasNext && p !== page) return
      // Can only jump to pages we've already got a cursor for, or next
      if (p !== page && p !== page + 1 && cursorForPage[p] === undefined && p !== 1)
        return
    } else if (total != null && p > Math.ceil(total / PAGE_SIZE)) {
      return
    }
    void runSearch(query, p)
  }

  const onPartsFound = useCallback((parts: ScenePart[]) => {
    setPreview((prev) => {
      if (!prev) return prev
      const same =
        prev.sceneParts.length === parts.length &&
        prev.sceneParts.every((p, i) => p.id === parts[i]?.id)
      const stillOk =
        prev.objectId == null || parts.some((p) => p.id === prev.objectId)
      if (same && stillOk) return prev
      // Keep whole-scene selection (objectId undefined) or a still-valid part.
      return {
        ...prev,
        sceneParts: parts,
        objectId: stillOk ? prev.objectId : undefined,
        ref: withObjectId(prev.ref, stillOk ? prev.objectId : undefined),
      }
    })
  }, [])

  if (!open) return null

  const resolveHit = async (
    hit: ModelHit,
    opts?: { objectId?: string; variantId?: string },
  ): Promise<{
    ref: ModelRef
    url: string
    attribution?: ModelAttribution
    revokeOnDispose?: boolean
    variantId?: string
    objectId?: string
  }> => {
    const variants = hit.variants
    const variant =
      variants?.find((v) => v.id === opts?.variantId) ??
      variants?.find((v) => v.glbUrl === hit.glbUrl) ??
      variants?.[0]
    const hitForResolve: ModelHit = variant
      ? { ...hit, glbUrl: variant.glbUrl }
      : hit

    const resolved = await adapter.resolveGlb(hitForResolve, { token })
    let ref = hitToModelRef(hitForResolve)
    if (ref.source === 'library') {
      // Never persist ephemeral blob: / signed Sketchfab URLs — re-resolve on load.
      if (hit.library === 'sketchfab') {
        ref = { ...ref, glbUrl: undefined }
      } else {
        const fromHit =
          hitForResolve.glbUrl && !hitForResolve.glbUrl.startsWith('blob:')
            ? hitForResolve.glbUrl
            : undefined
        const fromResolved =
          !resolved.revokeOnDispose && !resolved.url.startsWith('blob:')
            ? resolved.url
            : undefined
        ref = { ...ref, glbUrl: fromHit ?? fromResolved }
      }
    } else if (ref.source === 'url') {
      const nextUrl =
        resolved.revokeOnDispose || resolved.url.startsWith('blob:')
          ? hitForResolve.glbUrl && !hitForResolve.glbUrl.startsWith('blob:')
            ? hitForResolve.glbUrl
            : ref.url
          : resolved.url
      ref = { ...ref, url: nextUrl }
    }
    ref = withObjectId(ref, opts?.objectId)
    if (ref.source === 'url' && !ref.url) {
      throw new Error('Нет URL модели')
    }
    return {
      ref,
      url: toAbsoluteUrl(resolved.url),
      attribution: resolved.attribution ?? hitAttribution(hit),
      revokeOnDispose: resolved.revokeOnDispose,
      variantId: variant?.id,
      objectId: opts?.objectId,
    }
  }

  const onPreview = async (
    hit: ModelHit,
    opts?: { objectId?: string; variantId?: string },
  ) => {
    setPreviewLoading(true)
    setError(null)
    clearPreview()
    try {
      const resolved = await resolveHit(hit, opts)
      setPreview({
        hit,
        ref: resolved.ref,
        url: resolved.url,
        attribution: resolved.attribution,
        revokeOnDispose: resolved.revokeOnDispose,
        variantId: resolved.variantId,
        objectId: resolved.objectId,
        sceneParts: [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить превью')
    } finally {
      setPreviewLoading(false)
    }
  }

  const onSelectVariant = (variant: ModelVariant) => {
    if (!preview) return
    void onPreview(preview.hit, { variantId: variant.id })
  }

  const onSelectPart = (objectId: string | undefined) => {
    setPreview((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        objectId,
        ref: withObjectId(prev.ref, objectId),
      }
    })
  }

  const onPlace = () => {
    if (!preview) return
    const { ref, attribution, revokeOnDispose, url } = preview
    if (revokeOnDispose) URL.revokeObjectURL(url)
    setPreview(null)
    setPendingModel({ model: ref, attribution })
  }

  const onUpload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { record } = await uploadGlbFile(file)
      setTab('local')
      resetPaging()
      const hit: ModelHit = {
        library: 'local',
        id: record.id,
        title: record.name,
        license: record.attribution?.license ?? 'Private',
        author: record.attribution?.author,
        thumbUrl: record.thumbBlob
          ? URL.createObjectURL(record.thumbBlob)
          : undefined,
      }
      await onPreview(hit)
      void runSearch('', 1)
    } catch (e) {
      setError(
        e instanceof UploadValidationError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Ошибка загрузки',
      )
    } finally {
      setUploading(false)
    }
  }

  const rangeFrom = total != null && total > 0 ? (page - 1) * PAGE_SIZE + 1 : hits.length > 0 ? 1 : 0
  const rangeTo =
    total != null ? Math.min(page * PAGE_SIZE, total) : hits.length
  const canPrev = page > 1 && !loading
  const canNext =
    !loading &&
    (total != null ? page < totalPages : hasNext)
  // Always show pager when there is something to browse (or we're mid-paging)
  const showPager = !needsToken && (hits.length > 0 || page > 1 || hasNext || (total != null && total > 0))

  return (
    <div
      className="tex-modal-backdrop"
      onClick={() => {
        clearPreview()
        setOpen(false)
      }}
      role="presentation"
    >
      <div
        className="tex-modal model-browser"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Каталог моделей"
      >
        <header className="tex-modal-header">
          <h3>3D модели</h3>
          <div className="model-browser-header-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setLibraryTokensOpen(true)}
            >
              API ключи
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                clearPreview()
                setOpen(false)
              }}
            >
              Закрыть
            </button>
          </div>
        </header>

        <div className="model-tabs">
          {BROWSER_TABS.map((id) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'active' : ''}
              onClick={() => {
                setTab(id)
                setDraft('')
                setQuery('')
                resetPaging()
                clearPreview()
              }}
            >
              {adapterFor(id).label}
            </button>
          ))}
        </div>

        {tab === 'local' && (
          <label className="model-upload">
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              hidden
              disabled={uploading}
              onChange={(e) => {
                void onUpload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <span className="tool-btn">
              {uploading ? 'Загрузка…' : 'Загрузить свой GLB'}
            </span>
          </label>
        )}

        {needsToken ? (
          <div className="model-token-cta">
            <p>
              Для «{adapter.label}» нужен ваш API-ключ (BYOK). Ключ хранится только
              в этом браузере.
            </p>
            <button type="button" onClick={() => setLibraryTokensOpen(true)}>
              Открыть настройки ключей
            </button>
          </div>
        ) : (
          <div className="model-browser-body">
            <div className="model-browser-list">
              <form
                className="tex-search"
                onSubmit={(e) => {
                  e.preventDefault()
                  resetPaging()
                  setQuery(draft.trim())
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Поиск моделей…"
                  autoFocus
                />
                <button type="submit">Найти</button>
              </form>
              {loading && <p className="muted">Загрузка…</p>}
              {error && <p className="conflict">{error}</p>}
              {!loading && !error && (
                <p className="muted tex-count">
                  {total != null
                    ? total === 0
                      ? 'Ничего не найдено'
                      : `${rangeFrom}–${rangeTo} из ${total}`
                    : hits.length === 0
                      ? 'Ничего не найдено'
                      : `Страница ${page}${hasNext ? '+' : ''} · ${hits.length} на стр.`}
                </p>
              )}
              <div className="tex-grid">
                {hits.map((h) => {
                  const selected =
                    preview?.hit.library === h.library &&
                    preview?.hit.id === h.id
                  return (
                    <button
                      key={`${h.library}-${h.id}`}
                      type="button"
                      className={`tex-card${selected ? ' tex-card-active' : ''}`}
                      onClick={() => void onPreview(h)}
                    >
                      {h.thumbUrl ? (
                        <img
                          src={h.thumbUrl}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.opacity = '0.2'
                          }}
                        />
                      ) : (
                        <div className="model-thumb-fallback" aria-hidden>
                          3D
                        </div>
                      )}
                      <span>{h.title}</span>
                      <span className="model-card-meta muted">
                        {h.license}
                        {h.author ? ` · ${h.author}` : ''}
                      </span>
                    </button>
                  )
                })}
              </div>

              {showPager && (
                <nav className="model-pager" aria-label="Страницы результатов">
                  <button
                    type="button"
                    className="model-pager-nav"
                    disabled={!canPrev}
                    aria-label="Предыдущая страница"
                    onClick={() => goToPage(page - 1)}
                  >
                    ‹
                  </button>
                  <div className="model-pager-pages">
                    {total != null && totalPages > 1
                      ? pageWindow(page, totalPages).map((item, i) =>
                          item === '…' ? (
                            <span key={`e${i}`} className="muted">
                              …
                            </span>
                          ) : (
                            <button
                              key={item}
                              type="button"
                              className={
                                item === page ? 'active' : undefined
                              }
                              disabled={loading}
                              onClick={() => goToPage(item)}
                            >
                              {item}
                            </button>
                          ),
                        )
                      : (
                          <span className="model-pager-label">
                            {page}
                            {hasNext || (total != null && page < totalPages)
                              ? ` / ${total != null ? totalPages : '…'}`
                              : totalPages > 1
                                ? ` / ${totalPages}`
                                : ''}
                          </span>
                        )}
                  </div>
                  <button
                    type="button"
                    className="model-pager-nav"
                    disabled={!canNext}
                    aria-label="Следующая страница"
                    onClick={() => goToPage(page + 1)}
                  >
                    ›
                  </button>
                </nav>
              )}
            </div>

            <aside className="model-preview-panel" aria-label="Превью модели">
              {previewLoading && <p className="muted">Загрузка превью…</p>}
              {!previewLoading && !preview && (
                <p className="muted model-preview-empty">
                  Выберите модель, чтобы увидеть 3D-превью. Вращайте мышью.
                </p>
              )}
              {!previewLoading && preview && (
                <>
                  <div className="model-preview-meta">
                    <strong>{preview.hit.title}</strong>
                    <span className="muted">
                      {preview.hit.license}
                      {preview.hit.author ? ` · ${preview.hit.author}` : ''}
                    </span>
                    {preview.hit.url && (
                      <a
                        href={preview.hit.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Источник
                      </a>
                    )}
                  </div>

                  {preview.hit.variants && preview.hit.variants.length > 1 && (
                    <div className="model-part-picker" role="listbox" aria-label="Модели в ассете">
                      <span className="muted model-part-picker-label">
                        Файлы ({preview.hit.variants.length})
                      </span>
                      <div className="model-part-picker-list">
                        {preview.hit.variants.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            role="option"
                            aria-selected={preview.variantId === v.id}
                            className={
                              preview.variantId === v.id ? 'active' : undefined
                            }
                            title={v.label}
                            onClick={() => onSelectVariant(v)}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <ModelPreview
                    url={preview.url}
                    objectId={preview.objectId}
                    onParts={onPartsFound}
                  />

                  {preview.sceneParts.length > 1 && (
                    <div className="model-part-picker" role="listbox" aria-label="Части сцены">
                      <span className="muted model-part-picker-label">
                        В файле ({preview.sceneParts.length})
                      </span>
                      <div className="model-part-picker-list">
                        <button
                          type="button"
                          role="option"
                          aria-selected={!preview.objectId}
                          className={!preview.objectId ? 'active' : undefined}
                          onClick={() => onSelectPart(undefined)}
                        >
                          Всё
                        </button>
                        {preview.sceneParts.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            role="option"
                            aria-selected={preview.objectId === p.id}
                            className={
                              preview.objectId === p.id ? 'active' : undefined
                            }
                            title={p.label}
                            onClick={() => onSelectPart(p.id)}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="model-preview-actions">
                    <button type="button" onClick={onPlace}>
                      Поставить
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={clearPreview}
                    >
                      Сбросить
                    </button>
                  </div>
                  <p className="muted model-preview-hint">
                    {preview.hit.variants && preview.hit.variants.length > 1
                      ? 'Выберите файл, затем «Поставить» и кликните на плане.'
                      : preview.sceneParts.length > 1
                        ? 'Выберите часть сцены, затем «Поставить» и кликните на плане.'
                        : 'После «Поставить» кликните на плане или полу в 3D.'}
                  </p>
                </>
              )}
            </aside>
          </div>
        )}

        <footer className="tex-modal-footer muted">
          По {PAGE_SIZE} моделей на странице. Внешние библиотеки — через прокси
          Vite.
        </footer>
      </div>
    </div>
  )
}
