import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'

/**
 * Trang riêng cho 5 cột review (3D Review, First unit, Unit issue,
 * VVT review, Owner review) — tách khỏi SectionTasksPage để bảng chính
 * gọn hơn, còn trang này tập trung riêng cho việc theo dõi review.
 */
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
      .select('id, zone, activity, drawing_id, assignee_id, review_3d, first_unit, unit_issue_date, vvt_review, owner_review')
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
      setError('Bạn chỉ sửa được task được gán.')
      return
    }
    const { error: err } = await supabase.from('tasks').update(patch).eq('id', id)
    if (err) setError(err.message)
    else setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  if (!section) {
    return <p className="muted">Section không tồn tại hoặc chưa load project.</p>
  }

  return (
    <div className="stack">
      <div className="section-head">
        <h2>{displaySectionName(section.header_name)} · Review</h2>
        <p className="muted">
          Ship {currentProject?.ship_id} · {filtered.length} task
          {caps.canEditAssignedOnly ? ' (chỉ task của bạn)' : ''}
        </p>
        <Link className="back-link" to={`/sections/${sectionId}`}>
          ← Quay lại danh sách task
        </Link>
      </div>

      <div className="pm-filter-bar">
        <input
          placeholder="Tìm zone / activity / drawing…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <colgroup>
              <col style={{ width: '8rem' }} />  {/* Zone */}
              <col style={{ width: '15rem' }} /> {/* Activity */}
              <col style={{ width: '8rem' }} />  {/* Drawing */}
              <col style={{ width: '8rem' }} />  {/* 3D Review */}
              <col style={{ width: '7rem' }} />  {/* First unit */}
              <col style={{ width: '8rem' }} />  {/* Unit issue */}
              <col style={{ width: '7rem' }} />  {/* VVT review */}
              <col style={{ width: '7rem' }} />  {/* Owner review */}
            </colgroup>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Activity</th>
                <th>Drawing</th>
                <th>3D Review</th>
                <th>First unit</th>
                <th>Unit issue</th>
                <th>VVT review</th>
                <th>Owner review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const canEdit =
                  caps.canEditAllTasks || (caps.canEditAssignedOnly && t.assignee_id === user.id)
                return (
                  <tr key={t.id}>
                    <td>{t.zone || '—'}</td>
                    <td>{t.activity || '—'}</td>
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
                        value={t.owner_review || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { owner_review: e.target.value || null })}
                      />
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
