import { IconImg, TOOL_ICONS, UI_ICONS } from './icons'
import { useBuildingStore } from '../store/buildingStore'
import { isGroundFloor, type Tool } from '../engine/types'

const tools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', hint: 'V' },
  { id: 'placeObject', label: 'Каталог', hint: 'F' },
]

export function FurnishWorkbench() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const pendingModel = useBuildingStore((s) => s.pendingModel)
  const setPendingModel = useBuildingStore((s) => s.setPendingModel)
  const setModelBrowserOpen = useBuildingStore((s) => s.setModelBrowserOpen)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const floor = useBuildingStore((s) => s.activeFloor())
  const ground = isGroundFloor(floor)

  return (
    <aside className="toolbar workbench-rail" aria-label="Объекты">
      <h2 className="panel-title">Объекты</h2>
      {ground ? (
        <p className="hint">
          Земля — модели ставятся на этаж. Переключитесь на этаж.
        </p>
      ) : (
        <>
          <div className="tool-list">
            {tools.map((t) => {
              const icon = TOOL_ICONS[t.id]
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tool-btn ${tool === t.id ? 'active' : ''}`}
                  onClick={() => setTool(t.id)}
                  title={`${t.label} (${t.hint})`}
                >
                  <span className="tool-btn-main">
                    {icon && <IconImg src={icon} className="ui-icon tool-icon" />}
                    <span>{t.label}</span>
                  </span>
                  <kbd>{t.hint}</kbd>
                </button>
              )
            })}
          </div>

          {pendingModel ? (
            <div className="furnish-pending">
              <p className="hint">
                Модель выбрана — кликните по плану или полу в 3D.
              </p>
              <button
                type="button"
                className="ghost"
                onClick={() => setPendingModel(null)}
              >
                Отменить размещение
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="tool-btn furnish-catalog-btn"
              onClick={() => setModelBrowserOpen(true)}
            >
              <span className="tool-btn-main">
                <IconImg
                  src={TOOL_ICONS.placeObject!}
                  className="ui-icon tool-icon"
                />
                <span>Открыть каталог</span>
              </span>
            </button>
          )}

          <div className="tool-actions">
            <button type="button" onClick={deleteSelection}>
              <IconImg src={UI_ICONS.delete} className="ui-icon" />
              Удалить
            </button>
          </div>
          <p className="hint">
            F — каталог (NASA, Sketchfab, свой GLB…). Клик по полу ставит
            объект. Выделите объект, чтобы сдвинуть или повернуть в свойствах.
          </p>
        </>
      )}
    </aside>
  )
}
