import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { displaySectionName } from '../lib/roles'
import { IconChevronLeft, IconChevronRight } from '../components/Icons'

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function ymd(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function CalendarPage() {
  const { caps, user } = useAuth()
  const { currentProject, sections } = useProject()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [sectionId, setSectionId] = useState('')
  const [tasks, setTasks] = useState([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!currentProject?.id) {
      setTasks([])
      return
    }
    let query = supabase
      .from('tasks')
      .select('id, activity, drawing_id, start_date, finish_date, late_date, percent_complete, section_id, assignee_id, status')
      .eq('project_id', currentProject.id)

    if (sectionId) query = query.eq('section_id', sectionId)
    if (caps.canEditAssignedOnly) query = query.eq('assignee_id', user.id)

    query.then(({ data, error: err }) => {
      if (err) setError(err.message)
      setTasks(data || [])
      setSelectedTaskId('')
    })
  }, [currentProject?.id, sectionId, caps.canEditAssignedOnly, user?.id])

  const focusTask = tasks.find((t) => t.id === selectedTaskId)

  const markers = useMemo(() => {
    const map = new Map()
    const list = focusTask ? [focusTask] : tasks
    list.forEach((t) => {
      ;['start_date', 'finish_date', 'late_date'].forEach((field) => {
        const d = t[field]
        if (!d) return
        if (!map.has(d)) map.set(d, [])
        map.get(d).push({ task: t, type: field })
      })
    })
    return map
  }, [tasks, focusTask])

  const counts = useMemo(() => {
    let start = 0
    let finish = 0
    let late = 0
    markers.forEach((arr) => {
      arr.forEach((m) => {
        if (m.type === 'start_date') start += 1
        if (m.type === 'finish_date') finish += 1
        if (m.type === 'late_date') late += 1
      })
    })
    return { start, finish, late }
  }, [markers])

  function shiftMonth(delta) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  const firstDow = new Date(year, month, 1).getDay()
  const totalDays = daysInMonth(year, month)
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(d)

  const monthLabel = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '18px', alignItems: 'start' }}>
      <aside className="pm-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ margin: 0, fontSize: '13.5px', fontWeight: 700 }}>Milestone Filters</h3>
        
        <label>
          Section
          <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            <option value="">All Sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {displaySectionName(s.header_name)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Specific Task
          <select value={selectedTaskId} onChange={(e) => setSelectedTaskId(e.target.value)}>
            <option value="">All Tasks</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.activity || 'Task'} {t.drawing_id ? `| ${t.drawing_id}` : ''}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} />
            <span>Starts: <strong>{counts.start}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
            <span>Finishes: <strong>{counts.finish}</strong></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)' }} />
            <span>Overdue Target: <strong>{counts.late}</strong></span>
          </div>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </aside>

      <div className="pm-panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{monthLabel}</h2>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button type="button" className="pm-btn tiny secondary" onClick={() => shiftMonth(-1)}>
              <IconChevronLeft size={13} />
            </button>
            <button
              type="button"
              className="pm-btn tiny secondary"
              onClick={() => {
                setYear(today.getFullYear())
                setMonth(today.getMonth())
              }}
            >
              Today
            </button>
            <button type="button" className="pm-btn tiny secondary" onClick={() => shiftMonth(1)}>
              <IconChevronRight size={13} />
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div
              key={d}
              style={{
                textAlign: 'center',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--ink-muted)',
                padding: '4px 0',
                textTransform: 'uppercase',
              }}
            >
              {d}
            </div>
          ))}

          {cells.map((day, idx) => {
            if (day == null) {
              return <div key={`e-${idx}`} style={{ minHeight: '60px', background: 'transparent' }} />
            }
            const key = ymd(year, month, day)
            const marks = markers.get(key) || []
            const isToday =
              day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

            return (
              <div
                key={key}
                style={{
                  minHeight: '60px',
                  background: isToday ? 'var(--primary-subtle)' : 'var(--surface-subtle)',
                  border: `1px solid ${isToday ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: isToday ? 700 : 600,
                    color: isToday ? 'var(--primary)' : 'var(--ink-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {day}
                </span>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
                  {marks.slice(0, 4).map((m, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 4px',
                        borderRadius: '2px',
                        color: '#fff',
                        background:
                          m.type === 'start_date'
                            ? 'var(--primary)'
                            : m.type === 'finish_date'
                            ? 'var(--success)'
                            : 'var(--danger)',
                      }}
                      title={`${m.type.replace('_', ' ')}: ${m.task.activity}`}
                    >
                      {m.type === 'start_date' ? 'S' : m.type === 'finish_date' ? 'F' : 'L'}
                    </span>
                  ))}
                  {marks.length > 4 ? (
                    <span style={{ fontSize: '9px', color: 'var(--ink-muted)', fontWeight: 600 }}>
                      +{marks.length - 4}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
