import type { Workbench } from '../engine/types'
import { useBuildingStore } from '../store/buildingStore'
import { IconImg, UI_ICONS } from './icons'

const WORKBENCHES: { id: Workbench; label: string; hint: string }[] = [
  {
    id: 'draft',
    label: 'Планировка',
    hint: 'Стены, проёмы, ограничения',
  },
  {
    id: 'paint',
    label: 'Покраска',
    hint: 'Материалы стен и полов в 3D',
  },
  {
    id: 'furnish',
    label: 'Объекты',
    hint: 'Каталог и расстановка 3D моделей',
  },
]

export function WorkbenchSwitcher() {
  const workbench = useBuildingStore((s) => s.workbench)
  const setWorkbench = useBuildingStore((s) => s.setWorkbench)

  return (
    <div className="workbench-switcher" role="tablist" aria-label="Верстак">
      {WORKBENCHES.map((wb) => (
        <button
          key={wb.id}
          type="button"
          role="tab"
          aria-selected={workbench === wb.id}
          className={workbench === wb.id ? 'active' : ''}
          title={wb.hint}
          onClick={() => setWorkbench(wb.id)}
        >
          <IconImg
            src={UI_ICONS.workbench[wb.id]}
            className="ui-icon workbench-icon"
          />
          <span>{wb.label}</span>
        </button>
      ))}
    </div>
  )
}
