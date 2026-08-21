import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { IconSave, IconTrash, IconCheck, IconCross, IconPlus } from '../components/Icons'
import { UserAvatar } from '../components/UserAvatar'
import { TeamProfileModal } from '../components/TeamProfileModal'
import { useNotification } from '../components/NotificationContext'

const POSITIONS = ['Admin', 'Manager', 'Senior', 'Engineer', 'Designer']

export function UsersPage() {
  const { caps, profile, createUser, deleteUser } = useAuth()
  const { confirm, toast } = useNotification()
  const canManage = caps.canManageUsers
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [accessId, setAccessId] = useState('')
  const [loading, setLoading] = useState(true)
  const [addingUser, setAddingUser] = useState(null)
  const [addingLoading, setAddingLoading] = useState(false)
  const [viewPerson, setViewPerson] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, display_name, employee_id, position, theme_color, avatar_url, app_access')
      .order('employee_id', { ascending: true, nullsFirst: false })
    if (err) setError(err.message)
    setUsers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function saveUser(user) {
    if (!canManage) return
    setSavingId(user.id)
    setError('')
    const { error: err } = await supabase
      .from('profiles')
      .update({
        display_name: user.display_name,
        employee_id: user.employee_id || null,
        position: user.position,
      })
      .eq('id', user.id)
    if (err) setError(err.message)
    else toast.success('Saved', `${user.display_name || user.email} updated.`)
    setSavingId('')
  }

  async function setAppAccess(user, next) {
    if (!canManage) return
    if (user.id === profile?.id && !next) {
      setError('You cannot turn off access for your own account.')
      return
    }
    setAccessId(user.id)
    setError('')
    const { error: err } = await supabase.from('profiles').update({ app_access: next }).eq('id', user.id)
    if (err) {
      setError(err.message)
    } else {
      patch(user.id, { app_access: next })
      toast.success(
        next ? 'Access enabled' : 'Access disabled',
        next
          ? `${user.display_name || user.email} can sign in again.`
          : `${user.display_name || user.email} is blocked from the app.`,
      )
    }
    setAccessId('')
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
      await createUser({ ...addingUser, theme_color: '#2563eb' })
      setAddingUser(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setAddingLoading(false)
    }
  }

  async function handleDelete(u) {
    if (u.id === profile?.id) {
      setError('You cannot delete your own account.')
      return
    }
    const ok = await confirm({
      title: `Remove ${u.display_name || u.email}?`,
      message:
        'Permanent delete. Prefer turning Access off if you only want to block the app. This also deletes their Supabase Auth account.',
      confirmText: 'Remove permanently',
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

  function openOverview(u, e) {
    if (e?.target?.closest?.('input, select, button, label, a')) return
    setViewPerson(u)
  }

  return (
    <div className="stack">
      <div className="pm-hero shell-manager">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h2>Engineering Team Directory</h2>
            <p className="muted" style={{ marginTop: '2px' }}>
              {canManage
                ? 'Edit members, toggle Access, or click a row to view profile overview.'
                : 'View-only — click a member to open their profile overview.'}
            </p>
          </div>
          {canManage && !addingUser && (
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
          <table className="pm-table users-directory-table">
            <thead>
              <tr>
                <th style={{ width: '90px' }}>Emp ID</th>
                <th style={{ minWidth: '200px' }}>Display Name</th>
                <th style={{ minWidth: '200px' }}>Corporate Email</th>
                <th style={{ width: '130px' }}>Position</th>
                <th style={{ width: '110px' }}>Access</th>
                {canManage ? <th style={{ width: '100px' }}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const accessOn = u.app_access !== false
                return (
                  <tr
                    key={u.id}
                    className={`users-dir-row ${accessOn ? '' : 'access-off'} ${canManage ? '' : 'clickable'}`}
                    onClick={(e) => openOverview(u, e)}
                    title="View profile overview"
                  >
                    <td>
                      {canManage ? (
                        <input
                          value={u.employee_id || ''}
                          placeholder="e.g. 01"
                          onChange={(e) => patch(u.id, { employee_id: e.target.value })}
                        />
                      ) : (
                        <span className="users-dir-text">{u.employee_id || '—'}</span>
                      )}
                    </td>
                    <td>
                      <div className="users-dir-name-cell">
                        <button
                          type="button"
                          className="users-dir-avatar-btn"
                          title="View profile"
                          onClick={(e) => {
                            e.stopPropagation()
                            setViewPerson(u)
                          }}
                        >
                          <UserAvatar
                            name={u.display_name || u.email || 'U'}
                            avatarUrl={u.avatar_url}
                            themeColor={u.theme_color}
                            size={28}
                            rounded="full"
                          />
                        </button>
                        {canManage ? (
                          <input
                            value={u.display_name || ''}
                            placeholder="Engineer name…"
                            onChange={(e) => patch(u.id, { display_name: e.target.value })}
                            style={{ textAlign: 'left', flex: 1 }}
                          />
                        ) : (
                          <span className="users-dir-text strong">{u.display_name || '—'}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'left' }} className="muted">
                      {u.email}
                    </td>
                    <td>
                      {canManage ? (
                        <select
                          value={u.position || 'Engineer'}
                          onChange={(e) => patch(u.id, { position: e.target.value })}
                        >
                          {POSITIONS.map((p) => (
                            <option key={p}>{p}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="users-dir-text">{u.position || 'Engineer'}</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {canManage ? (
                        <label className={`access-switch ${accessOn ? 'on' : 'off'}`} title={accessOn ? 'On' : 'Off'}>
                          <input
                            type="checkbox"
                            checked={accessOn}
                            disabled={accessId === u.id || u.id === profile?.id}
                            onChange={(e) => setAppAccess(u, e.target.checked)}
                          />
                          <span className="access-switch-track">
                            <span className="access-switch-knob" />
                          </span>
                          <span className="access-switch-label">{accessOn ? 'On' : 'Off'}</span>
                        </label>
                      ) : (
                        <span className={`access-badge ${accessOn ? 'on' : 'off'}`}>
                          {accessOn ? 'On' : 'Off'}
                        </span>
                      )}
                    </td>
                    {canManage ? (
                      <td onClick={(e) => e.stopPropagation()}>
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
                            title="Delete permanently"
                            disabled={deletingId === u.id || u.id === profile?.id}
                            onClick={() => handleDelete(u)}
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                )
              })}

              {canManage && addingUser && (
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
                    <span className="access-badge on">On</span>
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

      {viewPerson ? (
        <TeamProfileModal
          person={viewPerson}
          onClose={() => setViewPerson(null)}
          onPersonUpdated={(updated) => {
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)))
            setViewPerson(updated)
          }}
        />
      ) : null}
    </div>
  )
}
