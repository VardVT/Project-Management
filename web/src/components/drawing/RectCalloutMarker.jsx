import { getAnnotationRect, getCalloutLayout } from '../../lib/drawingCoords'

const STATUS_COLOR = {
  Completed: '#16a34a',
  'In Progress': '#2563eb',
  'On Hold': '#ca8a04',
  'Not Started': '#ef4444',
}

/**
 * Rectangle highlight + callout comment with leader arrow (PDF-style markup).
 */
export function RectCalloutMarker({ annotation, index, selected, onClick }) {
  const status = annotation?.task?.status || 'Not Started'
  const color = annotation.color || STATUS_COLOR[status] || '#ef4444'
  const text =
    annotation.task?.activity || annotation.task?.title || annotation.label || `Issue ${index + 1}`
  const rect = getAnnotationRect(annotation)
  const layout = getCalloutLayout(rect)
  const { callout, line } = layout

  return (
    <div
      className={`dwg-mark${selected ? ' selected' : ''}`}
      style={{ '--mark-color': color }}
      role="presentation"
    >
      {/* Leader line + arrowhead (SVG overlay, percent coords via viewBox 0–100) */}
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

      {/* Highlight region */}
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

      {/* On-drawing comment callout */}
      <button
        type="button"
        className="dwg-mark-callout"
        style={{
          left: `${callout.x}%`,
          top: `${callout.y}%`,
          width: `${callout.width}%`,
        }}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(annotation)
        }}
      >
        <span className="dwg-mark-idx">{index + 1}</span>
        <span className="dwg-mark-text">{text}</span>
      </button>
    </div>
  )
}
