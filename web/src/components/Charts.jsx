/**
 * Shared SVG Chart Components for Progress Management Software.
 * Lightweight, accessible, zero-external-dependency visualizations.
 */

export function DonutRing({ percent = 0, size = 128, stroke = 14, color = 'var(--primary)' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = c - (clamped / 100) * c

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-deep)" strokeWidth={stroke} />
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
        fill="var(--ink-primary)"
        fontFamily="var(--font-family)"
      >
        {clamped}%
      </text>
    </svg>
  )
}

export function MultiSegmentDonut({ segments, size = 128, stroke = 16, solid = false, centerLabel }) {
  const effectiveStroke = solid ? size / 2 : stroke
  const r = (size - effectiveStroke) / 2
  const c = 2 * Math.PI * r
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  let offsetAcc = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {!solid && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-deep)" strokeWidth={effectiveStroke} />}
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
            strokeWidth={effectiveStroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offsetAcc}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )
        offsetAcc += dash
        return seg
      })}
      {centerLabel !== false && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.16}
          fontWeight="700"
          fill={solid ? '#fff' : 'var(--ink-primary)'}
          fontFamily="var(--font-family)"
        >
          {centerLabel ?? `${total} tasks`}
        </text>
      )}
    </svg>
  )
}

export function HorizontalBarList({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {items.map((it) => (
        <div key={it.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span>{it.name}</span>
            <strong className="muted">
              {it.avgPercent}% · {it.total} tasks
            </strong>
          </div>
          <div style={{ height: '6px', background: 'var(--bg-deep)', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${it.avgPercent}%`,
                height: '100%',
                background: it.color || (it.avgPercent >= 90 ? 'var(--success)' : it.avgPercent >= 40 ? 'var(--warning)' : 'var(--primary)'),
                borderRadius: '999px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function VerticalBarChart({ items, height = 160 }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height, paddingTop: '16px' }}>
      {items.map((it) => (
        <div key={it.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', minWidth: 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', marginBottom: '4px' }}>
            {it.value}
          </div>
          <div style={{ width: '100%', maxWidth: '36px', height: '100%', background: 'var(--bg-deep)', borderRadius: '4px 4px 0 0', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
            <div
              style={{
                width: '100%',
                height: `${(it.value / max) * 100}%`,
                background: it.color || 'var(--primary)',
                borderRadius: '4px 4px 0 0',
                transition: 'height 0.4s ease',
              }}
            />
          </div>
          <div
            style={{
              marginTop: '6px',
              fontSize: '10px',
              color: 'var(--ink-muted)',
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '80px',
            }}
            title={it.name}
          >
            {it.name}
          </div>
        </div>
      ))}
    </div>
  )
}

export function MultiVesselComparisonBar({ vessels = [], onSelectVessel }) {
  if (!vessels.length) return <p className="muted">No vessel data to display.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {vessels.map((v, idx) => {
        const p = v.overallProgress || 0
        const barColor =
          p >= 100
            ? 'var(--success)'
            : p >= 50
            ? 'var(--primary)'
            : 'var(--warning)'

        return (
          <div
            key={v.id}
            onClick={() => onSelectVessel && onSelectVessel(v)}
            style={{
              padding: '10px 12px',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              cursor: onSelectVessel ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)' }}>#{idx + 1}</span>
                <strong style={{ fontSize: '13px' }}>Vessel {v.ship_id || v.name}</strong>
                <span className="v-dept-badge">{v.department || 'Piping'}</span>
                {v.status === 'Completed' && <span className="pill ok">Done</span>}
                {v.overdueCount > 0 && (
                  <span className="pill" style={{ background: 'var(--danger-subtle)', color: 'var(--danger)' }}>
                    ⚠️ {v.overdueCount} overdue
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="muted" style={{ fontSize: '11px' }}>{v.totalTasks} tasks</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{p}%</strong>
              </div>
            </div>

            <div style={{ height: '6px', background: 'var(--bg-deep)', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
              <div
                style={{
                  width: `${Math.max(2, p)}%`,
                  height: '100%',
                  background: barColor,
                  borderRadius: '999px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '14px', fontSize: '11px', color: 'var(--ink-muted)' }}>
              <span>3D: <strong style={{ color: 'var(--ink-primary)' }}>{v.group3D ?? 0}%</strong></span>
              <span>ISO: <strong style={{ color: 'var(--ink-primary)' }}>{v.groupISO ?? 0}%</strong></span>
              <span>2D: <strong style={{ color: 'var(--ink-primary)' }}>{v.group2D ?? 0}%</strong></span>
              <span>MTO: <strong style={{ color: 'var(--ink-primary)' }}>{v.groupMTO ?? 0}%</strong></span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function MultiVesselStatusStackedBar({ vessels = [] }) {
  if (!vessels.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {vessels.map((v) => {
        const total = v.totalTasks || 1
        const comp = v.statusCounts?.Completed || 0
        const inProg = v.statusCounts?.['In Progress'] || 0
        const notStart = v.statusCounts?.['Not Started'] || 0
        const onHold = v.statusCounts?.['On Hold'] || 0

        const pComp = Math.round((comp / total) * 100)
        const pInProg = Math.round((inProg / total) * 100)
        const pNotStart = Math.round((notStart / total) * 100)
        const pOnHold = Math.max(0, 100 - pComp - pInProg - pNotStart)

        return (
          <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <strong>Vessel {v.ship_id || v.name}</strong>
              <span className="muted">
                {comp}/{total} done ({pComp}%)
              </span>
            </div>
            <div style={{ height: '8px', background: 'var(--bg-deep)', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
              {comp > 0 && <div style={{ width: `${pComp}%`, background: 'var(--success)' }} title={`Completed: ${comp}`} />}
              {inProg > 0 && <div style={{ width: `${pInProg}%`, background: 'var(--warning)' }} title={`In Progress: ${inProg}`} />}
              {notStart > 0 && <div style={{ width: `${pNotStart}%`, background: 'var(--ink-faint)' }} title={`Not Started: ${notStart}`} />}
              {onHold > 0 && <div style={{ width: `${pOnHold}%`, background: 'var(--danger)' }} title={`On Hold: ${onHold}`} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function GroupBenchmarkChart({ vessels = [] }) {
  if (!vessels.length) return null

  const groups = [
    { key: 'group3D', name: '3D Pipe Drawing', weight: '65%', color: '#2563eb' },
    { key: 'groupISO', name: 'ISO Generating', weight: '15%', color: '#8b5cf6' },
    { key: 'group2D', name: '2D Plan Drawing', weight: '10%', color: '#ec4899' },
    { key: 'groupMTO', name: 'MTO Material Take-Off', weight: '10%', color: '#10b981' },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
      {groups.map((g) => (
        <div key={g.key} className="pm-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '13px' }}>{g.name}</strong>
              <div className="muted" style={{ fontSize: '11px' }}>Weight {g.weight}</div>
            </div>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: g.color }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {vessels.map((v) => {
              const val = v[g.key] ?? 0
              return (
                <div key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px' }}>
                    <span className="muted">{v.ship_id || v.name}</span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{val}%</strong>
                  </div>
                  <div style={{ height: '5px', background: 'var(--bg-deep)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${val}%`,
                        height: '100%',
                        background: g.color,
                        borderRadius: '999px',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
