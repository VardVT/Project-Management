import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { CANONICAL_SECTIONS, displaySectionName } from '../lib/roles'
import { buildWorkloadSeries, HOURS_PER_DAY } from '../lib/workload'
import { SCurveChart, DualDailyBars } from '../components/Charts'

function fmtHours(n) {
  const v = Math.round(Number(n) || 0)
  return `${v.toLocaleString()}h`
}

export function ReportsPage() {
  const { caps, user } = useAuth()
  const { projects, currentProject, sections, selectProject } = useProject()
  const [vesselId, setVesselId] = useState(currentProject?.id || '')
  const [sectionKey, setSectionKey] = useState('')
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (currentProject?.id) setVesselId(currentProject.id)
  }, [currentProject?.id])

  const sectionOptions = useMemo(() => {
    if (!vesselId) {
      return CANONICAL_SECTIONS.map((name) => ({ value: name, label: displaySectionName(name) }))
    }
    return sections.map((s) => ({ value: s.id, label: displaySectionName(s.header_name) }))
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
      let q = supabase
        .from('tasks')
        .select(
          'id, project_id, section_id, start_date, finish_date, late_date, percent_complete, status, completed_at, activity',
        )

      if (vesselId) {
        q = q.eq('project_id', vesselId)
        if (sectionKey) q = q.eq('section_id', sectionKey)
      } else if (sectionKey) {
        const { data: matched, error: secErr } = await supabase
          .from('sections')
          .select('id')
          .eq('header_name', sectionKey)
        if (secErr) {
          if (!cancelled) {
            setError(secErr.message)
            setLoading(false)
          }
          return
        }
        const ids = (matched || []).map((s) => s.id)
        if (!ids.length) {
          if (!cancelled) {
            setTasks([])
            setLoading(false)
          }
          return
        }
        q = q.in('section_id', ids)
      }

      if (caps.canEditAssignedOnly) q = q.eq('assignee_id', user.id)

      const { data, error: err } = await q
      if (cancelled) return
      if (err) setError(err.message)
      setTasks(data || [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [vesselId, sectionKey, projects.length, caps.canEditAssignedOnly, user?.id])

  function onVesselChange(id) {
    setVesselId(id)
    setSectionKey('')
    if (id) {
      const p = projects.find((x) => x.id === id)
      if (p) selectProject(p)
    }
  }

  const series = useMemo(() => buildWorkloadSeries(tasks), [tasks])
  const { totals } = series
  const vesselLabel = vesselId
    ? projects.find((p) => p.id === vesselId)?.ship_id ||
      projects.find((p) => p.id === vesselId)?.name ||
      'Vessel'
    : 'All vessels'

  if (!caps.showReports) {
    return (
      <div className="pm-panel" style={{ padding: 32, textAlign: 'center' }}>
        <p className="muted">Reports are available to Manager / Senior roles.</p>
      </div>
    )
  }

  if (!projects.length) {
    return (
      <div className="pm-panel" style={{ padding: 40, textAlign: 'center' }}>
        <h3 style={{ marginTop: 0 }}>No vessels loaded</h3>
        <p className="muted">Create a vessel project to generate workload reports.</p>
      </div>
    )
  }

  return (
    <div className="stack reports-page">
      <div className="pm-hero shell-manager">
        <p className="eyebrow">Workload analytics</p>
        <h2>Reports · Plan vs Actual</h2>
        <p className="muted">
          S-curve and daily hours · <strong>{vesselLabel}</strong> · {HOURS_PER_DAY}h / calendar day · start fixed,
          close = complete
        </p>
      </div>

      <div className="pm-panel reports-toolbar">
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
        <div className="reports-legend">
          <span>
            <i className="reports-swatch plan" /> Plan
          </span>
          <span>
            <i className="reports-swatch actual" /> Actual
          </span>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="muted">Loading workload…</p> : null}

      <div className="reports-kpi-row">
        <div className="pm-panel reports-kpi">
          <span className="reports-kpi-label">Plan total</span>
          <strong className="reports-kpi-num">{fmtHours(totals.planHours)}</strong>
          <span className="muted reports-kpi-sub">Σ days × {HOURS_PER_DAY}h (start→finish)</span>
        </div>
        <div className="pm-panel reports-kpi">
          <span className="reports-kpi-label">Plan to date</span>
          <strong className="reports-kpi-num">{fmtHours(totals.planHoursToDate)}</strong>
          <span className="muted reports-kpi-sub">Planned hours through today</span>
        </div>
        <div className="pm-panel reports-kpi">
          <span className="reports-kpi-label">Actual to date</span>
          <strong className="reports-kpi-num">{fmtHours(totals.actualHoursToDate)}</strong>
          <span className="muted reports-kpi-sub">Start → today / completed_at</span>
        </div>
        <div className="pm-panel reports-kpi">
          <span className="reports-kpi-label">Variance</span>
          <strong
            className="reports-kpi-num"
            style={{ color: totals.varianceHours > 0 ? 'var(--danger)' : 'var(--success)' }}
          >
            {totals.varianceHours > 0 ? '+' : ''}
            {fmtHours(totals.varianceHours)}
          </strong>
          <span className="muted reports-kpi-sub">Actual − Plan (to date)</span>
        </div>
        <div className="pm-panel reports-kpi">
          <span className="reports-kpi-label">Tasks</span>
          <strong className="reports-kpi-num">
            {totals.openTaskCount}
            <span className="reports-kpi-split"> / {totals.closedTaskCount}</span>
          </strong>
          <span className="muted reports-kpi-sub">Open / completed (in filter)</span>
        </div>
      </div>

      <div className="pm-panel">
        <div className="reports-card-head">
          <h3>S-curve · cumulative hours</h3>
          <p className="muted">Plan baseline vs actual elapsed (9h/day). No PIC split.</p>
        </div>
        <SCurveChart
          days={series.days}
          plan={series.planCumulative}
          actual={series.actualCumulative}
          height={280}
        />
      </div>

      <div className="pm-panel">
        <div className="reports-card-head">
          <h3>Daily hours · Plan vs Actual</h3>
          <p className="muted">Grey = plan · Teal = actual (sampled if range is long)</p>
        </div>
        <DualDailyBars days={series.days} plan={series.planDaily} actual={series.actualDaily} height={180} />
      </div>
    </div>
  )
}
