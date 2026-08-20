import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'
import { NewProjectModal } from './NewProjectModal'
import { ExcelToolbar } from './ExcelToolbar'
import { useNotification } from './NotificationContext'
import {
  IconDashboard,
  IconVessel,
  IconTask,
  IconSummary,
  IconReview,
  IconCalendar,
  IconUsers,
  IconReport,
  IconPlus,
  IconTrash,
  IconLogOut,
  IconChevronDown,
  IconChevronRight,
} from './Icons'

export function AppShell() {
  const { profile, user, caps, signOut } = useAuth()
  const { currentProject, projects, sections, selectProject, deleteProject } = useProject()
  const { confirm, toast } = useNotification()
  const navigate = useNavigate()

  const [expandedVessels, setExpandedVessels] = useState(new Set())
  const [taskOpen, setTaskOpen] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [switching, setSwitching] = useState(null)

  const name = profile?.display_name || user?.email?.split('@')[0] || 'User'
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
    const label = currentProject.ship_id || currentProject.name || 'this vessel'
    const ok = await confirm({
      title: `Delete Vessel ${label}?`,
      message: 'All sections, drawings and engineering tasks will be permanently removed. This action cannot be undone.',
      confirmText: 'Delete Vessel',
      isDanger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      await deleteProject(currentProject.id)
      navigate('/dashboard')
    } catch (err) {
      toast.error('Delete Failed', err.message || 'Failed to delete vessel')
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
          <div className="pm-user-info">
            <div className="pm-user-name" title={name}>{name}</div>
            <div className={`pm-role-badge role-${caps.shell}`}>{caps.label || 'Engineer'}</div>
          </div>
        </div>

        <nav className="pm-menu">
          <div className="pm-menu-section-label">Overview</div>
          {caps.showDashboard && (
            <NavLink to="/dashboard" className="pm-menu-item">
              <IconDashboard size={17} />
              <span>Fleet Dashboard</span>
            </NavLink>
          )}

          <div className="pm-menu-section-label">Vessels & Engineering</div>
          {projects.length === 0 ? (
            <span className="pm-submenu-empty">No vessels loaded</span>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IconVessel size={16} />
                      <span>Vessel {v.ship_id || v.name}</span>
                    </div>
                    {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  </button>

                  {isExpanded && (
                    <div className="pm-submenu">
                      <button
                        type="button"
                        className="pm-menu-item sub"
                        onClick={() => onClickTask(v)}
                        disabled={switching === v.id}
                      >
                        <IconTask size={14} />
                        <span>{switching === v.id ? 'Switching…' : 'Tasks'}</span>
                      </button>

                      {isCurrent && taskOpen && (
                        <div className="pm-submenu pm-submenu-nested">
                          {sections.length === 0 ? (
                            <span className="pm-submenu-empty">No sections</span>
                          ) : (
                            sections.map((s) => (
                              <NavLink key={s.id} to={`/sections/${s.id}`} className="pm-menu-item sub2">
                                <span>{displaySectionName(s.header_name)}</span>
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
                        <IconSummary size={14} />
                        <span>Summary</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}

          <div className="pm-menu-section-label">Management</div>
          {caps.showReviewRequests && (
            <NavLink to="/reviews" className="pm-menu-item">
              <IconReview size={17} />
              <span>Review Requests</span>
            </NavLink>
          )}

          {caps.showCalendar && (
            <NavLink to="/calendar" className="pm-menu-item">
              <IconCalendar size={17} />
              <span>Milestones & Calendar</span>
            </NavLink>
          )}

          {caps.canManageUsers && (
            <NavLink to="/users" className="pm-menu-item">
              <IconUsers size={17} />
              <span>Team Members</span>
            </NavLink>
          )}

          {caps.showReports && (
            <NavLink to="/reports" className="pm-menu-item muted-link">
              <IconReport size={17} />
              <span>Reports</span>
            </NavLink>
          )}
        </nav>
      </aside>

      <div className="pm-main">
        <header className="pm-header">
          <div className="pm-header-left">
            <div className="pm-ship-indicator">
              <IconVessel size={15} />
              <span className="ship-id">Vessel {ship}</span>
              <span className="dept-tag">{dept}</span>
            </div>

            <div className="pm-header-title">
              <h1>Progress Management</h1>
              <span className="subtitle">Pipe and Machinery Manager</span>
            </div>
          </div>

          <div className="pm-header-actions">
            <div className="pm-action-group">
              {caps.canCreateProject && (
                <button
                  type="button"
                  className="pm-btn primary"
                  onClick={() => setShowNew(true)}
                  title="Create new vessel project"
                >
                  <IconPlus size={15} />
                  <span>New Vessel</span>
                </button>
              )}
              <ExcelToolbar />
            </div>

            {caps.canDeleteProject && currentProject?.id ? (
              <button
                type="button"
                className="pm-btn danger"
                disabled={deleting}
                onClick={onDeleteProject}
                title="Delete current vessel"
              >
                <IconTrash size={14} />
                <span>{deleting ? 'Deleting…' : 'Delete'}</span>
              </button>
            ) : null}

            <button
              type="button"
              className="pm-btn ghost"
              onClick={async () => {
                await signOut()
                navigate('/login')
              }}
              title="Sign out of system"
            >
              <IconLogOut size={15} />
              <span>Sign out</span>
            </button>
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
