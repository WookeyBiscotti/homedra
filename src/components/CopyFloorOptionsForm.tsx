import { useState } from 'react'
import {
  DEFAULT_COPY_FLOOR_OPTIONS,
  type CopyFloorOptions,
} from '../engine/copyFloor'

const OPTIONS: { key: keyof CopyFloorOptions; label: string }[] = [
  { key: 'walls', label: 'Стены' },
  { key: 'constraints', label: 'Ограничения' },
  { key: 'doors', label: 'Двери' },
  { key: 'windows', label: 'Окна' },
  { key: 'passages', label: 'Проёмы' },
  { key: 'stairs', label: 'Проёмы лестниц' },
  { key: 'plates', label: 'Полы без стен' },
]

interface CopyFloorOptionsFormProps {
  title: string
  confirmLabel: string
  onConfirm: (options: CopyFloorOptions) => void
  onCancel: () => void
  /** Extra action: create empty without copying */
  onSkip?: () => void
  skipLabel?: string
}

export function CopyFloorOptionsForm({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  onSkip,
  skipLabel = 'Пустой этаж',
}: CopyFloorOptionsFormProps) {
  const [options, setOptions] = useState<CopyFloorOptions>({
    ...DEFAULT_COPY_FLOOR_OPTIONS,
  })

  const toggle = (key: keyof CopyFloorOptions) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      // Wall openings/constraints need walls
      if (
        key !== 'walls' &&
        next[key] &&
        (key === 'constraints' ||
          key === 'doors' ||
          key === 'windows' ||
          key === 'passages')
      ) {
        next.walls = true
      }
      if (key === 'walls' && !next.walls) {
        next.constraints = false
        next.doors = false
        next.windows = false
        next.passages = false
      }
      return next
    })
  }

  const anySelected =
    options.walls ||
    options.constraints ||
    options.doors ||
    options.windows ||
    options.passages ||
    options.stairs ||
    options.plates

  return (
    <div className="copy-floor-form" role="dialog" aria-label={title}>
      <h3>{title}</h3>
      <p className="muted">Выберите, что перенести с предыдущего этажа</p>
      <div className="copy-floor-checks">
        {OPTIONS.map(({ key, label }) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={options[key]}
              onChange={() => toggle(key)}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="copy-floor-actions">
        <button
          type="button"
          className="prop-action"
          disabled={!anySelected}
          onClick={() => onConfirm(options)}
        >
          {confirmLabel}
        </button>
        {onSkip && (
          <button type="button" className="prop-action" onClick={onSkip}>
            {skipLabel}
          </button>
        )}
        <button type="button" className="linkish" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}
