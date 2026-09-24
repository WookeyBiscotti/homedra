import {
  electricalDeviceSize,
  ensureCableNetwork,
  isGroundFloor,
  type Tool,
  type WallSide,
} from '../engine/types'
import { roomsForWallSides } from '../engine/geometry/wallSolid'
import { useBuildingStore } from '../store/buildingStore'
import { IconImg, TOOL_ICONS, UI_ICONS } from './icons'

const drawTools: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Выбор', hint: 'V' },
  { id: 'cable', label: 'Кабель', hint: 'C' },
  { id: 'outlet', label: 'Розетка', hint: 'R' },
  { id: 'switch', label: 'Выключатель', hint: 'P' },
  { id: 'panel', label: 'Щиток', hint: 'S' },
]

export function ElectricalWorkbench() {
  const tool = useBuildingStore((s) => s.tool)
  const setTool = useBuildingStore((s) => s.setTool)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const floor = useBuildingStore((s) => s.activeFloor())
  const ground = isGroundFloor(floor)
  const sectionMm2 = useBuildingStore((s) => s.cableSectionMm2)
  const setCableSectionMm2 = useBuildingStore((s) => s.setCableSectionMm2)
  const elevation = useBuildingStore((s) => s.cableElevation)
  const setCableElevation = useBuildingStore((s) => s.setCableElevation)
  const selection = useBuildingStore((s) => s.selection)
  const updateElectricalNode = useBuildingStore((s) => s.updateElectricalNode)
  const cables = ensureCableNetwork(floor.cables)
  const selectedDevice =
    selection?.kind === 'electricalNode'
      ? (cables.nodes.find((n) => n.id === selection.id && n.device) ?? null)
      : null
  const selectedSize = selectedDevice ? electricalDeviceSize(selectedDevice) : null
  const deviceRooms =
    selectedDevice?.anchor.type === 'wall'
      ? roomsForWallSides(floor, selectedDevice.anchor.wallId)
      : null

  return (
    <aside className="toolbar workbench-rail electrical-rail" aria-label="Электрика">
      <h2 className="panel-title">Электрика</h2>
      {ground ? (
        <p className="hint">
          Земля — только уровень грунта. Переключитесь на этаж, чтобы вести
          кабель.
        </p>
      ) : (
        <>
          <label className="mep-field">
            Сечение, мм²
            <input
              type="number"
              min={0.75}
              max={50}
              step={0.25}
              value={sectionMm2}
              onChange={(e) => setCableSectionMm2(Number(e.target.value))}
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
              onChange={(e) => setCableElevation(Number(e.target.value))}
            />
          </label>
          {selectedDevice && selectedSize && (
            <>
              {selectedDevice.anchor.type === 'wall' && deviceRooms && (
                <label className="mep-field">
                  Сторона стены
                  <select
                    value={selectedDevice.side ?? 'pos'}
                    onChange={(e) =>
                      updateElectricalNode(selectedDevice.id, {
                        side: e.target.value as WallSide,
                      })
                    }
                  >
                    <option value="pos">
                      Сторона +{deviceRooms.pos ? ' (комната)' : ' (снаружи)'}
                    </option>
                    <option value="neg">
                      Сторона −{deviceRooms.neg ? ' (комната)' : ' (снаружи)'}
                    </option>
                  </select>
                </label>
              )}
              <label className="mep-field">
                Ширина, мм
                <input
                  type="number"
                  min={20}
                  max={1500}
                  step={1}
                  value={Math.round(selectedSize.width * 1000)}
                  onChange={(e) =>
                    updateElectricalNode(selectedDevice.id, {
                      width: Number(e.target.value) / 1000,
                    })
                  }
                />
              </label>
              <label className="mep-field">
                Высота, мм
                <input
                  type="number"
                  min={20}
                  max={2000}
                  step={1}
                  value={Math.round(selectedSize.height * 1000)}
                  onChange={(e) =>
                    updateElectricalNode(selectedDevice.id, {
                      height: Number(e.target.value) / 1000,
                    })
                  }
                />
              </label>
            </>
          )}
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
            Клик по стене — кабель в стене, клик по полу — в плите. Розетка и
            выключатель встают на ту сторону стены, куда кликнули. Escape —
            сброс.
          </p>
        </>
      )}
    </aside>
  )
}
