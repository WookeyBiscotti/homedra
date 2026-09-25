import type { MaterialRef } from '../../engine/types'
import { DEFAULT_DISPLACEMENT_SCALE } from '../../materials/ambientcg'
import { materialLabel } from '../../materials/customTextures'
import { useBuildingStore } from '../../store/buildingStore'
import { TextureSourceTabs } from '../CustomTextureLibrary'
import { useMaterialThumb } from '../TextureBrowser'

/** Docked texture palette + brush controls for paint scene mode. */
export function PaintWorkbench() {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setPaintBrush = useBuildingStore((s) => s.setPaintBrush)

  const selectBrush = (ref: MaterialRef) => {
    setPaintBrush(ref)
  }

  const thumb = useMaterialThumb(paintBrush)

  return (
    <aside className="toolbar workbench-rail paint-workbench" aria-label="Покраска">
      <header className="paint-workbench-header">
        <h2 className="panel-title">Покраска</h2>
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
              if (!paintBrush || paintBrush.source !== 'ambientcg' || el.dataset.fallback) {
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
          <span className="paint-brush-id">{materialLabel(paintBrush)}</span>
          {paintBrush && (
            <div className="mat-tile-row">
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
              <label className="mat-tile paint-tile">
                Рельеф, м
                <input
                  type="number"
                  min={0}
                  max={0.15}
                  step={0.005}
                  value={
                    paintBrush.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE
                  }
                  onChange={(e) =>
                    setPaintBrush({
                      ...paintBrush,
                      displacementScale: Math.max(
                        0,
                        Number(e.target.value) || 0,
                      ),
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <p className="paint-hint muted">
        ЛКМ — нанести · Alt+ЛКМ — стереть · Shift+ЛКМ по полу — стены комнаты.
        Срезы (торцы, проёмы, лестница) красятся отдельно от сторон стены.
      </p>

      <TextureSourceTabs
        selected={paintBrush}
        onSelect={selectBrush}
        gridClassName="tex-grid paint-tex-grid"
      />
    </aside>
  )
}
