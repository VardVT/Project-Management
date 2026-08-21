import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { CANONICAL_SECTIONS, displaySectionName } from '../lib/roles'
import { statusFromPercent } from '../lib/progress'

const WINDOW_DAYS = 15
const DAY_COUNT = WINDOW_DAYS * 2 + 1 // 31

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
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
  const st = t.status === 'On Hold' ? 'On Hold' : statusFromPercent(t.percent_complete)
  if (st === 'On Hold') return 'hold'
  if (st === 'In Progress') return 'progress'
  return 'idle'
}

export function CalendarPage() {
  const { caps, user } = useAuth()
  const { projects, currentProject, sections, selectProject } = useProject()
  const [vesselId, setVesselId] = useState(currentProject?.id || '')
  const [sectionKey, setSectionKey] = useState('')
  const [tasks, setTasks] = useState([])
  const [allSections, setAllSections] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const today0 = useMemo(() => startOfDay(new Date()), [])
  const windowStart = useMemo(() => addDays(today0, -WINDOW_DAYS), [today0])
  const windowEnd = useMemo(() => addDays(today0, WINDOW_DAYS), [today0])

  useEffect(() => {
    if (currentProject?.id) setVesselId(currentProject.id)
  }, [currentProject?.id])

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

  const projectById = useMemo(() => {
    const map = new Map()
    projects.forEach((p) => map.set(p.id, p))
    return map
  }, [projects])

  const sectionById = useMemo(() => {
    const map = new Map()
    ;(vesselId ? sections : allSections).forEach((s) => map.set(s.id, s))
    return map
  }, [vesselId, sections, allSections])

  const sectionOptions = useMemo(() => {
    if (!vesselId) {
      return CANONICAL_SECTIONS.map((name) => ({
        value: name,
        label: displaySectionName(name),
      }))
    }
    return sections.map((s) => ({
      value: s.id,
      label: displaySectionName(s.header_name),
    }))
  }, [vesselId, sections])

  useEffect(() => {
    if (!projects.length) {
      setTasks([])
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')

      let taskQuery = supabase
        .from('tasks')
        .select(
          'id, activity, drawing_id, zone, start_date, finish_date, late_date, percent_complete, section_id, assignee_id, status, project_id',
        )

      if (vesselId) {
        taskQuery = taskQuery.eq('project_id', vesselId)
        if (sectionKey) taskQuery = taskQuery.eq('section_id', sectionKey)
      } else if (sectionKey) {
        const { data: matchedSections, error: secErr } = await supabase
          .from('sections')
          .select('id, header_name, project_id')
          .eq('header_name', sectionKey)
        if (secErr) {
          if (!cancelled) {
            setError(secErr.message)
            setLoading(false)
          }
          return
        }
        const ids = (matchedSections || []).map((s) => s.id)
        if (!ids.length) {
          if (!cancelled) {
            setTasks([])
            setAllSections([])
            setSelectedId('')
            setLoading(false)
          }
          return
        }
        taskQuery = taskQuery.in('section_id', ids)
      }

      if (caps.canEditAssignedOnly) taskQuery = taskQuery.eq('assignee_id', user.id)

      const requests = [taskQuery, supabase.from('profiles').select('id, display_name, email')]
      if (!vesselId) {
        requests.push(supabase.from('sections').select('id, header_name, sort_order, project_id').order('sort_order'))
      }

      const results = await Promise.all(requests)
      if (cancelled) return

      const [{ data, error: err }, { data: profileData }, sectionsResult] = results
      if (err) setError(err.message)
      setTasks(data || [])
      setProfiles(profileData || [])
      if (sectionsResult) setAllSections(sectionsResult.data || [])
      setSelectedId('')
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [vesselId, sectionKey, caps.canEditAssignedOnly, user?.id, projects.length])

  function onVesselChange(nextId) {
    setVesselId(nextId)
    setSectionKey('')
    if (nextId) {
      const p = projects.find((x) => x.id === nextId)
      if (p) selectProject(p)
    }
  }

  const sectionName = (id) => {
    const s = sectionById.get(id)
    return s ? displaySectionName(s.header_name) : 'Section'
  }

  const vesselLabel = (projectId) => {
    const p = projectById.get(projectId)
    return p?.ship_id || p?.name || 'Vessel'
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

      const overlaps = range.from <= windowEnd && range.to >= windowStart
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
        ship: vesselLabel(t.project_id),
      })
    }

    rows.sort((a, b) => {
      if (!vesselId && a.ship !== b.ship) return String(a.ship).localeCompare(String(b.ship))
      if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx
      return String(a.label).localeCompare(String(b.label))
    })
    return rows
  }, [tasks, windowStart, windowEnd, today0, vesselId, projectById])

  const selected = openRows.find((r) => r.task.id === selectedId) || null
  const todayIdx = WINDOW_DAYS
  const rangeLabel = `${dayColumns[0].monthShort} ${dayColumns[0].dayNum} – ${
    dayColumns[DAY_COUNT - 1].monthShort
  } ${dayColumns[DAY_COUNT - 1].dayNum}, ${dayColumns[DAY_COUNT - 1].date.getFullYear()}`
  const activeVesselLabel = vesselId ? vesselLabel(vesselId) : 'All vessels'

  if (!projects.length) {
    return (
      <div className="pm-panel" style={{ textAlign: 'center', padding: 40 }}>
        <h3 style={{ marginTop: 0 }}>No vessels loaded</h3>
        <p className="muted">Create or open a vessel project to view the near-term Gantt timeline.</p>
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
            <strong>{activeVesselLabel}</strong> · {rangeLabel} · open tasks only
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
        <div className="gantt-filters">
          <label className="gantt-filter">
            <span>Vessel</span>
            <select value={vesselId} onChange={(e) => onVesselChange(e.target.value)}>
              <option value="">All vessels</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ship_id || p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="gantt-filter">
            <span>Section</span>
            <select value={sectionKey} onChange={(e) => setSectionKey(e.target.value)}>
              <option value="">All sections</option>
              {sectionOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
                      onClick={() => setSelectedId((id) => (id === row.task.id ? '' : row.task.id))}
                      title={row.label}
                    >
                      <span className="gantt-label-title">{row.label}</span>
                      <span className="gantt-label-meta">
                        {!vesselId ? `${row.ship} · ` : ''}
                        {sectionName(row.task.section_id)}
                        {row.task.zone ? ` · ${row.task.zone}` : ''}
                        {` · ${picName(row.task.assignee_id)}`}
                      </span>
                    </button>
                    <div
                      className={`gantt-track ${selectedId === row.task.id ? 'active' : ''}`}
                      onClick={() => setSelectedId((id) => (id === row.task.id ? '' : row.task.id))}
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
              {vesselLabel(selected.task.project_id)} · {sectionName(selected.task.section_id)}
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
