import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'
import { statusFromPercent } from '../lib/progress'

const WINDOW_DAYS = 15
const DAY_COUNT = WINDOW_DAYS * 2 + 1 // 31

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
  return x
}

function toIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseIso(s) {
  if (!s) return null
  const m = String(s).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000)
}

function isTaskClosed(t) {
  const st = String(t.status || '').trim()
  if (st === 'Completed') return true
  const p = Number(t.percent_complete)
  if (Number.isFinite(p) && p >= 100 && st !== 'On Hold') return true
  return false
}

function barRange(t) {
  const start = parseIso(t.start_date)
  const finish = parseIso(t.finish_date)
  const late = parseIso(t.late_date)
  const dates = [start, finish, late].filter(Boolean)
  if (!dates.length) return null
  const from = start || finish || late
  const to = finish || late || start
  if (to < from) return { from: to, to: from, late }
  return { from, to, late }
}

function barTone(t) {
  const st =
    t.status === 'On Hold' ? 'On Hold' : statusFromPercent(t.percent_complete)
  if (st === 'On Hold') return 'hold'
  if (st === 'In Progress') return 'progress'
  return 'idle'
}

export function CalendarPage() {
  const { caps, user } = useAuth()
  const { currentProject, sections } = useProject()
  const [sectionId, setSectionId] = useState('')
  const [tasks, setTasks] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const today0 = useMemo(() => startOfDay(new Date()), [])
  const windowStart = useMemo(() => addDays(today0, -WINDOW_DAYS), [today0])
  const windowEnd = useMemo(() => addDays(today0, WINDOW_DAYS), [today0])

  const dayColumns = useMemo(() => {
    return Array.from({ length: DAY_COUNT }, (_, i) => {
      const d = addDays(windowStart, i)
      return {
        iso: toIso(d),
        date: d,
        dayNum: d.getDate(),
        monthShort: d.toLocaleString('en-US', { month: 'short' }),
        weekday: d.toLocaleString('en-US', { weekday: 'narrow' }),
        isToday: toIso(d) === toIso(today0),
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
      }
    })
  }, [windowStart, today0])

  useEffect(() => {
    if (!currentProject?.id) {
      setTasks([])
      return
    }
    setLoading(true)
    setError('')
    let query = supabase
      .from('tasks')
      .select(
        'id, activity, drawing_id, zone, start_date, finish_date, late_date, percent_complete, section_id, assignee_id, status',
      )
      .eq('project_id', currentProject.id)

    if (sectionId) query = query.eq('section_id', sectionId)
    if (caps.canEditAssignedOnly) query = query.eq('assignee_id', user.id)

    Promise.all([
      query,
      supabase.from('profiles').select('id, display_name, email'),
    ]).then(([{ data, error: err }, { data: profileData }]) => {
      if (err) setError(err.message)
      setTasks(data || [])
      setProfiles(profileData || [])
      setSelectedId('')
      setLoading(false)
    })
  }, [currentProject?.id, sectionId, caps.canEditAssignedOnly, user?.id])

  const sectionName = (id) => {
    const s = sections.find((x) => x.id === id)
    return s ? displaySectionName(s.header_name) : 'Section'
  }

  const picName = (id) => {
    if (!id) return '—'
    const p = profiles.find((x) => x.id === id)
    return p?.display_name || p?.email?.split('@')[0] || '—'
  }

  const openRows = useMemo(() => {
    const rows = []
    for (const t of tasks) {
      if (isTaskClosed(t)) continue
      const range = barRange(t)
      if (!range) continue

      const overlaps =
        range.from <= windowEnd && range.to >= windowStart
      const overdueOpen = range.to < today0
      if (!overlaps && !overdueOpen) continue

      let startIdx = daysBetween(windowStart, range.from)
      let endIdx = daysBetween(windowStart, range.to)
      startIdx = Math.max(0, Math.min(DAY_COUNT - 1, startIdx))
      endIdx = Math.max(0, Math.min(DAY_COUNT - 1, endIdx))
      if (endIdx < startIdx) endIdx = startIdx

      let lateIdx = null
      if (range.late) {
        const li = daysBetween(windowStart, range.late)
        if (li >= 0 && li < DAY_COUNT) lateIdx = li
      }

      const pct = Math.max(0, Math.min(100, Number(t.percent_complete) || 0))
      rows.push({
        task: t,
        startIdx,
        endIdx,
        lateIdx,
        pct,
        tone: barTone(t),
        overdue: range.to < today0,
        label: t.activity || t.drawing_id || 'Task',
      })
    }

    rows.sort((a, b) => {
      if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx
      return String(a.label).localeCompare(String(b.label))
    })
    return rows
  }, [tasks, windowStart, windowEnd, today0])

  const selected = openRows.find((r) => r.task.id === selectedId) || null
  const todayIdx = WINDOW_DAYS

  const rangeLabel = `${dayColumns[0].monthShort} ${dayColumns[0].dayNum} – ${
    dayColumns[DAY_COUNT - 1].monthShort
  } ${dayColumns[DAY_COUNT - 1].dayNum}, ${dayColumns[DAY_COUNT - 1].date.getFullYear()}`

  if (!currentProject?.id) {
    return (
      <div className="pm-panel" style={{ textAlign: 'center', padding: 40 }}>
        <h3 style={{ marginTop: 0 }}>No vessel selected</h3>
        <p className="muted">Select a vessel to view the near-term Gantt timeline.</p>
      </div>
    )
  }

  return (
    <div className="gantt-page">
      <div className="pm-hero shell-manager gantt-hero">
        <div>
          <p className="eyebrow">Near-term schedule</p>
          <h2>Rolling Gantt · ±{WINDOW_DAYS} days</h2>
          <p className="muted">
            Vessel <strong>{currentProject.ship_id}</strong> · {rangeLabel} · open tasks only
            {caps.canEditAssignedOnly ? ' · assigned to you' : ''}
          </p>
        </div>
        <div className="gantt-hero-stats">
          <div className="gantt-stat">
            <span className="gantt-stat-num">{openRows.length}</span>
            <span className="gantt-stat-label">Open in window</span>
          </div>
          <div className="gantt-stat">
            <span className="gantt-stat-num">{openRows.filter((r) => r.overdue).length}</span>
            <span className="gantt-stat-label">Overdue</span>
          </div>
        </div>
      </div>

      <div className="gantt-toolbar pm-panel">
        <label className="gantt-filter">
          <span>Section</span>
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {displaySectionName(s.header_name)}
              </option>
            ))}
          </select>
        </label>
        <div className="gantt-legend">
          <span>
            <i className="gantt-dot idle" /> Not started
          </span>
          <span>
            <i className="gantt-dot progress" /> In progress
          </span>
          <span>
            <i className="gantt-dot hold" /> On hold
          </span>
          <span>
            <i className="gantt-late-mark" /> Late date
          </span>
          <span>
            <i className="gantt-today-mark" /> Today
          </span>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading timeline…</p> : null}

      <div className="pm-panel gantt-board">
        <div className="gantt-scroll">
          <div
            className="gantt-grid"
            style={{
              ['--gantt-days']: DAY_COUNT,
              ['--gantt-today-idx']: todayIdx,
            }}
          >
            <div className="gantt-header-row">
              <div className="gantt-corner">Task</div>
              <div className="gantt-head">
                {dayColumns.map((col) => (
                  <div
                    key={col.iso}
                    className={`gantt-day-head ${col.isToday ? 'today' : ''} ${col.isWeekend ? 'weekend' : ''}`}
                    title={col.iso}
                  >
                    <span className="gantt-day-wd">{col.weekday}</span>
                    <span className="gantt-day-num">{col.dayNum}</span>
                    {(col.dayNum === 1 || col.isToday) && (
                      <span className="gantt-day-mo">{col.monthShort}</span>
                    )}
                  </div>
                ))}
                <div className="gantt-today-line" aria-hidden />
              </div>
            </div>

            {openRows.length === 0 && !loading ? (
              <div className="gantt-empty">
                No open tasks with dates in this ±{WINDOW_DAYS}-day window.
              </div>
            ) : (
              openRows.map((row) => {
                const left = (row.startIdx / DAY_COUNT) * 100
                const width = ((row.endIdx - row.startIdx + 1) / DAY_COUNT) * 100
                const lateLeft =
                  row.lateIdx == null ? null : ((row.lateIdx + 0.5) / DAY_COUNT) * 100
                return (
                  <div key={row.task.id} className="gantt-row-pair">
                    <button
                      type="button"
                      className={`gantt-label ${selectedId === row.task.id ? 'active' : ''}`}
                      onClick={() =>
                        setSelectedId((id) => (id === row.task.id ? '' : row.task.id))
                      }
                      title={row.label}
                    >
                      <span className="gantt-label-title">{row.label}</span>
                      <span className="gantt-label-meta">
                        {sectionName(row.task.section_id)}
                        {row.task.zone ? ` · ${row.task.zone}` : ''}
                        {` · ${picName(row.task.assignee_id)}`}
                      </span>
                    </button>
                    <div
                      className={`gantt-track ${selectedId === row.task.id ? 'active' : ''}`}
                      onClick={() =>
                        setSelectedId((id) => (id === row.task.id ? '' : row.task.id))
                      }
                    >
                      {dayColumns.map((col) => (
                        <div
                          key={col.iso}
                          className={`gantt-cell ${col.isToday ? 'today' : ''} ${col.isWeekend ? 'weekend' : ''}`}
                        />
                      ))}
                      <div
                        className={`gantt-bar tone-${row.tone} ${row.overdue ? 'overdue' : ''}`}
                        style={{ left: `${left}%`, width: `${Math.max(width, 100 / DAY_COUNT)}%` }}
                        title={`${row.label}: ${row.task.start_date || '—'} → ${row.task.finish_date || '—'} (${row.pct}%)`}
                      >
                        <div className="gantt-bar-fill" style={{ width: `${row.pct}%` }} />
                        <span className="gantt-bar-text">{row.pct}%</span>
                      </div>
                      {lateLeft != null ? (
                        <div
                          className="gantt-late"
                          style={{ left: `${lateLeft}%` }}
                          title={`Late: ${row.task.late_date}`}
                        />
                      ) : null}
                      <div className="gantt-today-line" aria-hidden />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {selected ? (
        <div className="pm-panel gantt-detail">
          <div>
            <strong>{selected.label}</strong>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              {sectionName(selected.task.section_id)}
              {selected.task.drawing_id ? ` · ${selected.task.drawing_id}` : ''}
              {selected.task.zone ? ` · ${selected.task.zone}` : ''}
            </div>
          </div>
          <div className="gantt-detail-grid">
            <div>
              <span className="muted">PIC</span>
              <strong>{picName(selected.task.assignee_id)}</strong>
            </div>
            <div>
              <span className="muted">Start</span>
              <strong>{selected.task.start_date || '—'}</strong>
            </div>
            <div>
              <span className="muted">Finish</span>
              <strong>{selected.task.finish_date || '—'}</strong>
            </div>
            <div>
              <span className="muted">Late</span>
              <strong>{selected.task.late_date || '—'}</strong>
            </div>
            <div>
              <span className="muted">Progress</span>
              <strong>{selected.pct}%</strong>
            </div>
            <div>
              <span className="muted">Status</span>
              <strong>{selected.task.status || '—'}</strong>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
