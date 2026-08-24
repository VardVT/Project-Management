import { useRef, useState } from 'react'
import { RectCalloutMarker } from './RectCalloutMarker'
import { calculateNormalizedCoords, normalizeRect } from '../../lib/drawingCoords'

const MIN_SIZE = 1.2 // % — ignore tiny accidental drags

export function AnnotationOverlay({
  annotations = [],
  pageNumber,
  markMode,
  selectedId,
  canEditAnnotation,
  onMarkClick,
  onRectDrawn,
  onCalloutMove,
  onDragStateChange,
}) {
  const layerRef = useRef(null)
  const dragRef = useRef(null)
  const [draft, setDraft] = useState(null)

  const pageMarks = annotations.filter(
    (a) =>
      (a.type === 'rect' || a.type === 'pin') && Number(a.page_number) === Number(pageNumber)
  )

  function onPointerDown(e) {
    if (!markMode || e.button !== 0) return
    // Ignore starts on existing callout/rect buttons
    if (e.target?.closest?.('.dwg-mark-callout, .dwg-mark-rect')) return
    e.preventDefault()
    e.stopPropagation()
    const layer = layerRef.current
    if (!layer) return
    const start = calculateNormalizedCoords(e, layer)
    dragRef.current = { start, pointerId: e.pointerId }
    setDraft({ x: start.x, y: start.y, width: 0, height: 0 })
    layer.setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e) {
    if (!dragRef.current) return
    const layer = layerRef.current
    if (!layer) return
    const cur = calculateNormalizedCoords(e, layer)
    const rect = normalizeRect(dragRef.current.start.x, dragRef.current.start.y, cur.x, cur.y)
    setDraft(rect)
  }

  function finishDrag(e) {
    if (!dragRef.current) return
    const layer = layerRef.current
    const start = dragRef.current.start
    dragRef.current = null
    if (layer && e?.pointerId != null) {
      try {
        layer.releasePointerCapture?.(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    if (!layer) {
      setDraft(null)
      return
    }
    const cur = calculateNormalizedCoords(e, layer)
    const rect = normalizeRect(start.x, start.y, cur.x, cur.y)
    setDraft(null)
    if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return
    onRectDrawn?.(rect)
  }

  function onPointerUp(e) {
    finishDrag(e)
  }

  function onPointerCancel(e) {
    dragRef.current = null
    setDraft(null)
    try {
      layerRef.current?.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      ref={layerRef}
      className={`dwg-overlay${markMode ? ' mark-mode' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      role="presentation"
    >
      {pageMarks.map((ann, i) => (
        <RectCalloutMarker
          key={ann.id}
          annotation={ann}
          index={i}
          selected={selectedId === ann.id}
          canEdit={typeof canEditAnnotation === 'function' ? canEditAnnotation(ann) : Boolean(canEditAnnotation)}
          getOverlayEl={() => layerRef.current}
          onClick={onMarkClick}
          onCalloutMove={onCalloutMove}
          onDragStateChange={onDragStateChange}
        />
      ))}

      {draft && draft.width > 0 && draft.height > 0 && (
        <div
          className="dwg-mark-draft"
          style={{
            left: `${draft.x}%`,
            top: `${draft.y}%`,
            width: `${draft.width}%`,
            height: `${draft.height}%`,
          }}
        />
      )}
    </div>
  )
}
