import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { computeWeightedProgress } from '../lib/progress'
import {
  DonutRing,
  MultiVesselComparisonBar,
  MultiVesselStatusStackedBar,
  GroupBenchmarkChart,
} from '../components/Charts'

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
      // 1. Fetch all projects/vessels
      const { data: projects, error: pErr } = await supabase
        .from('projects')
        .select('id, name, ship_id, department, status, start_date, end_date, created_at, ship_leader_id, owner_id')
        .order('created_at', { ascending: false })

      if (pErr) throw pErr
      if (!projects || projects.length === 0) {
        setVesselDataList([])
        setLoading(false)
        return
      }

      // 2. Fetch all sections
      const { data: sections, error: sErr } = await supabase
        .from('sections')
        .select('id, header_name, sort_order, project_id')
        .order('sort_order', { ascending: true })

      if (sErr) throw sErr

      // 3. Fetch all tasks with progress & review fields
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

      // 4. Compute metrics for each vessel
      const processed = projects.map((p) => {
        const pSections = sectionsByProject.get(p.id) || []
        const pTasks = tasksByProject.get(p.id) || []

        // Structure sections with tasks for computeWeightedProgress
        const sectionsWithTasks = pSections.map((s) => ({
          header_name: s.header_name,
          tasks: pTasks.filter((t) => t.section_id === s.id),
        }))

        const stats = computeWeightedProgress(sectionsWithTasks)

        // Status counts
        const statusCounts = { 'Not Started': 0, 'In Progress': 0, Completed: 0, 'On Hold': 0 }
        let pendingReviewCount = 0
        let overdueCount = 0

        pTasks.forEach((t) => {
          const st = t.status || 'Not Started'
          statusCounts[st] = (statusCounts[st] || 0) + 1
          if (t.pending_review) pendingReviewCount += 1

          const deadline = t.late_date || t.finish_date
          if (deadline && deadline < today && Number(t.percent_complete) < 100 && st !== 'Completed') {
            overdueCount += 1
          }
        })

        // 4 Technical Groups mapping (3D: 65%, ISO: 15%, 2D: 10%, MTO: 10%)
        const findGroupPercent = (name) => {
          const g = (stats.groups || []).find((grp) => grp.name.toLowerCase().includes(name.toLowerCase()))
          return g ? g.avgPercent : 0
        }

        const group3D = findGroupPercent('3D')
        const groupISO = findGroupPercent('Iso')
        const group2D = findGroupPercent('2D')
        const groupMTO = findGroupPercent('MTO')

        // Start & finish dates calculated from tasks or project settings
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
      setError(err.message || 'Lỗi khi tải dữ liệu hạm đội tàu')
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

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim()
      list = list.filter(
        (v) =>
          v.ship_id.toLowerCase().includes(q) ||
          v.name.toLowerCase().includes(q) ||
          v.department.toLowerCase().includes(q)
      )
    }

    // Status filter
    if (statusFilter === 'IN_PROGRESS') {
      list = list.filter((v) => v.overallProgress < 100 && v.status !== 'Completed')
    } else if (statusFilter === 'COMPLETED') {
      list = list.filter((v) => v.overallProgress >= 100 || v.status === 'Completed')
    } else if (statusFilter === 'ATTENTION') {
      list = list.filter((v) => v.overdueCount > 0 || v.pendingReviewCount > 0)
    }

    // Sort
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

  // --- Comparison Selection Handler ---
  function toggleCompareSelection(id) {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      } else {
        if (prev.length >= 4) {
          alert('Chỉ có thể so sánh tối đa 4 tàu cùng lúc để đảm bảo hiển thị trực quan.')
          return prev
        }
        return [...prev, id]
      }
    })
  }

  const comparedVessels = useMemo(() => {
    return vesselDataList.filter((v) => selectedForCompare.includes(v.id))
  }, [vesselDataList, selectedForCompare])

  if (!caps.showDashboard) {
    return (
      <div className="pm-panel">
        <h2>Dashboard</h2>
        <p className="muted">Role của bạn không có quyền xem trang Admin Dashboard.</p>
        <Link to="/summary">Đi tới Summary →</Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="dash-loading-state">
        <div className="dash-spinner" />
        <p>Đang tổng hợp dữ liệu toàn bộ hạm đội tàu…</p>
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
            Admin Executive Fleet View
          </div>
          <h2>Fleet Multi-Vessel Dashboard</h2>
          <p className="dash-hero-subtitle">
            Tổng hợp tiến độ & so sánh đa chiều toàn bộ <strong>{vesselDataList.length} Vessel</strong> theo chuẩn dữ liệu kỹ thuật
          </p>
        </div>

        <div className="dash-hero-actions">
          <button
            type="button"
            className="dash-action-btn refresh"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Làm mới dữ liệu từ Supabase"
          >
            {refreshing ? 'Đang cập nhật…' : '🔄 Refresh Live Data'}
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {/* 2. Fleet Executive KPI Rollup (4 Cards) */}
      <div className="fleet-kpi-grid">
        <div className="fleet-kpi-card highlight-blue">
          <div className="fleet-kpi-header">
            <span className="fleet-kpi-title">Tổng số Vessel</span>
            <span className="fleet-kpi-icon">🚢</span>
          </div>
          <div className="fleet-kpi-val">{fleetRollup.totalVessels}</div>
          <div className="fleet-kpi-sub">
            <span className="pill ok">{fleetRollup.activeVessels} Đang thi công</span>
            <span className="pill muted-pill">{fleetRollup.completedVessels} Hoàn thành</span>
          </div>
        </div>

        <div className="fleet-kpi-card highlight-teal">
          <div className="fleet-kpi-header">
            <span className="fleet-kpi-title">Tiến độ Hạm Đội (Bình quân)</span>
            <span className="fleet-kpi-icon">📊</span>
          </div>
          <div className="fleet-kpi-val-row">
            <span className="fleet-kpi-val">{fleetRollup.avgProgress}%</span>
            <div className="fleet-kpi-donut">
              <DonutRing percent={fleetRollup.avgProgress} size={48} stroke={6} color="#10b981" />
            </div>
          </div>
          <div className="fleet-kpi-sub">
            <span>3D: <strong>{fleetRollup.fleet3D}%</strong> · ISO: <strong>{fleetRollup.fleetISO}%</strong></span>
          </div>
        </div>

        <div className="fleet-kpi-card highlight-amber">
          <div className="fleet-kpi-header">
            <span className="fleet-kpi-title">Khối lượng Công việc</span>
            <span className="fleet-kpi-icon">📝</span>
          </div>
          <div className="fleet-kpi-val">{fleetRollup.totalTasks} <span className="unit">tasks</span></div>
          <div className="fleet-kpi-sub">
            <span>Đã xong <strong>{fleetRollup.completedTasks}</strong> ({fleetRollup.totalTasks ? Math.round((fleetRollup.completedTasks / fleetRollup.totalTasks) * 100) : 0}%)</span>
          </div>
        </div>

        <div className={`fleet-kpi-card ${fleetRollup.totalOverdue > 0 || fleetRollup.totalPendingReview > 0 ? 'highlight-danger' : 'highlight-ok'}`}>
          <div className="fleet-kpi-header">
            <span className="fleet-kpi-title">Cảnh báo & Duyệt</span>
            <span className="fleet-kpi-icon">{fleetRollup.totalOverdue > 0 ? '⚠️' : '✅'}</span>
          </div>
          <div className="fleet-kpi-val">
            {fleetRollup.totalPendingReview} <span className="unit">cần duyệt</span>
          </div>
          <div className="fleet-kpi-sub">
            {fleetRollup.totalOverdue > 0 ? (
              <span className="text-danger">⚠️ <strong>{fleetRollup.totalOverdue}</strong> task quá hạn deadline</span>
            ) : (
              <span className="text-ok">✅ Không có task trễ hạn</span>
            )}
          </div>
        </div>
      </div>

      {/* Zero State if no vessels */}
      {vesselDataList.length === 0 ? (
        <div className="pm-panel empty-fleet-state">
          <div className="empty-icon">🚢</div>
          <h3>Chưa có Vessel nào trong hệ thống</h3>
          <p className="muted">
            Hãy tạo dự án / vessel mới để bắt đầu theo dõi tiến độ và kích hoạt các công cụ phân tích so sánh đa tàu.
          </p>
        </div>
      ) : (
        <>
          {/* 3. Control & Filter Toolbar */}
          <div className="dash-controls-bar">
            {/* View Mode Switcher */}
            <div className="dash-view-tabs">
              <button
                type="button"
                className={`dash-tab-btn ${viewMode === 'overview' ? 'active' : ''}`}
                onClick={() => setViewMode('overview')}
              >
                📊 Tổng Quan & Xếp Hạng
              </button>
              <button
                type="button"
                className={`dash-tab-btn ${viewMode === 'matrix' ? 'active' : ''}`}
                onClick={() => setViewMode('matrix')}
              >
                📋 Ma Trận So Sánh Đa Tàu
              </button>
              <button
                type="button"
                className={`dash-tab-btn ${viewMode === 'benchmark' ? 'active' : ''}`}
                onClick={() => setViewMode('benchmark')}
              >
                🎯 Đối Chuẩn Nhóm Kỹ Thuật (3D/ISO/2D/MTO)
              </button>
              <button
                type="button"
                className={`dash-tab-btn ${viewMode === 'compare' ? 'active' : ''}`}
                onClick={() => setViewMode('compare')}
              >
                ⚔️ So Sánh Song Song ({selectedForCompare.length})
              </button>
            </div>

            {/* Search & Filters */}
            <div className="dash-filters-group">
              <div className="dash-search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Tìm theo Ship ID, tên..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="dash-search-input"
                />
                {searchTerm && (
                  <button type="button" className="search-clear" onClick={() => setSearchTerm('')}>
                    ×
                  </button>
                )}
              </div>

              {/* Status Filter Pills */}
              <div className="dash-status-pills">
                <button
                  type="button"
                  className={`pill-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ALL')}
                >
                  Tất cả ({vesselDataList.length})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${statusFilter === 'IN_PROGRESS' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('IN_PROGRESS')}
                >
                  Đang làm ({fleetRollup.activeVessels})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${statusFilter === 'COMPLETED' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('COMPLETED')}
                >
                  Hoàn thành ({fleetRollup.completedVessels})
                </button>
                <button
                  type="button"
                  className={`pill-btn ${statusFilter === 'ATTENTION' ? 'active' : ''}`}
                  onClick={() => setStatusFilter('ATTENTION')}
                >
                  Cần chú ý ({fleetRollup.attentionVessels})
                </button>
              </div>

              {/* Sorter */}
              <select
                className="dash-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                title="Sắp xếp danh sách tàu"
              >
                <option value="PROGRESS_DESC">% Tiến độ: Cao → Thấp</option>
                <option value="PROGRESS_ASC">% Tiến độ: Thấp → Cao</option>
                <option value="TASKS_DESC">Số lượng Tasks: Nhiều nhất</option>
                <option value="SHIP_ID">Tên / Ship ID</option>
                <option value="DEADLINE">Hạn hoàn thành gần nhất</option>
              </select>
            </div>
          </div>

          {/* 4. VIEW MODE: OVERVIEW & RANKING */}
          {viewMode === 'overview' && (
            <div className="dash-main-grid">
              {/* Left Column: Visual Comparative Bars */}
              <div className="dash-panel-card">
                <div className="dash-card-head">
                  <div>
                    <h3>Bảng Xếp Hạng & Tiến Độ Đa Tàu</h3>
                    <p className="muted">
                      So sánh % Overall và phân rã 4 nhóm <strong>3D (65%)</strong> · <strong>ISO (15%)</strong> · <strong>2D (10%)</strong> · <strong>MTO (10%)</strong>
                    </p>
                  </div>
                  <span className="badge-count">{filteredAndSortedVessels.length} vessels</span>
                </div>

                <MultiVesselComparisonBar
                  vessels={filteredAndSortedVessels}
                  onSelectVessel={handleNavigateToVessel}
                />
              </div>

              {/* Right Column: Status Distribution Breakdown */}
              <div className="dash-panel-card">
                <div className="dash-card-head">
                  <div>
                    <h3>Phân Bố Trạng Thái Công Việc Từng Tàu</h3>
                    <p className="muted">Tỷ lệ Hoàn thành (Xanh lá) vs Đang làm (Vàng) vs Chưa làm (Xanh lam)</p>
                  </div>
                </div>

                <MultiVesselStatusStackedBar vessels={filteredAndSortedVessels} />

                <div className="status-legend-bar">
                  <span className="leg-item"><span className="dot dot-comp" /> Đã hoàn thành</span>
                  <span className="leg-item"><span className="dot dot-inprog" /> Đang thực hiện</span>
                  <span className="leg-item"><span className="dot dot-notstart" /> Chưa bắt đầu</span>
                  <span className="leg-item"><span className="dot dot-onhold" /> On Hold / Tạm ngưng</span>
                </div>
              </div>

              {/* Full Width: Vessel Cards Grid */}
              <div className="dash-card-wide-wrap">
                <div className="dash-card-head">
                  <h3>Thẻ Chi Tiết Từng Vessel</h3>
                  <p className="muted">Bấm vào thẻ để chuyển thẳng vào chế độ quản lý và xem báo cáo chi tiết của tàu đó</p>
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
                            className={`compare-checkbox-btn ${isSelected ? 'selected' : ''}`}
                            onClick={() => toggleCompareSelection(v.id)}
                            title={isSelected ? 'Bỏ chọn so sánh' : 'Chọn để so sánh song song'}
                          >
                            {isSelected ? '✓ Đang so sánh' : '+ So sánh'}
                          </button>
                        </div>

                        <div className="v-card-body">
                          <div className="v-gauge-wrap">
                            <DonutRing percent={v.overallProgress} size={84} stroke={10} />
                            <div className="v-gauge-sub">
                              <strong>{v.totalTasks}</strong> tasks
                              <span className="v-sec-count">{v.sectionCount} sections</span>
                            </div>
                          </div>

                          <div className="v-groups-mini-list">
                            <div className="v-mini-row">
                              <span>3D Drawing (65%)</span>
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
                              <span>2D Drawing (10%)</span>
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
                          <div className="v-dates">
                            <span>📅 {v.startDate || '—'} → {v.endDate || '—'}</span>
                            {v.durationDays ? <span className="v-days">({v.durationDays} ngày)</span> : null}
                          </div>

                          <div className="v-card-actions">
                            <button
                              type="button"
                              className="v-open-btn"
                              onClick={() => handleNavigateToVessel(v)}
                            >
                              Mở Vessel này →
                            </button>
                          </div>
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
            <div className="dash-panel-card dash-matrix-panel">
              <div className="dash-card-head">
                <div>
                  <h3>Ma Trận So Sánh Đa Chiều Hạm Đội (Fleet Cross-Vessel Matrix)</h3>
                  <p className="muted">Xem toàn diện tất cả các thông số, phân rã nhóm kỹ thuật và chỉ số rủi ro của từng tàu</p>
                </div>
                <div className="matrix-export-note">
                  Hiển thị <strong>{filteredAndSortedVessels.length}</strong> / {vesselDataList.length} tàu
                </div>
              </div>

              <div className="pm-table-wrap">
                <table className="pm-table matrix-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>So sánh</th>
                      <th>Ship ID / Vessel</th>
                      <th>Phòng ban</th>
                      <th>Tiến độ Tổng (% Weighted)</th>
                      <th>3D Pipe (65%)</th>
                      <th>ISO (15%)</th>
                      <th>2D (10%)</th>
                      <th>MTO (10%)</th>
                      <th>Số Task</th>
                      <th>Đã xong</th>
                      <th>Chờ duyệt</th>
                      <th>Quá hạn</th>
                      <th>Thời gian</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedVessels.map((v) => {
                      const isSelected = selectedForCompare.includes(v.id)
                      return (
                        <tr key={v.id} className={isSelected ? 'row-selected' : ''}>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleCompareSelection(v.id)}
                              title="Chọn để so sánh song song"
                            />
                          </td>
                          <td>
                            <strong className="matrix-ship-id">{v.ship_id}</strong>
                          </td>
                          <td>
                            <span className="v-dept-tag">{v.department}</span>
                          </td>
                          <td>
                            <div className="matrix-progress-cell">
                              <div className="matrix-progress-bar">
                                <div
                                  className="matrix-progress-fill"
                                  style={{
                                    width: `${v.overallProgress}%`,
                                    background:
                                      v.overallProgress >= 100
                                        ? '#10b981'
                                        : v.overallProgress >= 50
                                        ? '#0ea5e9'
                                        : '#f59e0b',
                                  }}
                                />
                              </div>
                              <strong>{v.overallProgress}%</strong>
                            </div>
                          </td>
                          <td className="matrix-num">{v.group3D}%</td>
                          <td className="matrix-num">{v.groupISO}%</td>
                          <td className="matrix-num">{v.group2D}%</td>
                          <td className="matrix-num">{v.groupMTO}%</td>
                          <td className="matrix-num"><strong>{v.totalTasks}</strong></td>
                          <td className="matrix-num text-ok">{v.statusCounts?.Completed || 0}</td>
                          <td className="matrix-num">
                            {v.pendingReviewCount > 0 ? (
                              <span className="pill-warn">{v.pendingReviewCount}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td className="matrix-num">
                            {v.overdueCount > 0 ? (
                              <span className="pill-danger">⚠️ {v.overdueCount}</span>
                            ) : (
                              <span className="text-muted">0</span>
                            )}
                          </td>
                          <td className="matrix-dates">
                            {v.startDate && v.endDate ? `${v.startDate} → ${v.endDate}` : '—'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="matrix-view-btn"
                              onClick={() => handleNavigateToVessel(v)}
                            >
                              Xem →
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
                  <h3>Đối Chuẩn Chuyên Môn Kỹ Thuật (Group Benchmarking)</h3>
                  <p className="muted">
                    So sánh trực quan mức độ hoàn thành của từng tàu trên 4 trụ cột kỹ thuật: <strong>3D (65%)</strong>, <strong>ISO (15%)</strong>, <strong>2D (10%)</strong>, <strong>MTO (10%)</strong>
                  </p>
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
                  <h3>So Sánh Đối Đầu Song Song (Side-by-Side Vessel Comparator)</h3>
                  <p className="muted">
                    Đặt từ 2 đến 4 tàu cạnh nhau để phân tích sự chênh lệch tiến độ, khối lượng và hiệu suất thực tế.
                  </p>
                </div>
                <div className="compare-picker-prompt">
                  <span>Chọn tàu cần so sánh:</span>
                  <div className="compare-chips-list">
                    {vesselDataList.map((v) => {
                      const isSel = selectedForCompare.includes(v.id)
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className={`chip-toggle ${isSel ? 'active' : ''}`}
                          onClick={() => toggleCompareSelection(v.id)}
                        >
                          {isSel ? '✓ ' : '+ '} {v.ship_id}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {comparedVessels.length < 2 ? (
                <div className="compare-notice">
                  <div className="compare-empty-icon">⚔️</div>
                  <h4>Chưa chọn đủ Vessel để so sánh đối đầu</h4>
                  <p>
                    {comparedVessels.length === 0
                      ? 'Mặc định chưa có vessel nào được chọn. Vui lòng bấm chọn các tàu từ danh sách trên (hoặc bấm "+ So sánh" trên thẻ tàu / ô checkbox trong bảng Ma trận) để chọn từ 2 đến 4 tàu so sánh song song.'
                      : `Bạn đã chọn 1 tàu (Vessel ${comparedVessels[0].ship_id}). Vui lòng chọn thêm ít nhất 1 tàu nữa để tiến hành so sánh đối đầu.`}
                  </p>
                </div>
              ) : (
                <div className="side-by-side-grid" style={{ gridTemplateColumns: `repeat(${comparedVessels.length}, 1fr)` }}>
                  {comparedVessels.map((v) => (
                    <div key={v.id} className="side-compare-col">
                      <div className="side-col-header">
                        <span className="v-dept-badge">{v.department}</span>
                        <h4>Vessel {v.ship_id}</h4>
                        <div className="side-gauge-center">
                          <DonutRing percent={v.overallProgress} size={110} stroke={12} />
                        </div>
                      </div>

                      <div className="side-col-metrics">
                        <div className="metric-row">
                          <span className="metric-lbl">Tổng số tasks</span>
                          <strong className="metric-val">{v.totalTasks}</strong>
                        </div>
                        <div className="metric-row">
                          <span className="metric-lbl">Đã hoàn thành</span>
                          <strong className="metric-val text-ok">
                            {v.statusCounts?.Completed || 0} ({v.totalTasks ? Math.round(((v.statusCounts?.Completed || 0) / v.totalTasks) * 100) : 0}%)
                          </strong>
                        </div>
                        <div className="metric-row">
                          <span className="metric-lbl">Đang thi công</span>
                          <strong className="metric-val text-amber">{v.statusCounts?.['In Progress'] || 0}</strong>
                        </div>
                        <div className="metric-row">
                          <span className="metric-lbl">Task chờ duyệt</span>
                          <strong className="metric-val">{v.pendingReviewCount}</strong>
                        </div>
                        <div className="metric-row">
                          <span className="metric-lbl">Task quá hạn</span>
                          <strong className={`metric-val ${v.overdueCount > 0 ? 'text-danger' : 'text-ok'}`}>
                            {v.overdueCount > 0 ? `⚠️ ${v.overdueCount}` : '0'}
                          </strong>
                        </div>
                      </div>

                      <div className="side-col-groups">
                        <h5>Tiến độ nhóm kỹ thuật</h5>
                        <div className="side-group-item">
                          <div className="s-head"><span>3D Pipe Drawing (65%)</span><strong>{v.group3D}%</strong></div>
                          <div className="s-track"><div className="s-fill c-3d" style={{ width: `${v.group3D}%` }} /></div>
                        </div>
                        <div className="side-group-item">
                          <div className="s-head"><span>ISO Generating (15%)</span><strong>{v.groupISO}%</strong></div>
                          <div className="s-track"><div className="s-fill c-iso" style={{ width: `${v.groupISO}%` }} /></div>
                        </div>
                        <div className="side-group-item">
                          <div className="s-head"><span>2D Drawing (10%)</span><strong>{v.group2D}%</strong></div>
                          <div className="s-track"><div className="s-fill c-2d" style={{ width: `${v.group2D}%` }} /></div>
                        </div>
                        <div className="side-group-item">
                          <div className="s-head"><span>MTO (10%)</span><strong>{v.groupMTO}%</strong></div>
                          <div className="s-track"><div className="s-fill c-mto" style={{ width: `${v.groupMTO}%` }} /></div>
                        </div>
                      </div>

                      <div className="side-col-footer">
                        <button
                          type="button"
                          className="v-open-btn"
                          onClick={() => handleNavigateToVessel(v)}
                        >
                          Chuyển đến {v.ship_id} →
                        </button>
                      </div>
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


