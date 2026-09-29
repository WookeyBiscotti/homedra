import { MONTH_SHORT } from '../../landscape/season'
import { useBuildingStore } from '../../store/buildingStore'

export function LandscapeMonthSlider() {
  const workbench = useBuildingStore((s) => s.workbench)
  const month = useBuildingStore((s) => s.landscapeMonth)
  const setLandscapeMonth = useBuildingStore((s) => s.setLandscapeMonth)

  if (workbench !== 'landscape') return null

  return (
    <div className="landscape-month-bar" aria-label="Месяц растений">
      <p className="landscape-month-title">Месяц</p>
      <input
        type="range"
        min={1}
        max={12}
        step={1}
        value={month}
        aria-valuemin={1}
        aria-valuemax={12}
        aria-valuenow={month}
        aria-valuetext={MONTH_SHORT[month - 1]}
        onChange={(e) => setLandscapeMonth(Number(e.target.value))}
      />
      <div className="landscape-month-ticks">
        {MONTH_SHORT.map((label, i) => {
          const value = i + 1
          return (
            <button
              key={label}
              type="button"
              className={month === value ? 'active' : ''}
              onClick={() => setLandscapeMonth(value)}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
