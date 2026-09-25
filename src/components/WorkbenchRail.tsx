import { useBuildingStore } from '../store/buildingStore'
import { ElectricalWorkbench } from './ElectricalWorkbench'
import { FurnishWorkbench } from './FurnishWorkbench'
import { LandscapeWorkbench } from './LandscapeWorkbench'
import { PlumbingWorkbench } from './PlumbingWorkbench'
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
    case 'plumbing':
      return <PlumbingWorkbench />
    case 'electrical':
      return <ElectricalWorkbench />
    case 'landscape':
      return <LandscapeWorkbench />
    case 'draft':
    default:
      return <Toolbar />
  }
}
