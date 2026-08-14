/**
 * Các component biểu đồ dùng chung, vẽ bằng SVG thuần (không cần thư viện
 * ngoài). Dùng lại được ở nhiều trang: DashboardPage, SummaryPage...
 */

/** Vòng tròn % đơn sắc — dùng cho "Overall progress". */
export function DonutRing({ percent = 0, size = 128, stroke = 14, color = 'var(--shell-accent, var(--sky))' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const offset = c - (clamped / 100) * c

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
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
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.22} fontWeight="700" fill="var(--ink)">
        {clamped}%
      </text>
    </svg>
  )
}

/**
 * Nhiều màu theo tỷ trọng. Mặc định vẽ dạng donut (có lỗ giữa); truyền
 * `solid` để vẽ như pie chart đặc (stroke = bán kính, không có lỗ) —
 * dùng cho các pie chart kiểu Excel/Power BI.
 */
export function MultiSegmentDonut({ segments, size = 128, stroke = 16, solid = false, centerLabel }) {
  const effectiveStroke = solid ? size / 2 : stroke
  const r = (size - effectiveStroke) / 2
  const c = 2 * Math.PI * r
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  let offsetAcc = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {!solid && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={effectiveStroke} />}
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
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.15} fontWeight="700" fill={solid ? '#fff' : 'var(--ink)'}>
          {centerLabel ?? `${total} task`}
        </text>
      )}
    </svg>
  )
}

/** Thanh ngang — dùng để so sánh % giữa nhiều mục (section, group...). */
export function HorizontalBarList({ items }) {
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
                background: it.color || (it.avgPercent >= 90 ? 'var(--ok)' : it.avgPercent >= 40 ? 'var(--brass)' : 'var(--sky)'),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Cột dọc — dùng cho khối lượng theo người, hoặc phân bố theo khoảng %. */
export function VerticalBarChart({ items, height = 160 }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="vbar-chart" style={{ height }}>
      {items.map((it) => (
        <div className="vbar-col" key={it.name}>
          <div className="vbar-value">{it.value}</div>
          <div className="vbar-track" style={{ height: '100%' }}>
            <div
              className="vbar-fill"
              style={{ height: `${(it.value / max) * 100}%`, background: it.color || 'var(--shell-accent, var(--sky))' }}
            />
          </div>
          <div className="vbar-label" title={it.name}>
            {it.name}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Biểu đồ so sánh tiến độ tổng thể giữa nhiều Vessel (hỗ trợ hiển thị mở rộng không giới hạn tàu).
 * Mỗi tàu có thanh % overall, xếp hạng #, và mini badge 4 nhóm (3D/ISO/2D/MTO).
 */
export function MultiVesselComparisonBar({ vessels = [], onSelectVessel }) {
  if (!vessels.length) return <p className="muted">Chưa có dữ liệu tàu để so sánh.</p>

  return (
    <div className="mv-bar-list">
      {vessels.map((v, idx) => {
        const p = v.overallProgress || 0
        const barColor =
          p >= 100
            ? 'linear-gradient(90deg, #10b981, #059669)'
            : p >= 75
            ? 'linear-gradient(90deg, #0ea5e9, #2563eb)'
            : p >= 40
            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
            : 'linear-gradient(90deg, #64748b, #475569)'

        return (
          <div
            key={v.id}
            className={`mv-bar-row ${onSelectVessel ? 'clickable' : ''}`}
            onClick={() => onSelectVessel && onSelectVessel(v)}
            title="Bấm để xem chi tiết tàu"
          >
            <div className="mv-bar-head">
              <div className="mv-bar-title-group">
                <span className={`mv-rank-badge ${idx === 0 ? 'top-1' : idx === 1 ? 'top-2' : idx === 2 ? 'top-3' : ''}`}>
                  #{idx + 1}
                </span>
                <strong className="mv-ship-id">{v.ship_id || v.name}</strong>
                <span className="mv-dept-tag">{v.department || 'Piping'}</span>
                {v.status === 'Completed' && <span className="status-badge ok">Done</span>}
                {v.overdueCount > 0 && (
                  <span className="status-badge danger" title={`${v.overdueCount} task quá hạn`}>
                    ⚠️ {v.overdueCount} overdue
                  </span>
                )}
              </div>
              <div className="mv-bar-stats">
                <span className="mv-tasks-count">{v.totalTasks} tasks</span>
                <strong className="mv-percent-val">{p}%</strong>
              </div>
            </div>

            <div className="mv-track">
              <div
                className="mv-fill"
                style={{
                  width: `${Math.max(2, p)}%`,
                  background: barColor,
                }}
              />
            </div>

            {/* Phân nhóm kỹ thuật 4 khối 3D (65%) | ISO (15%) | 2D (10%) | MTO (10%) */}
            <div className="mv-subgroups">
              <span className="mv-sub-item" title="3D Pipe Drawing (Trọng số 65%)">
                <span className="sub-dot" style={{ background: '#3b82f6' }} />
                3D: <strong>{v.group3D ?? 0}%</strong>
              </span>
              <span className="mv-sub-item" title="ISO Generating (Trọng số 15%)">
                <span className="sub-dot" style={{ background: '#8b5cf6' }} />
                ISO: <strong>{v.groupISO ?? 0}%</strong>
              </span>
              <span className="mv-sub-item" title="2D Drawing (Trọng số 10%)">
                <span className="sub-dot" style={{ background: '#ec4899' }} />
                2D: <strong>{v.group2D ?? 0}%</strong>
              </span>
              <span className="mv-sub-item" title="MTO (Trọng số 10%)">
                <span className="sub-dot" style={{ background: '#10b981' }} />
                MTO: <strong>{v.groupMTO ?? 0}%</strong>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Biểu đồ phân bổ trạng thái công việc chồng lớp (Stacked Status Bar) giữa các tàu.
 * Giúp nhận biết trực quan tỷ lệ Completed / In Progress / Not Started / On Hold.
 */
export function MultiVesselStatusStackedBar({ vessels = [] }) {
  if (!vessels.length) return null

  return (
    <div className="mv-status-stack-list">
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
          <div key={v.id} className="mv-status-row">
            <div className="mv-status-label">
              <span className="mv-ship-name">{v.ship_id || v.name}</span>
              <span className="mv-status-sub">
                {comp}/{total} xong ({pComp}%)
              </span>
            </div>
            <div className="mv-stacked-track" title={`Hoàn thành: ${comp} | Đang làm: ${inProg} | Chưa làm: ${notStart} | On Hold: ${onHold}`}>
              {comp > 0 && <div className="mv-seg comp" style={{ width: `${pComp}%` }} />}
              {inProg > 0 && <div className="mv-seg inprog" style={{ width: `${pInProg}%` }} />}
              {notStart > 0 && <div className="mv-seg notstart" style={{ width: `${pNotStart}%` }} />}
              {onHold > 0 && <div className="mv-seg onhold" style={{ width: `${pOnHold}%` }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Biểu đồ so sánh đối chuẩn theo 4 nhóm chuyên môn (3D / ISO / 2D / MTO) qua các Vessel.
 */
export function GroupBenchmarkChart({ vessels = [] }) {
  if (!vessels.length) return null

  const groups = [
    { key: 'group3D', name: '3D Pipe Drawing', weight: '65%', color: '#3b82f6' },
    { key: 'groupISO', name: 'ISO Generating', weight: '15%', color: '#8b5cf6' },
    { key: 'group2D', name: '2D Drawing', weight: '10%', color: '#ec4899' },
    { key: 'groupMTO', name: 'MTO', weight: '10%', color: '#10b981' },
  ]

  return (
    <div className="benchmark-grid">
      {groups.map((g) => (
        <div key={g.key} className="benchmark-card">
          <div className="benchmark-head">
            <div>
              <strong className="benchmark-title">{g.name}</strong>
              <span className="benchmark-weight">Trọng số {g.weight}</span>
            </div>
            <span className="benchmark-dot" style={{ background: g.color }} />
          </div>

          <div className="benchmark-bars">
            {vessels.map((v) => {
              const val = v[g.key] ?? 0
              return (
                <div key={v.id} className="benchmark-item">
                  <div className="benchmark-item-head">
                    <span className="b-ship">{v.ship_id || v.name}</span>
                    <strong className="b-val">{val}%</strong>
                  </div>
                  <div className="benchmark-track">
                    <div
                      className="benchmark-fill"
                      style={{
                        width: `${val}%`,
                        background: g.color,
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

