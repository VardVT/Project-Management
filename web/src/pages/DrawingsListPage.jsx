import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { useNotification } from '../components/NotificationContext'
import { deleteDrawing, listDrawings, uploadDrawingPdf } from '../lib/drawingsApi'

function formatBytes(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(status) {
  if (status === 'approved_archived') return 'Archived locally'
  if (status === 'rejected') return 'Rejected'
  return 'In review'
}

function isPdfFile(file) {
  const name = String(file?.name || '').toLowerCase()
  return name.endsWith('.pdf') || file?.type === 'application/pdf'
}

function titleFromFile(file) {
  return String(file.name || 'Untitled drawing').replace(/\.pdf$/i, '').trim() || 'Untitled drawing'
}

export function DrawingsListPage() {
  const { user, caps } = useAuth()
  const { currentProject, projects, selectProject } = useProject()
  const { toast, confirm } = useNotification()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [version, setVersion] = useState('Rev 1')

  const canUpload = caps.canCreateTask

  async function refreshList() {
    if (!currentProject?.id) {
      setRows([])
      return
    }
    const data = await listDrawings(currentProject.id)
    setRows(data)
  }

  useEffect(() => {
    if (!currentProject?.id) {
      setRows([])
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const data = await listDrawings(currentProject.id)
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) {
          setRows([])
          setError(err.message || 'Failed to load drawings')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [currentProject?.id])

  async function handleUpload(e) {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    if (!picked.length || !currentProject) return

    const pdfs = picked.filter(isPdfFile)
    const skipped = picked.length - pdfs.length
    if (!pdfs.length) {
      toast.error('Invalid file', 'Please select one or more PDF drawings.')
      return
    }
    if (skipped > 0) {
      toast.warning('Some files skipped', `${skipped} non-PDF file(s) were ignored.`)
    }

    setUploading(true)
    setUploadProgress({ done: 0, total: pdfs.length })
    const uploaded = []
    const failed = []

    try {
      for (let i = 0; i < pdfs.length; i += 1) {
        const file = pdfs[i]
        setUploadProgress({ done: i, total: pdfs.length, name: file.name })
        try {
          // Single file: optional Title field. Batch: each file keeps its own name.
          const drawingTitle =
            pdfs.length === 1 && title.trim()
              ? title.trim()
              : titleFromFile(file)
          const row = await uploadDrawingPdf({
            projectId: currentProject.id,
            file,
            title: drawingTitle,
            version,
            userId: user.id,
          })
          uploaded.push(row)
        } catch (err) {
          failed.push({ name: file.name, message: err.message || 'Upload failed' })
        }
        setUploadProgress({ done: i + 1, total: pdfs.length, name: file.name })
      }

      setTitle('')
      await refreshList()

      if (uploaded.length === 1 && failed.length === 0) {
        toast.success('Drawing uploaded', uploaded[0].title)
        navigate(`/plan-drawing/${uploaded[0].id}`)
        return
      }

      if (uploaded.length > 0) {
        toast.success(
          `Uploaded ${uploaded.length} drawing${uploaded.length > 1 ? 's' : ''}`,
          failed.length ? `${failed.length} failed — see details.` : 'All selected PDFs are on the list.'
        )
      }
      if (failed.length) {
        toast.error(
          `${failed.length} upload(s) failed`,
          failed
            .slice(0, 3)
            .map((f) => f.name)
            .join(', ') + (failed.length > 3 ? '…' : '')
        )
      }
    } finally {
      setUploading(false)
      setUploadProgress(null)
    }
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: `Delete ${row.title}?`,
      message: 'The PDF and all marks on this drawing will be removed.',
      confirmText: 'Delete drawing',
      isDanger: true,
    })
    if (!ok) return
    try {
      await deleteDrawing(row)
      setRows((prev) => prev.filter((d) => d.id !== row.id))
      toast.success('Drawing deleted', row.title)
    } catch (err) {
      toast.error('Delete failed', err.message)
    }
  }

  const uploadLabel = uploading
    ? uploadProgress
      ? `Uploading ${uploadProgress.done}/${uploadProgress.total}…`
      : 'Uploading…'
    : 'Upload PDFs'

  return (
    <div className="dwg-list-page">
      <div className="pm-page-head">
        <div>
          <h2>Plan Drawing</h2>
          <p className="muted">
            Upload one or many PDFs, then open a drawing to mark regions and comments.
          </p>
        </div>
      </div>

      <div className="pm-panel dwg-upload-panel">
        <label>
          Vessel
          <select
            value={currentProject?.id || ''}
            onChange={(e) => {
              const p = projects.find((x) => x.id === e.target.value)
              if (p) selectProject(p)
            }}
          >
            {projects.length === 0 && <option value="">No vessels</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ship_id || p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title (optional, single file)
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Leave blank to use file name(s)"
            disabled={!canUpload || uploading}
          />
        </label>
        <label>
          Version
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={!canUpload || uploading}
          />
        </label>
        <div className="dwg-upload-actions">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={handleUpload}
          />
          <button
            type="button"
            className="pm-btn primary"
            disabled={!canUpload || !currentProject || uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploadLabel}
          </button>
          {canUpload ? (
            <span className="muted">Select multiple PDFs in the file dialog (Ctrl/Shift + click).</span>
          ) : (
            <span className="muted">Senior / Manager can upload. Everyone can open and view marks.</span>
          )}
        </div>
      </div>

      {uploading && uploadProgress && (
        <div className="pm-panel dwg-upload-progress">
          <div className="dwg-upload-progress-bar">
            <div
              className="dwg-upload-progress-fill"
              style={{
                width: `${Math.round((uploadProgress.done / Math.max(uploadProgress.total, 1)) * 100)}%`,
              }}
            />
          </div>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {uploadProgress.done}/{uploadProgress.total}
            {uploadProgress.name ? ` — ${uploadProgress.name}` : ''}
          </p>
        </div>
      )}

      {error && <p className="muted" style={{ color: '#b91c1c' }}>{error}</p>}
      {loading && <p className="muted">Loading drawings…</p>}

      {!loading && currentProject && rows.length === 0 && !error && (
        <div className="pm-panel" style={{ textAlign: 'center', padding: 32 }}>
          <p className="muted">No drawings on this vessel yet.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="pm-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="dwg-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Rev</th>
                <th>Pages</th>
                <th>Size</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link to={`/plan-drawing/${row.id}`}>{row.title}</Link>
                  </td>
                  <td>{row.version || '—'}</td>
                  <td>{row.page_count || 1}</td>
                  <td>{formatBytes(row.file_size)}</td>
                  <td>{statusLabel(row.status)}</td>
                  <td className="dwg-table-actions">
                    <Link to={`/plan-drawing/${row.id}`} className="pm-btn tiny secondary">
                      Open
                    </Link>
                    {caps.canDeleteProject || row.created_by === user.id ? (
                      <button
                        type="button"
                        className="pm-btn tiny ghost"
                        onClick={() => handleDelete(row)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
