import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'

const STATUSES = ['Not Started', 'In Progress', 'Completed', 'On Hold']

export function SectionTasksPage() {
  const { sectionId } = useParams()
  const { user, caps } = useAuth()
  const { sections, currentProject } = useProject()
  const section = sections.find((s) => s.id === sectionId)

  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [filterAssigned, setFilterAssigned] = useState('')
  const [filterText, setFilterText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newActivity, setNewActivity] = useState('')

  async function load() {
    if (!sectionId || !currentProject) return
    setLoading(true)
    setError('')

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('section_id', sectionId)
      .order('created_at', { ascending: true })

    if (caps.canEditAssignedOnly) {
      query = query.eq('assignee_id', user.id)
    }

    const [{ data: taskData, error: taskErr }, { data: profileData }] = await Promise.all([
      query,
      supabase.from('profiles').select('id, display_name, email, position'),
    ])

    if (taskErr) setError(taskErr.message)
    setTasks(taskData || [])
    setProfiles(profileData || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [sectionId, currentProject?.id, caps.canEditAssignedOnly, user?.id])

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAssigned && t.assignee_id !== filterAssigned) return false
      const hay = `${t.zone || ''} ${t.activity || ''} ${t.drawing_id || ''}`.toLowerCase()
      if (filterText && !hay.includes(filterText.toLowerCase())) return false
      return true
    })
  }, [tasks, filterAssigned, filterText])

  async function addTask(e) {
    e.preventDefault()
    if (!caps.canCreateTask || !newActivity.trim() || !currentProject) return
    const { error: err } = await supabase.from('tasks').insert({
      project_id: currentProject.id,
      section_id: sectionId,
      title: newActivity.trim(),
      activity: newActivity.trim(),
      status: 'Not Started',
      percent_complete: 0,
    })
    if (err) setError(err.message)
    else {
      setNewActivity('')
      await load()
    }
  }

  async function patchTask(id, patch) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    if (caps.canEditAssignedOnly && task.assignee_id !== user.id) {
      setError('Bạn chỉ sửa được task được gán.')
      return
    }

    if (patch.percent_complete != null && caps.percentCap < 100) {
      const n = Number(patch.percent_complete)
      if (n > caps.percentCap && !task.pending_review) {
        patch.percent_complete = caps.percentCap
      }
    }

    const { error: err } = await supabase.from('tasks').update(patch).eq('id', id)
    if (err) setError(err.message)
    else setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  async function submitReview(task) {
    if (!caps.canSubmitReview) return
    const { error: err } = await supabase
      .from('tasks')
      .update({
        pending_review: true,
        review_requested_by: user.id,
        review_requested_at: new Date().toISOString(),
        percent_complete: Math.min(Number(task.percent_complete) || 0, caps.percentCap),
      })
      .eq('id', task.id)
    if (err) setError(err.message)
    else await load()
  }

  function nameOf(id) {
    const p = profiles.find((x) => x.id === id)
    return p?.display_name || p?.email || '—'
  }

  if (!section) {
    return <p className="muted">Section không tồn tại hoặc chưa load project.</p>
  }

  return (
    <div className="stack">
      <div className="section-head">
        <h2>{displaySectionName(section.header_name)}</h2>
        <p className="muted">
          Ship {currentProject?.ship_id} · {filtered.length} task
          {caps.canEditAssignedOnly ? ' (chỉ task của bạn)' : ''}
        </p>
      </div>

      <div className="pm-filter-bar">
        <input
          placeholder="Tìm zone / activity / drawing…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        {!caps.canEditAssignedOnly && (
          <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)}>
            <option value="">All Assigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || p.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {caps.canCreateTask && (
        <form className="pm-inline-form" onSubmit={addTask}>
          <input
            value={newActivity}
            onChange={(e) => setNewActivity(e.target.value)}
            placeholder="Activity name…"
            required
          />
          <button type="submit" className="pm-btn purple">
            New Task
          </button>
        </form>
      )}

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Activity</th>
                <th>Drawing</th>
                <th>Assigned</th>
                <th>Start</th>
                <th>Finish</th>
                <th>%</th>
                <th>Status</th>
                <th>3D Review</th>
                <th>First unit</th>
                <th>Unit issue</th>
                <th>VVT review</th>
                <th>Owner review</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const canEdit =
                  caps.canEditAllTasks || (caps.canEditAssignedOnly && t.assignee_id === user.id)
                return (
                  <tr key={t.id} className={t.pending_review ? 'pending' : ''}>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.zone || ''}
                        onChange={(e) => patchTask(t.id, { zone: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.activity || ''}
                        onChange={(e) =>
                          patchTask(t.id, { activity: e.target.value, title: e.target.value })
                        }
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.drawing_id || ''}
                        onChange={(e) => patchTask(t.id, { drawing_id: e.target.value })}
                      />
                    </td>
                    <td>
                      {caps.canEditAllTasks ? (
                        <select
                          value={t.assignee_id || ''}
                          onChange={(e) => patchTask(t.id, { assignee_id: e.target.value || null })}
                        >
                          <option value="">—</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.display_name || p.email}
                            </option>
                          ))}
                        </select>
                      ) : (
                        nameOf(t.assignee_id)
                      )}
                    </td>
                    <td>
                      <input
                        type="date"
                        disabled={!canEdit}
                        value={t.start_date || ''}
                        onChange={(e) => patchTask(t.id, { start_date: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        disabled={!canEdit}
                        value={t.finish_date || ''}
                        onChange={(e) => patchTask(t.id, { finish_date: e.target.value || null })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        max={caps.percentCap}
                        disabled={!canEdit}
                        value={t.percent_complete ?? 0}
                        onChange={(e) => patchTask(t.id, { percent_complete: Number(e.target.value) })}
                        style={{ width: '4.5rem' }}
                      />
                    </td>
                    <td>
                      <select
                        disabled={!canEdit}
                        value={t.status || 'Not Started'}
                        onChange={(e) => patchTask(t.id, { status: e.target.value })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.review_3d || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { review_3d: e.target.value || null })}
                        style={{ width: '6rem' }}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.first_unit || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { first_unit: e.target.value || null })}
                        style={{ width: '4.5rem' }}
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
                        style={{ width: '4.5rem' }}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.owner_review || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { owner_review: e.target.value || null })}
                        style={{ width: '4.5rem' }}
                      />
                    </td>
                    <td>
                      {t.pending_review ? (
                        <span className="status-chip doing">Pending</span>
                      ) : caps.canSubmitReview && t.assignee_id === user.id ? (
                        <button type="button" className="pm-btn tiny" onClick={() => submitReview(t)}>
                          Submit
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted">Không có task.</p>}
        </div>
      )}
    </div>
  )
}
