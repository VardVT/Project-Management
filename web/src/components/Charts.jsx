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
