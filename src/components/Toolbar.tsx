import { useBuildingStore } from '../store/buildingStore'
import { isGroundFloor, selectedVertexIds, type Tool } from '../engine/types'

const tools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', hint: 'V' },
  { id: 'wall', label: 'Стена', hint: 'W' },
  { id: 'door', label: 'Дверь', hint: 'D' },
  { id: 'passage', label: 'Проём', hint: 'O' },
  { id: 'window', label: 'Окно', hint: 'N' },
  { id: 'stair', label: 'Лестн. пол', hint: 'S' },
  { id: 'lockLength', label: 'Фикс. длина', hint: 'L' },
  { id: 'lockPoint', label: 'Фикс. точка', hint: 'P' },
  { id: 'horizontal', label: 'Горизонт.', hint: 'H' },
  { id: 'vertical', label: 'Вертикаль', hint: 'I' },
]

export function Toolbar() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const undo = useBuildingStore((s) => s.undo)
  const redo = useBuildingStore((s) => s.redo)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const mergeSelectedVertices = useBuildingStore((s) => s.mergeSelectedVertices)
  const selection = useBuildingStore((s) => s.selection)
  const history = useBuildingStore((s) => s.history)
  const future = useBuildingStore((s) => s.future)
  const floor = useBuildingStore((s) => s.activeFloor())
  const ground = isGroundFloor(floor)

  const canMerge = selectedVertexIds(selection).length === 2

  return (
    <aside className="toolbar">
      <h2 className="panel-title">Инструменты</h2>
      {ground ? (
        <p className="hint">
          Земля — только уровень грунта. Переключитесь на этаж, чтобы чертить
          стены.
        </p>
      ) : (
        <>
          <div className="tool-list">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tool-btn ${tool === t.id ? 'active' : ''}`}
                onClick={() => setTool(t.id)}
                title={`${t.label} (${t.hint})`}
              >
                <span>{t.label}</span>
                <kbd>{t.hint}</kbd>
              </button>
            ))}
          </div>
          <div className="tool-actions">
            <button type="button" onClick={undo} disabled={history.length === 0} title="Ctrl+Z">
              Отменить
            </button>
            <button type="button" onClick={redo} disabled={future.length === 0} title="Ctrl+Y">
              Повторить
            </button>
            <button type="button" onClick={deleteSelection}>
              Удалить
            </button>
            <button
              type="button"
              onClick={mergeSelectedVertices}
              disabled={!canMerge}
              title="Слить две выделенные точки (M)"
            >
              Слить точки
            </button>
          </div>
          <p className="hint">
            Стена: клик — начало/конец. Проёмы в стене (D/O/N): клик на стене и
            тяните. Лестница (S): прямоугольник на плане — вырез в полу. В режиме
            Выбор перетаскивайте проёмы. Shift — мультивыбор. Две точки → «Слить
            точки» (M).
          </p>
        </>
      )}
      {ground && (
        <div className="tool-actions">
          <button type="button" onClick={undo} disabled={history.length === 0} title="Ctrl+Z">
            Отменить
          </button>
          <button type="button" onClick={redo} disabled={future.length === 0} title="Ctrl+Y">
            Повторить
          </button>
        </div>
      )}
    </aside>
  )
}
