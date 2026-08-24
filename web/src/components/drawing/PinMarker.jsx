const STATUS_COLOR = {
  Completed: '#16a34a',
  'In Progress': '#2563eb',
  'On Hold': '#ca8a04',
  'Not Started': '#ef4444',
}

export function PinMarker({ annotation, index, selected, onClick }) {
  const status = annotation?.task?.status || 'Not Started'
  const color = annotation.color || STATUS_COLOR[status] || '#ef4444'
  const label = annotation.label || `#${index + 1}`

  return (
    <button
      type="button"
      className={`dwg-pin${selected ? ' selected' : ''}`}
      style={{
        left: `${Number(annotation.x_percent)}%`,
        top: `${Number(annotation.y_percent)}%`,
        '--pin-color': color,
      }}
      title={annotation.task?.activity || annotation.task?.title || label}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(annotation)
      }}
    >
      <span className="dwg-pin-dot" />
      <span className="dwg-pin-label">{index + 1}</span>
    </button>
  )
}
