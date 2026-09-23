import type { Constraint, Floor, Id } from '../engine/types'
import { CONSTRAINT_ICONS } from '../engine/constraints/solver'
import { vertexWallDegree } from '../engine/geometry/walls'
import { useBuildingStore } from '../store/buildingStore'

function describeConstraint(floor: Floor, c: Constraint): string {
  switch (c.type) {
    case 'fixedLength':
      return `Длина стены ${c.length.toFixed(2)} м`
    case 'fixedPosition': {
      const v = floor.vertices.find((x) => x.id === c.vertexId)
      if (!v) return 'Фиксация точки'
      return `Фиксация точки (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`
    }
    case 'horizontal':
      return 'Стена горизонтальна'
    case 'vertical':
      return 'Стена вертикальна'
    case 'wallDistance': {
      const face =
        c.face === 'inner'
          ? 'внутр.'
          : c.face === 'outer'
            ? 'внеш.'
            : 'оси'
      return `Расстояние стен ${c.distance.toFixed(2)} м (${face})`
    }
    case 'vertexDistance': {
      const face =
        c.face === 'inner'
          ? 'внутр.'
          : c.face === 'outer'
            ? 'внеш.'
            : 'оси'
      return `Расстояние точек ${c.distance.toFixed(2)} м (${face})`
    }
    case 'pointsHorizontal':
      return `Точки на горизонтали (${c.vertexIds.length})`
    case 'pointsVertical':
      return `Точки на вертикали (${c.vertexIds.length})`
    case 'coincident':
      return 'Совпадение вершин'
    case 'pointOnWall':
      return 'Точка на стене'
    default:
      return 'Ограничение'
  }
}

function constraintIcon(c: Constraint): string {
  if (c.type === 'fixedLength') return CONSTRAINT_ICONS.fixedLength
  if (c.type === 'fixedPosition') return CONSTRAINT_ICONS.fixedPosition
  if (c.type === 'horizontal') return CONSTRAINT_ICONS.horizontal
  if (c.type === 'vertical') return CONSTRAINT_ICONS.vertical
  if (c.type === 'wallDistance') return CONSTRAINT_ICONS.wallDistance
  if (c.type === 'vertexDistance') return CONSTRAINT_ICONS.vertexDistance
  if (c.type === 'pointsHorizontal') return CONSTRAINT_ICONS.pointsHorizontal
  if (c.type === 'pointsVertical') return CONSTRAINT_ICONS.pointsVertical
  if (c.type === 'coincident') return CONSTRAINT_ICONS.coincident
  if (c.type === 'pointOnWall') return CONSTRAINT_ICONS.pointOnWall
  return CONSTRAINT_ICONS.fixedLength
}

export function ConstraintsList() {
  const floor = useBuildingStore((s) => s.activeFloor())
  const removeConstraint = useBuildingStore((s) => s.removeConstraint)
  const setSelection = useBuildingStore((s) => s.setSelection)

  const joints = floor.vertices
    .map((v) => ({
      id: v.id,
      degree: vertexWallDegree(floor, v.id),
    }))
    .filter((j) => j.degree >= 2)

  const selectConstraint = (c: Constraint) => {
    if (c.type === 'fixedLength' || c.type === 'horizontal' || c.type === 'vertical') {
      setSelection({ kind: 'wall', id: c.wallId })
    } else if (c.type === 'fixedPosition') {
      setSelection({ kind: 'vertex', id: c.vertexId })
    } else if (c.type === 'wallDistance') {
      setSelection({
        kind: 'multi',
        vertexIds: [],
        wallIds: [c.wallA, c.wallB],
      })
    } else if (c.type === 'vertexDistance' || c.type === 'coincident') {
      setSelection({
        kind: 'multi',
        vertexIds: [c.vertexA, c.vertexB],
        wallIds: [],
      })
    } else if (c.type === 'pointOnWall') {
      setSelection({
        kind: 'multi',
        vertexIds: [c.vertexId],
        wallIds: [c.wallId],
      })
    } else if (c.type === 'pointsHorizontal' || c.type === 'pointsVertical') {
      setSelection({
        kind: 'multi',
        vertexIds: [...c.vertexIds],
        wallIds: [],
      })
    }
  }

  const selectJoint = (vertexId: Id) => {
    const wallIds = floor.walls
      .filter((w) => w.a === vertexId || w.b === vertexId)
      .map((w) => w.id)
    setSelection({
      kind: 'multi',
      vertexIds: [vertexId],
      wallIds,
    })
  }

  const empty = floor.constraints.length === 0 && joints.length === 0

  return (
    <section className="prop-section constraints-list">
      <h3>Все ограничения</h3>
      {empty ? (
        <p className="muted">Пока нет ограничений на этом этаже.</p>
      ) : (
        <ul className="constraint-rows">
          {joints.map((j) => (
            <li key={`joint-${j.id}`} className="constraint-row">
              <button
                type="button"
                className="constraint-row-main"
                onClick={() => selectJoint(j.id)}
                title="Стык стен — общая вершина (совпадение)"
              >
                <img
                  src={CONSTRAINT_ICONS.coincident}
                  alt=""
                  width={14}
                  height={14}
                />
                <span>
                  Стык стен ({j.degree}) — вершины в одной точке
                </span>
              </button>
            </li>
          ))}
          {floor.constraints.map((c) => (
            <li key={c.id} className="constraint-row">
              <button
                type="button"
                className="constraint-row-main"
                onClick={() => selectConstraint(c)}
                title="Выбрать объекты"
              >
                <img src={constraintIcon(c)} alt="" width={14} height={14} />
                <span>{describeConstraint(floor, c)}</span>
              </button>
              <button
                type="button"
                className="constraint-row-remove"
                onClick={() => removeConstraint(c.id)}
                title="Удалить"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
