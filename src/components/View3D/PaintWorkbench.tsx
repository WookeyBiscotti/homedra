import {
  defaultTileTexRegion,
  keepMaterialLook,
  type MaterialRef,
} from '../../engine/types'
import { materialLabel } from '../../materials/customTextures'
import { useBuildingStore } from '../../store/buildingStore'
import { CoveringEditor } from '../CoveringEditor'
import { TextureSourceTabs } from '../CustomTextureLibrary'
import { TileThumb } from '../TileThumb'

/** Docked texture palette + covering (PBR / crop) controls for paint scene mode. */
export function PaintWorkbench() {
  const paintBrush = useBuildingStore((s) => s.paintBrush)
  const setPaintBrush = useBuildingStore((s) => s.setPaintBrush)
  const updatePaintBrush = useBuildingStore((s) => s.updatePaintBrush)

  const selectBrush = (ref: MaterialRef) => {
    if (!paintBrush) {
      setPaintBrush(ref)
      return
    }
    // New brush image — keep PBR sliders, reset crop. Painted walls stay as-is.
    updatePaintBrush({
      ...keepMaterialLook(paintBrush, ref),
      texRegion: defaultTileTexRegion(),
    })
  }

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
        {paintBrush ? (
          <TileThumb
            material={paintBrush}
            alt={materialLabel(paintBrush)}
            texRegion={paintBrush.texRegion}
            className="paint-brush-thumb"
          />
        ) : (
          <span className="paint-brush-empty">Выберите текстуру</span>
        )}
        <div className="paint-brush-meta">
          <span className="paint-brush-id">{materialLabel(paintBrush)}</span>
        </div>
      </div>

      {paintBrush && (
        <CoveringEditor
          value={paintBrush}
          onChange={updatePaintBrush}
          ariaLabel="Кисть покрытия"
        />
      )}

      <p className="paint-hint muted">
        ЛКМ — нанести · Alt+ЛКМ — стереть · Shift+ЛКМ по полу — стены комнаты.
        Пол, потолок и срезы (торцы, проёмы, лестница) красятся отдельно.
        Уже покрашенные поверхности правятся в панели свойств.
      </p>

      <TextureSourceTabs
        selected={paintBrush}
        onSelect={selectBrush}
        gridClassName="tex-grid paint-tex-grid"
      />
    </aside>
  )
}
