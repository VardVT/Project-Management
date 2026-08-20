import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'

const STATUSES = ['Not Started', 'In Progress', 'Completed', 'On Hold']

export function SectionTasksPage() {
  const { sectionId } = useParams()
  const navigate = useNavigate()
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
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

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
    setSelectedIds(new Set()) // FIX: đổi section thì clear luôn lựa chọn cũ
  }, [sectionId, currentProject?.id, caps.canEditAssignedOnly, user?.id])

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAssigned && t.assignee_id !== filterAssigned) return false
      const hay = `${t.zone || ''} ${t.activity || ''} ${t.drawing_id || ''}`.toLowerCase()
      if (filterText && !hay.includes(filterText.toLowerCase())) return false
      return true
    })
  }, [tasks, filterAssigned, filterText])

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length && filtered.length > 0) return new Set()
      return new Set(filtered.map((t) => t.id))
    })
  }

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

  // FIX: 3 hành động hàng loạt trên các task đang được tích chọn qua checkbox
  async function bulkDelete() {
    if (!caps.canEditAllTasks || selectedIds.size === 0) return
    const ok = window.confirm(`Xóa ${selectedIds.size} task đã chọn? Không hoàn tác được.`)
    if (!ok) return
    setBulkBusy(true)
    try {
      const { error: err } = await supabase.from('tasks').delete().in('id', [...selectedIds])
      if (err) throw err
      setSelectedIds(new Set())
      await load()
    } catch (err) {
      setError(err.message || 'Xóa hàng loạt thất bại')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkMoveSection(newSectionId) {
    if (!caps.canEditAllTasks || selectedIds.size === 0 || !newSectionId) return
    setBulkBusy(true)
    try {
      const { error: err } = await supabase
        .from('tasks')
        .update({ section_id: newSectionId })
        .in('id', [...selectedIds])
      if (err) throw err
      // FIX: task vừa chuyển đi sẽ không còn thuộc section đang xem nữa —
      // clear lựa chọn rồi load lại danh sách của section hiện tại.
      setSelectedIds(new Set())
      await load()
    } catch (err) {
      setError(err.message || 'Chuyển section hàng loạt thất bại')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkSetAssignee(assigneeId) {
    if (!caps.canEditAllTasks || selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      const { error: err } = await supabase
        .from('tasks')
        .update({ assignee_id: assigneeId || null })
        .in('id', [...selectedIds])
      if (err) throw err
      await load()
    } catch (err) {
      setError(err.message || 'Gán người hàng loạt thất bại')
    } finally {
      setBulkBusy(false)
    }
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
        <div className="section-head-row">
          <h2>{displaySectionName(section.header_name)}</h2>
          {/* FIX: dropdown nhảy nhanh sang section khác, không cần quay lại sidebar */}
          <select
            className="section-jump-select"
            value={sectionId}
            onChange={(e) => navigate(`/sections/${e.target.value}`)}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {displaySectionName(s.header_name)}
              </option>
            ))}
          </select>
        </div>
        <p className="muted">
          Ship {currentProject?.ship_id} · {filtered.length} task
          {caps.canEditAssignedOnly ? ' (chỉ task của bạn)' : ''}
        </p>
        <Link className="back-link" to={`/sections/${sectionId}/reviews`}>
          Xem cột Review (3D/VVT/Owner…) →
        </Link>
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

      {/* FIX: toolbar hành động hàng loạt — chỉ hiện khi có ít nhất 1 task
          đang được chọn, và chỉ cho người có quyền sửa toàn bộ task. */}
      {caps.canEditAllTasks && selectedIds.size > 0 && (
        <div className="pm-bulk-toolbar">
          <span className="pm-bulk-count">{selectedIds.size} task đã chọn</span>

          <select
            defaultValue=""
            disabled={bulkBusy}
            onChange={(e) => {
              bulkMoveSection(e.target.value)
              e.target.value = ''
            }}
          >
            <option value="" disabled>
              Chuyển Section →
            </option>
            {sections
              .filter((s) => s.id !== sectionId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {displaySectionName(s.header_name)}
                </option>
              ))}
          </select>

          <select
            defaultValue=""
            disabled={bulkBusy}
            onChange={(e) => {
              bulkSetAssignee(e.target.value)
              e.target.value = ''
            }}
          >
            <option value="" disabled>
              Gán người →
            </option>
            <option value="">— Bỏ gán —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || p.email}
              </option>
            ))}
          </select>

          <button type="button" className="pm-btn danger" disabled={bulkBusy} onClick={bulkDelete}>
            {bulkBusy ? 'Đang xử lý…' : `Xóa ${selectedIds.size} task`}
          </button>

          <button type="button" className="pm-btn ghost" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <colgroup>
              <col style={{ width: '3.2rem' }} />
              <col style={{ width: '17rem' }} />
              <col style={{ width: '30rem' }} />
              <col style={{ width: '25rem' }} />
              <col style={{ width: '12rem' }} />
              <col style={{ width: '10.5rem' }} />
              <col style={{ width: '10.5rem' }} />
              <col style={{ width: '7.5rem' }} />
              <col style={{ width: '11.25rem' }} />
              <col style={{ width: '8.25rem' }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    className="pm-checkbox-circle"
                    checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    title="Chọn tất cả"
                  />
                </th>
                <th>Section</th>
                <th>Activity</th>
                <th>Drawing</th>
                <th>Assigned</th>
                <th>Start</th>
                <th>Finish</th>
                <th>%</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const canEdit =
                  caps.canEditAllTasks || (caps.canEditAssignedOnly && t.assignee_id === user.id)
                return (
                  <tr key={t.id} data-status={t.status || 'Not Started'} className={t.pending_review ? 'pending' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        className="pm-checkbox-circle"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                      />
                    </td>
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
