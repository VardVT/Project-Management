import { useEffect, useState } from 'react'
import { displaySectionName } from '../../lib/roles'
import { supabase } from '../../lib/supabase'

export function TaskPinModal({
  open,
  rect,
  pageNumber,
  sections = [],
  drawingTitle,
  busy,
  onClose,
  onSubmit,
}) {
  const [activity, setActivity] = useState('')
  const [sectionId, setSectionId] = useState('')
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
    setSectionId(sections[0]?.id || '')
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
  }, [open, sections])

  if (!open || !rect) return null

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!activity.trim()) {
      setError('Enter a comment / task title.')
      return
    }
    if (!sectionId) {
      setError('Select a section.')
      return
    }
    try {
      await onSubmit({
        activity: activity.trim(),
        sectionId,
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
          {drawingTitle} · Page {pageNumber} · region {rect.width.toFixed(1)}% × {rect.height.toFixed(1)}%
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
            Section
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={busy || sections.length === 0}
            >
              {sections.length === 0 && <option value="">No sections on vessel</option>}
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {displaySectionName(s.header_name)}
                </option>
              ))}
            </select>
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

          {error && (
            <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>
          )}

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
