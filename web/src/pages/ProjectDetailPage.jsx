import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const STATUSES = [
  { value: 'todo', label: 'Todo' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
]

export function ProjectDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const [project, setProject] = useState(null)
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // State lưu danh sách ID các task được chọn
  const [selectedTaskIds, setSelectedTaskIds] = useState([])

  async function loadAll() {
    setLoading(true)
    setError('')

    const [projectRes, tasksRes, membersRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tasks')
        .select('id, title, status, assignee_id, due_date, created_at')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_members')
        .select('role, user_id, profiles(id, display_name, email)')
        .eq('project_id', id),
    ])

    if (projectRes.error) setError(projectRes.error.message)
    else setProject(projectRes.data)

    if (tasksRes.error) setError(tasksRes.error.message)
    else setTasks(tasksRes.data || [])

    if (membersRes.error) setError(membersRes.error.message)
    else setMembers(membersRes.data || [])

    setLoading(false)
  }

  useEffect(() => {
    loadAll()
  }, [id])

  // --- LOGIC CHỌN NHIỀU TASK ---
  function toggleSelectTask(taskId) {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((i) => i !== taskId) : [...prev, taskId]
    )
  }

  function toggleSelectAll() {
    if (selectedTaskIds.length === tasks.length) {
      setSelectedTaskIds([])
    } else {
      setSelectedTaskIds(tasks.map((t) => t.id))
    }
  }

  // --- LOGIC THAO TÁC HÀNG LOẠT (BATCH ACTIONS) ---
  async function updateBatchStatus(newStatus) {
    if (!selectedTaskIds.length || !newStatus) return
    setError('')
    const { error: err } = await supabase
      .from('tasks')
      .update({ status: newStatus })
      .in('id', selectedTaskIds)

    if (err) setError(err.message)
    else {
      setTasks((prev) =>
        prev.map((t) => (selectedTaskIds.includes(t.id) ? { ...t, status: newStatus } : t))
      )
    }
  }

  async function updateBatchAssignee(assigneeId) {
    if (!selectedTaskIds.length) return
    setError('')
    const targetId = assigneeId || null
    const { error: err } = await supabase
      .from('tasks')
      .update({ assignee_id: targetId })
      .in('id', selectedTaskIds)

    if (err) setError(err.message)
    else {
      setTasks((prev) =>
        prev.map((t) => (selectedTaskIds.includes(t.id) ? { ...t, assignee_id: targetId } : t))
      )
    }
  }

  async function deleteBatchTasks() {
    if (!selectedTaskIds.length) return
    if (!window.confirm(`Bạn có chắc muốn xóa ${selectedTaskIds.length} task đã chọn?`)) return

    setError('')
    const { error: err } = await supabase.from('tasks').delete().in('id', selectedTaskIds)

    if (err) setError(err.message)
    else {
      setTasks((prev) => prev.filter((t) => !selectedTaskIds.includes(t.id)))
      setSelectedTaskIds([])
    }
  }

  // --- LOGIC ĐƠN LẺ ---
  async function createTask(e) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    setError('')

    const { error: err } = await supabase.from('tasks').insert({
      project_id: id,
      title: title.trim(),
      status: 'todo',
      assignee_id: user.id,
    })

    if (err) setError(err.message)
    else {
      setTitle('')
      await loadAll()
    }
    setSaving(false)
  }

  async function updateStatus(taskId, status) {
    const { error: err } = await supabase.from('tasks').update({ status }).eq('id', taskId)
    if (err) setError(err.message)
    else setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
  }

  async function updateAssignee(taskId, assigneeId) {
    const { error: err } = await supabase
      .from('tasks')
      .update({ assignee_id: assigneeId || null })
      .eq('id', taskId)
    if (err) setError(err.message)
    else setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, assignee_id: assigneeId || null } : t)))
  }

  function memberName(userId) {
    const m = members.find((x) => x.user_id === userId)
    return m?.profiles?.display_name || m?.profiles?.email || '—'
  }

  if (loading) return <p className="muted">Đang tải dự án…</p>
  if (!project) return <p className="error">Không tìm thấy dự án hoặc bạn không có quyền xem.</p>

  const isAllSelected = tasks.length > 0 && selectedTaskIds.length === tasks.length

  return (
    <div className="stack">
      <p>
        <Link to="/" className="back-link">
          ← Về danh sách dự án
        </Link>
      </p>

      <div className="section-head">
        <h1>{project.name}</h1>
        <p className="muted">{project.description || 'Không có mô tả'}</p>
      </div>

      <form className="panel form" onSubmit={createTask}>
        <h2>Thêm task</h2>
        <label>
          Tiêu đề
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Ví dụ: Viết tài liệu API"
          />
        </label>
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Đang thêm…' : 'Thêm task'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {/* THANH THAO TÁC HÀNG LOẠT (BATCH BAR) */}
      {selectedTaskIds.length > 0 && (
        <div className="batch-toolbar panel primary flex-row align-center justify-between">
          <span>
            Đã chọn <strong>{selectedTaskIds.length}</strong> task
          </span>
          <div className="batch-actions flex-row gap-2">
            <select onChange={(e) => updateBatchStatus(e.target.value)} defaultValue="">
              <option value="" disabled>
                Đổi Status hàng loạt...
              </option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select onChange={(e) => updateBatchAssignee(e.target.value)} defaultValue="">
              <option value="" disabled>
                Đổi Người làm hàng loạt...
              </option>
              <option value="">Chưa gán</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profiles?.display_name || m.profiles?.email || m.user_id}
                </option>
              ))}
            </select>

            <button type="button" className="btn danger" onClick={deleteBatchTasks}>
              Xóa các mục đã chọn
            </button>
            <button type="button" className="btn ghost" onClick={() => setSelectedTaskIds([])}>
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="muted">Chưa có task.</p>
      ) : (
        <div className="task-container">
          <div className="task-header flex-row align-center gap-2 mb-2">
            <button
              type="button"
              className={`select-circle-btn ${isAllSelected ? 'selected' : ''}`}
              onClick={toggleSelectAll}
              title="Chọn tất cả"
            >
              {isAllSelected && '✓'}
            </button>
            <span>Chọn tất cả ({tasks.length} task)</span>
          </div>

          <ul className="task-list">
            {tasks.map((task) => {
              const isSelected = selectedTaskIds.includes(task.id)
              return (
                <li
                  key={task.id}
                  className={`task-item flex-row align-center gap-3 ${isSelected ? 'is-selected' : ''}`}
                  data-status={task.status}
                >
                  {/* NÚT TRÒN ĐỂ CHỌN TASK */}
                  <button
                    type="button"
                    className={`select-circle-btn ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSelectTask(task.id)}
                  >
                    {isSelected && '✓'}
                  </button>

                  <div className="flex-1">
                    <strong>{task.title}</strong>
                    <div>
                      <span className={`status-chip ${task.status}`}>{task.status}</span>
                    </div>
                    <p className="muted">Người làm: {memberName(task.assignee_id)}</p>
                  </div>

                  <div className="task-actions">
                    <select value={task.status} onChange={(e) => updateStatus(task.id, e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={task.assignee_id || ''}
                      onChange={(e) => updateAssignee(task.id, e.target.value)}
                    >
                      <option value="">Chưa gán</option>
                      {members.map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.profiles?.display_name || m.profiles?.email || m.user_id}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
