import { useRef, useState } from 'react'
import {
  calculateNormalizedCoords,
  clampPercent,
  getAnnotationRect,
  getCalloutLayout,
} from '../../lib/drawingCoords'

const STATUS_COLOR = {
  Completed: '#16a34a',
  'In Progress': '#2563eb',
  'On Hold': '#ca8a04',
  'Not Started': '#ef4444',
}

/**
 * Rectangle highlight + draggable callout comment with leader arrow.
 */
export function RectCalloutMarker({
  annotation,
  index,
  selected,
  canEdit,
  getOverlayEl,
  onClick,
  onCalloutMove,
  onDragStateChange,
}) {
  const status = annotation?.task?.status || 'Not Started'
  const color = annotation.color || STATUS_COLOR[status] || '#ef4444'
  const text =
    annotation.task?.activity || annotation.task?.title || annotation.label || `Issue ${index + 1}`
  const rect = getAnnotationRect(annotation)
  const baseLayout = getCalloutLayout(rect, annotation)

  const [liveCallout, setLiveCallout] = useState(null)
  const dragRef = useRef(null)
  const movedRef = useRef(false)

  const callout = liveCallout || baseLayout.callout
  const layout = liveCallout
    ? getCalloutLayout(rect, {
        ...annotation,
        vector_data: {
          ...(annotation.vector_data || {}),
          callout_x_percent: liveCallout.x,
          callout_y_percent: liveCallout.y,
          callout_w_percent: liveCallout.width,
          callout_h_percent: liveCallout.height,
        },
      })
    : baseLayout
  const { line } = layout

  function onCalloutPointerDown(e) {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    onClick?.(annotation)

    if (!canEdit) return

    const overlay = getOverlayEl?.()
    if (!overlay) return

    const start = calculateNormalizedCoords(e, overlay)
    dragRef.current = {
      pointerId: e.pointerId,
      originX: start.x,
      originY: start.y,
      calloutX: callout.x,
      calloutY: callout.y,
      width: callout.width,
      height: callout.height,
    }
    movedRef.current = false
    onDragStateChange?.(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function onCalloutPointerMove(e) {
    if (!dragRef.current) return
    e.stopPropagation()
    const overlay = getOverlayEl?.()
    if (!overlay) return
    const cur = calculateNormalizedCoords(e, overlay)
    const dx = cur.x - dragRef.current.originX
    const dy = cur.y - dragRef.current.originY
    if (Math.abs(dx) + Math.abs(dy) > 0.3) movedRef.current = true

    const maxX = Math.max(0, 100 - dragRef.current.width)
    const maxY = Math.max(0, 100 - Math.min(dragRef.current.height, 8))
    setLiveCallout({
      x: clampPercent(Math.min(maxX, Math.max(0, dragRef.current.calloutX + dx))),
      y: clampPercent(Math.min(maxY, Math.max(0, dragRef.current.calloutY + dy))),
      width: dragRef.current.width,
      height: dragRef.current.height,
    })
  }

  async function onCalloutPointerUp(e) {
    if (!dragRef.current) return
    e.stopPropagation()
    const draft = dragRef.current
    dragRef.current = null
    onDragStateChange?.(false)
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }

    if (!movedRef.current) {
      setLiveCallout(null)
      return
    }

    const overlay = getOverlayEl?.()
    const cur = overlay ? calculateNormalizedCoords(e, overlay) : null
    const dx = cur ? cur.x - draft.originX : 0
    const dy = cur ? cur.y - draft.originY : 0
    const maxX = Math.max(0, 100 - draft.width)
    const maxY = Math.max(0, 100 - Math.min(draft.height, 8))
    const next = {
      x: clampPercent(Math.min(maxX, Math.max(0, draft.calloutX + dx))),
      y: clampPercent(Math.min(maxY, Math.max(0, draft.calloutY + dy))),
    }
    setLiveCallout({ ...next, width: draft.width, height: draft.height })
    try {
      await onCalloutMove?.(annotation, next)
    } catch {
      setLiveCallout(null)
    }
  }

  function onCalloutPointerCancel(e) {
    dragRef.current = null
    setLiveCallout(null)
    onDragStateChange?.(false)
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`dwg-mark${selected ? ' selected' : ''}`}
      style={{ '--mark-color': color }}
      role="presentation"
    >
      <svg className="dwg-mark-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          <marker
            id={`dwg-arrow-${annotation.id}`}
            markerWidth="5"
            markerHeight="5"
            refX="4"
            refY="2.5"
            orient="auto"
          >
            <path d="M0,0 L5,2.5 L0,5 Z" fill={color} />
          </marker>
        </defs>
        <line
          x1={line.x2}
          y1={line.y2}
          x2={line.x1}
          y2={line.y1}
          stroke={color}
          strokeWidth="0.35"
          vectorEffect="non-scaling-stroke"
          markerEnd={`url(#dwg-arrow-${annotation.id})`}
        />
      </svg>

      <button
        type="button"
        className="dwg-mark-rect"
        style={{
          left: `${rect.x}%`,
          top: `${rect.y}%`,
          width: `${rect.width}%`,
          height: `${rect.height}%`,
        }}
        title={text}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(annotation)
        }}
      />

      <button
        type="button"
        className={`dwg-mark-callout${canEdit ? ' movable' : ''}`}
        style={{
          left: `${callout.x}%`,
          top: `${callout.y}%`,
          width: `${callout.width}%`,
        }}
        title={canEdit ? 'Drag to move comment' : text}
        onPointerDown={onCalloutPointerDown}
        onPointerMove={onCalloutPointerMove}
        onPointerUp={onCalloutPointerUp}
        onPointerCancel={onCalloutPointerCancel}
      >
        <span className="dwg-mark-idx">{index + 1}</span>
        <span className="dwg-mark-text">{text}</span>
      </button>
    </div>
  )
}
