import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'
import { syncPercentAndStatus, statusFromPercent, percentFromStatus } from '../lib/progress'
import { withCompletionTimestamps } from '../lib/workload'
import { useNotification } from '../components/NotificationContext'
import { RightDrawer } from '../components/RightDrawer'
import { AssigneeCell } from '../components/AssigneeCell'
import { TeamProfileModal } from '../components/TeamProfileModal'
import { IconPlus, IconTrash, IconSearch, IconArrowRight, IconFilter, IconCross, IconTask } from '../components/Icons'

const STATUSES = ['Not Started', 'In Progress', 'Completed', 'On Hold']

function statusTone(status) {
  const s = String(status || '')
    .trim()
    .toLowerCase()
  if (s === 'completed') return 'completed'
  if (s === 'in progress') return 'in-progress'
  if (s === 'on hold') return 'on-hold'
  return 'not-started'
}

const DEFAULT_NEW_TASK = {
  zone: '',
  activity: '',
  drawing_id: '',
  assignee_id: '',
  start_date: '',
  finish_date: '',
  percent_complete: 0,
  status: 'Not Started',
}

export function SectionTasksPage() {
  const { sectionId } = useParams()
  const navigate = useNavigate()
  const { user, profile, caps } = useAuth()
  const { sections, currentProject } = useProject()
  const { confirm, toast } = useNotification()
  const section = sections.find((s) => s.id === sectionId)

  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [viewPerson, setViewPerson] = useState(null)
  const [filterAssigned, setFilterAssigned] = useState('')
  const [filterText, setFilterText] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTask, setNewTask] = useState(DEFAULT_NEW_TASK)
  const [addBusy, setAddBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
      supabase.from('profiles').select('id, display_name, email, position, theme_color, avatar_url, app_access, employee_id'),
    ])

    if (taskErr) setError(taskErr.message)
    setTasks(taskData || [])
    setProfiles(profileData || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    setSelectedIds(new Set())
  }, [sectionId, currentProject?.id, caps.canEditAssignedOnly, user?.id])

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAssigned && t.assignee_id !== filterAssigned) return false
      if (filterStatus && t.status !== filterStatus) return false
      const hay = `${t.zone || ''} ${t.activity || ''} ${t.drawing_id || ''}`.toLowerCase()
      if (filterText && !hay.includes(filterText.toLowerCase())) return false
      return true
    })
  }, [tasks, filterAssigned, filterText, filterStatus])

  const activeFilterCount = [filterAssigned, filterText, filterStatus].filter(Boolean).length

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

  async function handleAddTask(e) {
    e.preventDefault()
    if (!caps.canCreateTask || !newTask.activity.trim() || !currentProject) return
    setAddBusy(true)
    try {
      const linked = syncPercentAndStatus({
        percent_complete: Number(newTask.percent_complete) || 0,
        status: newTask.status,
      })
      const { error: err } = await supabase.from('tasks').insert({
        project_id: currentProject.id,
        section_id: sectionId,
        title: newTask.activity.trim(),
        activity: newTask.activity.trim(),
        zone: newTask.zone || null,
        drawing_id: newTask.drawing_id || null,
        assignee_id: newTask.assignee_id || null,
        start_date: newTask.start_date || null,
        finish_date: newTask.finish_date || null,
        percent_complete: linked.percent_complete,
        status: linked.status,
      })
      if (err) throw err
      toast.success('Task Created', `"${newTask.activity.trim()}" added to ${displaySectionName(section?.header_name)}.`)
      setNewTask(DEFAULT_NEW_TASK)
      setShowAddModal(false)
      await load()
    } catch (err) {
      toast.error('Create Failed', err.message)
    } finally {
      setAddBusy(false)
    }
  }

  async function patchTask(id, patch) {
    const task = tasks.find((t) => t.id === id)
    if (!task) return

    if (caps.canEditAssignedOnly && task.assignee_id !== user.id) {
      toast.error('Not Authorized', 'You are only authorized to edit your assigned tasks.')
      return
    }

    if (patch.percent_complete != null && caps.percentCap < 100) {
      const n = Number(patch.percent_complete)
      if (n > caps.percentCap && !task.pending_review) {
        patch.percent_complete = caps.percentCap
      }
    }

    patch = syncPercentAndStatus(patch, task)
    patch = withCompletionTimestamps(patch, task)

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
    else {
      toast.success('Review Submitted', 'Task has been submitted for senior review.')
      await load()
    }
  }

  async function bulkDelete() {
    if (!caps.canEditAllTasks || selectedIds.size === 0) return
    const ok = await confirm({
      title: `Delete ${selectedIds.size} Task${selectedIds.size > 1 ? 's' : ''}?`,
      message: 'The selected tasks will be permanently removed. This action cannot be undone.',
      confirmText: `Delete ${selectedIds.size} Tasks`,
      isDanger: true,
    })
    if (!ok) return
    setBulkBusy(true)
    try {
      const { error: err } = await supabase.from('tasks').delete().in('id', [...selectedIds])
      if (err) throw err
      toast.success('Tasks Deleted', `${selectedIds.size} task${selectedIds.size > 1 ? 's' : ''} removed.`)
      setSelectedIds(new Set())
      await load()
    } catch (err) {
      toast.error('Delete Failed', err.message || 'Bulk delete failed')
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
      setSelectedIds(new Set())
      await load()
    } catch (err) {
      toast.error('Move Failed', err.message || 'Bulk move section failed')
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
      toast.error('Assign Failed', err.message || 'Bulk assignment failed')
    } finally {
      setBulkBusy(false)
    }
  }

  function clearFilters() {
    setFilterText('')
    setFilterAssigned('')
    setFilterStatus('')
  }

  function patchNew(fields) {
    setNewTask((prev) => {
      const next = { ...prev, ...fields }
      if (fields.percent_complete != null) {
        next.status = statusFromPercent(Number(fields.percent_complete) || 0)
      } else if (fields.status != null) {
        next.percent_complete = percentFromStatus(fields.status, prev.percent_complete)
      }
      return next
    })
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
      {/* Section Header */}
      <div className="pm-hero shell-manager">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2>{displaySectionName(section.header_name)}</h2>
            <select
              value={sectionId}
              onChange={(e) => navigate(`/sections/${e.target.value}`)}
              style={{ fontWeight: 600, color: 'var(--primary)', height: '30px' }}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {displaySectionName(s.header_name)}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Filter drawer trigger */}
            <button
              type="button"
              className={`pm-btn tiny ${activeFilterCount > 0 ? 'primary' : 'secondary'}`}
              onClick={() => setDrawerOpen((o) => !o)}
              title="Toggle filter panel"
            >
              <IconFilter size={13} />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="pm-filter-badge">{activeFilterCount}</span>
              )}
            </button>

            {caps.canCreateTask && (
              <button
                type="button"
                className="pm-btn primary tiny"
                onClick={() => { setNewTask(DEFAULT_NEW_TASK); setShowAddModal(true) }}
              >
                <IconPlus size={13} />
                <span>New Task</span>
              </button>
            )}

            <Link to={`/sections/${sectionId}/reviews`} className="pm-btn secondary tiny">
              <span>Review Matrix</span>
              <IconArrowRight size={12} />
            </Link>
          </div>
        </div>

        <p className="muted" style={{ marginTop: '4px' }}>
          Vessel <strong>{currentProject?.ship_id}</strong> · {filtered.length}
          {tasks.length !== filtered.length ? ` of ${tasks.length}` : ''} tasks
          {caps.canEditAssignedOnly ? ' (Assigned to you)' : ''}
        </p>
      </div>

      {/* Bulk actions toolbar */}
      {caps.canEditAllTasks && selectedIds.size > 0 && (
        <div className="pm-bulk-toolbar">
          <span className="pm-bulk-count">{selectedIds.size} selected</span>

          <select
            defaultValue=""
            disabled={bulkBusy}
            onChange={(e) => {
              bulkMoveSection(e.target.value)
              e.target.value = ''
            }}
            style={{ height: '28px', fontSize: '12px' }}
          >
            <option value="" disabled>Move to section…</option>
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
            style={{ height: '28px', fontSize: '12px' }}
          >
            <option value="" disabled>Assign engineer…</option>
            <option value="">— Unassigned —</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name || p.email}
              </option>
            ))}
          </select>

          <button type="button" className="pm-btn danger tiny" disabled={bulkBusy} onClick={bulkDelete}>
            <IconTrash size={12} />
            <span>{bulkBusy ? 'Deleting…' : `Delete (${selectedIds.size})`}</span>
          </button>

          <button
            type="button"
            className="pm-btn ghost tiny"
            disabled={bulkBusy}
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading engineering tasks…</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <colgroup>
              <col style={{ width: '40px' }} />
              <col style={{ width: '130px' }} />
              <col style={{ width: '280px' }} />
              <col style={{ width: '200px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '115px' }} />
              <col style={{ width: '115px' }} />
              <col style={{ width: '70px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '90px' }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    className="pm-checkbox-circle"
                    checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                    onChange={toggleSelectAll}
                    title="Select All"
                  />
                </th>
                <th>Section</th>
                <th>Activity Description</th>
                <th>Drawing ID</th>
                <th>PIC</th>
                <th>Start Date</th>
                <th>Finish Date</th>
                <th>% Done</th>
                <th>Status</th>
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
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { zone: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.activity || ''}
                        placeholder="Activity title…"
                        onChange={(e) =>
                          patchTask(t.id, { activity: e.target.value, title: e.target.value })
                        }
                        style={{ textAlign: 'left' }}
                      />
                    </td>
                    <td>
                      <input
                        disabled={!canEdit}
                        value={t.drawing_id || ''}
                        placeholder="—"
                        onChange={(e) => patchTask(t.id, { drawing_id: e.target.value })}
                      />
                    </td>
                    <td>
                      <AssigneeCell
                        assigneeId={t.assignee_id}
                        profiles={profiles}
                        canAssign={caps.canEditAllTasks}
                        onAssign={(id) => patchTask(t.id, { assignee_id: id })}
                        onView={(p) => setViewPerson(p)}
                      />
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
                        className={`status-select status-select-${statusTone(t.status)}`}
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
                        <button type="button" className="pm-btn tiny primary" onClick={() => submitReview(t)}>
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
          {filtered.length === 0 && (
            <p className="muted" style={{ textAlign: 'center', padding: '24px' }}>
              No tasks found {activeFilterCount > 0 ? 'matching the current filters.' : 'in this section.'}
            </p>
          )}
        </div>
      )}

      {/* ── ADD TASK MODAL ─────────────────────────────────── */}
      {showAddModal && (
        <div className="pm-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="pm-modal new-task-modal" style={{ maxWidth: '580px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="new-task-modal-header">
              <div className="new-task-modal-title-group">
                <div className="new-task-badge">
                  <IconTask size={14} />
                  <span>Vessel {currentProject?.ship_id} · {displaySectionName(section.header_name)}</span>
                </div>
                <h2>Create New Engineering Task</h2>
              </div>
              <button
                type="button"
                className="pm-btn ghost icon-only tiny new-task-close-btn"
                onClick={() => setShowAddModal(false)}
                title="Close"
              >
                <IconCross size={16} />
              </button>
            </div>

            <form onSubmit={handleAddTask} className="new-task-form">
              {/* Group 1: Task Core Information */}
              <div className="new-task-section">
                <label className="new-task-field-full">
                  <span className="field-label">Activity Description <strong className="required-star">*</strong></span>
                  <input
                    autoFocus
                    required
                    value={newTask.activity}
                    onChange={(e) => patchNew({ activity: e.target.value })}
                    placeholder="e.g. 3D Route verification for engine room line A-201…"
                    className="new-task-input-primary"
                  />
                </label>

                <div className="new-task-grid-2">
                  <label>
                    <span className="field-label">Section / Frame Area</span>
                    <input
                      value={newTask.zone}
                      onChange={(e) => patchNew({ zone: e.target.value })}
                      placeholder="e.g. FR 20-40, Deck 3"
                    />
                  </label>

                  <label>
                    <span className="field-label">Drawing / Iso Reference ID</span>
                    <input
                      value={newTask.drawing_id}
                      onChange={(e) => patchNew({ drawing_id: e.target.value })}
                      placeholder="e.g. DWG-PIPE-004-REV2"
                    />
                  </label>
                </div>
              </div>

              {/* Group 2: Assignment & Status */}
              <div className="new-task-section">
                <div className="new-task-grid-2">
                  {caps.canEditAllTasks ? (
                    <label>
                      <span className="field-label">Assigned Engineer</span>
                      <div className="new-task-assignee">
                        <AssigneeCell
                          assigneeId={newTask.assignee_id || null}
                          profiles={profiles}
                          canAssign
                          onAssign={(id) => patchNew({ assignee_id: id || '' })}
                          onView={(p) => setViewPerson(p)}
                        />
                      </div>
                    </label>
                  ) : (
                    <label>
                      <span className="field-label">Assigned Engineer</span>
                      <div className="new-task-assignee">
                        <AssigneeCell
                          assigneeId={profile?.id}
                          profiles={profile ? [profile, ...profiles.filter((p) => p.id !== profile.id)] : profiles}
                          canAssign={false}
                          onView={(p) => setViewPerson(p)}
                        />
                      </div>
                    </label>
                  )}

                  <label>
                    <span className="field-label">Initial Status</span>
                    <select
                      className={`status-select status-select-${statusTone(newTask.status)}`}
                      value={newTask.status}
                      onChange={(e) => patchNew({ status: e.target.value })}
                    >
                      {STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              {/* Group 3: Schedule & Initial Progress */}
              <div className="new-task-section">
                <div className="new-task-grid-2">
                  <label>
                    <span className="field-label">Planned Start Date</span>
                    <input
                      type="date"
                      value={newTask.start_date}
                      onChange={(e) => patchNew({ start_date: e.target.value })}
                    />
                  </label>

                  <label>
                    <span className="field-label">Target Finish Date</span>
                    <input
                      type="date"
                      value={newTask.finish_date}
                      onChange={(e) => patchNew({ finish_date: e.target.value })}
                    />
                  </label>
                </div>

                <div className="new-task-progress-slider-wrap">
                  <div className="new-task-progress-header">
                    <span className="field-label">Initial Progress</span>
                    <div className="new-task-percent-badge">
                      <strong>{newTask.percent_complete || 0}%</strong>
                    </div>
                  </div>

                  <div className="new-task-progress-row">
                    <input
                      type="range"
                      min={0}
                      max={caps.percentCap}
                      step={5}
                      value={newTask.percent_complete || 0}
                      onChange={(e) => patchNew({ percent_complete: Number(e.target.value) })}
                      className="new-task-range"
                    />
                    <input
                      type="number"
                      min={0}
                      max={caps.percentCap}
                      value={newTask.percent_complete}
                      onChange={(e) => patchNew({ percent_complete: e.target.value })}
                      className="new-task-number-input"
                    />
                  </div>
                </div>
              </div>

              <div className="pm-modal-actions new-task-actions">
                <button
                  type="button"
                  className="pm-btn ghost"
                  onClick={() => setShowAddModal(false)}
                  disabled={addBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pm-btn primary"
                  disabled={addBusy || !newTask.activity.trim()}
                >
                  <IconPlus size={15} />
                  <span>{addBusy ? 'Creating…' : 'Create Task'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── RIGHT FILTER DRAWER (no backdrop) ─────────────── */}
      <RightDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Filter & Search"
        subtitle={`${tasks.length} tasks total · ${filtered.length} shown`}
        footer={
          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              type="button"
              className="pm-btn ghost"
              style={{ flex: 1 }}
              onClick={clearFilters}
            >
              Clear All
            </button>
            <button
              type="button"
              className="pm-btn primary"
              style={{ flex: 1 }}
              onClick={() => setDrawerOpen(false)}
            >
              Done
            </button>
          </div>
        }
      >
        {/* Text search */}
        <div className="pm-drawer-section">
          <div className="pm-drawer-section-title">Search</div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <IconSearch size={14} style={{ position: 'absolute', left: '9px', color: 'var(--ink-faint)', pointerEvents: 'none' }} />
            <input
              type="search"
              placeholder="Section, activity, drawing ID…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{ width: '100%', paddingLeft: '30px' }}
              autoFocus={drawerOpen}
            />
          </div>
        </div>

        {/* Engineer filter */}
        {!caps.canEditAssignedOnly && (
          <div className="pm-drawer-section">
            <div className="pm-drawer-section-title">Engineer / PIC</div>
            <select
              value={filterAssigned}
              onChange={(e) => setFilterAssigned(e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">All Engineers</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name || p.email}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status filter */}
        <div className="pm-drawer-section">
          <div className="pm-drawer-section-title">Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              className={`pill-btn ${filterStatus === '' ? 'active' : ''}`}
              onClick={() => setFilterStatus('')}
            >
              All
            </button>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`pill-btn ${filterStatus === s ? 'active' : ''}`}
                onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Live count summary */}
        <div style={{ marginTop: 'auto', padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--ink-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {filtered.length}
          </div>
          <div className="muted" style={{ fontSize: '11.5px' }}>of {tasks.length} tasks match</div>
        </div>
      </RightDrawer>

      {viewPerson ? (
        <TeamProfileModal
          person={viewPerson}
          onClose={() => setViewPerson(null)}
          onPersonUpdated={(updated) => {
            setProfiles((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
            setViewPerson(updated)
          }}
        />
      ) : null}
    </div>
  )
}
