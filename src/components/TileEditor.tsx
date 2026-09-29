import { useState } from 'react'
import type { TileSpec } from '../engine/types'
import { defaultTileSpec, defaultTileTexRegion, keepMaterialLook } from '../engine/types'
import { MaterialPbrFields } from './PbrMaterialEditor'
import { MaterialSlot } from './TextureBrowser'
import { TextureRegionPicker } from './TextureRegionPicker'
import { TileThumb } from './TileThumb'

export function TileEditor({
  spec,
  title,
  onSave,
  onClose,
}: {
  spec: TileSpec
  title: string
  onSave: (spec: TileSpec) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<TileSpec>({
    ...spec,
    material: { ...spec.material },
    texRegion: spec.texRegion ? { ...spec.texRegion } : defaultTileTexRegion(),
  })

  return (
    <div className="tile-editor" role="dialog" aria-label={title}>
      <h3>{title}</h3>
      <div className="tile-face-preview" aria-label="Внешний вид плитки">
        <TileThumb
          material={draft.material}
          alt={draft.name}
          width={draft.width}
          length={draft.length}
          texRegion={draft.texRegion}
        />
      </div>
      <label>
        Название
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      <label>
        Ширина, м
        <input
          type="number"
          min={0.05}
          max={2}
          step={0.01}
          value={draft.width}
          onChange={(e) => setDraft({ ...draft, width: Number(e.target.value) })}
        />
      </label>
      <label>
        Длина, м
        <input
          type="number"
          min={0.05}
          max={2}
          step={0.01}
          value={draft.length}
          onChange={(e) => setDraft({ ...draft, length: Number(e.target.value) })}
        />
      </label>
      <label>
        Толщина, мм
        <input
          type="number"
          min={2}
          max={40}
          step={1}
          value={Math.round(draft.thickness * 1000)}
          onChange={(e) =>
            setDraft({ ...draft, thickness: Number(e.target.value) / 1000 })
          }
        />
      </label>
      <MaterialSlot
        label="Рисунок"
        value={draft.material}
        showRepeat={false}
        onChange={(material) =>
          setDraft({
            ...draft,
            material: keepMaterialLook(draft.material, material),
            texRegion: defaultTileTexRegion(),
          })
        }
        onClear={() =>
          setDraft({
            ...draft,
            material: keepMaterialLook(
              draft.material,
              defaultTileSpec().material,
            ),
            texRegion: defaultTileTexRegion(),
          })
        }
      />
      <p className="tool-group-title">PBR</p>
      <MaterialPbrFields
        value={draft.material}
        onChange={(material) => setDraft({ ...draft, material })}
      />
      <TextureRegionPicker
        material={draft.material}
        value={draft.texRegion}
        hint="Рамка на текстуре — какой кусок попадёт на плитку. Тяните середину или углы."
        onChange={(texRegion) => setDraft({ ...draft, texRegion })}
      />
      <div className="copy-floor-actions">
        <button
          type="button"
          className="prop-action"
          onClick={() =>
            onSave({
              ...draft,
              name: draft.name.trim() || 'Плитка',
              width: Math.max(0.05, draft.width),
              length: Math.max(0.05, draft.length),
              thickness: Math.max(0.002, Math.min(0.08, draft.thickness)),
            })
          }
        >
          Сохранить
        </button>
        <button type="button" className="linkish" onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  )
}
