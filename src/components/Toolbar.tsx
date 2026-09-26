import { IconImg, TOOL_ICONS, UI_ICONS } from './icons'
import { useBuildingStore } from '../store/buildingStore'
import { isGroundFloor, selectedVertexIds, type Tool } from '../engine/types'

const drawTools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', hint: 'V' },
  { id: 'wall', label: 'Стена', hint: 'W' },
  { id: 'door', label: 'Дверь', hint: 'D' },
  { id: 'passage', label: 'Проём', hint: 'O' },
  { id: 'window', label: 'Окно', hint: 'N' },
  { id: 'stair', label: 'Лестн. пол', hint: 'S' },
  { id: 'floor', label: 'Пол', hint: 'B' },
  { id: 'box', label: 'Короб', hint: 'K' },
  { id: 'cutout', label: 'Вырез', hint: 'C' },
]

const constraintTools: { id: Tool; label: string; hint: string }[] = [
  { id: 'lockLength', label: 'Фикс. длина', hint: 'L' },
  { id: 'lockPoint', label: 'Фикс. точка', hint: 'P' },
  { id: 'horizontal', label: 'Горизонт.', hint: 'H' },
  { id: 'vertical', label: 'Вертикаль', hint: 'I' },
]

function ToolButton({
  id,
  label,
  hint,
  active,
  onClick,
}: {
  id: Tool
  label: string
  hint: string
  active: boolean
  onClick: () => void
}) {
  const icon = TOOL_ICONS[id]
  return (
    <button
      type="button"
      className={`tool-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      title={`${label} (${hint})`}
    >
      <span className="tool-btn-main">
        {icon && <IconImg src={icon} className="ui-icon tool-icon" />}
        <span>{label}</span>
      </span>
      <kbd>{hint}</kbd>
    </button>
  )
}

export function Toolbar() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const mergeSelectedVertices = useBuildingStore((s) => s.mergeSelectedVertices)
  const selection = useBuildingStore((s) => s.selection)
  const floor = useBuildingStore((s) => s.activeFloor())
  const ground = isGroundFloor(floor)

  const canMerge = selectedVertexIds(selection).length === 2

  return (
    <aside className="toolbar workbench-rail" aria-label="Планировка">
      <h2 className="panel-title">Планировка</h2>
      {ground ? (
        <p className="hint">
          Земля — только уровень грунта. Переключитесь на этаж, чтобы чертить
          стены.
        </p>
      ) : (
        <>
          <div className="tool-list">
            {drawTools.map((t) => (
              <ToolButton
                key={t.id}
                {...t}
                active={tool === t.id}
                onClick={() => setTool(t.id)}
              />
            ))}
          </div>

          <h3 className="tool-group-title">Ограничения</h3>
          <div className="tool-list">
            {constraintTools.map((t) => (
              <ToolButton
                key={t.id}
                {...t}
                active={tool === t.id}
                onClick={() => setTool(t.id)}
              />
            ))}
          </div>

          <div className="tool-actions">
            <button type="button" onClick={deleteSelection}>
              <IconImg src={UI_ICONS.delete} className="ui-icon" />
              Удалить
            </button>
            <button
              type="button"
              onClick={mergeSelectedVertices}
              disabled={!canMerge}
              title="Слить две выделенные точки (M)"
            >
              <IconImg src={UI_ICONS.merge} className="ui-icon" />
              Слить точки
            </button>
          </div>
          <p className="hint">
            Стена: клик — начало/конец. Проёмы (D/O/N). Лестница (S). Пол без
            стен (B). Короб (K). Вырез в коробе (C). Ограничения — клик по стене
            или точке. Shift — мультивыбор.
          </p>
        </>
      )}
    </aside>
  )
}
