import { useEffect, useState } from 'react'
// ✅ SỬA LẠI: Import đúng từ 'react-router-dom'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { useNotification } from '../components/NotificationContext'
import { DrawingViewer } from '../components/drawing/DrawingViewer'
import {
  createPinWithTask,
  deleteAnnotationMark,
  drawingPublicUrl,
  getDrawing,
  listAnnotations,
  updateAnnotationCalloutPosition,
  updateDrawingPageCount,
} from '../lib/drawingsApi'

export function DrawingDetailPage() {
  const { drawingId } = useParams()
  const { user, caps } = useAuth()
  const { currentProject, projects, selectProject, reloadSections } = useProject()
  const { toast, confirm } = useNotification()

  const [drawing, setDrawing] = useState(null)
  const [annotations, setAnnotations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fileUrl = drawingPublicUrl(drawing?.file_path)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!drawingId) return
      setLoading(true)
      setError('')
      try {
        const row = await getDrawing(drawingId)
        if (cancelled) return
        if (!row) {
          setDrawing(null)
          setError('Bản vẽ không tồn tại hoặc đã bị xóa.')
          return
        }
        setDrawing(row)
        const pins = await listAnnotations(drawingId)
        if (!cancelled) setAnnotations(pins)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Không thể tải bản vẽ')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [drawingId])

  useEffect(() => {
    if (!drawing?.project_id || !projects?.length) return
    if (currentProject?.id === drawing.project_id) return
    const project = projects.find((p) => p.id === drawing.project_id)
    if (project) selectProject(project)
  }, [drawing?.project_id, projects, currentProject?.id, selectProject])

  async function handleCreatePin(payload) {
    try {
      const { annotation } = await createPinWithTask({
        drawing,
        pageNumber: payload.pageNumber,
        xPercent: payload.xPercent,
        yPercent: payload.yPercent,
        widthPercent: payload.widthPercent,
        heightPercent: payload.heightPercent,
        activity: payload.activity,
        assigneeId: payload.assigneeId,
        zone: payload.zone,
        userId: user?.id,
      })
      setAnnotations((prev) => [...prev, annotation])
      if (typeof reloadSections === 'function') {
        await reloadSections()
      }
      toast.success('Đã tạo ghi chú', `${payload.activity} → Live Comment`)
    } catch (err) {
      toast.error('Lỗi tạo ghi chú', err.message)
      throw err
    }
  }

  async function handleMoveCallout(annotation, pos) {
    try {
      const updated = await updateAnnotationCalloutPosition(annotation, pos)
      setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)))
    } catch (err) {
      toast.error('Không thể di chuyển ghi chú', err.message)
      throw err
    }
  }

  async function handleDeleteMark(annotation) {
    const label = annotation.task?.activity || annotation.task?.title || annotation.label || 'ghi chú này'
    const ok = await confirm({
      title: 'Xóa ghi chú?',
      message: `"${label}" sẽ bị xóa khỏi bản vẽ cùng với công việc liên kết.`,
      confirmText: 'Xóa vĩnh viễn',
      isDanger: true,
    })
    if (!ok) return
    try {
      await deleteAnnotationMark(annotation)
      setAnnotations((prev) => prev.filter((a) => a.id !== annotation.id))
      toast.success('Đã xóa ghi chú', label)
    } catch (err) {
      toast.error('Lỗi khi xóa ghi chú', err.message)
    }
  }

  async function handlePageCount(numPages) {
    if (!drawing?.id) return
    if (Number(drawing.page_count) === Number(numPages)) return
    setDrawing((prev) => (prev ? { ...prev, page_count: numPages } : prev))
    try {
      await updateDrawingPageCount(drawing.id, numPages)
    } catch {
      /* non-blocking */
    }
  }

  const renderStatusBadge = (status) => {
    const isArchived = status === 'approved_archived'
    const isApproved = status === 'approved'

    let badgeStyle = 'bg-slate-100 text-slate-600 border-slate-200'
    if (isApproved) badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (isArchived) badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200'

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${badgeStyle}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isApproved ? 'bg-emerald-500' : isArchived ? 'bg-amber-500' : 'bg-slate-400'}`} />
        {status || 'Draft'}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-500 text-sm font-medium animate-pulse">Đang tải bản vẽ...</p>
      </div>
    )
  }

  if (error || !drawing) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-6 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Không tìm thấy bản vẽ</h3>
          <p className="text-slate-600 text-sm mb-6">{error || 'Bản vẽ có thể đã bị xóa hoặc bạn không có quyền truy cập.'}</p>
          <Link
            to="/plan-drawing"
            className="inline-flex items-center justify-center px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
          >
            ← Quay lại danh sách bản vẽ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden">
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-4">
          <Link
            to="/plan-drawing"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors px-2 py-1 rounded-md hover:bg-slate-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Bản vẽ
          </Link>
          <div className="h-4 w-px bg-slate-200" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900 leading-tight">{drawing.title}</h1>
              {renderStatusBadge(drawing.status)}
            </div>
            <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{drawing.version || 'Rev 1'}</span>
              <span>•</span>
              <span>{drawing.page_count || 1} trang</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {drawing.status === 'approved_archived' && (
            <span className="text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded-md border border-amber-200">
              🔒 Bản vẽ đã lưu trữ (Chỉ xem)
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden bg-slate-200">
        <DrawingViewer
          fileUrl={fileUrl}
          drawing={drawing}
          annotations={annotations}
          canPin={caps?.canCreateTask && drawing.status !== 'approved_archived'}
          canEditMarks={
            drawing.status !== 'approved_archived' &&
            (caps?.canCreateTask || caps?.canEditAllTasks)
          }
          userId={user?.id}
          onCreatePin={handleCreatePin}
          onMoveCallout={handleMoveCallout}
          onDeleteMark={handleDeleteMark}
          onPageCount={handlePageCount}
        />
      </main>
    </div>
  )
}
