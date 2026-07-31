import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const POSITIONS = ['Admin', 'Manager', 'Senior', 'Engineer', 'Designer']

export function UsersPage() {
  const { caps, createUser, deleteUser } = useAuth()
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [loading, setLoading] = useState(true)

  // State cho dòng nhập liệu khi bấm dấu cộng ở cuối bảng
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

  // ---- LƯU THAY ĐỔI USER CŨ (UPDATE) ----
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

  // ---- MỞ DÒNG TRỐNG THÊM MỚI ----
  function startAdding() {
    setAddingUser({
      email: '',
      display_name: '',
      employee_id: '',
      position: 'Engineer',
      theme_color: '#2f6f9f'
    })
  }

  // ---- TẠO USER MỚI QUA EDGE FUNCTION ----
  async function handleCreateNew() {
    if (!addingUser.email || !addingUser.display_name) {
      setError('Vui lòng nhập đầy đủ Email và Tên hiển thị.')
      return
    }
    setAddingLoading(true)
    setError('')
    try {
      await createUser(addingUser)
      setAddingUser(null)
      await load() // Tải lại danh sách
    } catch (err) {
      setError(err.message)
    } finally {
      setAddingLoading(false)
    }
  }

  // ---- XÓA USER ----
  async function handleDelete(u) {
    if (!window.confirm(`Bạn có chắc muốn xóa nhân sự: ${u.display_name || u.email}?`)) return
    setDeletingId(u.id)
    setError('')
    try {
      await deleteUser(u.id)
      setUsers((prev) => prev.filter((user) => user.id !== u.id))
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="stack">
      <div className="pm-hero shell-manager">
        <h2>User Management</h2>
        <p className="muted">Quản lý trực tiếp thông tin nhân sự. Bấm dấu cộng ở cuối bảng để thêm tài khoản mới (Mật khẩu mặc định: pass01).</p>
      </div>

      {error ? <p className="error" style={{ color: 'red' }}>{error}</p> : null}
      
      {loading ? (
        <p className="muted">Đang tải…</p>
      ) : (
        <div className="pm-table-wrap">
          <table className="pm-table">
            <thead>
              <tr>
                <th>Mã NV</th>
                <th>Tên</th>
                <th>Email</th>
                <th>Position</th>
                <th>Theme</th>
                <th style={{ width: '90px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* DANH SÁCH USER HIỆN TẠI */}
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <input value={u.employee_id || ''} onChange={(e) => patch(u.id, { employee_id: e.target.value })} />
                  </td>
                  <td>
                    <input value={u.display_name || ''} onChange={(e) => patch(u.id, { display_name: e.target.value })} />
                  </td>
                  <td className="muted">{u.email}</td>
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
                      value={u.theme_color || '#2f6f9f'}
                      onChange={(e) => patch(u.id, { theme_color: e.target.value })}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {/* Icon Lưu (💾) */}
                      <button 
                        type="button" 
                        className="pm-btn tiny green" 
                        title="Lưu thay đổi"
                        disabled={savingId === u.id} 
                        onClick={() => saveUser(u)}
                      >
                        {savingId === u.id ? '…' : '💾'}
                      </button>
                      {/* Icon Xóa (🗑️) */}
                      <button 
                        type="button" 
                        className="pm-btn tiny" 
                        title="Xóa user"
                        style={{ backgroundColor: '#e53935', color: 'white' }} 
                        disabled={deletingId === u.id} 
                        onClick={() => handleDelete(u)}
                      >
                        {deletingId === u.id ? '…' : '🗑️'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* DÒNG NHẬP LIỆU MỚI KHI BẤM DẤU CỘNG */}
              {addingUser && (
                <tr style={{ backgroundColor: 'rgba(47, 111, 159, 0.05)' }}>
                  <td>
                    <input 
                      placeholder="Mã NV..." 
                      value={addingUser.employee_id} 
                      onChange={(e) => setAddingUser({...addingUser, employee_id: e.target.value})} 
                    />
                  </td>
                  <td>
                    <input 
                      placeholder="Tên hiển thị..." 
                      value={addingUser.display_name} 
                      onChange={(e) => setAddingUser({...addingUser, display_name: e.target.value})} 
                    />
                  </td>
                  <td>
                    <input 
                      type="email"
                      placeholder="Email..." 
                      value={addingUser.email} 
                      onChange={(e) => setAddingUser({...addingUser, email: e.target.value})} 
                    />
                  </td>
                  <td>
                    <select value={addingUser.position} onChange={(e) => setAddingUser({...addingUser, position: e.target.value})}>
                      {POSITIONS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="color"
                      value={addingUser.theme_color}
                      onChange={(e) => setAddingUser({...addingUser, theme_color: e.target.value})}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      {/* Icon Xác nhận tạo (✔) */}
                      <button 
                        type="button" 
                        className="pm-btn tiny green" 
                        title="Tạo nhân sự mới"
                        disabled={addingLoading} 
                        onClick={handleCreateNew}
                      >
                        {addingLoading ? '…' : '✔'}
                      </button>
                      {/* Icon Hủy (✕) */}
                      <button 
                        type="button" 
                        className="pm-btn tiny" 
                        title="Hủy"
                        style={{ backgroundColor: '#9e9e9e', color: 'white' }} 
                        onClick={() => setAddingUser(null)}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* NÚT DẤU CỘNG Ở CUỐI BẢNG */}
          {!addingUser && (
            <div style={{ padding: '12px', textAlign: 'center', borderTop: '1px solid var(--border-color, #e0e0e0)' }}>
              <button 
                type="button" 
                className="pm-btn" 
                onClick={startAdding}
                style={{ width: '100%', borderStyle: 'dashed', background: 'transparent', color: 'inherit' }}
              >
                + Thêm nhân sự mới
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
