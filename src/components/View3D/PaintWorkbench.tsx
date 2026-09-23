import { useState } from 'react'
import type { MaterialRef } from '../../engine/types'
import {
  ambientcgThumbnailUrl,
  materialRefFromAsset,
} from '../../materials/ambientcg'
import { useAmbientcgSearch } from '../../materials/useAmbientcgSearch'
import { useBuildingStore } from '../../store/buildingStore'

/** Docked texture palette + brush controls for paint scene mode. */
export function PaintWorkbench() {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setPaintBrush = useBuildingStore((s) => s.setPaintBrush)

  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const { assets, total, loading, loadingMore, error, hasMore, loadMore } =
    useAmbientcgSearch(query)

  const selectBrush = (ref: MaterialRef) => {
    setPaintBrush(ref)
  }

  const thumb = paintBrush
    ? ambientcgThumbnailUrl(paintBrush.assetId, 128)
    : null

  return (
    <aside className="paint-workbench" aria-label="Покраска">
      <header className="paint-workbench-header">
        <h3>Кисть</h3>
        {paintBrush && (
          <button
            type="button"
            className="ghost small"
            onClick={() => setPaintBrush(null)}
          >
            Сбросить
          </button>
        )}
      </header>

      <div className="paint-brush-preview">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => {
              const el = e.currentTarget
              if (!paintBrush || el.dataset.fallback) {
                el.style.visibility = 'hidden'
                return
              }
              el.dataset.fallback = '1'
              el.src = `https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/${paintBrush.assetId}/${paintBrush.assetId}_SQ_Color.jpg`
            }}
          />
        ) : (
          <span className="paint-brush-empty">Выберите текстуру</span>
        )}
        <div className="paint-brush-meta">
          <span className="paint-brush-id">
            {paintBrush?.assetId ?? 'Нет кисти'}
          </span>
          {paintBrush && (
            <label className="mat-tile paint-tile">
              Тайл, м
              <input
                type="number"
                min={0.2}
                max={10}
                step={0.1}
                value={paintBrush.tileSizeM}
                onChange={(e) =>
                  setPaintBrush({
                    ...paintBrush,
                    tileSizeM: Math.max(0.2, Number(e.target.value) || 1.5),
                  })
                }
              />
            </label>
          )}
        </div>
      </div>

      <p className="paint-hint muted">
        ЛКМ — нанести · Alt+ЛКМ — стереть · Shift+ЛКМ по полу — стены комнаты.
        Срезы (торцы, проёмы, лестница) красятся отдельно от сторон стены.
      </p>

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
          placeholder="Поиск: wood, bricks, metal…"
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

      <div className="tex-grid paint-tex-grid">
        {assets.map((a) => {
          const active = paintBrush?.assetId === a.id
          return (
            <button
              key={a.id}
              type="button"
              className={`tex-card${active ? ' tex-card-active' : ''}`}
              onClick={() => selectBrush(materialRefFromAsset(a))}
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
                }}
              />
              <span>{a.title}</span>
            </button>
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
    </aside>
  )
}
