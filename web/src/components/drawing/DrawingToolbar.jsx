export function DrawingToolbar({
  tool,
  onToolChange,
  pageNumber,
  pageCount,
  onPageChange,
  zoom,
  onZoomChange,
  canPin,
  archived,
}) {
  const zoomPct = Math.round((Number(zoom) || 1) * 100)

  return (
    <div className="dwg-toolbar">
      <div className="dwg-toolbar-group">
        <button
          type="button"
          className={`pm-btn tiny${tool === 'pan' ? ' primary' : ' ghost'}`}
          onClick={() => onToolChange('pan')}
          title="Pan / zoom"
        >
          Pan
        </button>
        <button
          type="button"
          className={`pm-btn tiny${tool === 'pin' ? ' primary' : ' ghost'}`}
          onClick={() => onToolChange('pin')}
          disabled={!canPin || archived}
          title={canPin ? 'Place pin & create task' : 'Only Senior/Manager can create pins'}
        >
          Pin
        </button>
      </div>

      <div className="dwg-toolbar-group">
        <button
          type="button"
          className="pm-btn tiny ghost"
          disabled={pageNumber <= 1}
          onClick={() => onPageChange(pageNumber - 1)}
        >
          Prev
        </button>
        <span className="dwg-toolbar-meta">
          Page {pageNumber} / {pageCount || 1}
        </span>
        <button
          type="button"
          className="pm-btn tiny ghost"
          disabled={pageNumber >= (pageCount || 1)}
          onClick={() => onPageChange(pageNumber + 1)}
        >
          Next
        </button>
      </div>

      <div className="dwg-toolbar-group">
        <button
          type="button"
          className="pm-btn tiny ghost"
          onClick={() => onZoomChange(Math.max(0.5, zoom - 0.25))}
        >
          -
        </button>
        <span className="dwg-toolbar-meta">{zoomPct}%</span>
        <button
          type="button"
          className="pm-btn tiny ghost"
          onClick={() => onZoomChange(Math.min(4, zoom + 0.25))}
        >
          +
        </button>
        <button type="button" className="pm-btn tiny ghost" onClick={() => onZoomChange(1)}>
          Reset
        </button>
      </div>
    </div>
  )
}
