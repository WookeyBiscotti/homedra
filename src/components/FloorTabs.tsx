import { useState } from 'react'
import type { CopyFloorOptions } from '../engine/copyFloor'
import { isGroundFloor, isStoryFloor } from '../engine/types'
import { useBuildingStore } from '../store/buildingStore'
import { CopyFloorOptionsForm } from './CopyFloorOptionsForm'

export function FloorTabs() {
  const floors = useBuildingStore((s) => s.building.floors)
  const activeFloorId = useBuildingStore((s) => s.activeFloorId)
  const setActiveFloor = useBuildingStore((s) => s.setActiveFloor)
  const setFloorVisible = useBuildingStore((s) => s.setFloorVisible)
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
        const visible = f.visible !== false
        return (
          <button
            key={f.id}
            type="button"
            className={`floor-tab ${f.id === activeFloorId ? 'active' : ''} ${ground ? 'ground' : ''} ${visible ? '' : 'hidden-floor'}`}
            onClick={() => setActiveFloor(f.id)}
            title={visible ? 'Этаж виден в 3D' : 'Этаж скрыт в 3D'}
          >
            <input
              type="checkbox"
              className="floor-vis"
              checked={visible}
              title={visible ? 'Скрыть в 3D' : 'Показать в 3D'}
              aria-label={visible ? `Скрыть «${f.name}»` : `Показать «${f.name}»`}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation()
                setFloorVisible(f.id, e.target.checked)
              }}
            />
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
