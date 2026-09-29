/** Shared PBR slider / color / ambientCG texture controls. */

import type { MaterialRef, ObjectMaterialOverride } from '../engine/types'
import { DEFAULT_DISPLACEMENT_SCALE } from '../materials/ambientcg'
import type { PbrSample } from '../models/objectAppearance'
import { MaterialSlot } from './TextureBrowser'

function patchMaterialLook<K extends keyof MaterialRef>(
  value: MaterialRef,
  key: K,
  next: MaterialRef[K] | undefined,
): MaterialRef {
  const out: MaterialRef = { ...value }
  if (next === undefined) {
    delete out[key]
  } else {
    out[key] = next
  }
  return out
}

/** Ceramic / surface PBR sliders stored on `MaterialRef`. */
export function MaterialPbrFields({
  value,
  onChange,
  onCommit,
  hideDisplacement = false,
  ariaLabel = 'PBR плитки',
}: {
  value: MaterialRef
  onChange: (next: MaterialRef) => void
  onCommit?: () => void
  hideDisplacement?: boolean
  ariaLabel?: string
}) {
  return (
    <div
      className="pbr-editor"
      onPointerDown={onCommit}
      role="group"
      aria-label={ariaLabel}
    >
      <ColorRow
        label="Цвет"
        value={value.tint}
        fallback="#ffffff"
        onChange={(hex) => onChange({ ...value, tint: hex })}
        onClear={() => onChange(patchMaterialLook(value, 'tint', undefined))}
      />
      <NumRow
        label="Шероховатость"
        value={value.roughness}
        fallback={0.75}
        onChange={(n) => onChange({ ...value, roughness: clamp01(n) })}
        onClear={() => onChange(patchMaterialLook(value, 'roughness', undefined))}
      />
      <NumRow
        label="Металличность"
        value={value.metalness}
        fallback={0}
        onChange={(n) => onChange({ ...value, metalness: clamp01(n) })}
        onClear={() => onChange(patchMaterialLook(value, 'metalness', undefined))}
      />
      <NumRow
        label="Нормали"
        value={value.normalScale}
        fallback={0.85}
        min={0}
        max={2}
        step={0.05}
        onChange={(n) => onChange({ ...value, normalScale: Math.max(0, n) })}
        onClear={() =>
          onChange(patchMaterialLook(value, 'normalScale', undefined))
        }
      />
      <NumRow
        label="AO"
        value={value.aoMapIntensity}
        fallback={1}
        min={0}
        max={2}
        step={0.05}
        onChange={(n) => onChange({ ...value, aoMapIntensity: Math.max(0, n) })}
        onClear={() =>
          onChange(patchMaterialLook(value, 'aoMapIntensity', undefined))
        }
      />
      <NumRow
        label="Окружение (env)"
        value={value.envMapIntensity}
        fallback={0.75}
        min={0}
        max={3}
        step={0.05}
        onChange={(n) =>
          onChange({ ...value, envMapIntensity: Math.max(0, n) })
        }
        onClear={() =>
          onChange(patchMaterialLook(value, 'envMapIntensity', undefined))
        }
      />
      {!hideDisplacement && (
        <NumRow
          label="Рельеф (м)"
          value={value.displacementScale}
          fallback={0}
          min={0}
          max={0.08}
          step={0.001}
          onChange={(n) =>
            onChange({ ...value, displacementScale: Math.max(0, n) })
          }
          onClear={() =>
            onChange(patchMaterialLook(value, 'displacementScale', undefined))
          }
        />
      )}
    </div>
  )
}

export type { PbrSample }

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function NumRow({
  label,
  value,
  fallback,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  onClear,
}: {
  label: string
  value: number | undefined
  fallback?: number
  min?: number
  max?: number
  step?: number
  onChange: (n: number) => void
  onClear: () => void
}) {
  const display = value ?? fallback ?? (min + max) / 2
  const overridden = value !== undefined
  return (
    <label className={`pbr-row${overridden ? ' pbr-row-set' : ''}`}>
      <span className="pbr-row-label">
        {label}
        <strong>{display.toFixed(2)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={display}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button
        type="button"
        className="ghost small"
        disabled={!overridden}
        onClick={onClear}
        title="Сбросить к исходному"
      >
        ×
      </button>
    </label>
  )
}

function ColorRow({
  label,
  value,
  fallback,
  onChange,
  onClear,
}: {
  label: string
  value: string | undefined
  fallback?: string
  onChange: (hex: string) => void
  onClear: () => void
}) {
  const display = value ?? fallback ?? '#ffffff'
  const overridden = value !== undefined
  return (
    <label className={`pbr-row pbr-row-color${overridden ? ' pbr-row-set' : ''}`}>
      <span className="pbr-row-label">{label}</span>
      <input
        type="color"
        value={display}
        onChange={(e) => onChange(e.target.value)}
      />
      <code className="muted">{display}</code>
      <button
        type="button"
        className="ghost small"
        disabled={!overridden}
        onClick={onClear}
        title="Сбросить"
      >
        ×
      </button>
    </label>
  )
}

function patch<K extends keyof ObjectMaterialOverride>(
  value: ObjectMaterialOverride,
  key: K,
  next: ObjectMaterialOverride[K] | undefined,
): ObjectMaterialOverride {
  const out: ObjectMaterialOverride = { ...value }
  if (next === undefined) {
    delete out[key]
  } else {
    out[key] = next
  }
  return out
}

/** Inline PBR parameter editor for one material override. */
export function PbrMaterialEditor({
  label,
  value,
  onChange,
  onClear,
  sample,
}: {
  label: string
  value: ObjectMaterialOverride
  onChange: (next: ObjectMaterialOverride) => void
  onClear: () => void
  sample?: PbrSample
}) {
  return (
    <div className="collection-edit-slot pbr-editor">
      <div className="collection-edit-slot-head">
        <strong>{label}</strong>
        <button type="button" className="ghost small" onClick={onClear}>
          Сбросить всё
        </button>
      </div>

      <ColorRow
        label="Цвет (albedo)"
        value={value.tint}
        fallback={sample?.color}
        onChange={(hex) => onChange({ ...value, tint: hex })}
        onClear={() => onChange(patch(value, 'tint', undefined))}
      />

      <NumRow
        label="Шероховатость"
        value={value.roughness}
        fallback={sample?.roughness}
        onChange={(n) => onChange({ ...value, roughness: clamp01(n) })}
        onClear={() => onChange(patch(value, 'roughness', undefined))}
      />
      <NumRow
        label="Металличность"
        value={value.metalness}
        fallback={sample?.metalness}
        onChange={(n) => onChange({ ...value, metalness: clamp01(n) })}
        onClear={() => onChange(patch(value, 'metalness', undefined))}
      />

      <ColorRow
        label="Свечение"
        value={value.emissive}
        fallback={sample?.emissive ?? '#000000'}
        onChange={(hex) => onChange({ ...value, emissive: hex })}
        onClear={() => onChange(patch(value, 'emissive', undefined))}
      />
      <NumRow
        label="Сила свечения"
        value={value.emissiveIntensity}
        fallback={sample?.emissiveIntensity ?? 0}
        min={0}
        max={5}
        step={0.05}
        onChange={(n) =>
          onChange({ ...value, emissiveIntensity: Math.max(0, n) })
        }
        onClear={() => onChange(patch(value, 'emissiveIntensity', undefined))}
      />

      <NumRow
        label="Прозрачность"
        value={value.opacity}
        fallback={sample?.opacity ?? 1}
        onChange={(n) => onChange({ ...value, opacity: clamp01(n) })}
        onClear={() => onChange(patch(value, 'opacity', undefined))}
      />
      <NumRow
        label="Окружение (env)"
        value={value.envMapIntensity}
        fallback={sample?.envMapIntensity ?? 1}
        min={0}
        max={3}
        step={0.05}
        onChange={(n) =>
          onChange({ ...value, envMapIntensity: Math.max(0, n) })
        }
        onClear={() => onChange(patch(value, 'envMapIntensity', undefined))}
      />
      <NumRow
        label="Нормали"
        value={value.normalScale}
        fallback={sample?.normalScale ?? 1}
        min={0}
        max={2}
        step={0.05}
        onChange={(n) => onChange({ ...value, normalScale: Math.max(0, n) })}
        onClear={() => onChange(patch(value, 'normalScale', undefined))}
      />
      <NumRow
        label="AO"
        value={value.aoMapIntensity}
        fallback={sample?.aoMapIntensity ?? 1}
        min={0}
        max={2}
        step={0.05}
        onChange={(n) =>
          onChange({ ...value, aoMapIntensity: Math.max(0, n) })
        }
        onClear={() => onChange(patch(value, 'aoMapIntensity', undefined))}
      />
      <NumRow
        label="Рельеф (м)"
        value={value.displacementScale}
        fallback={sample?.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE}
        min={0}
        max={0.15}
        step={0.005}
        onChange={(n) =>
          onChange({ ...value, displacementScale: Math.max(0, n) })
        }
        onClear={() => onChange(patch(value, 'displacementScale', undefined))}
      />

      <MaterialSlot
        label="Текстура"
        value={value.material}
        preferCollection
        onChange={(ref: MaterialRef) => onChange({ ...value, material: ref })}
        onClear={() => onChange(patch(value, 'material', null))}
      />
    </div>
  )
}
