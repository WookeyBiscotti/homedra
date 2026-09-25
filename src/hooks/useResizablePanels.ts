import { useEffect, useState } from 'react'
import type { Workbench } from '../engine/types'

const STORAGE_KEY = 'interior-panel-widths'

const DEFAULT_RAIL: Record<Workbench, number> = {
  draft: 200,
  paint: 280,
  furnish: 220,
  plumbing: 220,
  electrical: 220,
  landscape: 280,
}

const DEFAULT_PROPS = 240
const MIN_RAIL = 160
const MAX_RAIL = 480
const MIN_PROPS = 180
const MAX_PROPS = 480

type Widths = {
  rail: Partial<Record<Workbench, number>>
  props: number
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function loadWidths(): Widths {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { rail: {}, props: DEFAULT_PROPS }
    const parsed = JSON.parse(raw) as Partial<Widths>
    return {
      rail: parsed.rail ?? {},
      props:
        typeof parsed.props === 'number'
          ? clamp(parsed.props, MIN_PROPS, MAX_PROPS)
          : DEFAULT_PROPS,
    }
  } catch {
    return { rail: {}, props: DEFAULT_PROPS }
  }
}

function railFor(workbench: Workbench, stored: Widths['rail']) {
  const v = stored[workbench]
  if (typeof v === 'number') return clamp(v, MIN_RAIL, MAX_RAIL)
  return DEFAULT_RAIL[workbench]
}

/** Persistable left/right panel widths for the workspace grid. */
export function useResizablePanels(workbench: Workbench) {
  const [widths, setWidths] = useState<Widths>(loadWidths)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
  }, [widths])

  const railWidth = railFor(workbench, widths.rail)
  const propsWidth = widths.props

  const resizeRail = (deltaPx: number) => {
    setWidths((prev) => ({
      ...prev,
      rail: {
        ...prev.rail,
        [workbench]: clamp(
          railFor(workbench, prev.rail) + deltaPx,
          MIN_RAIL,
          MAX_RAIL,
        ),
      },
    }))
  }

  const resizeProps = (deltaPx: number) => {
    setWidths((prev) => ({
      ...prev,
      props: clamp(prev.props + deltaPx, MIN_PROPS, MAX_PROPS),
    }))
  }

  return { railWidth, propsWidth, resizeRail, resizeProps }
}
