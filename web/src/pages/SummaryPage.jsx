import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { GROUP_DENSITIES, getDashboardGroupFromSectionName } from '../lib/progress'
import { DonutRing, MultiSegmentDonut, VerticalBarChart } from '../components/Charts'

const BUCKET_COLOR = {
  'Not Started (0%)': 'var(--sky)',
  '1-25%': 'var(--brass)',
  '26-50%': 'var(--brass)',
  '51-75%': 'var(--brass)',
  '76-99%': 'var(--brass)',
  'Completed (100%)': 'var(--ok)',
}

const PIE_COLORS = { notStarted: 'var(--sky)', inProgress: 'var(--brass)', completed: 'var(--ok)' }

function daysBetween(startIso, endIso) {
  if (!startIso || !endIso) return null
  const d = Math.round((new Date(endIso) - new Date(startIso)) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

/**
 * Tính bảng nhóm (giống mockup Excel: Projects | Tasks | Start | End | Days
 * | %Progress | Remaining | Density) + phần dữ liệu pie theo từng nhóm.
 * Nhóm cố định theo GROUP_DENSITIES (3D drawing / 2D drawing / Iso generating / MTO)
 * — dùng đúng logic getDashboardGroupFromSectionName đã có sẵn trong progress.js.
 */
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
    name: 'Toàn dự án',
    total: totalAll,
    avgPercent: overall,
    remaining: 100 - overall,
    density: '—',
    start: allStart,
    end: allEnd,
    days: daysBetween(allStart, allEnd),
  }

  return { allRow, rows }
}

/** Phân bố % toàn dự án theo 6 khoảng, giống "Task Summary" trong mockup. */
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
      <div className="pm-panel">
        <p className="muted">Chưa chọn project / vessel.</p>
      </div>
    )
  }
  if (loading) return <p className="muted">Đang tải…</p>

  const { allRow, rows } = buildGroupTable(tasks, sections)
  const buckets = buildPercentBuckets(rows.length ? tasks.filter((t) => t.percent_complete != null) : [])
  const dueThisWeek = tasks
    .filter((t) => inNext7Days(t.finish_date))
    .sort((a, b) => (a.finish_date < b.finish_date ? -1 : 1))
    .slice(0, 8)

  return (
    <div className="stack">
      <div className={`pm-hero shell-manager`}>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="muted">
          Ship <strong>{currentProject.ship_id}</strong> · {allRow.total} tasks
          {allRow.start ? ` · Starts on ${allRow.start}` : ''}
          {allRow.end ? ` · Ends on ${allRow.end}` : ''}
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="dash-grid">
        <div className="dash-card">
          <h3>Overall progress</h3>
          <div className="dash-card-center">
            <DonutRing percent={allRow.avgPercent} />
          </div>
        </div>

        <div className="dash-card">
          <h3>Due this week</h3>
          {dueThisWeek.length ? (
            <ul className="overdue-list">
              {dueThisWeek.map((t) => (
                <li key={t.id}>
                  <div className="overdue-main">
                    <strong>{t.activity || '—'}</strong>
                    <span className="muted">{t.zone || ''}</span>
                  </div>
                  <span className="overdue-date">{t.finish_date}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Không có task đến hạn trong tuần này.</p>
          )}
        </div>

        <div className="dash-card dash-card-wide">
          <h3>Projects overview</h3>
          <div className="pm-table-wrap">
            <table className="pm-table summary-table">
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Tasks</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Days</th>
                  <th>% Progress</th>
                  <th>Remaining</th>
                  <th>Density</th>
                </tr>
              </thead>
              <tbody>
                <tr className="summary-total-row">
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
                    <td>{r.density}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {rows
          .filter((r) => r.total > 0)
          .map((r) => (
            <div className="dash-card" key={r.name}>
              <h3>{r.name}</h3>
              <div className="donut-wrap-block">
                <MultiSegmentDonut segments={r.pie} solid centerLabel={`${r.total}`} />
                <div className="donut-legend">
                  {r.pie.map((s) => (
                    <div className="legend-row" key={s.name}>
                      <span className="legend-dot" style={{ background: s.color }} />
                      <span>{s.name}</span>
                      <strong>
                        {s.value} ({Math.round((s.value / r.total) * 100)}%)
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

        <div className="dash-card dash-card-wide">
          <h3>Task summary (theo % hoàn thành)</h3>
          <VerticalBarChart items={buckets} height={180} />
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
          <p className="eyebrow">Engineer Summary</p>
          <h2>Việc của tôi</h2>
          <p className="muted">
            {profile?.display_name} — chỉ thấy / cập nhật task được gán. % tối đa{' '}
            <strong>{caps.percentCap}%</strong> trước khi review.
          </p>
        </div>
        <div className="pm-panel">
          <p className="muted">Mở menu Vessel → Task để làm việc. Nút Submit Review có trên từng task.</p>
        </div>
      </div>
    )
  }

  if (caps.shell === 'senior') {
    return <RichProjectDashboard eyebrow="Senior Summary" title="Theo dõi & Review" />
  }

  return <RichProjectDashboard eyebrow="Manager Summary" title="Tổng quan dự án" />
}
