import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { computeWeightedProgress, statusFromPercent } from '../lib/progress'
import {
  DonutRing,
  MultiVesselComparisonBar,
  MultiVesselStatusStackedBar,
  GroupBenchmarkChart,
} from '../components/Charts'
import {
  IconDashboard,
  IconSummary,
  IconTable,
  IconTarget,
  IconCompare,
  IconRefresh,
  IconSearch,
  IconVessel,
  IconArrowRight,
} from '../components/Icons'
import { useNotification } from '../components/NotificationContext'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null
  const d = Math.round((new Date(endIso) - new Date(startIso)) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

export function DashboardPage() {
  const { caps } = useAuth()
  const { projects: contextProjects, selectProject } = useProject()
  const navigate = useNavigate()
  const { toast } = useNotification()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [vesselDataList, setVesselDataList] = useState([])

  // Controls & Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL') // ALL | IN_PROGRESS | COMPLETED | ATTENTION
  const [sortBy, setSortBy] = useState('PROGRESS_DESC') // PROGRESS_DESC | PROGRESS_ASC | TASKS_DESC | SHIP_ID | DEADLINE
  const [viewMode, setViewMode] = useState('overview') // overview | matrix | benchmark | compare

  // Side-by-side comparison selection (IDs of vessels to compare)
  const [selectedForCompare, setSelectedForCompare] = useState([])

  const loadAllVesselsData = useCallback(async () => {
    try {
      setError('')
      const { data: projects, error: pErr } = await supabase
        .from('projects')
        .select('id, name, ship_id, department, status, start_date, end_date, created_at, ship_leader_id, owner_id, group_weights')
        .order('created_at', { ascending: false })

      if (pErr) throw pErr
      if (!projects || projects.length === 0) {
        setVesselDataList([])
        setLoading(false)
        return
      }

      const { data: sections, error: sErr } = await supabase
        .from('sections')
        .select('id, header_name, sort_order, project_id')
        .order('sort_order', { ascending: true })

      if (sErr) throw sErr

      const { data: tasks, error: tErr } = await supabase
        .from('tasks')
        .select('id, project_id, section_id, percent_complete, status, start_date, finish_date, late_date, pending_review, activity, zone, drawing_id')

      if (tErr) throw tErr

      const today = todayIso()
      const sectionsByProject = new Map()
      ;(sections || []).forEach((s) => {
        if (!sectionsByProject.has(s.project_id)) sectionsByProject.set(s.project_id, [])
        sectionsByProject.get(s.project_id).push(s)
      })

      const tasksByProject = new Map()
      ;(tasks || []).forEach((t) => {
        if (!tasksByProject.has(t.project_id)) tasksByProject.set(t.project_id, [])
        tasksByProject.get(t.project_id).push(t)
      })

      const processed = projects.map((p) => {
        const pSections = sectionsByProject.get(p.id) || []
        const pTasks = tasksByProject.get(p.id) || []

        const sectionsWithTasks = pSections.map((s) => ({
          header_name: s.header_name,
          tasks: pTasks.filter((t) => t.section_id === s.id),
        }))

        const stats = computeWeightedProgress(sectionsWithTasks, p.group_weights)

        const statusCounts = { 'Not Started': 0, 'In Progress': 0, Completed: 0, 'On Hold': 0 }
        let pendingReviewCount = 0
        let overdueCount = 0

        pTasks.forEach((t) => {
          // Đồng bộ với rule % ↔ status (On Hold giữ nguyên)
          const st =
            t.status === 'On Hold' ? 'On Hold' : statusFromPercent(t.percent_complete)
          statusCounts[st] = (statusCounts[st] || 0) + 1
          if (t.pending_review) pendingReviewCount += 1

          const deadline = t.late_date || t.finish_date
          if (deadline && deadline < today && Number(t.percent_complete) < 100 && st !== 'Completed') {
            overdueCount += 1
          }
        })

        const findGroupPercent = (name) => {
          const g = (stats.groups || []).find((grp) => grp.name.toLowerCase().includes(name.toLowerCase()))
          return g ? g.avgPercent : 0
        }

        const group3D = findGroupPercent('3D')
        const groupISO = findGroupPercent('Iso')
        const group2D = findGroupPercent('2D')
        const groupMTO = findGroupPercent('MTO')

        const allStarts = pTasks.map((t) => t.start_date).filter(Boolean).sort()
        const allFinishes = pTasks.map((t) => t.finish_date).filter(Boolean).sort()
        const calcStart = p.start_date || allStarts[0] || null
        const calcEnd = p.end_date || allFinishes[allFinishes.length - 1] || null
        const durationDays = daysBetween(calcStart, calcEnd)

        return {
          id: p.id,
          name: p.name,
          ship_id: p.ship_id || p.name,
          department: p.department || 'Piping',
          status: p.status || (stats.overallProgress >= 100 ? 'Completed' : 'In Progress'),
          overallProgress: stats.overallProgress ?? 0,
          totalTasks: stats.totalTasks ?? pTasks.length,
          sectionCount: pSections.length,
          group3D,
          groupISO,
          group2D,
          groupMTO,
          groups: stats.groups || [],
          sectionStats: stats.sectionStats || [],
          statusCounts,
          pendingReviewCount,
          overdueCount,
          startDate: calcStart,
          endDate: calcEnd,
          durationDays,
          rawProject: p,
        }
      })

      setVesselDataList(processed)
    } catch (err) {
      setError(err.message || 'Error loading fleet data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (caps.showDashboard) {
      loadAllVesselsData()
    }
  }, [caps.showDashboard, contextProjects.length, loadAllVesselsData])

  async function handleRefresh() {
    setRefreshing(true)
    await loadAllVesselsData()
  }

  async function handleNavigateToVessel(vessel) {
    if (vessel?.rawProject) {
      await selectProject(vessel.rawProject)
    }
    navigate('/summary')
  }

  // --- Fleet KPI Rollup Aggregations ---
  const fleetRollup = useMemo(() => {
    const totalVessels = vesselDataList.length
    if (totalVessels === 0) {
      return {
        totalVessels: 0,
        activeVessels: 0,
        completedVessels: 0,
        attentionVessels: 0,
        avgProgress: 0,
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        totalPendingReview: 0,
        totalOverdue: 0,
        fleet3D: 0,
        fleetISO: 0,
        fleet2D: 0,
        fleetMTO: 0,
      }
    }

    let sumProgress = 0
    let totalTasks = 0
    let completedTasks = 0
    let inProgressTasks = 0
    let totalPendingReview = 0
    let totalOverdue = 0
    let completedVessels = 0
    let attentionVessels = 0

    let sum3D = 0
    let sumISO = 0
    let sum2D = 0
    let sumMTO = 0

    vesselDataList.forEach((v) => {
      sumProgress += v.overallProgress
      totalTasks += v.totalTasks
      completedTasks += v.statusCounts?.Completed || 0
      inProgressTasks += v.statusCounts?.['In Progress'] || 0
      totalPendingReview += v.pendingReviewCount
      totalOverdue += v.overdueCount
      if (v.overallProgress >= 100 || v.status === 'Completed') completedVessels += 1
      if (v.overdueCount > 0 || v.pendingReviewCount > 0) attentionVessels += 1

      sum3D += v.group3D
      sumISO += v.groupISO
      sum2D += v.group2D
      sumMTO += v.groupMTO
    })

    const avgProgress = Math.round(sumProgress / totalVessels)
    const activeVessels = totalVessels - completedVessels

    return {
      totalVessels,
      activeVessels,
      completedVessels,
      attentionVessels,
      avgProgress,
      totalTasks,
      completedTasks,
      inProgressTasks,
      totalPendingReview,
      totalOverdue,
      fleet3D: Math.round(sum3D / totalVessels),
      fleetISO: Math.round(sumISO / totalVessels),
      fleet2D: Math.round(sum2D / totalVessels),
      fleetMTO: Math.round(sumMTO / totalVessels),
    }
  }, [vesselDataList])

  // --- Filtering & Sorting ---
  const filteredAndSortedVessels = useMemo(() => {
    let list = [...vesselDataList]

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      list = list.filter(
        (v) =>
          v.ship_id.toLowerCase().includes(q) ||
          v.name.toLowerCase().includes(q) ||
          v.department.toLowerCase().includes(q)
      )
    }

    if (statusFilter === 'IN_PROGRESS') {
      list = list.filter((v) => v.overallProgress < 100 && v.status !== 'Completed')
    } else if (statusFilter === 'COMPLETED') {
      list = list.filter((v) => v.overallProgress >= 100 || v.status === 'Completed')
    } else if (statusFilter === 'ATTENTION') {
      list = list.filter((v) => v.overdueCount > 0 || v.pendingReviewCount > 0)
    }

    list.sort((a, b) => {
      if (sortBy === 'PROGRESS_DESC') return b.overallProgress - a.overallProgress
      if (sortBy === 'PROGRESS_ASC') return a.overallProgress - b.overallProgress
      if (sortBy === 'TASKS_DESC') return b.totalTasks - a.totalTasks
      if (sortBy === 'SHIP_ID') return a.ship_id.localeCompare(b.ship_id)
      if (sortBy === 'DEADLINE') {
        if (!a.endDate) return 1
        if (!b.endDate) return -1
        return a.endDate.localeCompare(b.endDate)
      }
      return 0
    })

    return list
  }, [vesselDataList, searchTerm, statusFilter, sortBy])

  function toggleCompareSelection(id) {
    if (!selectedForCompare.includes(id) && selectedForCompare.length >= 4) {
      toast.warning('Compare limit', 'Select up to 4 vessels to compare side-by-side.')
      return
    }
    setSelectedForCompare((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const comparedVessels = useMemo(() => {
    return vesselDataList.filter((v) => selectedForCompare.includes(v.id))
  }, [vesselDataList, selectedForCompare])

  if (!caps.showDashboard) {
    return (
      <div className="pm-panel">
        <h2>Fleet Dashboard</h2>
        <p className="muted">Your current access level does not include executive fleet overview.</p>
        <Link to="/summary" className="pm-btn primary" style={{ marginTop: '12px' }}>
          Go to Vessel Summary →
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="pm-panel" style={{ textAlign: 'center', padding: '40px' }}>
        <p className="muted">Aggregating fleet progress and engineering metrics…</p>
      </div>
    )
  }

  return (
    <div className="stack dash-container">
      {/* 1. Header Banner & Top Toolbar */}
      <div className="dash-hero">
        <div className="dash-hero-info">
          <div className="dash-hero-badge">
            <span className="live-dot" />
            Executive Fleet Overview
          </div>
          <h2>Fleet Engineering Dashboard</h2>
        </div>

        <div className="dash-hero-actions">
          <button
            type="button"
            className="pm-btn secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Reload live metrics from database"
          >
            <IconRefresh size={14} />
            <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {/* 2. Fleet Executive KPI Rollup */}
      <div className="fleet-kpi-grid">
        <div className="fleet-kpi-card">
          <div className="fleet-kpi-header">
            <span className="fleet-kpi-title">Active Vessels</span>
            <IconVessel size={18} className="muted" />
          </div>
          <div className="fleet-kpi-val">{fleetRollup.totalVessels}</div>
          <div className="fleet-kpi-sub">
            <span className="pill ok">{fleetRollup.activeVessels} In Progress</span>
            <span className="pill muted-pill">{fleetRollup.completedVessels} Completed</span>
          </div>
        </div>

        <div className="fleet-kpi-card">
          <div className="fleet-kpi-header">
            <span className="fleet-kpi-title">Average Progress</span>
            <IconDashboard size={18} className="muted" />
          </div>
          <div className="fleet-kpi-val-row">
            <span className="fleet-kpi-val">{fleetRollup.avgProgress}%</span>
            <DonutRing percent={fleetRollup.avgProgress} size={42} stroke={5} color="#059669" />
          </div>
          <div className="fleet-kpi-sub">
            <span>3D: <strong>{fleetRollup.fleet3D}%</strong> · ISO: <strong>{fleetRollup.fleetISO}%</strong></span>
          </div>
        </div>

        <div className="fleet-kpi-card">
          <div className="fleet-kpi-header">
            <span className="fleet-kpi-title">Engineering Workload</span>
            <IconSummary size={18} className="muted" />
          </div>
          <div className="fleet-kpi-val">
            {fleetRollup.totalTasks} <span className="unit">tasks</span>
          </div>
          <div className="fleet-kpi-sub">
            <span>Done: <strong>{fleetRollup.completedTasks}</strong> ({fleetRollup.totalTasks ? Math.round((fleetRollup.completedTasks / fleetRollup.totalTasks) * 100) : 0}%)</span>
          </div>
        </div>

        <div className="fleet-kpi-card">
          <div className="fleet-kpi-header">
            <span className="fleet-kpi-title">Review & Overdue Queue</span>
            <IconTarget size={18} className="muted" />
          </div>
          <div className="fleet-kpi-val">
            {fleetRollup.totalPendingReview} <span className="unit">pending</span>
          </div>
          <div className="fleet-kpi-sub">
            {fleetRollup.totalOverdue > 0 ? (
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>⚠️ {fleetRollup.totalOverdue} overdue</span>
            ) : (
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>✓ All on schedule</span>
            )}
          </div>
        </div>
      </div>

      {vesselDataList.length === 0 ? (
        <div className="pm-panel" style={{ textAlign: 'center', padding: '40px' }}>
          <IconVessel size={36} className="muted" />
          <h3 style={{ marginTop: '12px' }}>No Vessels in System</h3>
          <p className="muted">Create a new vessel project to begin tracking engineering milestones.</p>
        </div>
      ) : (
        <>
          {/* 3. Control & Filter Toolbar */}
          <div className="dash-controls-bar">
            <div className="dash-view-tabs">
              <button
                type="button"
                className={`dash-tab-btn ${viewMode === 'overview' ? 'active' : ''}`}
                onClick={() => setViewMode('overview')}
              >
                <IconSummary size={14} />
                <span>Overview & Rank</span>
              </button>
              <button
                type="button"
                className={`dash-tab-btn ${viewMode === 'matrix' ? 'active' : ''}`}
                onClick={() => setViewMode('matrix')}
              >
                <IconTable size={14} />
                <span>Fleet Matrix</span>
              </button>
              <button
                type="button"
                className={`dash-tab-btn ${viewMode === 'benchmark' ? 'active' : ''}`}
                onClick={() => setViewMode('benchmark')}
              >
                <IconTarget size={14} />
                <span>Technical Benchmark</span>
              </button>
              <button
                type="button"
                className={`dash-tab-btn ${viewMode === 'compare' ? 'active' : ''}`}
                onClick={() => setViewMode('compare')}
              >
                <IconCompare size={14} />
                <span>Compare ({selectedForCompare.length})</span>
              </button>
            </div>

            <div className="dash-filters-group">
              <div className="dash-search-wrap">
                <IconSearch size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search ship ID, name…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="dash-search-input"
                />
              </div>

              <div className="dash-status-pills">
                <button
                  type="button"
                  className={`pill-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ALL')}
                >
                  All ({vesselDataList.length})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${statusFilter === 'IN_PROGRESS' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('IN_PROGRESS')}
                >
                  Active ({fleetRollup.activeVessels})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('COMPLETED')}
                >
                  Done ({fleetRollup.completedVessels})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${statusFilter === 'ATTENTION' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ATTENTION')}
                >
                  Attention ({fleetRollup.attentionVessels})
                </button>
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ height: '30px', fontSize: '12px' }}
              >
                <option value="PROGRESS_DESC">Progress: High → Low</option>
                <option value="PROGRESS_ASC">Progress: Low → High</option>
                <option value="TASKS_DESC">Workload: Most Tasks</option>
                <option value="SHIP_ID">Vessel Name / ID</option>
                <option value="DEADLINE">Earliest Deadline</option>
              </select>
            </div>
          </div>

          {/* 4. VIEW MODE: OVERVIEW & RANKING */}
          {viewMode === 'overview' && (
            <div className="dash-main-grid">
              <div className="dash-panel-card">
                <div className="dash-card-head">
                  <div>
                    <h3>Vessel Progress Rankings</h3>
                  </div>
                  <span className="pill muted-pill">{filteredAndSortedVessels.length} vessels</span>
                </div>

                <MultiVesselComparisonBar
                  vessels={filteredAndSortedVessels}
                  onSelectVessel={handleNavigateToVessel}
                />
              </div>

              <div className="dash-panel-card">
                <div className="dash-card-head">
                  <div>
                    <h3>Status Breakdown by Vessel</h3>
                  </div>
                </div>

                <MultiVesselStatusStackedBar vessels={filteredAndSortedVessels} />
              </div>

              <div className="dash-card-wide-wrap">
                <div className="dash-card-head">
                  <h3>Vessel Directory & Quick Actions</h3>
                </div>

                <div className="vessel-cards-grid">
                  {filteredAndSortedVessels.map((v) => {
                    const isSelected = selectedForCompare.includes(v.id)
                    return (
                      <div key={v.id} className="vessel-executive-card">
                        <div className="v-card-top">
                          <div className="v-card-title">
                            <span className="v-dept-badge">{v.department}</span>
                            <h4>Vessel {v.ship_id}</h4>
                          </div>

                          <button
                            type="button"
                            className={`pm-btn tiny ${isSelected ? 'primary' : 'ghost'}`}
                            onClick={() => toggleCompareSelection(v.id)}
                            title={isSelected ? 'Remove from comparator' : 'Add to side-by-side comparison'}
                          >
                            {isSelected ? '✓ Selected' : '+ Compare'}
                          </button>
                        </div>

                        <div className="v-card-body">
                          <div className="v-gauge-wrap">
                            <DonutRing percent={v.overallProgress} size={78} stroke={9} />
                            <div className="v-gauge-sub">
                              <strong>{v.totalTasks}</strong> tasks
                            </div>
                          </div>

                          <div className="v-groups-mini-list">
                            <div className="v-mini-row">
                              <span>3D Pipe (65%)</span>
                              <div className="v-mini-bar-track">
                                <div className="v-mini-bar-fill c-3d" style={{ width: `${v.group3D}%` }} />
                              </div>
                              <strong>{v.group3D}%</strong>
                            </div>

                            <div className="v-mini-row">
                              <span>ISO Gen (15%)</span>
                              <div className="v-mini-bar-track">
                                <div className="v-mini-bar-fill c-iso" style={{ width: `${v.groupISO}%` }} />
                              </div>
                              <strong>{v.groupISO}%</strong>
                            </div>

                            <div className="v-mini-row">
                              <span>2D Plan (10%)</span>
                              <div className="v-mini-bar-track">
                                <div className="v-mini-bar-fill c-2d" style={{ width: `${v.group2D}%` }} />
                              </div>
                              <strong>{v.group2D}%</strong>
                            </div>

                            <div className="v-mini-row">
                              <span>MTO (10%)</span>
                              <div className="v-mini-bar-track">
                                <div className="v-mini-bar-fill c-mto" style={{ width: `${v.groupMTO}%` }} />
                              </div>
                              <strong>{v.groupMTO}%</strong>
                            </div>
                          </div>
                        </div>

                        <div className="v-card-footer">
                          <span className="muted">
                            {v.startDate && v.endDate ? `${v.startDate} → ${v.endDate}` : 'Dates not set'}
                          </span>

                          <button
                            type="button"
                            className="pm-btn tiny secondary"
                            onClick={() => handleNavigateToVessel(v)}
                          >
                            <span>Open Vessel</span>
                            <IconArrowRight size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 5. VIEW MODE: COMPARATIVE MATRIX TABLE */}
          {viewMode === 'matrix' && (
            <div className="dash-panel-card">
              <div className="dash-card-head">
                <div>
                  <h3>Fleet Cross-Vessel Engineering Matrix</h3>
                </div>
                <span className="pill muted-pill">
                  Showing {filteredAndSortedVessels.length} / {vesselDataList.length} vessels
                </span>
              </div>

              <div className="pm-table-wrap">
                <table className="pm-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Comp</th>
                      <th>Vessel / ID</th>
                      <th>Dept</th>
                      <th>Overall Progress</th>
                      <th>3D (65%)</th>
                      <th>ISO (15%)</th>
                      <th>2D (10%)</th>
                      <th>MTO (10%)</th>
                      <th>Tasks</th>
                      <th>Done</th>
                      <th>Pending</th>
                      <th>Overdue</th>
                      <th>Schedule</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedVessels.map((v) => {
                      const isSelected = selectedForCompare.includes(v.id)
                      return (
                        <tr key={v.id} className={isSelected ? 'row-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              className="pm-checkbox-circle"
                              checked={isSelected}
                              onChange={() => toggleCompareSelection(v.id)}
                            />
                          </td>
                          <td>
                            <strong>{v.ship_id}</strong>
                          </td>
                          <td>
                            <span className="v-dept-badge">{v.department}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                              <div style={{ width: '80px', height: '6px', background: 'var(--bg-deep)', borderRadius: '999px', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${v.overallProgress}%`,
                                    height: '100%',
                                    background: v.overallProgress >= 100 ? 'var(--success)' : 'var(--primary)',
                                    borderRadius: '999px',
                                  }}
                                />
                              </div>
                              <strong>{v.overallProgress}%</strong>
                            </div>
                          </td>
                          <td>{v.group3D}%</td>
                          <td>{v.groupISO}%</td>
                          <td>{v.group2D}%</td>
                          <td>{v.groupMTO}%</td>
                          <td><strong>{v.totalTasks}</strong></td>
                          <td style={{ color: 'var(--success)', fontWeight: 600 }}>{v.statusCounts?.Completed || 0}</td>
                          <td>
                            {v.pendingReviewCount > 0 ? (
                              <span className="status-chip doing">{v.pendingReviewCount}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td>
                            {v.overdueCount > 0 ? (
                              <span className="status-chip on-hold">⚠️ {v.overdueCount}</span>
                            ) : (
                              <span className="muted">0</span>
                            )}
                          </td>
                          <td className="muted">
                            {v.startDate && v.endDate ? `${v.startDate} → ${v.endDate}` : '—'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="pm-btn tiny secondary"
                              onClick={() => handleNavigateToVessel(v)}
                            >
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. VIEW MODE: GROUP BENCHMARKING */}
          {viewMode === 'benchmark' && (
            <div className="dash-panel-card">
              <div className="dash-card-head">
                <div>
                  <h3>Technical Group Benchmarking</h3>
                </div>
              </div>

              <GroupBenchmarkChart vessels={filteredAndSortedVessels} />
            </div>
          )}

          {/* 7. VIEW MODE: SIDE-BY-SIDE DIFF COMPARATOR */}
          {viewMode === 'compare' && (
            <div className="dash-panel-card">
              <div className="dash-card-head">
                <div>
                  <h3>Side-by-Side Vessel Comparator</h3>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span className="muted" style={{ fontSize: '11.5px' }}>Toggle:</span>
                  {vesselDataList.map((v) => {
                    const isSel = selectedForCompare.includes(v.id)
                    return (
                      <button
                        key={v.id}
                        type="button"
                        className={`pm-btn tiny ${isSel ? 'primary' : 'ghost'}`}
                        onClick={() => toggleCompareSelection(v.id)}
                      >
                        {isSel ? '✓ ' : '+ '} {v.ship_id}
                      </button>
                    )
                  })}
                </div>
              </div>

              {comparedVessels.length < 2 ? (
                <div className="pm-panel" style={{ textAlign: 'center', padding: '40px' }}>
                  <IconCompare size={32} className="muted" />
                  <h4 style={{ marginTop: '12px' }}>Select at least 2 vessels</h4>
                  <p className="muted">
                    Click '+ Compare' above or on any vessel card to view direct comparisons.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${comparedVessels.length}, 1fr)`, gap: '16px', marginTop: '12px' }}>
                  {comparedVessels.map((v) => (
                    <div key={v.id} className="pm-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <span className="v-dept-badge">{v.department}</span>
                        <h4 style={{ margin: '4px 0 10px' }}>Vessel {v.ship_id}</h4>
                        <DonutRing percent={v.overallProgress} size={96} stroke={10} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="muted">Total Tasks</span>
                          <strong>{v.totalTasks}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="muted">Completed</span>
                          <strong style={{ color: 'var(--success)' }}>
                            {v.statusCounts?.Completed || 0} ({v.totalTasks ? Math.round(((v.statusCounts?.Completed || 0) / v.totalTasks) * 100) : 0}%)
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="muted">In Progress</span>
                          <strong style={{ color: 'var(--warning)' }}>{v.statusCounts?.['In Progress'] || 0}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span className="muted">Overdue</span>
                          <strong style={{ color: v.overdueCount > 0 ? 'var(--danger)' : 'var(--success)' }}>
                            {v.overdueCount > 0 ? `⚠️ ${v.overdueCount}` : '0'}
                          </strong>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="pm-btn secondary"
                        onClick={() => handleNavigateToVessel(v)}
                        style={{ marginTop: 'auto' }}
                      >
                        <span>Open Vessel {v.ship_id}</span>
                        <IconArrowRight size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
