import { CONSTRAINT_ICONS } from '../engine/constraints/solver'
import type { Tool, Workbench } from '../engine/types'

/** Icons for draft / furnish tools (constraint tools reuse jsketcher SVGs). */
export const TOOL_ICONS: Partial<Record<Tool, string>> = {
  select: '/icons/tools/select.svg',
  wall: '/icons/tools/wall.svg',
  door: '/icons/tools/door.svg',
  passage: '/icons/tools/passage.svg',
  window: '/icons/tools/window.svg',
  stair: '/icons/tools/stair.svg',
  placeObject: '/icons/tools/place-object.svg',
  lockLength: CONSTRAINT_ICONS.fixedLength,
  lockPoint: CONSTRAINT_ICONS.fixedPosition,
  horizontal: CONSTRAINT_ICONS.horizontal,
  vertical: CONSTRAINT_ICONS.vertical,
  wallDistance: CONSTRAINT_ICONS.wallDistance,
}

export const UI_ICONS = {
  undo: '/icons/ui/undo.svg',
  redo: '/icons/ui/redo.svg',
  delete: '/icons/tools/delete.svg',
  merge: '/icons/tools/merge.svg',
  workbench: {
    draft: '/icons/ui/workbench-draft.svg',
    paint: '/icons/ui/workbench-paint.svg',
    furnish: '/icons/ui/workbench-furnish.svg',
  } satisfies Record<Workbench, string>,
} as const

export function IconImg({
  src,
  className = 'ui-icon',
  alt = '',
}: {
  src: string
  className?: string
  alt?: string
}) {
  return <img src={src} alt={alt} className={className} width={18} height={18} draggable={false} />
}
