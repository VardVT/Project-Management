import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'
import { NewProjectModal } from './NewProjectModal'
import { ExcelToolbar } from './ExcelToolbar'

export function AppShell() {
  const { profile, user, caps, signOut } = useAuth()
  const { currentProject, projects, sections, selectProject, deleteProject } = useProject()
  const navigate = useNavigate()

  // FIX: sidebar giờ phân cấp theo Vessel — mỗi vessel là 1 mục cấp 1,
  // bấm vào mở ra Task/Summary (cấp 2). expandedVessels: các vessel đang
  // mở rộng. taskOpen: có đang hiện danh sách section (Task) của vessel
  // hiện tại (currentProject) hay không — vì `sections` trong context chỉ
  // phản ánh đúng project đang chọn, nên list section chỉ hiện dưới đúng
  // vessel trùng currentProject.
  const [expandedVessels, setExpandedVessels] = useState(new Set())
  const [taskOpen, setTaskOpen] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [switching, setSwitching] = useState(null) // id vessel đang chuyển, để disable tạm

  const name = profile?.display_name || user?.email || 'User'
  const ship = currentProject?.ship_id || currentProject?.name || '—'
  const dept = currentProject?.department || 'Piping'

  function toggleVessel(id) {
    setExpandedVessels((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function ensureCurrentThen(vessel, after) {
    if (currentProject?.id !== vessel.id) {
      setSwitching(vessel.id)
      try {
        await selectProject(vessel)
      } finally {
        setSwitching(null)
      }
    }
    after()
  }

  async function onClickTask(vessel) {
    setExpandedVessels((prev) => new Set(prev).add(vessel.id))
    await ensureCurrentThen(vessel, () => setTaskOpen(true))
  }

  async function onClickSummary(vessel) {
    await ensureCurrentThen(vessel, () => navigate('/summary'))
  }

  async function onDeleteProject() {
    if (!currentProject?.id || !caps.canDeleteProject) return
    const label = currentProject.ship_id || currentProject.name || 'project này'
    const ok = window.confirm(
      `Xóa project ${label}?\nToàn bộ section + task sẽ bị xóa. Không hoàn tác được.`
    )
    if (!ok) return
    setDeleting(true)
    try {
      await deleteProject(currentProject.id)
      navigate('/dashboard')
    } catch (err) {
      window.alert(err.message || 'Xóa project thất bại')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`pm-app shell-${caps.shell}`}>
      <aside className="pm-sidebar">
        <div className="pm-sidebar-user">
          <div className="pm-avatar" style={profile?.theme_color ? { background: profile.theme_color } : undefined}>
            {name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="pm-user-name">{name}</div>
            <div className={`pm-role-badge role-${caps.shell}`}>{caps.label}</div>
          </div>
        </div>

        <nav className="pm-menu">
          {caps.showDashboard && (
            <NavLink to="/dashboard" className="pm-menu-item">
              00 Dashboard
            </NavLink>
          )}

          {/* FIX: liệt kê thẳng từng Vessel (project) — không có nhãn cha
              "Vessel" bọc ngoài, mỗi tàu là 1 mục cấp 1 độc lập. */}
          {projects.length === 0 ? (
            <span className="pm-submenu-empty">Chưa có vessel nào</span>
          ) : (
            projects.map((v) => {
              const isCurrent = currentProject?.id === v.id
              const isExpanded = expandedVessels.has(v.id)
              return (
                <div key={v.id} className="pm-vessel-group">
                  <button
                    type="button"
                    className={`pm-menu-item parent${isCurrent ? ' active-vessel' : ''}`}
                    onClick={() => toggleVessel(v.id)}
                    disabled={switching === v.id}
                  >
                    Vessel {v.ship_id || v.name}
                    <span>{isExpanded ? '▼' : '▶'}</span>
                  </button>

                  {isExpanded && (
                    <div className="pm-submenu">
                      <button
                        type="button"
                        className="pm-menu-item sub"
                        onClick={() => onClickTask(v)}
                        disabled={switching === v.id}
                      >
                        {switching === v.id ? 'Đang chuyển…' : 'Task'}
                      </button>

                      {/* Danh sách section chỉ hiện đúng dưới vessel đang
                          là currentProject (vì sections context chỉ phản
                          ánh 1 project tại 1 thời điểm) và khi Task đang mở. */}
                      {isCurrent && taskOpen && (
                        <div className="pm-submenu pm-submenu-nested">
                          {sections.length === 0 ? (
                            <span className="pm-submenu-empty">Chưa có section</span>
                          ) : (
                            sections.map((s) => (
                              <NavLink key={s.id} to={`/sections/${s.id}`} className="pm-menu-item sub2">
                                {displaySectionName(s.header_name)}
                              </NavLink>
                            ))
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        className="pm-menu-item sub"
                        onClick={() => onClickSummary(v)}
                        disabled={switching === v.id}
                      >
                        Summary
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {caps.showReviewRequests && (
            <NavLink to="/reviews" className="pm-menu-item">
              Review Requests
            </NavLink>
          )}

          {caps.showCalendar && (
            <NavLink to="/calendar" className="pm-menu-item">
              Calendar
            </NavLink>
          )}

          {caps.canManageUsers && (
            <NavLink to="/users" className="pm-menu-item">
              Users
            </NavLink>
          )}

          {caps.showReports && (
            <NavLink to="/reports" className="pm-menu-item muted-link">
              Reports
            </NavLink>
          )}

          {caps.showPlanDrawing && (
            <NavLink to="/plan-drawing" className="pm-menu-item muted-link">
              Plan Drawing
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="pm-main">
        <header className="pm-header">
          <div className="pm-ship-panel">
            <div className="pm-ship-id">{ship}</div>
            <div className="pm-dept">{dept}</div>
          </div>

          <div className="pm-header-center">
            <h1>Progress Management</h1>
            <div className="pm-actions">
              {caps.canCreateProject && (
                <button type="button" className="pm-btn purple" onClick={() => setShowNew(true)}>
                  New
                </button>
              )}
              <ExcelToolbar />
              {caps.canDeleteProject && currentProject?.id ? (
                <button
                  type="button"
                  className="pm-btn danger"
                  disabled={deleting}
                  onClick={onDeleteProject}
                  title="Xóa project hiện tại (section + task)"
                >
                  {deleting ? 'Deleting…' : 'Xóa'}
                </button>
              ) : null}
              {caps.canManageUsers && (
                <button type="button" className="pm-btn green" onClick={() => navigate('/users')}>
                  Users
                </button>
              )}
              <button
                type="button"
                className="pm-btn ghost"
                onClick={async () => {
                  await signOut()
                  navigate('/login')
                }}
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </header>

        <div className="pm-content">
          <Outlet />
        </div>
      </div>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
