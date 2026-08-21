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

export function getDashboardGroupFromSectionName(headerName) {
  const raw = String(headerName || '').trim()
  if (!raw) return null
  const n = normalizeVietnamese(raw).toLowerCase()

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
 */
export function computeWeightedProgress(sectionsWithTasks) {
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

  Object.keys(GROUP_DENSITIES).forEach((groupName) => {
    const g = groupStats[groupName]
    if (g.totalTasks > 0) {
      const avg = Math.round(g.totalPercentSum / g.totalTasks)
      const density = GROUP_DENSITIES[groupName]
      groups.push({ name: groupName, total: g.totalTasks, avgPercent: avg, density })
      weightedProgressSum += avg * density
      totalDensity += density
    }
  })

  const overallProgress = totalDensity > 0 ? Math.round(weightedProgressSum / totalDensity) : 0
  const totalTasks = sectionStats.reduce((a, s) => a + s.total, 0)

  return { overallProgress, groups, sectionStats, totalTasks }
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
    'Pipe 2D',
    'Piping 2D',
    'Sys diagram & 2D drawing',
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
  if (key.includes('iso')) return 'ISO generation'
  if (key.includes('pipe modeling') || key.includes('3d pipe')) return '3D Pipe Drawing'
  if (key.includes('3d equipment')) return '3D Equipment Modeling'
  // "2D drawing", "sys diagram", sheet 03… → cùng về Pipe 2D drawing
  // (tránh nhầm "2D & 3D Checking…" đã match exact ở General drawing phía trên)
  if (key.includes('2d') || key.includes('sys diagram')) return 'Pipe 2D drawing'
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
