/** Inline PBR + image-crop editor for wall/floor coverings (`MaterialRef`). */

import {
  defaultTileTexRegion,
  keepMaterialLook,
  type MaterialRef,
} from '../engine/types'
import { MaterialPbrFields } from './PbrMaterialEditor'
import { MaterialSlot } from './TextureBrowser'
import { TextureRegionPicker } from './TextureRegionPicker'

export function CoveringEditor({
  value,
  onChange,
  onCommit,
  showRepeat = true,
  showTexture = true,
  ariaLabel = 'Покрытие',
  regionHint = 'Рамка на текстуре — какой кусок попадёт на покрытие. Тяните середину или углы.',
}: {
  value: MaterialRef
  onChange: (next: MaterialRef) => void
  onCommit?: () => void
  showRepeat?: boolean
  /** Texture picker — off when the parent already has a MaterialSlot. */
  showTexture?: boolean
  ariaLabel?: string
  regionHint?: string
}) {
  return (
    <div className="covering-editor" role="group" aria-label={ariaLabel}>
      {showTexture && (
        <MaterialSlot
          label="Текстура"
          value={value}
          showRepeat={false}
          allowClear={false}
          onChange={(ref) => {
            onCommit?.()
            onChange({
              ...keepMaterialLook(value, ref),
              texRegion: defaultTileTexRegion(),
            })
          }}
          onClear={() => undefined}
        />
      )}
      {showRepeat && (
        <div className="mat-tile-row">
          <label className="mat-tile">
            Тайл, м
            <input
              type="number"
              min={0.2}
              max={10}
              step={0.1}
              value={value.tileSizeM}
              onFocus={() => onCommit?.()}
              onChange={(e) =>
                onChange({
                  ...value,
                  tileSizeM: Math.max(0.2, Number(e.target.value) || 1.5),
                })
              }
            />
          </label>
        </div>
      )}
      <p className="tool-group-title">PBR</p>
      <MaterialPbrFields
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        ariaLabel={`PBR · ${ariaLabel}`}
      />
      <TextureRegionPicker
        material={value}
        value={value.texRegion}
        hint={regionHint}
        onCommit={onCommit}
        onChange={(texRegion) => onChange({ ...value, texRegion })}
      />
    </div>
  )
}

/** Material picker + collapsible covering (PBR / crop) settings. */
export function CoveringSlot({
  label,
  value,
  onChange,
  onClear,
  applyOnly,
  preferCollection,
  onCommit,
}: {
  label: string
  value: MaterialRef | null | undefined
  onChange: (ref: MaterialRef) => void
  onClear: () => void
  applyOnly?: boolean
  preferCollection?: boolean
  onCommit?: () => void
}) {
  return (
    <div className="covering-slot">
      <MaterialSlot
        label={label}
        value={value}
        showRepeat={false}
        applyOnly={applyOnly}
        preferCollection={preferCollection}
        onChange={(ref) =>
          onChange(
            value
              ? {
                  ...keepMaterialLook(value, ref),
                  texRegion: defaultTileTexRegion(),
                }
              : ref,
          )
        }
        onClear={onClear}
      />
      {value && !applyOnly && (
        <details className="covering-details">
          <summary>PBR и область рисунка</summary>
          <CoveringEditor
            value={value}
            onChange={onChange}
            onCommit={onCommit}
            showTexture={false}
            ariaLabel={label}
          />
        </details>
      )}
    </div>
  )
}
