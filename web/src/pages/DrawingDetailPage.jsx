import { useEffect, useState } from 'react'
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
  const { currentProject, projects, sections, selectProject } = useProject()
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
          setError('Drawing not found.')
          return
        }
        setDrawing(row)
        const pins = await listAnnotations(drawingId)
        if (!cancelled) setAnnotations(pins)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load drawing')
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
    if (!drawing?.project_id || !projects.length) return
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
        sectionId: payload.sectionId,
        assigneeId: payload.assigneeId,
        zone: payload.zone,
        userId: user.id,
      })
      setAnnotations((prev) => [...prev, annotation])
      toast.success('Mark created', payload.activity)
    } catch (err) {
      toast.error('Could not create mark', err.message)
      throw err
    }
  }

  async function handleMoveCallout(annotation, pos) {
    try {
      const updated = await updateAnnotationCalloutPosition(annotation, pos)
      setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)))
    } catch (err) {
      toast.error('Could not move comment', err.message)
      throw err
    }
  }

  async function handleDeleteMark(annotation) {
    const label = annotation.task?.activity || annotation.task?.title || annotation.label || 'this comment'
    const ok = await confirm({
      title: 'Delete comment?',
      message: `"${label}" will be removed from the drawing and its linked task will be deleted.`,
      confirmText: 'Delete',
      isDanger: true,
    })
    if (!ok) return
    try {
      await deleteAnnotationMark(annotation)
      setAnnotations((prev) => prev.filter((a) => a.id !== annotation.id))
      toast.success('Comment deleted', label)
    } catch (err) {
      toast.error('Could not delete comment', err.message)
    }
  }

  async function handlePageCount(numPages) {
    if (!drawing?.id) return
    if (Number(drawing.page_count) === Number(numPages)) return
    try {
      await updateDrawingPageCount(drawing.id, numPages)
      setDrawing((prev) => (prev ? { ...prev, page_count: numPages } : prev))
    } catch {
      /* non-blocking */
    }
  }

  if (loading) {
    return <p className="muted">Opening drawing…</p>
  }

  if (error || !drawing) {
    return (
      <div className="pm-panel" style={{ padding: 24 }}>
        <p style={{ color: '#b91c1c' }}>{error || 'Drawing not found.'}</p>
        <Link to="/plan-drawing">Back to drawings</Link>
      </div>
    )
  }

  return (
    <div className="dwg-detail-page">
      <div className="dwg-detail-head">
        <div>
          <Link to="/plan-drawing" className="dwg-back">
            ← Drawings
          </Link>
          <h2>{drawing.title}</h2>
          <p className="muted">
            {drawing.version || 'Rev 1'} · {drawing.page_count || 1} page(s) · {drawing.status}
          </p>
        </div>
      </div>

      <DrawingViewer
        fileUrl={fileUrl}
        drawing={drawing}
        annotations={annotations}
        canPin={caps.canCreateTask && drawing.status !== 'approved_archived'}
        canEditMarks={
          drawing.status !== 'approved_archived' &&
          (caps.canCreateTask || caps.canEditAllTasks)
        }
        userId={user.id}
        sections={sections}
        onCreatePin={handleCreatePin}
        onMoveCallout={handleMoveCallout}
        onDeleteMark={handleDeleteMark}
        onPageCount={handlePageCount}
      />
    </div>
  )
}
