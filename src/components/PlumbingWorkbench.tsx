import type { CSSProperties } from 'react'
import {
  PIPE_MEDIUM_META,
  ensurePipeNetwork,
  isGroundFloor,
  type PipeMedium,
  type Tool,
} from '../engine/types'
import { useBuildingStore } from '../store/buildingStore'
import { IconImg, TOOL_ICONS, UI_ICONS } from './icons'

const drawTools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', hint: 'V' },
  { id: 'pipe', label: 'Труба', hint: 'T' },
  { id: 'pipeValve', label: 'Перекрытие', hint: 'K' },
  { id: 'pipeHeater', label: 'Нагреватель', hint: 'G' },
]

const MEDIA = (Object.keys(PIPE_MEDIUM_META) as PipeMedium[]).map((id) => ({
  id,
  ...PIPE_MEDIUM_META[id],
}))

export function PlumbingWorkbench() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const floor = useBuildingStore((s) => s.activeFloor())
  const ground = isGroundFloor(floor)
  const medium = useBuildingStore((s) => s.pipeMedium)
  const setPipeMedium = useBuildingStore((s) => s.setPipeMedium)
  const diameterMm = useBuildingStore((s) => s.pipeDiameterMm)
  const setPipeDiameterMm = useBuildingStore((s) => s.setPipeDiameterMm)
  const selection = useBuildingStore((s) => s.selection)
  const elevation = useBuildingStore((s) => s.pipeElevation)
  const setPipeElevation = useBuildingStore((s) => s.setPipeElevation)
  const pipes = ensurePipeNetwork(floor.pipes)
  const selectedSeg =
    selection?.kind === 'pipeSegment'
      ? (pipes.segments.find((s) => s.id === selection.id) ?? null)
      : null
  const nodeSegs =
    selection?.kind === 'pipeNode'
      ? pipes.segments.filter((s) => s.a === selection.id || s.b === selection.id)
      : []
  const fieldDiameter =
    selectedSeg?.diameterMm ??
    (nodeSegs.length > 0 &&
    nodeSegs.every((s) => s.diameterMm === nodeSegs[0].diameterMm)
      ? nodeSegs[0].diameterMm
      : diameterMm)

  return (
    <aside className="toolbar workbench-rail plumbing-rail" aria-label="Трубы">
      <h2 className="panel-title">Трубы</h2>
      {ground ? (
        <p className="hint">
          Земля — только уровень грунта. Переключитесь на этаж, чтобы вести
          трубы.
        </p>
      ) : (
        <>
          <h3 className="tool-group-title">Среда</h3>
          <div className="mep-medium-list">
            {MEDIA.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`mep-medium-btn ${medium === m.id ? 'active' : ''}`}
                style={{ '--mep-color': m.color } as CSSProperties}
                onClick={() => setPipeMedium(m.id)}
              >
                <span className="mep-swatch" />
                {m.label}
              </button>
            ))}
          </div>
          <label className="mep-field">
            Диаметр, мм
            <input
              type="number"
              min={6}
              max={200}
              step={1}
              value={fieldDiameter}
              onChange={(e) => setPipeDiameterMm(Number(e.target.value))}
            />
          </label>
          <label className="mep-field">
            Высота в стене, м
            <input
              type="number"
              min={0}
              max={5}
              step={0.05}
              value={elevation}
              onChange={(e) => setPipeElevation(Number(e.target.value))}
            />
          </label>
          <div className="tool-list">
            {drawTools.map((t) => {
              const icon = TOOL_ICONS[t.id]
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`tool-btn ${tool === t.id ? 'active' : ''}`}
                  title={`${t.label} (${t.hint})`}
                  onClick={() => setTool(t.id)}
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
          <div className="tool-actions">
            <button type="button" onClick={deleteSelection}>
              <IconImg src={UI_ICONS.delete} className="ui-icon" />
              Удалить
            </button>
          </div>
          <p className="hint">
            Клик по стене — трасса в стене, клик по полу — в плите. Цепочка
            кликов, угол стены сам. Escape — сброс.
          </p>
        </>
      )}
    </aside>
  )
}
