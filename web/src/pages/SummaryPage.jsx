import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import {
  GROUP_DENSITIES,
  getDashboardGroupFromSectionName,
  resolveGroupDensities,
} from '../lib/progress'
import { ROLES } from '../lib/roles'
import { DonutRing, MultiSegmentDonut, VerticalBarChart } from '../components/Charts'
import { IconVessel } from '../components/Icons'

const BUCKET_COLOR = {
  'Not Started (0%)': 'var(--ink-muted)',
  '1-25%': 'var(--warning)',
  '26-50%': 'var(--warning)',
  '51-75%': 'var(--warning)',
  '76-99%': 'var(--warning)',
  'Completed (100%)': 'var(--success)',
}

const PIE_COLORS = { notStarted: '#64748b', inProgress: '#0d9488', completed: '#059669' }

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null
  const d = Math.round((new Date(endIso) - new Date(startIso)) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

function buildGroupTable(tasks, sections, densities) {
  const dens = resolveGroupDensities(densities)
  const sectionNameById = new Map(sections.map((s) => [s.id, s.header_name]))
  const groupNames = Object.keys(GROUP_DENSITIES)
  const byGroup = new Map(groupNames.map((g) => [g, []]))

  tasks.forEach((t) => {
    const secName = sectionNameById.get(t.section_id)
    const group = getDashboardGroupFromSectionName(secName)
    if (group && byGroup.has(group)) byGroup.get(group).push(t)
  })

  const rows = groupNames.map((name) => {
    const list = byGroup.get(name)
    const total = list.length
    const sumPercent = list.reduce((s, t) => s + (Number(t.percent_complete) || 0), 0)
    const avgPercent = total ? Math.round(sumPercent / total) : 0
    const starts = list.map((t) => t.start_date).filter(Boolean).sort()
    const finishes = list.map((t) => t.finish_date).filter(Boolean).sort()
    const start = starts[0] || null
    const end = finishes[finishes.length - 1] || null

    const notStarted = list.filter((t) => (Number(t.percent_complete) || 0) === 0).length
    const completed = list.filter((t) => (Number(t.percent_complete) || 0) === 100).length
    const inProgress = total - notStarted - completed

    return {
      name,
      total,
      avgPercent,
      remaining: 100 - avgPercent,
      density: dens[name],
      start,
      end,
      days: daysBetween(start, end),
      pie: [
        { name: 'Not Started', value: notStarted, color: PIE_COLORS.notStarted },
        { name: 'In Progress', value: inProgress, color: PIE_COLORS.inProgress },
        { name: 'Completed', value: completed, color: PIE_COLORS.completed },
      ].filter((s) => s.value > 0),
    }
  })

  const activeRows = rows.filter((r) => r.total > 0)
  const totalAll = rows.reduce((s, r) => s + r.total, 0)
  const weightedSum = activeRows.reduce((s, r) => s + r.avgPercent * r.density, 0)
  const densitySum = activeRows.reduce((s, r) => s + r.density, 0)
  const overall = densitySum ? Math.round(weightedSum / densitySum) : 0
  const allStarts = rows.flatMap((r) => (r.start ? [r.start] : [])).sort()
  const allEnds = rows.flatMap((r) => (r.end ? [r.end] : [])).sort()
  const allStart = allStarts[0] || null
  const allEnd = allEnds[allEnds.length - 1] || null

  const allRow = {
    name: 'Total Project',
    total: totalAll,
    avgPercent: overall,
    remaining: 100 - overall,
    density: '100%',
    start: allStart,
    end: allEnd,
    days: daysBetween(allStart, allEnd),
  }

  return { allRow, rows }
}

function buildPercentBuckets(tasks) {
  const buckets = {
    'Not Started (0%)': 0,
    '1-25%': 0,
    '26-50%': 0,
    '51-75%': 0,
    '76-99%': 0,
    'Completed (100%)': 0,
  }
  tasks.forEach((t) => {
    const p = Number(t.percent_complete) || 0
    if (p === 0) buckets['Not Started (0%)'] += 1
    else if (p <= 25) buckets['1-25%'] += 1
    else if (p <= 50) buckets['26-50%'] += 1
    else if (p <= 75) buckets['51-75%'] += 1
    else if (p < 100) buckets['76-99%'] += 1
    else buckets['Completed (100%)'] += 1
  })
  return Object.entries(buckets).map(([name, value]) => ({ name, value, color: BUCKET_COLOR[name] }))
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function inNext7Days(iso) {
  if (!iso) return false
  const today = new Date(todayIso())
  const target = new Date(iso)
  const diffDays = Math.round((target - today) / 86400000)
  return diffDays >= 0 && diffDays <= 6
}

function RichProjectDashboard({ eyebrow, title }) {
  const { caps } = useAuth()
  const { currentProject, sections, updateGroupWeights } = useProject()
  const canEditWeights = caps.role === ROLES.ADMIN || caps.role === ROLES.MANAGER
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weights, setWeights] = useState(() => resolveGroupDensities(null))
  const [weightSaving, setWeightSaving] = useState(false)
  const [weightMsg, setWeightMsg] = useState('')
  const saveTimer = useRef(null)

  useEffect(() => {
    setWeights(resolveGroupDensities(currentProject?.group_weights))
  }, [currentProject?.id, currentProject?.group_weights])

  useEffect(() => {
    if (!currentProject?.id) {
      setTasks([])
      return
    }
    setLoading(true)
    setError('')
    supabase
      .from('tasks')
      .select('id, section_id, percent_complete, start_date, finish_date, activity, zone')
      .eq('project_id', currentProject.id)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        setTasks(data || [])
        setLoading(false)
      })
  }, [currentProject?.id])

  function onWeightChange(groupName, raw) {
    const n = Math.max(0, Number(raw))
    const next = {
      ...weights,
      [groupName]: Number.isFinite(n) ? n : 0,
    }
    setWeights(next)
    setWeightMsg('')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setWeightSaving(true)
      try {
        await updateGroupWeights(next)
        setWeightMsg('Weights saved')
        setTimeout(() => setWeightMsg(''), 2000)
      } catch (err) {
        setError(err?.message || 'Could not save weights.')
      } finally {
        setWeightSaving(false)
      }
    }, 450)
  }

  if (!currentProject?.id) {
    return (
      <div className="pm-panel" style={{ textAlign: 'center', padding: '40px' }}>
        <IconVessel size={32} className="muted" />
        <h3 style={{ marginTop: '12px' }}>No Vessel Selected</h3>
        <p className="muted">Select a vessel from the sidebar to view its engineering progress summary.</p>
      </div>
    )
  }
  if (loading) return <p className="muted">Loading vessel metrics…</p>

  const { allRow, rows } = buildGroupTable(tasks, sections, weights)
  const weightSumAll = Object.values(weights).reduce((s, n) => s + (Number(n) || 0), 0)
  const buckets = buildPercentBuckets(rows.length ? tasks.filter((t) => t.percent_complete != null) : [])
  const dueThisWeek = tasks
    .filter((t) => inNext7Days(t.finish_date))
    .sort((a, b) => (a.finish_date < b.finish_date ? -1 : 1))
    .slice(0, 8)

  const completedCount = tasks.filter((t) => Number(t.percent_complete) === 100).length
  const inProgressCount = tasks.filter((t) => {
    const p = Number(t.percent_complete) || 0
    return p > 0 && p < 100
  }).length
  const notStartedCount = tasks.filter((t) => (Number(t.percent_complete) || 0) === 0).length

  return (
    <div className="stack summary-container">
      {/* Top Hero Banner */}
      <div className="pm-hero shell-manager summary-hero-card">
        <div className="summary-hero-left">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="muted summary-vessel-meta">
            Vessel <strong>{currentProject.ship_id}</strong> {currentProject.name ? `(${currentProject.name})` : ''} · <strong>{allRow.total}</strong> engineering tasks
            {allRow.start ? ` · Start: ${allRow.start}` : ''}
            {allRow.end ? ` · Finish: ${allRow.end}` : ''}
            {allRow.days ? ` · Duration: ${allRow.days} days` : ''}
          </p>
        </div>
        <div className="summary-hero-badge">
          <span className="live-dot" />
          <span>Live Vessel Progress</span>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}

      {/* Quick KPI Stat Highlights */}
      <div className="summary-kpi-row">
        <div className="summary-kpi-tile">
          <span className="summary-kpi-label">Overall Progress</span>
          <div className="summary-kpi-value-group">
            <span className="summary-kpi-num">{allRow.avgPercent}%</span>
            <span className={`summary-status-pill ${allRow.avgPercent === 100 ? 'done' : allRow.avgPercent > 0 ? 'progress' : 'idle'}`}>
              {allRow.avgPercent === 100 ? 'Completed' : allRow.avgPercent > 0 ? 'In Progress' : 'Pending'}
            </span>
          </div>
        </div>

        <div className="summary-kpi-tile">
          <span className="summary-kpi-label">Total Engineering Tasks</span>
          <div className="summary-kpi-value-group">
            <span className="summary-kpi-num">{allRow.total}</span>
            <span className="summary-kpi-sub">disciplines: {rows.filter(r => r.total > 0).length}</span>
          </div>
        </div>

        <div className="summary-kpi-tile">
          <span className="summary-kpi-label">Completed Tasks</span>
          <div className="summary-kpi-value-group">
            <span className="summary-kpi-num text-success">{completedCount}</span>
            <span className="summary-kpi-sub">({allRow.total ? Math.round((completedCount / allRow.total) * 100) : 0}%)</span>
          </div>
        </div>

        <div className="summary-kpi-tile">
          <span className="summary-kpi-label">In Progress / Active</span>
          <div className="summary-kpi-value-group">
            <span className="summary-kpi-num text-warning">{inProgressCount}</span>
            <span className="summary-kpi-sub">Not started: {notStartedCount}</span>
          </div>
        </div>
      </div>

      {/* Main Visual Row: Donut Ring & Due Tasks */}
      <div className="summary-grid-2">
        <div className="pm-panel summary-panel-card">
          <div className="summary-card-head">
            <div>
              <h3>Overall Engineering Progress</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '12px' }}>
                Weighted across all technical discipline densities
              </p>
            </div>
          </div>

          <div className="summary-donut-layout">
            <div className="summary-donut-wrap">
              <DonutRing percent={allRow.avgPercent} size={150} stroke={16} color="#0d9488" />
            </div>

            <div className="summary-donut-metrics">
              <div className="summary-donut-stat-item">
                <span className="stat-bullet completed" />
                <div className="stat-text">
                  <span className="stat-name">Completed Progress</span>
                  <strong>{allRow.avgPercent}%</strong>
                </div>
              </div>

              <div className="summary-donut-stat-item">
                <span className="stat-bullet remaining" />
                <div className="stat-text">
                  <span className="stat-name">Remaining Workload</span>
                  <strong>{allRow.remaining}%</strong>
                </div>
              </div>

              <div className="summary-donut-stat-item">
                <span className="stat-bullet schedule" />
                <div className="stat-text">
                  <span className="stat-name">Active Schedule Duration</span>
                  <strong>{allRow.days != null ? `${allRow.days} calendar days` : 'Not set'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pm-panel summary-panel-card">
          <div className="summary-card-head">
            <div>
              <h3>Due This Week</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '12px' }}>
                Milestones & deadlines within next 7 days
              </p>
            </div>
            <span className="pill muted-pill">{dueThisWeek.length} tasks</span>
          </div>

          {dueThisWeek.length ? (
            <div className="summary-due-list">
              {dueThisWeek.map((t) => (
                <div key={t.id} className="summary-due-item">
                  <div className="summary-due-main">
                    <strong className="summary-due-title">{t.activity || 'Untitled task'}</strong>
                    <div className="summary-due-meta">
                      <span className="summary-due-zone">{t.zone || 'General Zone'}</span>
                      {t.drawing_id ? <span className="summary-due-dwg">· {t.drawing_id}</span> : null}
                    </div>
                  </div>
                  <div className="summary-due-tag">
                    <span className="summary-due-date">{t.finish_date}</span>
                    <span className="summary-due-pct">{(Number(t.percent_complete) || 0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="summary-empty-due">
              <span style={{ fontSize: '24px' }}>✓</span>
              <p style={{ margin: '6px 0 0', fontSize: '13px', fontWeight: 600 }}>No upcoming deadlines this week</p>
              <span className="muted" style={{ fontSize: '11.5px' }}>All engineering activities are on track.</span>
            </div>
          )}
        </div>

        {/* Technical Group Breakdown Table */}
        <div className="pm-panel summary-panel-card" style={{ gridColumn: '1 / -1' }}>
          <div className="summary-card-head">
            <div>
              <h3>Technical Discipline Breakdown</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '12px' }}>
                Discipline weight allocation, progress completion, and active date spans
              </p>
            </div>
            {canEditWeights ? (
              <span className="summary-weight-status">
                {weightSaving ? 'Saving weights…' : weightMsg || `Total Weight: ${weightSumAll}% · Live updates`}
              </span>
            ) : null}
          </div>

          <div className="pm-table-wrap">
            <table className="pm-table summary-breakdown-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '180px' }}>Technical Group</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Tasks</th>
                  <th style={{ width: '110px' }}>Start Date</th>
                  <th style={{ width: '110px' }}>End Date</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Days</th>
                  <th style={{ minWidth: '220px' }}>% Progress</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Remaining</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Discipline Weight</th>
                </tr>
              </thead>
              <tbody>
                <tr className="summary-total-row">
                  <td>
                    <strong>{allRow.name}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="summary-pill-count">{allRow.total}</span>
                  </td>
                  <td>{allRow.start || '—'}</td>
                  <td>{allRow.end || '—'}</td>
                  <td style={{ textAlign: 'center' }}>{allRow.days ?? '—'}</td>
                  <td>
                    <div className="summary-progress-cell">
                      <div className="summary-bar-track">
                        <div className="summary-bar-fill" style={{ width: `${allRow.avgPercent}%` }} />
                      </div>
                      <strong className="summary-pct-text">{allRow.avgPercent}%</strong>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--ink-muted)' }}>{allRow.remaining}%</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="summary-weight-badge total">{allRow.density}</span>
                  </td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <span className="summary-group-name">{r.name}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="summary-pill-count">{r.total}</span>
                    </td>
                    <td className="muted">{r.start || '—'}</td>
                    <td className="muted">{r.end || '—'}</td>
                    <td style={{ textAlign: 'center' }} className="muted">{r.days ?? '—'}</td>
                    <td>
                      <div className="summary-progress-cell">
                        <div className="summary-bar-track">
                          <div
                            className={`summary-bar-fill fill-${r.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`}
                            style={{ width: `${r.avgPercent}%` }}
                          />
                        </div>
                        <strong className="summary-pct-text">{r.avgPercent}%</strong>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--ink-muted)' }}>{r.remaining}%</td>
                    <td style={{ textAlign: 'center' }}>
                      {canEditWeights ? (
                        <label className="weight-edit">
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            step={1}
                            value={weights[r.name] ?? r.density}
                            onChange={(e) => onWeightChange(r.name, e.target.value)}
                          />
                          <span>%</span>
                        </label>
                      ) : (
                        <span className="summary-weight-badge">{r.density}%</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Discipline Donut Segment Breakdown */}
        {rows
          .filter((r) => r.total > 0)
          .map((r) => (
            <div className="pm-panel summary-panel-card" key={r.name}>
              <div className="summary-card-head">
                <div>
                  <h3 style={{ fontSize: '13.5px' }}>{r.name} Discipline Breakdown</h3>
                  <span className="muted" style={{ fontSize: '11.5px' }}>{r.total} tasks allocated</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
                <MultiSegmentDonut segments={r.pie} solid centerLabel={`${r.total}`} size={118} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', flex: 1, minWidth: '150px' }}>
                  {r.pie.map((s) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} key={s.name}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                      <span>{s.name}</span>
                      <strong style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                        {s.value} ({Math.round((s.value / r.total) * 100)}%)
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

        {/* Histogram */}
        <div className="pm-panel summary-panel-card" style={{ gridColumn: '1 / -1' }}>
          <div className="summary-card-head">
            <div>
              <h3>Progress Distribution Histogram</h3>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '12px' }}>
                Task distribution across completion ranges
              </p>
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <VerticalBarChart items={buckets} height={170} />
          </div>
        </div>
      </div>
    </div>
  )
}

export function SummaryPage() {
  const { caps } = useAuth()

  if (caps.shell === 'engineer') {
    return (
      <div className="stack">
        <div className="pm-hero shell-engineer">
          <p className="eyebrow">Engineer Work Summary</p>
          <h2>My Assigned Tasks</h2>
        </div>
        <div className="pm-panel">
          <p className="muted">
            Open <strong>Vessel → Tasks</strong> in the sidebar to update activities and submit for review.
          </p>
        </div>
      </div>
    )
  }

  if (caps.shell === 'senior') {
    return <RichProjectDashboard eyebrow="Senior Engineer Summary" title="Vessel Discipline Control" />
  }

  return <RichProjectDashboard eyebrow="Executive Summary" title="Vessel Engineering Overview" />
}
