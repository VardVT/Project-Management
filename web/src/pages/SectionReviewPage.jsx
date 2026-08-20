import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'
import { IconSearch, IconChevronLeft } from '../components/Icons'

export function SectionReviewPage() {
  const { sectionId } = useParams()
  const { user, caps } = useAuth()
  const { sections, currentProject } = useProject()
  const section = sections.find((s) => s.id === sectionId)

  const [tasks, setTasks] = useState([])
  const [filterText, setFilterText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    if (!sectionId || !currentProject) return
    setLoading(true)
    setError('')

    let query = supabase
      .from('tasks')
      .select('id, zone, activity, drawing_id, assignee_id, review_3d, first_unit, unit_issue_date, vvt_review, owners_review')
      .eq('section_id', sectionId)
      .order('created_at', { ascending: true })

    if (caps.canEditAssignedOnly) {
      query = query.eq('assignee_id', user.id)
    }

    const { data, error: err } = await query
    if (err) setError(err.message)
    setTasks(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [sectionId, currentProject?.id, caps.canEditAssignedOnly, user?.id])

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const hay = `${t.zone || ''} ${t.activity || ''} ${t.drawing_id || ''}`.toLowerCase()
      if (filterText && !hay.includes(filterText.toLowerCase())) return false
      return true
    })
  }, [tasks, filterText])

  async function patchTask(id, patch) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    if (caps.canEditAssignedOnly && task.assignee_id !== user.id) {
      setError('You are only authorized to edit your assigned tasks.')
      return
    }
    const { error: err } = await supabase.from('tasks').update(patch).eq('id', id)
    if (err) setError(err.message)
    else setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  if (!section) {
    return (
      <div className="pm-panel">
        <p className="muted">Section not found or vessel not loaded.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="pm-hero shell-manager">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h2>{displaySectionName(section.header_name)} · Engineering Review Matrix</h2>
          <Link to={`/sections/${sectionId}`} className="pm-btn secondary tiny">
            <IconChevronLeft size={12} />
            <span>Back to Tasks Grid</span>
          </Link>
        </div>
        <p className="muted">
          Vessel <strong>{currentProject?.ship_id}</strong>
        </p>
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', maxWidth: '360px' }}>
        <IconSearch size={14} style={{ position: 'absolute', left: '8px', color: 'var(--ink-faint)' }} />
        <input
          style={{ width: '100%', paddingLeft: '28px' }}
          placeholder="Filter zone, activity, drawing ID…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading review status matrix…</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <colgroup>
              <col style={{ width: '120px' }} />
              <col style={{ width: '280px' }} />
              <col style={{ width: '220px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Activity Description</th>
                <th>Drawing ID</th>
                <th>3D Review</th>
                <th>First Unit</th>
                <th>Unit Issue Date</th>
                <th>VVT Review</th>
                <th>Owner Review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const canEdit =
                  caps.canEditAllTasks || (caps.canEditAssignedOnly && t.assignee_id === user.id)
                return (
                  <tr key={t.id}>
                    <td>{t.zone || '—'}</td>
                    <td style={{ textAlign: 'left' }}>{t.activity || '—'}</td>
                    <td>{t.drawing_id || '—'}</td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.review_3d || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { review_3d: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.first_unit || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { first_unit: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        disabled={!canEdit}
                        value={t.unit_issue_date || ''}
                        onChange={(e) => patchTask(t.id, { unit_issue_date: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.vvt_review || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { vvt_review: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.owners_review || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { owners_review: e.target.value || null })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="muted" style={{ textAlign: 'center', padding: '24px' }}>
              No tasks found for review.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
