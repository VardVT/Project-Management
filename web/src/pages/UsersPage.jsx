import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { IconSave, IconTrash, IconCheck, IconCross, IconPlus } from '../components/Icons'
import { useNotification } from '../components/NotificationContext'

const POSITIONS = ['Admin', 'Manager', 'Senior', 'Engineer', 'Designer']

export function UsersPage() {
  const { caps, createUser, deleteUser } = useAuth()
  const { confirm, toast } = useNotification()
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [loading, setLoading] = useState(true)

  const [addingUser, setAddingUser] = useState(null)
  const [addingLoading, setAddingLoading] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, display_name, employee_id, position, theme_color')
      .order('employee_id', { ascending: true, nullsFirst: false })
    if (err) setError(err.message)
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  if (!caps.canManageUsers) {
    return <Navigate to="/" replace />
  }

  async function saveUser(user) {
    setSavingId(user.id)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({
        display_name: user.display_name,
        employee_id: user.employee_id || null,
        position: user.position,
        theme_color: user.theme_color || null,
      })
      .eq('id', user.id)
    if (err) setError(err.message)
    setSavingId('')
  }

  function patch(id, fields) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...fields } : u)))
  }

  function startAdding() {
    setAddingUser({
      email: '',
      display_name: '',
      employee_id: '',
      position: 'Engineer',
      theme_color: '#2563eb',
    })
  }

  async function handleCreateNew() {
    if (!addingUser.email || !addingUser.display_name) {
      setError('Please provide both Email and Display Name.')
      return
    }
    setAddingLoading(true)
    setError('')
    try {
      await createUser(addingUser)
      setAddingUser(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setAddingLoading(false)
    }
  }

  async function handleDelete(u) {
    const ok = await confirm({
      title: `Remove ${u.display_name || u.email}?`,
      message: 'This will remove the user from the team directory. Their Supabase Auth account will also be deleted.',
      confirmText: 'Remove User',
      isDanger: true,
    })
    if (!ok) return
    setDeletingId(u.id)
    setError('')
    try {
      await deleteUser(u.id)
      setUsers((prev) => prev.filter((user) => user.id !== u.id))
      toast.success('User Removed', `${u.display_name || u.email} has been removed.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="stack">
      <div className="pm-hero shell-manager">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2>Engineering Team Directory</h2>
            <p className="muted" style={{ marginTop: '2px' }}>
              Default initial password: <code>pass01</code>
            </p>
          </div>
          {!addingUser && (
            <button type="button" className="pm-btn primary" onClick={startAdding}>
              <IconPlus size={14} />
              <span>Add Member</span>
            </button>
          )}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {loading ? (
        <p className="muted">Loading team directory…</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>Emp ID</th>
                <th style={{ width: '220px' }}>Display Name</th>
                <th style={{ width: '240px' }}>Corporate Email</th>
                <th style={{ width: '140px' }}>Discipline Position</th>
                <th style={{ width: '90px' }}>Theme</th>
                <th style={{ width: '100px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <input
                      value={u.employee_id || ''}
                      placeholder="e.g. 01"
                      onChange={(e) => patch(u.id, { employee_id: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      value={u.display_name || ''}
                      placeholder="Engineer name…"
                      onChange={(e) => patch(u.id, { display_name: e.target.value })}
                      style={{ textAlign: 'left' }}
                    />
                  </td>
                  <td style={{ textAlign: 'left' }} className="muted">
                    {u.email}
                  </td>
                  <td>
                    <select value={u.position || 'Engineer'} onChange={(e) => patch(u.id, { position: e.target.value })}>
                      {POSITIONS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="color"
                      value={u.theme_color || '#2563eb'}
                      onChange={(e) => patch(u.id, { theme_color: e.target.value })}
                      style={{ width: '32px', height: '24px', padding: 0, cursor: 'pointer', border: 'none' }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="pm-btn tiny success icon-only"
                        title="Save changes"
                        disabled={savingId === u.id}
                        onClick={() => saveUser(u)}
                      >
                        <IconSave size={13} />
                      </button>
                      <button
                        type="button"
                        className="pm-btn tiny danger icon-only"
                        title="Delete member"
                        disabled={deletingId === u.id}
                        onClick={() => handleDelete(u)}
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {addingUser && (
                <tr style={{ background: 'var(--primary-subtle)' }}>
                  <td>
                    <input
                      placeholder="Emp ID…"
                      value={addingUser.employee_id}
                      onChange={(e) => setAddingUser({ ...addingUser, employee_id: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      placeholder="Full Name…"
                      value={addingUser.display_name}
                      onChange={(e) => setAddingUser({ ...addingUser, display_name: e.target.value })}
                      style={{ textAlign: 'left' }}
                    />
                  </td>
                  <td>
                    <input
                      type="email"
                      placeholder="user@corporate.com"
                      value={addingUser.email}
                      onChange={(e) => setAddingUser({ ...addingUser, email: e.target.value })}
                      style={{ textAlign: 'left' }}
                    />
                  </td>
                  <td>
                    <select
                      value={addingUser.position}
                      onChange={(e) => setAddingUser({ ...addingUser, position: e.target.value })}
                    >
                      {POSITIONS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="color"
                      value={addingUser.theme_color}
                      onChange={(e) => setAddingUser({ ...addingUser, theme_color: e.target.value })}
                      style={{ width: '32px', height: '24px', padding: 0, cursor: 'pointer', border: 'none' }}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="pm-btn tiny success icon-only"
                        title="Confirm create"
                        disabled={addingLoading}
                        onClick={handleCreateNew}
                      >
                        <IconCheck size={13} />
                      </button>
                      <button
                        type="button"
                        className="pm-btn tiny ghost icon-only"
                        title="Cancel"
                        onClick={() => setAddingUser(null)}
                      >
                        <IconCross size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
