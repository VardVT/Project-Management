/** Progress helpers: Vietnamese normalize, dashboard weights */

export function normalizeVietnamese(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
}

export const GROUP_DENSITIES = {
  '3D drawing': 65,
  '2D drawing': 10,
  'Iso generating': 15,
  MTO: 10,
}

/** Merge stored project weights with defaults (non-negative numbers only). */
export function resolveGroupDensities(stored) {
  const base = { ...GROUP_DENSITIES }
  if (!stored || typeof stored !== 'object') return base
  for (const key of Object.keys(base)) {
    const n = Number(stored[key])
    if (Number.isFinite(n) && n >= 0) base[key] = n
  }
  return base
}

export function getDashboardGroupFromSectionName(headerName) {
  const raw = String(headerName || '').trim()
  if (!raw) return null
  const n = normalizeVietnamese(raw).toLowerCase()

  // Drawing markup inbox — track issues only, never weight into Summary %
  if (n === 'live comment' || n.includes('live comment')) return null

  if (n.includes('checking') || n.includes('coordination') || n.includes('general')) {
    return null
  }
  if (n === 'mto') return 'MTO'
  if (n.includes('iso')) return 'Iso generating'
  if (n.includes('2d')) return '2D drawing'
  if (n.includes('3d pipe drawing') || n.includes('3d drawing') || n === '3d drawing') {
    return '3D drawing'
  }
  return null
}

/**
 * @param {Array<{header_name: string, tasks: Array<{percent_complete?: number}>}>} sectionsWithTasks
 * @param {Record<string, number>|null} [densitiesOverride]
 */
export function computeWeightedProgress(sectionsWithTasks, densitiesOverride = null) {
  const densities = resolveGroupDensities(densitiesOverride)
  const groupStats = {
    '3D drawing': { totalTasks: 0, totalPercentSum: 0 },
    '2D drawing': { totalTasks: 0, totalPercentSum: 0 },
    'Iso generating': { totalTasks: 0, totalPercentSum: 0 },
    MTO: { totalTasks: 0, totalPercentSum: 0 },
  }

  const sectionStats = []

  for (const section of sectionsWithTasks) {
    const tasks = section.tasks || []
    const total = tasks.length
    let sum = 0
    tasks.forEach((t) => {
      sum += Number(t.percent_complete) || 0
    })
    const avg = total > 0 ? Math.round(sum / total) : 0
    sectionStats.push({
      name: section.header_name,
      total,
      avgPercent: avg,
    })

    const group = getDashboardGroupFromSectionName(section.header_name)
    if (group && total > 0) {
      groupStats[group].totalTasks += total
      groupStats[group].totalPercentSum += sum
    }
  }

  const groups = []
  let weightedProgressSum = 0
  let totalDensity = 0

  Object.keys(densities).forEach((groupName) => {
    const g = groupStats[groupName]
    if (g.totalTasks > 0) {
      const avg = Math.round(g.totalPercentSum / g.totalTasks)
      const density = densities[groupName]
      groups.push({ name: groupName, total: g.totalTasks, avgPercent: avg, density })
      weightedProgressSum += avg * density
      totalDensity += density
    }
  })

  const overallProgress = totalDensity > 0 ? Math.round(weightedProgressSum / totalDensity) : 0
  const totalTasks = sectionStats.reduce((a, s) => a + s.total, 0)

  return { overallProgress, groups, sectionStats, totalTasks }
}

const PIE_COLORS_SUMMARY = { notStarted: '#64748b', inProgress: '#0d9488', completed: '#059669' }

function daysBetweenDates(startIso, endIso) {
  if (!startIso || !endIso) return null
  const d = Math.round((new Date(endIso) - new Date(startIso)) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

/**
 * Summary table rows + overall — uses same weighted formula as Fleet Dashboard.
 * @param {Array} tasks — project tasks
 * @param {Array<{id, header_name}>} sections — all sections for the vessel (not sidebar-only)
 * @param {Record<string, number>|null} densitiesOverride — project group_weights
 */
export function buildSummaryGroupTable(tasks, sections, densitiesOverride = null) {
  const densities = resolveGroupDensities(densitiesOverride)
  const groupNames = Object.keys(GROUP_DENSITIES)

  const sectionsWithTasks = (sections || []).map((s) => ({
    header_name: s.header_name,
    tasks: (tasks || []).filter((t) => t.section_id === s.id),
  }))
  const stats = computeWeightedProgress(sectionsWithTasks, densitiesOverride)

  const sectionNameById = new Map((sections || []).map((s) => [s.id, s.header_name]))
  const byGroup = new Map(groupNames.map((g) => [g, []]))
  ;(tasks || []).forEach((t) => {
    const group = getDashboardGroupFromSectionName(sectionNameById.get(t.section_id))
    if (group && byGroup.has(group)) byGroup.get(group).push(t)
  })

  const statByGroup = new Map((stats.groups || []).map((g) => [g.name, g]))

  const rows = groupNames.map((name) => {
    const list = byGroup.get(name) || []
    const stat = statByGroup.get(name)
    const total = list.length
    const avgPercent = stat?.avgPercent ?? 0
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
      density: densities[name],
      start,
      end,
      days: daysBetweenDates(start, end),
      pie: [
        { name: 'Not Started', value: notStarted, color: PIE_COLORS_SUMMARY.notStarted },
        { name: 'In Progress', value: inProgress, color: PIE_COLORS_SUMMARY.inProgress },
        { name: 'Completed', value: completed, color: PIE_COLORS_SUMMARY.completed },
      ].filter((s) => s.value > 0),
    }
  })

  const allStarts = rows.flatMap((r) => (r.start ? [r.start] : [])).sort()
  const allEnds = rows.flatMap((r) => (r.end ? [r.end] : [])).sort()
  const allStart = allStarts[0] || null
  const allEnd = allEnds[allEnds.length - 1] || null
  const overall = stats.overallProgress ?? 0

  const allRow = {
    name: 'Total Project',
    total: stats.totalTasks ?? (tasks || []).length,
    avgPercent: overall,
    remaining: 100 - overall,
    density: '100%',
    start: allStart,
    end: allEnd,
    days: daysBetweenDates(allStart, allEnd),
  }

  return { allRow, rows, stats }
}

export const SECTION_MAPPING = {
  'General drawing': [
    '2D & 3D Checking and Coordination',
    '2D and 3D Checking and Coordination',
    'General Arrangement',
    'General Arranagement', // typo in Engineering Plans
    'Pipe Production Support',
    'Production Supports',
    'Production Support',
  ],
  '3D Equipment Modeling': ['3D Equipment Modeling'],
  '3D Pipe Drawing': [
    'Equipment arrangement',
    'Equipment Arrangement',
    'Pipe Modeling',
    '3D Pipe Drawing',
  ],
  'ISO generation': ['Iso generating', 'ISO generating', 'Iso Generating', 'ISO generation'],
  'Pipe 2D drawing': [
    'Piping 2D drawing',
    'Pipe 2D drawing',
    '2D drawing',
    '2D Drawing',
    '2D drawings',
    'Pipe 2D',
    'Piping 2D',
    'Sys diagram & 2D drawing',
    'System diagram & 2D drawing',
    'System Diagram',
    'Sys Diagram',
    '03. Sys diagram & 2D drawing',
  ],
  MTO: ['MTO'],
}

export function mapExcelSectionToTarget(headerName) {
  const key = String(headerName || '').trim().toLowerCase()
  if (!key) return 'General drawing'
  for (const [target, sources] of Object.entries(SECTION_MAPPING)) {
    if (sources.some((s) => s.toLowerCase() === key) || target.toLowerCase() === key) {
      return target
    }
  }
  // soft match like desktop canonicalize (fallback)
  if (key.includes('mto')) return 'MTO'
  // Ưu tiên 2D trước ISO khi tên sheet/WBS có 03 / 2d / diagram
  if (
    key.includes('03.') ||
    key.includes('2d') ||
    key.includes('sys diagram') ||
    key.includes('system diagram') ||
    (key.includes('diagram') && !key.includes('iso'))
  ) {
    return 'Pipe 2D drawing'
  }
  if (key.includes('iso')) return 'ISO generation'
  if (key.includes('pipe modeling') || key.includes('3d pipe')) return '3D Pipe Drawing'
  if (key.includes('3d equipment')) return '3D Equipment Modeling'
  if (key.includes('arranagement') || key.includes('arrangement')) return 'General drawing'
  if (key.includes('production support') || key.includes('checking') || key.includes('coordination')) {
    return 'General drawing'
  }
  return String(headerName || '').trim() || 'General drawing'
}

export function isMtoTask(task) {
  const activity = String(task.activity || '').toLowerCase()
  const zone = String(task.zone || '').toLowerCase()
  const drawingId = String(task.drawing_id || task.drawingId || '')
  return activity.includes('mto') || zone.includes('mto') || drawingId.includes('-770-')
}

export function normalizePercent(value) {
  let n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (n <= 1) n = Math.round(n * 100)
  else if (n > 100) n = 100
  else n = Math.round(n)
  return n
}

/** 0% → Not Started · 100% → Completed · còn lại → In Progress */
export function statusFromPercent(percent) {
  const n = Number(percent)
  if (!Number.isFinite(n) || n <= 0) return 'Not Started'
  if (n >= 100) return 'Completed'
  return 'In Progress'
}

/**
 * Đổi status thì chỉnh % đi kèm.
 * On Hold giữ nguyên % hiện tại.
 * In Progress: nếu đang 0/100 thì đặt 10%, không thì giữ %.
 */
export function percentFromStatus(status, currentPercent = 0) {
  const s = String(status || '').trim()
  if (s === 'Not Started') return 0
  if (s === 'Completed') return 100
  if (s === 'On Hold') {
    const cur = Number(currentPercent)
    return Number.isFinite(cur) ? Math.min(100, Math.max(0, cur)) : 0
  }
  const cur = Number(currentPercent)
  if (!Number.isFinite(cur) || cur <= 0 || cur >= 100) return 10
  return cur
}

/**
 * Đồng bộ % ↔ status trong patch trước khi ghi DB.
 * Ưu tiên % làm nguồn sự thật (trừ khi status = On Hold).
 */
export function syncPercentAndStatus(patch, current = {}) {
  const next = { ...patch }
  const hasPercent = next.percent_complete != null
  const hasStatus = next.status != null

  if (hasPercent && hasStatus) {
    if (String(next.status) !== 'On Hold') {
      next.status = statusFromPercent(next.percent_complete)
    }
    return next
  }
  if (hasPercent) {
    next.status = statusFromPercent(next.percent_complete)
    return next
  }
  if (hasStatus && String(next.status) !== 'On Hold') {
    next.percent_complete = percentFromStatus(next.status, current.percent_complete)
  }
  return next
}

export function excelDateToIso(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    // Excel serial date
    const utc = Date.UTC(1899, 11, 30) + value * 86400000
    const d = new Date(utc)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  }
  const s = String(value).trim()
  if (!s || s.toLowerCase() === 'n/a' || s === '-') return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    let yyyy = m[3]
    if (yyyy.length === 2) yyyy = `20${yyyy}`
    return `${yyyy}-${mm}-${dd}`
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}
