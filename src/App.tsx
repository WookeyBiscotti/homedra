import { useEffect, useRef, type CSSProperties } from 'react'
import { FloorTabs } from './components/FloorTabs'
import { FloorPlanCanvas } from './components/Plan2D/FloorPlanCanvas'
import { LibraryTokensSettings } from './components/LibraryTokensSettings'
import { ModelBrowser } from './components/ModelBrowser'
import { CollectionBrowser } from './components/CollectionBrowser'
import { PanelResizeHandle } from './components/PanelResizeHandle'
import { PropertiesPanel } from './components/PropertiesPanel'
import { WorkbenchRail } from './components/WorkbenchRail'
import { WorkbenchSwitcher } from './components/WorkbenchSwitcher'
import { BuildingScene } from './components/View3D/BuildingScene'
import type { Tool } from './engine/types'
import { toolsForWorkbench } from './engine/types'
import { UI_ICONS } from './components/icons'
import { useResizablePanels } from './hooks/useResizablePanels'
import { useBuildingStore } from './store/buildingStore'
import './App.css'

const keyToTool: Record<string, Tool> = {
  v: 'select',
  w: 'wall',
  d: 'door',
  o: 'passage',
  n: 'window',
  s: 'stair',
  b: 'floor',
  f: 'placeObject',
  l: 'lockLength',
  p: 'lockPoint',
  h: 'horizontal',
  i: 'vertical',
}

function TopBar() {
  const viewMode = useBuildingStore((s) => s.viewMode)
  const setViewMode = useBuildingStore((s) => s.setViewMode)
  const undo = useBuildingStore((s) => s.undo)
  const redo = useBuildingStore((s) => s.redo)
  const history = useBuildingStore((s) => s.history)
  const future = useBuildingStore((s) => s.future)
  const saveLocal = useBuildingStore((s) => s.saveLocal)
  const loadLocal = useBuildingStore((s) => s.loadLocal)
  const exportProjectPackage = useBuildingStore((s) => s.exportProjectPackage)
  const importJson = useBuildingStore((s) => s.importJson)
  const newProject = useBuildingStore((s) => s.newProject)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">Interior</span>
        <span className="brand-sub">CAD Planner</span>
      </div>
      <div className="history-actions" role="group" aria-label="История">
        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0}
          title="Отменить (Ctrl+Z)"
        >
          <img
            src={UI_ICONS.undo}
            alt=""
            className="ui-icon"
            width={16}
            height={16}
            draggable={false}
          />
          <span className="history-label">Отменить</span>
          <kbd>Ctrl+Z</kbd>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={future.length === 0}
          title="Повторить (Ctrl+Y)"
        >
          <img
            src={UI_ICONS.redo}
            alt=""
            className="ui-icon"
            width={16}
            height={16}
            draggable={false}
          />
          <span className="history-label">Повторить</span>
          <kbd>Ctrl+Y</kbd>
        </button>
      </div>
      <WorkbenchSwitcher />
      <FloorTabs />
      <div className="view-toggle">
        <button
          type="button"
          className={viewMode === '2d' ? 'active' : ''}
          onClick={() => setViewMode('2d')}
        >
          2D план
        </button>
        <button
          type="button"
          className={viewMode === '3d' ? 'active' : ''}
          onClick={() => setViewMode('3d')}
        >
          3D вид
        </button>
      </div>
      <div className="file-actions">
        <button type="button" onClick={newProject}>
          Новый
        </button>
        <button type="button" onClick={saveLocal}>
          Сохранить
        </button>
        <button type="button" onClick={() => loadLocal()}>
          Загрузить
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              const text = await exportProjectPackage()
              const blob = new Blob([text], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'interior-project.json'
              a.click()
              URL.revokeObjectURL(url)
            })()
          }}
        >
          Экспорт
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Импорт
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const text = await file.text()
            await importJson(text)
            e.target.value = ''
          }}
        />
      </div>
    </header>
  )
}

export default function App() {
  const setTool = useBuildingStore((s) => s.setTool)
  const workbench = useBuildingStore((s) => s.workbench)
  const undo = useBuildingStore((s) => s.undo)
  const redo = useBuildingStore((s) => s.redo)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const mergeSelectedVertices = useBuildingStore((s) => s.mergeSelectedVertices)
  const cancelWallDraft = useBuildingStore((s) => s.cancelWallDraft)
  const cancelOpeningDraft = useBuildingStore((s) => s.cancelOpeningDraft)
  const cancelSlabOpeningDraft = useBuildingStore((s) => s.cancelSlabOpeningDraft)
  const cancelFloorPlateDraft = useBuildingStore((s) => s.cancelFloorPlateDraft)
  const viewMode = useBuildingStore((s) => s.viewMode)
  const setTransformGizmoMode = useBuildingStore((s) => s.setTransformGizmoMode)
  const selection = useBuildingStore((s) => s.selection)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const key = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey

      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelection()
        return
      }
      if (e.key === 'Escape') {
        cancelWallDraft()
        cancelOpeningDraft()
        cancelSlabOpeningDraft()
        cancelFloorPlateDraft()
        useBuildingStore.getState().setPendingModel(null)
        setTool('select')
        return
      }
      if (key === 'm' && !mod && workbench === 'draft') {
        e.preventDefault()
        mergeSelectedVertices()
        return
      }
      if (
        !mod &&
        workbench === 'furnish' &&
        selection?.kind === 'object' &&
        (key === 'g' || key === 'r' || key === 't')
      ) {
        e.preventDefault()
        setTool('select')
        setTransformGizmoMode(
          key === 'g' ? 'translate' : key === 'r' ? 'rotate' : 'scale',
        )
        return
      }
      if (!mod) {
        const tool = keyToTool[key]
        if (!tool) return
        // placeObject always routes to furnish workbench via setTool
        if (tool === 'placeObject') {
          setTool(tool)
          return
        }
        const allowed = toolsForWorkbench(workbench)
        if (allowed.includes(tool) || toolsForWorkbench('draft').includes(tool)) {
          setTool(tool)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    setTool,
    workbench,
    undo,
    redo,
    deleteSelection,
    mergeSelectedVertices,
    cancelWallDraft,
    cancelOpeningDraft,
    cancelSlabOpeningDraft,
    cancelFloorPlateDraft,
    setTransformGizmoMode,
    selection,
  ])

  const { railWidth, propsWidth, resizeRail, resizeProps } =
    useResizablePanels(workbench)

  return (
    <div className={`app-shell workbench-${workbench}`}>
      <TopBar />
      <div
        className={`workspace workspace-${workbench}`}
        style={
          {
            '--rail-width': `${railWidth}px`,
            '--props-width': `${propsWidth}px`,
          } as CSSProperties
        }
      >
        <WorkbenchRail />
        <PanelResizeHandle side="left" onResize={resizeRail} />
        <main className="viewport">
          {viewMode === '2d' ? <FloorPlanCanvas /> : <BuildingScene />}
        </main>
        <PanelResizeHandle side="right" onResize={resizeProps} />
        <PropertiesPanel />
      </div>
      <ModelBrowser />
      <CollectionBrowser />
      <LibraryTokensSettings />
    </div>
  )
}
