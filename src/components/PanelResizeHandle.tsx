import { useRef, useState } from 'react'

type Side = 'left' | 'right'

type Props = {
  side: Side
  onResize: (deltaPx: number) => void
}

/** Drag handle between a side panel and the viewport. */
export function PanelResizeHandle({ side, onResize }: Props) {
  const onResizeRef = useRef(onResize)
  onResizeRef.current = onResize
  const startX = useRef(0)
  const [dragging, setDragging] = useState(false)

  const endDrag = (el: HTMLElement, pointerId: number) => {
    if (el.hasPointerCapture(pointerId)) {
      el.releasePointerCapture(pointerId)
    }
    document.body.classList.remove('panel-resizing')
    setDragging(false)
  }

  return (
    <div
      className={`panel-resize-handle panel-resize-${side}${dragging ? ' active' : ''}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={
        side === 'left'
          ? 'Изменить ширину левой панели'
          : 'Изменить ширину правой панели'
      }
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        startX.current = e.clientX
        document.body.classList.add('panel-resizing')
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        const dx = e.clientX - startX.current
        startX.current = e.clientX
        onResizeRef.current(side === 'left' ? dx : -dx)
      }}
      onPointerUp={(e) => endDrag(e.currentTarget, e.pointerId)}
      onPointerCancel={(e) => endDrag(e.currentTarget, e.pointerId)}
    />
  )
}
