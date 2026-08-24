import { useCallback, useMemo, useState } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { PdfCanvas } from './PdfCanvas'
import { AnnotationOverlay } from './AnnotationOverlay'
import { DrawingToolbar } from './DrawingToolbar'
import { TaskPinModal } from './TaskPinModal'

/**
 * Main drawing workspace: crisp PDF + pan/zoom + rectangle callout overlay.
 */
export function DrawingViewer({
  fileUrl,
  drawing,
  annotations,
  canPin,
  sections,
  onCreatePin,
  onPageCount,
}) {
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(drawing?.page_count || 1)
  const [tool, setTool] = useState('pan')
  const [renderZoom, setRenderZoom] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [pendingRect, setPendingRect] = useState(null)
  const [busy, setBusy] = useState(false)
  const archived = drawing?.status === 'approved_archived' || !drawing?.file_path

  const pageMarks = useMemo(
    () =>
      (annotations || []).filter(
        (a) =>
          (a.type === 'rect' || a.type === 'pin') && Number(a.page_number) === Number(pageNumber)
      ),
    [annotations, pageNumber]
  )

  const handleDocumentLoad = useCallback(
    (numPages) => {
      setPageCount(numPages)
      onPageCount?.(numPages)
      setPageNumber((p) => Math.min(p, numPages))
    },
    [onPageCount]
  )

  async function handleSubmitMark(payload) {
    setBusy(true)
    try {
      await onCreatePin(payload)
      setPendingRect(null)
      setTool('pan')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dwg-viewer">
      <DrawingToolbar
        tool={tool}
        onToolChange={setTool}
        pageNumber={pageNumber}
        pageCount={pageCount}
        onPageChange={setPageNumber}
        zoom={renderZoom}
        onZoomChange={setRenderZoom}
        canPin={canPin}
        archived={archived}
      />

      <div className="dwg-viewer-body">
        <div className="dwg-stage">
          {!fileUrl ? (
            <div className="dwg-pdf-status">Drawing file is not available (archived or missing).</div>
          ) : (
            <TransformWrapper
              initialScale={1}
              minScale={0.4}
              maxScale={8}
              wheel={{ step: 0.12 }}
              panning={{ disabled: tool === 'mark' }}
              doubleClick={{ disabled: true }}
              limitToBounds={false}
            >
              <TransformComponent
                wrapperClass="dwg-transform-wrap"
                contentClass="dwg-transform-content"
              >
                <div className="dwg-page-stack">
                  <PdfCanvas
                    url={fileUrl}
                    pageNumber={pageNumber}
                    zoom={renderZoom}
                    onDocumentLoad={handleDocumentLoad}
                  />
                  <AnnotationOverlay
                    annotations={annotations}
                    pageNumber={pageNumber}
                    markMode={tool === 'mark' && canPin && !archived}
                    selectedId={selectedId}
                    onMarkClick={(ann) => setSelectedId(ann.id)}
                    onRectDrawn={(rect) => setPendingRect(rect)}
                  />
                </div>
              </TransformComponent>
            </TransformWrapper>
          )}
        </div>

        <aside className="dwg-pin-list">
          <div className="dwg-pin-list-head">
            <strong>Comments on page</strong>
            <span className="muted">{pageMarks.length}</span>
          </div>
          {pageMarks.length === 0 ? (
            <p className="muted dwg-pin-list-empty">
              {canPin
                ? 'Select Mark, then drag a rectangle on the drawing to add a comment.'
                : 'No comments on this page yet.'}
            </p>
          ) : (
            <ul>
              {pageMarks.map((ann, i) => (
                <li key={ann.id}>
                  <button
                    type="button"
                    className={`dwg-pin-list-item${selectedId === ann.id ? ' selected' : ''}`}
                    onClick={() => setSelectedId(ann.id)}
                  >
                    <span className="dwg-pin-list-idx" style={{ background: ann.color || '#ef4444' }}>
                      {i + 1}
                    </span>
                    <span className="dwg-pin-list-text">
                      <strong>{ann.task?.activity || ann.task?.title || ann.label || 'Issue'}</strong>
                      <small>{ann.task?.status || 'Not Started'}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <TaskPinModal
        open={!!pendingRect}
        rect={pendingRect}
        pageNumber={pageNumber}
        sections={sections}
        drawingTitle={drawing?.title || ''}
        busy={busy}
        onClose={() => setPendingRect(null)}
        onSubmit={handleSubmitMark}
      />
    </div>
  )
}
