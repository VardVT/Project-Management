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

export function DrawingsListPage() {
  const { user, caps } = useAuth()
  const { currentProject, projects, selectProject } = useProject()
  const { toast, confirm } = useNotification()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [version, setVersion] = useState('Rev 1')

  const canUpload = caps.canCreateTask

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
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !currentProject) return
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      toast.error('Invalid file', 'Please upload a PDF drawing.')
      return
    }
    setUploading(true)
    try {
      const row = await uploadDrawingPdf({
        projectId: currentProject.id,
        file,
        title: title || file.name.replace(/\.pdf$/i, ''),
        version,
        userId: user.id,
      })
      setTitle('')
      toast.success('Drawing uploaded', row.title)
      navigate(`/plan-drawing/${row.id}`)
    } catch (err) {
      toast.error('Upload failed', err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: `Delete ${row.title}?`,
      message: 'The PDF and all pins on this drawing will be removed.',
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

  return (
    <div className="dwg-list-page">
      <div className="pm-page-head">
        <div>
          <h2>Plan Drawing</h2>
          <p className="muted">
            Upload a PDF, open it with crisp zoom, then pin issues as engineering tasks.
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
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. NB994 W51 piping plan"
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
            hidden
            onChange={handleUpload}
          />
          <button
            type="button"
            className="pm-btn primary"
            disabled={!canUpload || !currentProject || uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload PDF'}
          </button>
          {!canUpload && (
            <span className="muted">Senior / Manager can upload. Everyone can open and view pins.</span>
          )}
        </div>
      </div>

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
