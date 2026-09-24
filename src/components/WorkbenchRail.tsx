import { useBuildingStore } from '../store/buildingStore'
import { FurnishWorkbench } from './FurnishWorkbench'
import { Toolbar } from './Toolbar'
import { PaintWorkbench } from './View3D/PaintWorkbench'

/** Left rail content for the active FreeCAD-style workbench. */
export function WorkbenchRail() {
  const workbench = useBuildingStore((s) => s.workbench)

  switch (workbench) {
    case 'paint':
      return <PaintWorkbench />
    case 'furnish':
      return <FurnishWorkbench />
    case 'draft':
    default:
      return <Toolbar />
  }
}
