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
  box: publicUrl('icons/tools/box.svg'),
  cutout: publicUrl('icons/tools/cutout.svg'),
  placeObject: publicUrl('icons/tools/place-object.svg'),
  placeTile: publicUrl('icons/tools/place-tile.svg'),
  fillTile: publicUrl('icons/tools/fill-tile.svg'),
  cutTile: publicUrl('icons/tools/cut-tile.svg'),
  placeMolding: publicUrl('icons/tools/place-molding.svg'),
  fillMolding: publicUrl('icons/tools/fill-molding.svg'),
  pipe: publicUrl('icons/tools/pipe.svg'),
  pipeValve: publicUrl('icons/tools/pipe-valve.svg'),
  pipeHeater: publicUrl('icons/tools/pipe-heater.svg'),
  cable: publicUrl('icons/tools/cable.svg'),
  outlet: publicUrl('icons/tools/outlet.svg'),
  switch: publicUrl('icons/tools/switch.svg'),
  panel: publicUrl('icons/tools/panel.svg'),
  sculptGround: publicUrl('icons/tools/sculpt.svg'),
  paintGround: publicUrl('icons/tools/paint-ground.svg'),
  plant: publicUrl('icons/tools/plant.svg'),
  paintGrass: publicUrl('icons/tools/grass.svg'),
  lockLength: CONSTRAINT_ICONS.fixedLength,
  lockPoint: CONSTRAINT_ICONS.fixedPosition,
  horizontal: CONSTRAINT_ICONS.horizontal,
  vertical: CONSTRAINT_ICONS.vertical,
  wallDistance: CONSTRAINT_ICONS.wallDistance,
}

export const UI_ICONS = {
  undo: publicUrl('icons/ui/undo.svg'),
  redo: publicUrl('icons/ui/redo.svg'),
  copy: publicUrl('icons/ui/copy.svg'),
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
    plumbing: publicUrl('icons/ui/workbench-plumbing.svg'),
    electrical: publicUrl('icons/ui/workbench-electrical.svg'),
    landscape: publicUrl('icons/ui/workbench-landscape.svg'),
    tiling: publicUrl('icons/ui/workbench-tiling.svg'),
    decor: publicUrl('icons/ui/workbench-decor.svg'),
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
