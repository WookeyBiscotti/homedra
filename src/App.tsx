import { useEffect, useRef } from 'react'
import { FloorTabs } from './components/FloorTabs'
import { FloorPlanCanvas } from './components/Plan2D/FloorPlanCanvas'
import { PropertiesPanel } from './components/PropertiesPanel'
import { Toolbar } from './components/Toolbar'
import { BuildingScene } from './components/View3D/BuildingScene'
import type { Tool } from './engine/types'
import { useBuildingStore } from './store/buildingStore'
import './App.css'

const keyToTool: Record<string, Tool> = {
  v: 'select',
  w: 'wall',
  d: 'door',
  o: 'passage',
  n: 'window',
  s: 'stair',
  l: 'lockLength',
  p: 'lockPoint',
  h: 'horizontal',
  i: 'vertical',
}

function TopBar() {
  const viewMode = useBuildingStore((s) => s.viewMode)
  const setViewMode = useBuildingStore((s) => s.setViewMode)
  const saveLocal = useBuildingStore((s) => s.saveLocal)
  const loadLocal = useBuildingStore((s) => s.loadLocal)
  const exportJson = useBuildingStore((s) => s.exportJson)
  const importJson = useBuildingStore((s) => s.importJson)
  const newProject = useBuildingStore((s) => s.newProject)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">Interior</span>
        <span className="brand-sub">CAD Planner</span>
      </div>
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
            const blob = new Blob([exportJson()], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'building.json'
            a.click()
            URL.revokeObjectURL(url)
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
            importJson(text)
            e.target.value = ''
          }}
        />
      </div>
    </header>
  )
}

export default function App() {
  const setTool = useBuildingStore((s) => s.setTool)
  const undo = useBuildingStore((s) => s.undo)
  const redo = useBuildingStore((s) => s.redo)
  const deleteSelection = useBuildingStore((s) => s.deleteSelection)
  const mergeSelectedVertices = useBuildingStore((s) => s.mergeSelectedVertices)
  const cancelWallDraft = useBuildingStore((s) => s.cancelWallDraft)
  const cancelOpeningDraft = useBuildingStore((s) => s.cancelOpeningDraft)
  const cancelSlabOpeningDraft = useBuildingStore((s) => s.cancelSlabOpeningDraft)
  const viewMode = useBuildingStore((s) => s.viewMode)

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
        return
      }
      if (key === 'm' && !mod) {
        e.preventDefault()
        mergeSelectedVertices()
        return
      }
      if (!mod) {
        const tool = keyToTool[key]
        if (tool) setTool(tool)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    setTool,
    undo,
    redo,
    deleteSelection,
    mergeSelectedVertices,
    cancelWallDraft,
    cancelOpeningDraft,
    cancelSlabOpeningDraft,
  ])

  return (
    <div className="app-shell">
      <TopBar />
      <div className="workspace">
        <Toolbar />
        <main className="viewport">
          {viewMode === '2d' ? <FloorPlanCanvas /> : <BuildingScene />}
        </main>
        <PropertiesPanel />
      </div>
    </div>
  )
}
