import { useCallback, useMemo, useRef, useState } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { PdfCanvas } from './PdfCanvas'
import { AnnotationOverlay } from './AnnotationOverlay'
import { DrawingToolbar } from './DrawingToolbar'
import { TaskPinModal } from './TaskPinModal'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 8

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Main drawing workspace: crisp PDF + pan/zoom + rectangle callout overlay.
 */
export function DrawingViewer({
  fileUrl,
  drawing,
  annotations,
  canPin,
  canEditMarks,
  userId,
  onCreatePin,
  onMoveCallout,
  onDeleteMark,
  onPageCount,
}) {
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(drawing?.page_count || 1)
  const [tool, setTool] = useState('pan')
  const [renderZoom, setRenderZoom] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [pendingRect, setPendingRect] = useState(null)
  const [busy, setBusy] = useState(false)
  const [draggingCallout, setDraggingCallout] = useState(false)
  const archived = drawing?.status === 'approved_archived' || !drawing?.file_path

  // ✅ ref tới instance của react-zoom-pan-pinch để có thể "reset" scale CSS
  // sau khi đã nướng (bake) mức zoom đó vào renderZoom (re-render PDF thật).
  const transformRef = useRef(null)

  function canEditAnnotation(ann) {
    if (archived) return false
    if (canEditMarks) return true
    return Boolean(userId && ann?.created_by === userId)
  }

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

  // ✅ Chạy khi thao tác zoom bằng lăn chuột / pinch KẾT THÚC (thư viện tự
  // debounce việc này, không cần setTimeout thủ công).
  // Ý tưởng: CSS transform scale hiện tại (do lăn chuột tạo ra) sẽ được
  // "nướng" thành renderZoom thật → PdfCanvas re-render PDF ở độ phân giải
  // mới (nét), sau đó ta reset scale của TransformWrapper về 1 để không bị
  // áp zoom 2 lần chồng lên nhau (1 lần CSS + 1 lần render thật).
  const handleZoomStop = useCallback((ref) => {
    const { scale, positionX, positionY } = ref.state

    // Bỏ qua thay đổi quá nhỏ (tránh re-render PDF liên tục không cần thiết)
    if (Math.abs(scale - 1) < 0.02) return

    setRenderZoom((prev) => clamp(prev * scale, MIN_ZOOM, MAX_ZOOM))

    // animationTime = 0: snap ngay lập tức, không có hiệu ứng easing,
    // giữ nguyên vị trí đang pan (positionX, positionY)
    transformRef.current?.setTransform(positionX, positionY, 1, 0)
  }, [])

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

  async function handleDelete(ann) {
    if (!canEditAnnotation(ann) || !onDeleteMark) return
    await onDeleteMark(ann)
    if (selectedId === ann.id) setSelectedId(null)
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
              ref={transformRef}
              initialScale={1}
              minScale={0.4}
              maxScale={8}
              wheel={{ step: 0.12 }}
              panning={{ disabled: tool === 'mark' || draggingCallout }}
              doubleClick={{ disabled: true }}
              limitToBounds={false}
              onZoomStop={handleZoomStop}
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
                    canEditAnnotation={canEditAnnotation}
                    onMarkClick={(ann) => setSelectedId(ann.id)}
                    onRectDrawn={(rect) => setPendingRect(rect)}
                    onCalloutMove={onMoveCallout}
                    onDragStateChange={setDraggingCallout}
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
                <li key={ann.id} className="dwg-pin-list-row">
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
                  {canEditAnnotation(ann) && (
                    <button
                      type="button"
                      className="pm-btn tiny ghost dwg-pin-list-delete"
                      title="Delete comment"
                      onClick={() => handleDelete(ann)}
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pageMarks.some((a) => canEditAnnotation(a)) && (
            <p className="muted dwg-pin-list-hint">Drag a comment box on the drawing to reposition it.</p>
          )}
        </aside>
      </div>

      <TaskPinModal
        open={!!pendingRect}
        rect={pendingRect}
        pageNumber={pageNumber}
        drawingTitle={drawing?.title || ''}
        busy={busy}
        onClose={() => setPendingRect(null)}
        onSubmit={handleSubmitMark}
      />
    </div>
  )
}
