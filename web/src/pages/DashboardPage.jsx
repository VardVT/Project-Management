import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { computeWeightedProgress } from '../lib/progress'

const STATUS_COLORS = {
  'Not Started': 'var(--sky)',
  'In Progress': 'var(--brass)',
  Completed: 'var(--ok)',
  'On Hold': 'var(--danger)',
}

/** Vòng tròn % đơn giản, vẽ bằng SVG thuần, không cần thư viện ngoài. */
function DonutRing({ percent = 0, size = 128, stroke = 14, color = 'var(--shell-accent, var(--sky))', label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = c - (clamped / 100) * c

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.22}
          fontWeight="700"
          fill="var(--ink)"
        >
          {clamped}%
        </text>
      </svg>
      {label ? <div className="donut-label">{label}</div> : null}
    </div>
  )
}

/** Donut nhiều màu để so sánh tỷ trọng — dùng cho phân bố Status. */
function MultiSegmentDonut({ segments, size = 128, stroke = 16 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  let offsetAcc = 0

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        {segments.map((s) => {
          const frac = s.value / total
          const dash = frac * c
          const seg = (
            <circle
              key={s.name}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offsetAcc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          offsetAcc += dash
          return seg
        })}
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.16} fontWeight="700" fill="var(--ink)">
          {total} task
        </text>
      </svg>
    </div>
  )
}

/** Thanh ngang so sánh % giữa các section. */
function HorizontalBarList({ items }) {
  const max = Math.max(...items.map((i) => i.total), 1)
  return (
    <div className="hbar-list">
      {items.map((it) => (
        <div className="hbar-row" key={it.name}>
          <div className="hbar-label">
            <span>{it.name}</span>
            <strong>
              {it.avgPercent}% · {it.total} task
            </strong>
          </div>
          <div className="hbar-track">
            <div
              className="hbar-fill"
              style={{
                width: `${it.avgPercent}%`,
                background: it.avgPercent >= 90 ? 'var(--ok)' : it.avgPercent >= 40 ? 'var(--brass)' : 'var(--sky)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { caps, profile } = useAuth()
  const { currentProject, sections } = useProject()
  const [stats, setStats] = useState(null)
  const [statusCounts, setStatusCounts] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentProject?.id || !caps.showDashboard) {
      setStats(null)
      setStatusCounts(null)
      return
    }
    ;(async () => {
      const { data, error: err } = await supabase
        .from('tasks')
        .select('id, percent_complete, section_id, status')
        .eq('project_id', currentProject.id)
      if (err) {
        setError(err.message)
        return
      }
      const bySection = sections.map((s) => ({
        header_name: s.header_name,
        tasks: (data || []).filter((t) => t.section_id === s.id),
      }))
      setStats(computeWeightedProgress(bySection))

      // FIX: đếm số task theo status để vẽ donut phân bố trạng thái
      const counts = { 'Not Started': 0, 'In Progress': 0, Completed: 0, 'On Hold': 0 }
      ;(data || []).forEach((t) => {
        const key = t.status || 'Not Started'
        counts[key] = (counts[key] || 0) + 1
      })
      setStatusCounts(counts)
    })()
  }, [currentProject?.id, sections, caps.showDashboard])

  if (!caps.showDashboard) {
    return (
      <div className="pm-panel">
        <h2>Dashboard</h2>
        <p className="muted">Role của bạn dùng trang Summary.</p>
        <Link to="/summary">Đi tới Summary →</Link>
      </div>
    )
  }

  const statusSegments = statusCounts
    ? Object.entries(statusCounts)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name, value, color: STATUS_COLORS[name] || 'var(--muted)' }))
    : []

  return (
    <div className="stack">
      <div className={`pm-hero shell-${caps.shell}`}>
        <p className="eyebrow">{caps.label} workspace</p>
        <h2>00 Dashboard</h2>
        <p className="muted">
          {profile?.display_name} · Ship <strong>{currentProject?.ship_id || '—'}</strong>
        </p>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="pm-stat-grid">
        <div className="pm-stat">
          <span>Overall (weighted)</span>
          <strong>{stats?.overallProgress ?? 0}%</strong>
        </div>
        <div className="pm-stat">
          <span>Total tasks</span>
          <strong>{stats?.totalTasks ?? 0}</strong>
        </div>
        <div className="pm-stat">
          <span>Sections</span>
          <strong>{sections.length}</strong>
        </div>
      </div>

      {/* FIX: hàng biểu đồ mới — donut tổng tiến độ + donut phân bố status */}
      <div className="pm-panel">
        <h3>Overview</h3>
        <div className="chart-row">
          <DonutRing percent={stats?.overallProgress ?? 0} label="Overall progress" />
          {statusSegments.length > 0 && (
            <div className="donut-wrap-block">
              <MultiSegmentDonut segments={statusSegments} />
              <div className="donut-legend">
                {statusSegments.map((s) => (
                  <div className="legend-row" key={s.name}>
                    <span className="legend-dot" style={{ background: s.color }} />
                    <span>{s.name}</span>
                    <strong>{s.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="pm-panel">
        <h3>Group progress (density)</h3>
        <p className="muted">3D 65% · ISO 15% · 2D 10% · MTO 10%</p>
        <div className="progress-bars">
          {(stats?.groups || []).map((g) => (
            <div key={g.name} className="progress-row">
              <div className="progress-label">
                <span>
                  {g.name} <em>({g.density})</em>
                </span>
                <strong>
                  {g.avgPercent}% · {g.total} tasks
                </strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${g.avgPercent}%` }} />
              </div>
            </div>
          ))}
          {!stats?.groups?.length ? <p className="muted">Chưa có task trong các nhóm tính %. Hãy Update Excel hoặc thêm task.</p> : null}
        </div>
      </div>

      {/* FIX: thay list text "By section" bằng thanh ngang trực quan hơn */}
      <div className="pm-panel">
        <h3>By section</h3>
        {stats?.sectionStats?.length ? (
          <HorizontalBarList items={stats.sectionStats} />
        ) : (
          <p className="muted">Chưa có dữ liệu section.</p>
        )}
      </div>
    </div>
  )
}
