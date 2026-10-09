import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useProject, useNotification, displaySectionName, VesselProject } from './context/AppContext';
import { NewProjectModal } from './components/NewProjectModal';
import { ExcelToolbar } from './components/ExcelToolbar';
import { ProfileModal } from './components/ProfileModal';
import { UserAvatar } from './components/UserAvatar';
import {
  IconDashboard,
  IconVessel,
  IconTask,
  IconSummary,
  IconReview,
  IconCalendar,
  IconUsers,
  IconReport,
  IconDrawing,
  IconPlus,
  IconTrash,
  IconLogOut,
  IconChevronDown,
  IconChevronRight,
  IconSpreadsheet,
  IconSearch,
  IconSettings,
  IconStar,
} from './components/Icons';

export function AppShell() {
  const { profile, user, caps, signOut } = useAuth();
  const { currentProject, projects, sections, selectProject, deleteProject } = useProject();
  const { confirm, toast } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  // Initial expand Vessel 1005 to match the design screenshot
  const [expandedVessels, setExpandedVessels] = useState<Set<string>>(new Set(['1005']));
  const [taskOpen, setTaskOpen] = useState<boolean>(true);
  const [showNew, setShowNew] = useState<boolean>(false);
  const [showProfile, setShowProfile] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [showVesselDropdown, setShowVesselDropdown] = useState<boolean>(false);

  const name = profile?.display_name || user?.email?.split('@')[0] || 'Phan Trọng Khôi';
  const ship = currentProject?.ship_id || currentProject?.name || '1001';
  const dept = currentProject?.department || 'Piping';

  // Keyboard shortcut listener for collapse [ and search Cmd+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '[' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function toggleVessel(id: string) {
    setExpandedVessels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function ensureCurrentThen(vessel: VesselProject, after: () => void) {
    if (currentProject?.id !== vessel.id) {
      setSwitching(vessel.id);
      try {
        await selectProject(vessel);
      } finally {
        setSwitching(null);
      }
    }
    after();
  }

  async function onClickTask(vessel: VesselProject) {
    setExpandedVessels((prev) => new Set(prev).add(vessel.id));
    await ensureCurrentThen(vessel, () => setTaskOpen(true));
  }

  async function onClickSummary(vessel: VesselProject) {
    await ensureCurrentThen(vessel, () => navigate('/summary'));
  }

  async function onDeleteProject() {
    if (!currentProject?.id || !caps.canDeleteProject) return;
    const label = currentProject.ship_id || currentProject.name || 'this vessel';
    const ok = await confirm({
      title: `Delete Vessel ${label}?`,
      message:
        'All sections, drawings, and engineering tasks will be permanently removed. This action cannot be undone.',
      confirmText: 'Delete Vessel',
      isDanger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteProject(currentProject.id);
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete vessel';
      toast.error('Delete Failed', message);
    } finally {
      setDeleting(false);
    }
  }

  // Filtered vessel list for sidebar search
  const filteredProjects = projects.filter((v) =>
    (v.name || v.ship_id).toLowerCase().includes(filterQuery.toLowerCase())
  );

  const starredProjects = projects.filter((v) => v.starred);

  return (
    <div
      className={`pm-app shell-${caps.shell} flex h-screen w-screen overflow-hidden text-[13px] bg-[#FAFBFC] text-[#172B4D] antialiased select-none`}
    >
      {/* SIDEBAR */}
      <aside
        className={`pm-sidebar ${
          isSidebarCollapsed ? 'w-0 sm:w-14 overflow-hidden border-r-0' : 'w-[260px]'
        } bg-[#FAFBFC] text-[#172B4D] flex flex-col shrink-0 h-screen border-r border-[#DFE1E6] transition-all duration-300 relative z-30 select-none`}
        data-purpose="main-sidebar"
      >
        {!isSidebarCollapsed && (
          <>
            {/* User Profile Header */}
            <div className="pm-sidebar-user p-3 border-b border-[#EBECF0] flex items-center justify-between">
              <button
                type="button"
                className="pm-sidebar-user-btn flex items-center gap-2.5 min-w-0 text-left hover:opacity-90 cursor-pointer"
                onClick={() => setShowProfile(true)}
                title="Open personal profile"
              >
                <UserAvatar
                  name={name}
                  avatarUrl={profile?.avatar_url}
                  themeColor={profile?.theme_color || '#0052CC'}
                  size={30}
                  className="pm-avatar ring-1 ring-blue-400 shrink-0"
                />
                <div className="pm-user-info truncate leading-tight">
                  <div className="pm-user-name font-semibold text-[#172B4D] text-xs truncate" title={name}>
                    {name}
                  </div>
                  <div className="pm-role-badge inline-block text-[10px] font-medium text-[#626F86]">
                    {caps.label || 'Admin · Fleet Lead'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShowProfile(true)}
                className="text-[#626F86] hover:text-[#172B4D] p-1 rounded hover:bg-[#EBECF0] transition-colors cursor-pointer"
                title="Settings"
              >
                <IconSettings size={15} />
              </button>
            </div>

            {/* Active Vessel Switcher Pill */}
            <div className="px-3 pt-2.5 pb-1 relative">
              <button
                type="button"
                onClick={() => setShowVesselDropdown((prev) => !prev)}
                className="w-full flex items-center justify-between bg-white hover:bg-[#F4F5F7] text-[#172B4D] px-2.5 py-1.5 rounded border border-[#DFE1E6] shadow-2xs transition-colors text-left group cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="text-xs font-semibold truncate text-[#172B4D]">
                    Vessel {ship} <span className="text-[#626F86] font-normal">•</span> {dept}
                  </span>
                </div>
                <IconChevronDown size={13} className="text-[#626F86] group-hover:text-[#172B4D] shrink-0" />
              </button>

              {/* Quick switcher menu */}
              {showVesselDropdown && (
                <div className="absolute left-3 right-3 top-10 bg-white border border-[#DFE1E6] rounded-md shadow-lg z-50 py-1 max-h-52 overflow-y-auto">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#626F86]">
                    Select Active Vessel
                  </div>
                  {projects.map((v) => (
                    <button
                      key={`switch-${v.id}`}
                      type="button"
                      onClick={() => {
                        selectProject(v);
                        setShowVesselDropdown(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left text-xs flex items-center justify-between hover:bg-[#F4F5F7] cursor-pointer ${
                        currentProject?.id === v.id ? 'bg-[#E9F2FF] font-semibold text-[#0052CC]' : ''
                      }`}
                    >
                      <span className="truncate">Vessel {v.ship_id || v.name}</span>
                      <span className="text-[10px] font-mono text-[#626F86]">{v.progress}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Search / Filter Input with Cmd+K */}
            <div className="px-3 py-1.5">
              <div className="relative flex items-center">
                <span className="absolute left-2.5 pointer-events-none text-gray-400">
                  <IconSearch size={13} />
                </span>
                <input
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="w-full pl-7 pr-10 py-1 bg-white border border-[#DFE1E6] rounded text-[11px] text-[#172B4D] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 outline-none"
                  placeholder="Filter vessel / task..."
                  type="text"
                />
                <kbd className="absolute right-1.5 px-1 py-0.5 text-[9px] font-mono text-[#626F86] bg-[#EBECF0] rounded border border-[#DFE1E6] leading-none pointer-events-none">
                  ⌘K
                </kbd>
              </div>
            </div>

            {/* Scrollable Navigation Items */}
            <nav className="pm-menu flex-1 overflow-y-auto px-2 py-1.5 space-y-3.5 text-xs select-none">
              {/* Section: OVERVIEW */}
              <div>
                <div className="pm-menu-section-label px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#626F86]">
                  Overview
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {caps.showDashboard && (
                    <NavLink
                      to="/dashboard"
                      className={({ isActive }) =>
                        `pm-menu-item flex items-center gap-2.5 px-2.5 py-1.5 rounded font-semibold transition-colors ${
                          isActive
                            ? 'text-[#0052CC] bg-[#E9F2FF]'
                            : 'text-[#172B4D] hover:bg-[#EBECF0]'
                        }`
                      }
                    >
                      <IconDashboard size={16} className="text-[#0052CC] shrink-0" />
                      <span className="truncate">Fleet Dashboard</span>
                    </NavLink>
                  )}

                  <NavLink
                    to="/excel"
                    className={({ isActive }) =>
                      `pm-menu-item flex items-center gap-2.5 px-2.5 py-1.5 rounded font-semibold transition-colors ${
                        isActive
                          ? 'text-[#00875A] bg-[#E3FCEF]'
                          : 'text-[#172B4D] hover:bg-[#EBECF0]'
                      }`
                    }
                  >
                    <IconSpreadsheet size={16} className="text-[#00875A] shrink-0" />
                    <span className="truncate">Excel Tool</span>
                    <span className="ml-auto text-[9px] bg-emerald-100 text-emerald-800 font-mono px-1 rounded">
                      GRID
                    </span>
                  </NavLink>
                </div>
              </div>

              {/* Section: STARRED VESSELS */}
              {starredProjects.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#626F86]">
                    <span>Starred Vessels</span>
                    <IconStar size={13} className="text-amber-500 fill-amber-400" />
                  </div>
                  <div className="space-y-0.5 mt-0.5">
                    {starredProjects.map((v) => (
                      <button
                        key={`star-${v.id}`}
                        type="button"
                        onClick={() => {
                          selectProject(v);
                          navigate('/dashboard');
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-[#172B4D] hover:bg-[#EBECF0] transition-colors group cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <IconStar size={13} className="text-amber-500 fill-amber-400 shrink-0" />
                          <span className="truncate font-medium">{v.name}</span>
                        </div>
                        <span className="text-[10px] font-mono font-semibold text-emerald-600 bg-[#E3FCEF] px-1 rounded">
                          {v.progress}%
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Section: VESSELS & ENGINEERING */}
              <div>
                <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#626F86]">
                  <span>Vessels &amp; Engineering</span>
                  <span className="text-[10px] bg-[#EBECF0] px-1.5 py-0.2 rounded text-[#172B4D] font-mono font-semibold">
                    {projects.length}
                  </span>
                </div>

                {filteredProjects.length === 0 ? (
                  <span className="pm-submenu-empty block px-2.5 py-2 text-[11px] text-gray-400 italic">
                    No vessels found
                  </span>
                ) : (
                  <div className="space-y-1 mt-0.5">
                    {filteredProjects.map((v) => {
                      const isCurrent = currentProject?.id === v.id;
                      const isExpanded = expandedVessels.has(v.id);

                      // Badge styles
                      const isDone = v.progress === 100;
                      const isHigh = v.progress >= 95;
                      const isCritical = v.progress < 30 || v.overdue >= 7;

                      return (
                        <div
                          key={v.id}
                          className={`pm-vessel-group rounded transition-all ${
                            isExpanded ? 'bg-white border border-[#DFE1E6] shadow-2xs overflow-hidden' : ''
                          }`}
                        >
                          <button
                            type="button"
                            className={`pm-menu-item parent w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors text-left cursor-pointer group ${
                              isExpanded
                                ? 'text-[#0052CC] font-semibold bg-[#E9F2FF] border-l-2 border-[#0052CC]'
                                : isCurrent
                                ? 'bg-[#F4F5F7] font-semibold text-[#172B4D]'
                                : 'text-[#172B4D] hover:bg-[#EBECF0]'
                            }`}
                            onClick={() => toggleVessel(v.id)}
                            disabled={switching === v.id}
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              {isExpanded ? (
                                <IconChevronDown size={13} className="text-[#0052CC] shrink-0" />
                              ) : (
                                <IconChevronRight size={13} className="text-[#626F86] group-hover:text-[#172B4D] shrink-0" />
                              )}
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isDone || isHigh
                                    ? 'bg-emerald-500'
                                    : isCritical
                                    ? 'bg-rose-500'
                                    : 'bg-blue-600'
                                }`}
                              ></span>
                              <span className="truncate">Vessel {v.ship_id || v.name}</span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {v.overdue > 0 && (
                                <span className="text-[9px] font-semibold text-rose-600 bg-amber-50 px-1 rounded border border-amber-200">
                                  {v.overdue} due
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-mono font-semibold px-1 rounded ${
                                  isDone || isHigh
                                    ? 'text-emerald-600 bg-[#E3FCEF]'
                                    : isCritical
                                    ? 'text-rose-600 bg-amber-50'
                                    : 'text-blue-600 bg-blue-50'
                                }`}
                              >
                                {v.progress}%
                              </span>
                            </div>
                          </button>

                          {/* Submenu when vessel is expanded */}
                          {isExpanded && (
                            <div className="pm-submenu py-1.5 bg-[#FAFBFC] border-t border-[#EBECF0] text-[11px] space-y-1">
                              {/* Level 2: Tasks Folder */}
                              <button
                                type="button"
                                className="pm-menu-item sub w-full flex items-center justify-between px-2.5 py-1 text-[#172B4D] hover:bg-[#EBECF0] rounded font-semibold text-left transition-colors cursor-pointer group"
                                onClick={() => onClickTask(v)}
                                disabled={switching === v.id}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <IconChevronDown size={12} className="text-[#626F86]" />
                                  <IconTask size={14} className="text-[#0052CC] shrink-0" />
                                  <span className="truncate text-xs">
                                    {switching === v.id ? 'Switching…' : 'Tasks'}
                                  </span>
                                </div>
                                <span className="text-[9px] font-mono font-semibold text-[#626F86] bg-[#EBECF0] px-1 rounded">
                                  {sections.length}
                                </span>
                              </button>

                              {/* Level 3: Sections & Deliverables */}
                              {isCurrent && taskOpen && (
                                <div className="pm-submenu pm-submenu-nested pl-6 pr-2 space-y-0.5 border-l-2 border-[#DFE1E6] ml-3.5 mt-0.5">
                                  {sections.length === 0 ? (
                                    <span className="pm-submenu-empty block py-1 text-[10px] text-gray-400 italic">
                                      No sections
                                    </span>
                                  ) : (
                                    sections.map((s) => (
                                      <NavLink
                                        key={s.id}
                                        to={`/sections/${s.id}`}
                                        className={({ isActive }) =>
                                          `pm-menu-item sub2 flex items-center justify-between px-2 py-1 rounded transition-colors text-left ${
                                            isActive
                                              ? 'bg-[#E9F2FF] text-[#0052CC] font-semibold'
                                              : 'text-[#172B4D] hover:bg-[#EBECF0]'
                                          }`
                                        }
                                      >
                                        <span className="truncate font-medium">
                                          {displaySectionName(s.header_name)}
                                        </span>
                                        <span
                                          className={`text-[9px] font-mono font-semibold px-1 rounded ${
                                            s.progress === 100
                                              ? 'text-emerald-600 bg-[#E3FCEF]'
                                              : s.progress === null
                                              ? 'text-gray-400 bg-[#EBECF0]'
                                              : s.progress < 50
                                              ? 'text-amber-600 bg-amber-50'
                                              : 'text-blue-600 bg-blue-50'
                                          }`}
                                        >
                                          {s.progress !== null ? `${s.progress}%` : '—'}
                                        </span>
                                      </NavLink>
                                    ))
                                  )}
                                </div>
                              )}

                              {/* Summary Button */}
                              <button
                                type="button"
                                className="pm-menu-item sub w-full flex items-center justify-between px-2.5 py-1 text-[#172B4D] hover:bg-[#EBECF0] rounded font-semibold transition-colors cursor-pointer text-left"
                                onClick={() => onClickSummary(v)}
                                disabled={switching === v.id}
                              >
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="w-3 h-3"></span>
                                  <IconSummary size={14} className="text-[#00875A] shrink-0" />
                                  <span className="truncate text-xs">Summary</span>
                                </div>
                                <span className="text-[9px] font-mono font-semibold text-emerald-600 bg-[#E3FCEF] px-1.5 py-0.2 rounded border border-[#ABF5D1]">
                                  {v.progress}%
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Section: MANAGEMENT */}
              <div>
                <div className="pm-menu-section-label px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#626F86]">
                  Management
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {caps.showReviewRequests && (
                    <NavLink
                      to="/reviews"
                      className={({ isActive }) =>
                        `pm-menu-item flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                          isActive
                            ? 'bg-[#E9F2FF] text-[#0052CC] font-semibold'
                            : 'text-[#172B4D] hover:bg-[#EBECF0]'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <IconReview size={16} className="text-[#626F86] shrink-0" />
                        <span className="truncate font-medium">Review Requests</span>
                      </div>
                      <span className="text-[10px] font-semibold bg-amber-500 text-slate-900 px-1.5 py-0.2 rounded-full font-mono">
                        16
                      </span>
                    </NavLink>
                  )}

                  {caps.showCalendar && (
                    <NavLink
                      to="/calendar"
                      className={({ isActive }) =>
                        `pm-menu-item flex items-center gap-2.5 px-2.5 py-1.5 rounded transition-colors ${
                          isActive
                            ? 'bg-[#E9F2FF] text-[#0052CC] font-semibold'
                            : 'text-[#172B4D] hover:bg-[#EBECF0]'
                        }`
                      }
                    >
                      <IconCalendar size={16} className="text-[#626F86] shrink-0" />
                      <span className="truncate font-medium">Near-term Gantt</span>
                    </NavLink>
                  )}

                  {caps.showTeamDirectory && (
                    <NavLink
                      to="/users"
                      className={({ isActive }) =>
                        `pm-menu-item flex items-center gap-2.5 px-2.5 py-1.5 rounded transition-colors ${
                          isActive
                            ? 'bg-[#E9F2FF] text-[#0052CC] font-semibold'
                            : 'text-[#172B4D] hover:bg-[#EBECF0]'
                        }`
                      }
                    >
                      <IconUsers size={16} className="text-[#626F86] shrink-0" />
                      <span className="truncate font-medium">Team Members</span>
                    </NavLink>
                  )}

                  {caps.showReports && (
                    <NavLink
                      to="/reports"
                      className={({ isActive }) =>
                        `pm-menu-item flex items-center gap-2.5 px-2.5 py-1.5 rounded transition-colors ${
                          isActive
                            ? 'bg-[#E9F2FF] text-[#0052CC] font-semibold'
                            : 'text-[#172B4D] hover:bg-[#EBECF0]'
                        }`
                      }
                    >
                      <IconReport size={16} className="text-[#626F86] shrink-0" />
                      <span className="truncate font-medium">Reports</span>
                    </NavLink>
                  )}

                  {caps.showPlanDrawing && (
                    <NavLink
                      to="/plan-drawing"
                      className={({ isActive }) =>
                        `pm-menu-item flex items-center gap-2.5 px-2.5 py-1.5 rounded transition-colors ${
                          isActive
                            ? 'bg-[#E9F2FF] text-[#0052CC] font-semibold'
                            : 'text-[#172B4D] hover:bg-[#EBECF0]'
                        }`
                      }
                    >
                      <IconDrawing size={16} className="text-[#626F86] shrink-0" />
                      <span className="truncate font-medium">Plan Drawing</span>
                    </NavLink>
                  )}
                </div>
              </div>
            </nav>

            {/* Bottom Status & Collapse Toggle */}
            <div className="p-3 border-t border-[#EBECF0] flex flex-col gap-2 text-[#626F86] bg-[#FAFBFC]">
              <div className="flex items-center justify-between text-[11px]">
                <div className="truncate leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                    <p className="font-semibold text-[#172B4D] truncate">VARD System v2.4</p>
                  </div>
                  <span className="text-[10px] text-[#626F86]">All services operational</span>
                </div>
                <span className="text-[9px] font-mono bg-[#EBECF0] px-1 py-0.5 rounded text-[#626F86]">
                  LIVE
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-[#EBECF0] hover:text-[#172B4D] text-[#626F86] text-[11px] font-medium transition-colors cursor-pointer"
                title="Collapse sidebar ([)"
              >
                <div className="flex items-center gap-1.5">
                  <IconChevronRight size={13} className="rotate-180" />
                  <span>Collapse sidebar</span>
                </div>
                <kbd className="text-[9px] font-mono text-[#626F86] bg-white border border-[#DFE1E6] px-1 py-0.2 rounded">
                  [
                </kbd>
              </button>
            </div>
          </>
        )}

        {/* Collapsed State Bar */}
        {isSidebarCollapsed && (
          <div className="h-full flex flex-col items-center py-3 justify-between">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(false)}
              className="p-2 text-[#0052CC] hover:bg-[#EBECF0] rounded cursor-pointer"
              title="Expand sidebar"
            >
              <IconChevronRight size={18} />
            </button>
            <div className="flex flex-col gap-3">
              <NavLink to="/dashboard" className="p-2 rounded text-gray-500 hover:text-[#0052CC]">
                <IconDashboard size={18} />
              </NavLink>
              <NavLink to="/excel" className="p-2 rounded text-gray-500 hover:text-[#00875A]">
                <IconSpreadsheet size={18} />
              </NavLink>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          </div>
        )}
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="pm-main flex-1 flex flex-col h-screen overflow-hidden">
        {/* TOPBAR HEADER */}
        <header
          className="pm-header h-14 bg-white border-b border-[#DFE1E6] px-4 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs z-20"
        >
          <div className="pm-header-left flex items-center gap-2 sm:gap-4">
            {isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-1.5 text-gray-500 hover:text-black rounded hover:bg-gray-100 cursor-pointer sm:hidden"
              >
                <IconChevronRight size={16} />
              </button>
            )}

            {/* Ship Indicator Pill */}
            <div className="pm-ship-indicator inline-flex items-center gap-2 bg-[#FAFBFC] border border-[#DFE1E6] px-2.5 py-1 rounded text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <IconVessel size={14} className="text-[#0052CC]" />
              <span className="ship-id font-bold text-[#172B4D]">Vessel {ship}</span>
              <span className="text-gray-300">•</span>
              <span className="dept-tag text-[#626F86] font-medium">{dept}</span>
            </div>

            <div className="h-4 w-[1px] bg-[#DFE1E6] hidden sm:block"></div>

            <div className="pm-header-title hidden md:block">
              <h1 className="text-sm font-bold text-[#172B4D] tracking-tight leading-none">
                Progress Management
              </h1>
              <span className="subtitle text-[11px] font-medium text-[#626F86] leading-none">
                Pipe and Machinery Manager
              </span>
            </div>
          </div>

          <div className="pm-header-actions flex items-center gap-2">
            <div className="pm-action-group flex items-center gap-1.5">
              {caps.canCreateProject && (
                <button
                  type="button"
                  className="pm-btn primary inline-flex items-center gap-1.5 bg-[#0052CC] hover:bg-[#0747A6] text-white px-3 py-1.5 rounded font-medium text-xs shadow-2xs transition-colors cursor-pointer"
                  onClick={() => setShowNew(true)}
                  title="Create new vessel project"
                >
                  <IconPlus size={14} />
                  <span>New Vessel</span>
                </button>
              )}

              {/* ExcelToolbar Integration */}
              <ExcelToolbar />
            </div>

            {caps.canDeleteProject && currentProject?.id ? (
              <button
                type="button"
                className="pm-btn danger inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#DE350B] bg-white hover:bg-[#FFEBE6] border border-[#DFE1E6] hover:border-red-300 rounded transition-colors cursor-pointer"
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
              className="pm-btn ghost inline-flex items-center justify-center text-[#626F86] hover:text-[#DE350B] hover:bg-[#F4F5F7] w-7 h-7 rounded text-xs transition-colors cursor-pointer"
              onClick={async () => {
                await signOut();
                navigate('/dashboard');
              }}
              title="Sign out of system"
            >
              <IconLogOut size={15} />
            </button>
          </div>
        </header>

        {/* OUTLET VIEW CONTAINER */}
        <div className="pm-content flex-1 overflow-hidden flex flex-col">
          <Outlet />
        </div>
      </div>

      {/* MODALS */}
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </div>
  );
}
