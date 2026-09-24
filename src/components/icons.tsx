import { CONSTRAINT_ICONS } from '../engine/constraints/solver'
import type { Tool, Workbench } from '../engine/types'
import { publicUrl } from '../publicUrl'

/** Icons for draft / furnish tools (constraint tools reuse jsketcher SVGs). */
export const TOOL_ICONS: Partial<Record<Tool, string>> = {
  select: publicUrl('icons/tools/select.svg'),
  wall: publicUrl('icons/tools/wall.svg'),
  door: publicUrl('icons/tools/door.svg'),
  passage: publicUrl('icons/tools/passage.svg'),
  window: publicUrl('icons/tools/window.svg'),
  stair: publicUrl('icons/tools/stair.svg'),
  floor: publicUrl('icons/tools/floor.svg'),
  placeObject: publicUrl('icons/tools/place-object.svg'),
  lockLength: CONSTRAINT_ICONS.fixedLength,
  lockPoint: CONSTRAINT_ICONS.fixedPosition,
  horizontal: CONSTRAINT_ICONS.horizontal,
  vertical: CONSTRAINT_ICONS.vertical,
  wallDistance: CONSTRAINT_ICONS.wallDistance,
}

export const UI_ICONS = {
  undo: publicUrl('icons/ui/undo.svg'),
  redo: publicUrl('icons/ui/redo.svg'),
  delete: publicUrl('icons/tools/delete.svg'),
  merge: publicUrl('icons/tools/merge.svg'),
  visibility: {
    solid: publicUrl('icons/ui/visibility-solid.svg'),
    ghost: publicUrl('icons/ui/visibility-ghost.svg'),
    hidden: publicUrl('icons/ui/visibility-hidden.svg'),
  },
  workbench: {
    draft: publicUrl('icons/ui/workbench-draft.svg'),
    paint: publicUrl('icons/ui/workbench-paint.svg'),
    furnish: publicUrl('icons/ui/workbench-furnish.svg'),
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
