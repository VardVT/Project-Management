import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { GROUP_DENSITIES, getDashboardGroupFromSectionName } from '../lib/progress'
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

const PIE_COLORS = { notStarted: '#64748b', inProgress: '#d97706', completed: '#059669' }

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null
  const d = Math.round((new Date(endIso) - new Date(startIso)) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

function buildGroupTable(tasks, sections) {
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
      density: GROUP_DENSITIES[name],
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
  const { currentProject, sections } = useProject()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const { allRow, rows } = buildGroupTable(tasks, sections)
  const buckets = buildPercentBuckets(rows.length ? tasks.filter((t) => t.percent_complete != null) : [])
  const dueThisWeek = tasks
    .filter((t) => inNext7Days(t.finish_date))
    .sort((a, b) => (a.finish_date < b.finish_date ? -1 : 1))
    .slice(0, 8)

  return (
    <div className="stack">
      <div className="pm-hero shell-manager">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="muted">
          Vessel <strong>{currentProject.ship_id}</strong> · {allRow.total} engineering tasks
          {allRow.start ? ` · Start: ${allRow.start}` : ''}
          {allRow.end ? ` · Finish: ${allRow.end}` : ''}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
        <div className="pm-panel">
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700 }}>Overall Progress</h3>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <DonutRing percent={allRow.avgPercent} size={130} stroke={14} />
          </div>
        </div>

        <div className="pm-panel">
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700 }}>Due This Week</h3>
          {dueThisWeek.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {dueThisWeek.map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: 'var(--surface-subtle)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12.5px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong>{t.activity || '—'}</strong>
                    <span className="muted">{t.zone || 'No zone'}</span>
                  </div>
                  <span style={{ fontWeight: 600, color: 'var(--warning)', fontVariantNumeric: 'tabular-nums' }}>
                    {t.finish_date}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No engineering tasks due in the next 7 days.</p>
          )}
        </div>

        <div className="pm-panel" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700 }}>Technical Group Breakdown</h3>
          <div className="pm-table-wrap">
            <table className="pm-table">
              <thead>
                <tr>
                  <th>Technical Group</th>
                  <th>Tasks</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Days</th>
                  <th>% Progress</th>
                  <th>Remaining</th>
                  <th>Weight</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: 'var(--primary-subtle)', fontWeight: 700 }}>
                  <td>{allRow.name}</td>
                  <td>{allRow.total}</td>
                  <td>{allRow.start || '—'}</td>
                  <td>{allRow.end || '—'}</td>
                  <td>{allRow.days ?? '—'}</td>
                  <td>{allRow.avgPercent}%</td>
                  <td>{allRow.remaining}%</td>
                  <td>{allRow.density}</td>
                </tr>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.total}</td>
                    <td>{r.start || '—'}</td>
                    <td>{r.end || '—'}</td>
                    <td>{r.days ?? '—'}</td>
                    <td>{r.avgPercent}%</td>
                    <td>{r.remaining}%</td>
                    <td>{r.density}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {rows
          .filter((r) => r.total > 0)
          .map((r) => (
            <div className="pm-panel" key={r.name}>
              <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700 }}>{r.name} Discipline</h3>
              <div style={{ display: 'flex', gap: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
                <MultiSegmentDonut segments={r.pie} solid centerLabel={`${r.total}`} size={110} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                  {r.pie.map((s) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} key={s.name}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
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

        <div className="pm-panel" style={{ gridColumn: '1 / -1' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 700 }}>Progress Distribution Histogram</h3>
          <VerticalBarChart items={buckets} height={160} />
        </div>
      </div>
    </div>
  )
}

export function SummaryPage() {
  const { caps, profile } = useAuth()

  if (caps.shell === 'engineer') {
    return (
      <div className="stack">
        <div className="pm-hero shell-engineer">
          <p className="eyebrow">Engineer Work Summary</p>
          <h2>My Assigned Tasks</h2>
          <p className="muted">
            {profile?.display_name || 'Engineer'} — Displaying assigned tasks. Max self-report cap is{' '}
            <strong>{caps.percentCap}%</strong> prior to formal review request.
          </p>
        </div>
        <div className="pm-panel">
          <p className="muted">
            Use the sidebar under <strong>Vessel → Tasks</strong> to update activities and submit for review.
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
