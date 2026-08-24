import { useEffect, useState } from 'react'
import { LIVE_COMMENT_SECTION } from '../../lib/roles'
import { supabase } from '../../lib/supabase'

export function TaskPinModal({
  open,
  rect,
  pageNumber,
  drawingTitle,
  busy,
  onClose,
  onSubmit,
}) {
  const [activity, setActivity] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [zone, setZone] = useState('')
  const [profiles, setProfiles] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setActivity('')
    setZone('')
    setAssigneeId('')
    setError('')
    let cancelled = false
    supabase
      .from('profiles')
      .select('id, display_name, email, position')
      .order('display_name', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setProfiles(data || [])
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open || !rect) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!activity.trim()) {
      setError('Enter a comment / task title.')
      return
    }
    try {
      await onSubmit({
        activity: activity.trim(),
        assigneeId: assigneeId || null,
        zone: zone.trim() || null,
        xPercent: rect.x,
        yPercent: rect.y,
        widthPercent: rect.width,
        heightPercent: rect.height,
        pageNumber,
      })
    } catch (err) {
      setError(err.message || 'Failed to create mark')
    }
  }

  return (
    <div className="pm-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="pm-modal dwg-pin-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dwg-pin-title"
      >
        <h2 id="dwg-pin-title">Mark region on drawing</h2>
        <p className="muted" style={{ marginTop: -8, marginBottom: 14, fontSize: 13 }}>
          {drawingTitle} · Page {pageNumber} · region {rect.width.toFixed(1)}% ×{' '}
          {rect.height.toFixed(1)}%
        </p>
        <p className="dwg-live-hint">
          Task will be added to <strong>{LIVE_COMMENT_SECTION}</strong> (not counted in Summary %).
        </p>

        <form onSubmit={handleSubmit} className="dwg-pin-form">
          <label>
            Comment / Issue
            <input
              autoFocus
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="e.g. Missing support at node 12"
              disabled={busy}
            />
          </label>

          <label>
            Zone (optional)
            <input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="e.g. ER / W51"
              disabled={busy}
            />
          </label>

          <label>
            Assignee (optional)
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={busy}
            >
              <option value="">Unassigned</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name || p.email}
                </option>
              ))}
            </select>
          </label>

          {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}

          <div className="pm-modal-actions">
            <button type="button" className="pm-btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="pm-btn primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create mark + task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
