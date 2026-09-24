import { useState } from 'react'
import type { CopyFloorOptions } from '../engine/copyFloor'
import {
  type FloorVisibility,
  isFloorRendered,
  isGroundFloor,
  isStoryFloor,
  normalizeFloorVisibility,
} from '../engine/types'
import { useBuildingStore } from '../store/buildingStore'
import { CopyFloorOptionsForm } from './CopyFloorOptionsForm'
import { IconImg, UI_ICONS } from './icons'

const VISIBILITY_LABEL: Record<FloorVisibility, string> = {
  solid: 'Полностью виден в 3D',
  ghost: 'Виден с прозрачностью в 3D',
  hidden: 'Скрыт в 3D',
}

const VISIBILITY_ACTION: Record<FloorVisibility, string> = {
  solid: 'Сделать полупрозрачным',
  ghost: 'Скрыть в 3D',
  hidden: 'Показать полностью',
}

export function FloorTabs() {
  const floors = useBuildingStore((s) => s.building.floors)
  const activeFloorId = useBuildingStore((s) => s.activeFloorId)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const cycleFloorVisible = useBuildingStore((s) => s.cycleFloorVisible)
  const addFloor = useBuildingStore((s) => s.addFloor)
  const removeFloor = useBuildingStore((s) => s.removeFloor)
  const [showCopyDialog, setShowCopyDialog] = useState(false)

  const stories = floors.filter(isStoryFloor)

  const handleAddClick = () => {
    if (stories.length === 0) {
      addFloor()
      return
    }
    setShowCopyDialog(true)
  }

  const handleConfirmCopy = (options: CopyFloorOptions) => {
    addFloor(options)
    setShowCopyDialog(false)
  }

  return (
    <div className="floor-tabs">
      {floors.map((f) => {
        const ground = isGroundFloor(f)
        const visibility = normalizeFloorVisibility(f.visible)
        const rendered = isFloorRendered(visibility)
        return (
          <button
            key={f.id}
            type="button"
            className={`floor-tab ${f.id === activeFloorId ? 'active' : ''} ${ground ? 'ground' : ''} ${rendered ? '' : 'hidden-floor'} ${visibility === 'ghost' ? 'ghost-floor' : ''}`}
            onClick={() => setActiveFloor(f.id)}
            title={VISIBILITY_LABEL[visibility]}
          >
            <span
              className="floor-vis"
              role="button"
              tabIndex={0}
              title={VISIBILITY_ACTION[visibility]}
              aria-label={`${VISIBILITY_ACTION[visibility]}: «${f.name}»`}
              onClick={(e) => {
                e.stopPropagation()
                cycleFloorVisible(f.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  cycleFloorVisible(f.id)
                }
              }}
            >
              <IconImg
                src={UI_ICONS.visibility[visibility]}
                className="ui-icon floor-vis-icon"
              />
            </span>
            <span className="floor-tab-name">{f.name}</span>
            {!ground && stories.length > 1 && (
              <span
                className="floor-close"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  removeFloor(f.id)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation()
                    removeFloor(f.id)
                  }
                }}
              >
                ×
              </span>
            )}
          </button>
        )
      })}
      <button type="button" className="floor-tab add" onClick={handleAddClick}>
        + Этаж
      </button>

      {showCopyDialog && (
        <div className="copy-floor-popover">
          <CopyFloorOptionsForm
            title="Новый этаж"
            confirmLabel="Создать с копированием"
            skipLabel="Пустой этаж"
            onConfirm={handleConfirmCopy}
            onSkip={() => {
              addFloor()
              setShowCopyDialog(false)
            }}
            onCancel={() => setShowCopyDialog(false)}
          />
        </div>
      )}
    </div>
  )
}
