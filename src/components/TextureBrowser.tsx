import { useEffect, useState } from 'react'
import type { MaterialRef } from '../engine/types'
import {
  ambientcgThumbnailUrl,
  materialRefFromAsset,
  searchMaterials,
} from '../materials/ambientcg'
import { useAmbientcgSearch } from '../materials/useAmbientcgSearch'

export function TextureBrowser({
  open,
  onClose,
  onSelect,
  title = 'Текстура ambientCG',
}: {
  open: boolean
  onClose: () => void
  onSelect: (ref: MaterialRef) => void
  title?: string
}) {
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const { assets, total, loading, loadingMore, error, hasMore, loadMore } =
    useAmbientcgSearch(query, open)

  // Prefetch catalog as soon as a slot mounts so the modal opens with data.
  useEffect(() => {
    void searchMaterials('', { limit: 1 }).catch(() => {})
  }, [])

  if (!open) return null

  return (
    <div className="tex-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="tex-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <header className="tex-modal-header">
          <h3>{title}</h3>
          <button type="button" className="ghost" onClick={onClose}>
            Закрыть
          </button>
        </header>
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
            placeholder="Поиск: wood, tiles, plaster…"
            autoFocus
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
        <div className="tex-grid">
          {assets.map((a) => (
            <button
              key={a.id}
              type="button"
              className="tex-card"
              onClick={() => {
                onSelect(materialRefFromAsset(a))
                onClose()
              }}
            >
              <img
                src={a.thumbnailUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const el = e.currentTarget
                  if (!el.dataset.fallback) {
                    el.dataset.fallback = '1'
                    el.src = `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${a.id}/${a.id}_SQ_Color.jpg`
                    return
                  }
                  el.style.opacity = '0.25'
                  el.closest('button')?.classList.add('tex-card-broken')
                }}
              />
              <span>{a.title}</span>
            </button>
          ))}
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
        <footer className="tex-modal-footer muted">
          Каталог ambientCG (CC0), поиск локальный — API без CORS.
          Карты с{' '}
          <a href="https://ambientcg.com" target="_blank" rel="noreferrer">
            ambientCG
          </a>
          .
        </footer>
      </div>
    </div>
  )
}

export function MaterialSlot({
  label,
  value,
  onChange,
  onClear,
  applyOnly = false,
}: {
  label: string
  value: MaterialRef | null | undefined
  onChange: (ref: MaterialRef) => void
  onClear: () => void
  /** When true, acts as apply action without showing current value. */
  applyOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const thumb =
    !applyOnly && value ? ambientcgThumbnailUrl(value.assetId, 128) : null

  return (
    <div className="mat-slot">
      <div className="mat-slot-head">
        <span>{label}</span>
        {!applyOnly && value && (
          <button type="button" className="ghost small" onClick={onClear}>
            Сбросить
          </button>
        )}
        {applyOnly && (
          <button type="button" className="ghost small" onClick={onClear}>
            Сбросить стены
          </button>
        )}
      </div>
      <button
        type="button"
        className="mat-slot-btn"
        onClick={() => setOpen(true)}
      >
        {thumb ? (
          <img
            src={thumb}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => {
              const el = e.currentTarget
              if (!value || el.dataset.fallback) {
                el.style.visibility = 'hidden'
                return
              }
              el.dataset.fallback = '1'
              el.src = `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${value.assetId}/${value.assetId}_SQ_Color.jpg`
            }}
          />
        ) : (
          <span className="mat-slot-empty">
            {applyOnly ? 'Задать…' : 'Выбрать…'}
          </span>
        )}
        <span className="mat-slot-id">
          {applyOnly
            ? 'Выбрать текстуру для всех стен'
            : (value?.assetId ?? 'Нет текстуры')}
        </span>
      </button>
      {!applyOnly && value && (
        <label className="mat-tile">
          Тайл, м
          <input
            type="number"
            min={0.2}
            max={10}
            step={0.1}
            value={value.tileSizeM}
            onChange={(e) =>
              onChange({
                ...value,
                tileSizeM: Math.max(0.2, Number(e.target.value) || 1.5),
              })
            }
          />
        </label>
      )}
      <TextureBrowser
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onChange}
        title={label}
      />
    </div>
  )
}
