import * as XLSX from 'xlsx'
import { excelDateToIso, mapExcelSectionToTarget, normalizePercent, normalizeVietnamese } from './progress'
import picMap from '../data/pic_abbreviation_mapping.json'

function sheetToMatrix(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
}

function normHeader(cell) {
  return normalizeVietnamese(String(cell ?? ''))
    .toLowerCase()
    .replace(/[`´']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normSheet(name) {
  return normalizeVietnamese(String(name || ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function cell(row, idx) {
  if (idx == null || idx < 0) return ''
  const v = row[idx]
  return v == null ? '' : v
}

function resolveAbbrev(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (picMap[s]) return picMap[s]
  const hit = Object.keys(picMap).find((k) => k.toLowerCase() === s.toLowerCase())
  return hit ? picMap[hit] : s
}

// FIX: chuẩn hóa Status về đúng 1 trong 4 giá trị dùng trong app (khớp STATUSES ở SectionTasksPage)
function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s.includes('complete')) return 'Completed'
  if (s.includes('progress')) return 'In Progress'
  if (s.includes('hold')) return 'On Hold'
  if (s.includes('not started') || !s) return 'Not Started'
  return String(raw || 'Not Started').trim()
}

/** Desktop sheet names (fuzzy) */
const PROGRESS_SHEET_MATCHERS = [
  (n) => n.includes('01.') || n.includes('3d model'),
  (n) => n.includes('02.') || n.includes('iso export') || (n.includes('iso') && n.includes('export')),
  (n) => n.includes('03.') || n.includes('sys diagram') || (n.includes('2d') && n.includes('drawing')),
  (n) => n.includes('04.') || n === 'mto' || n.endsWith(' mto') || n.includes('. mto'),
]

function isZoneListSheet(name) {
  const n = normSheet(name)
  return n.includes('zone list') && (n.includes('review') || n.includes('plan'))
}

function mapProgressColumns(headerRow) {
  const cols = {}
  headerRow.forEach((raw, idx) => {
    const h = normHeader(raw)
    if (!h) return

    if (cols.activity == null && (h === 'activity' || h.includes('activity'))) cols.activity = idx
    else if (cols.zone == null && (h === 'zone' || h.includes('zone'))) cols.zone = idx
    else if (
      cols.drawingId == null &&
      (h === 'drawing id' ||
        h === 'drawingid' ||
        h === 'drawing no' ||
        h === 'drawing number' ||
        h.includes('drawing id') ||
        h.includes('drawingid'))
    ) {
      cols.drawingId = idx
    } else if (cols.drawingId == null && (h === 'id' || h === 'dwg' || h === 'dwg no')) {
      cols._idSoft = idx
    } else if (
      cols.percent == null &&
      (h.includes('% complete') ||
        h.includes('percentcomplete') ||
        h.includes('percent complete') ||
        h === 'progress %' ||
        h === 'progress%' ||
        h === '%' ||
        h.includes('progress'))
    ) {
      cols.percent = idx
    } else if (cols.section == null && h.includes('section')) cols.section = idx
    else if (cols.startDate == null && h.includes('start')) cols.startDate = idx
    else if (cols.finishDate == null && (h.includes('finish') || h === 'end')) cols.finishDate = idx
    else if (cols.lateDate == null && h.includes('late')) cols.lateDate = idx
    else if (
      cols.pic == null &&
      (h === 'pic' || h.includes('p.i.c') || h.includes('assigned') || h.includes('assignee'))
    ) {
      cols.pic = idx
    }
    // FIX: thêm nhận diện 5 cột mới. Bỏ qua 'description' theo yêu cầu.
    else if (cols.status == null && h === 'status') cols.status = idx
    else if (cols.review3d == null && h.includes('3d review')) cols.review3d = idx
    else if (cols.firstUnit == null && h.includes('first unit')) cols.firstUnit = idx
    else if (cols.unitIssue == null && h.includes('unit issue')) cols.unitIssue = idx
    else if (cols.vvtReview == null && h.includes('vvt review')) cols.vvtReview = idx
    else if (cols.ownerReview == null && h.includes('owner review')) cols.ownerReview = idx
  })
  if (cols.drawingId == null && cols._idSoft != null) cols.drawingId = cols._idSoft
  delete cols._idSoft
  return cols
}

function mapZoneListColumns(headerRow) {
  const cols = {}
  headerRow.forEach((raw, idx) => {
    const h = normHeader(raw)
    if (!h) return
    if (cols.zone == null && (h === 'zone' || h.includes('zone'))) cols.zone = idx
    else if (
      cols.pic == null &&
      (h === 'pic' ||
        h.includes('p.i.c') ||
        h.includes('assigned') ||
        h.includes('abbreviation') ||
        h.includes('initial'))
    ) {
      cols.pic = idx
    }
  })
  return cols
}

function findHeader(matrix, mapper, predicate) {
  for (let i = 0; i < Math.min(matrix.length, 80); i++) {
    const cols = mapper(matrix[i] || [])
    if (predicate(cols)) return { headerRowIdx: i, cols }
  }
  return null
}

function parseZoneListSheet(wb) {
  const zoneToPic = {}
  let sheetNameUsed = ''

  for (const sheetName of wb.SheetNames) {
    if (!isZoneListSheet(sheetName)) continue
    sheetNameUsed = sheetName
    const matrix = sheetToMatrix(wb.Sheets[sheetName])
    const found = findHeader(matrix, mapZoneListColumns, (c) => c.zone != null && c.pic != null)
    if (!found) continue
    const { headerRowIdx, cols } = found
    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r]
      const zone = String(cell(row, cols.zone)).trim()
      const pic = String(cell(row, cols.pic)).trim()
      if (!zone || !pic) continue
      zoneToPic[zone] = pic
      zoneToPic[normalizeVietnamese(zone)] = pic
    }
  }

  return { zoneToPic, sheetNameUsed }
}

function pickProgressSheets(wb) {
  const names = wb.SheetNames
  const picked = []
  const used = new Set()

  for (const matcher of PROGRESS_SHEET_MATCHERS) {
    const hit = names.find((n) => !used.has(n) && matcher(normSheet(n)))
    if (hit) {
      used.add(hit)
      picked.push(hit)
    }
  }

  if (picked.length === 0) {
    for (const sheetName of names) {
      if (isZoneListSheet(sheetName)) continue
      const matrix = sheetToMatrix(wb.Sheets[sheetName])
      const found = findHeader(matrix, mapProgressColumns, (c) => c.activity != null && c.percent != null)
      if (found) picked.push(sheetName)
    }
  }

  return picked
}

export function parsePicPercentWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const { zoneToPic, sheetNameUsed: zoneSheet } = parseZoneListSheet(wb)
  const progressSheets = pickProgressSheets(wb)
  const tasks = []
  const sheetStats = []

  for (const sheetName of progressSheets) {
    const matrix = sheetToMatrix(wb.Sheets[sheetName])
    const found = findHeader(
      matrix,
      mapProgressColumns,
      (c) => c.activity != null && (c.percent != null || c.drawingId != null || c.zone != null)
    )

    if (!found || found.cols.activity == null) {
      sheetStats.push({ sheetName, rows: 0, reason: 'no Activity header' })
      continue
    }

    const { headerRowIdx, cols } = found
    let count = 0

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r]
      if (!row || row.every((c) => String(c).trim() === '')) continue

      const activity = String(cell(row, cols.activity)).trim()
      if (!activity) continue

      const zone = String(cell(row, cols.zone)).trim()
      const drawingId = String(cell(row, cols.drawingId)).trim()
      const percentComplete = normalizePercent(cell(row, cols.percent))

      const abbrevFromZone = zone ? zoneToPic[zone] || zoneToPic[normalizeVietnamese(zone)] || '' : ''
      const abbrevDirect = cols.pic != null ? String(cell(row, cols.pic)).trim() : ''
      const abbrev = abbrevFromZone || abbrevDirect
      const picRaw = resolveAbbrev(abbrev)

      count += 1
      tasks.push({
        activity,
        zone,
        drawingId,
        percentComplete,
        picRaw,
        picFullNameNoDiacritics: normalizeVietnamese(picRaw),
        picAbbrev: abbrev,
        sheetName,
      })
    }

    sheetStats.push({
      sheetName,
      rows: count,
      cols: { ...cols },
      hasZoneCol: cols.zone != null,
      hasDrawingCol: cols.drawingId != null,
      hasPercentCol: cols.percent != null,
    })
  }

  return {
    tasks,
    sheetStats,
    zoneSheet,
    zoneMappingCount: Object.keys(zoneToPic).length,
    progressSheets,
    allSheetNames: wb.SheetNames,
  }
}

/**
 * Parse Piping VT style workbook → sections[{ headerName, activities[] }]
 *
 * FIX: đọc đủ 13 field: Zone, Activity Name, P.I.C, Start date, Finish date,
 * % Complete, Status, 3D Review, First unit, Unit issue (ngày), VVT review,
 * Owner review. Cột nào file không có sẽ để trống '' thay vì làm hỏng object.
 */
export function parsePipingVtWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sectionsMap = new Map()

  for (const sheetName of wb.SheetNames) {
    if (isZoneListSheet(sheetName)) continue
    const matrix = sheetToMatrix(wb.Sheets[sheetName])
    if (!matrix.length) continue

    const found = findHeader(matrix, mapProgressColumns, (c) => c.activity != null)
    if (!found?.cols?.activity) continue
    const { headerRowIdx, cols } = found

    for (let r = headerRowIdx + 1; r < matrix.length; r++) {
      const row = matrix[r]
      if (!row || row.every((c) => String(c).trim() === '')) continue
      const activity = String(cell(row, cols.activity)).trim()
      if (!activity) continue

      const sectionFromCol = cols.section != null ? String(cell(row, cols.section)).trim() : ''
      const zone = (cols.zone != null ? String(cell(row, cols.zone)).trim() : '') || sectionFromCol || sheetName
      const target = mapExcelSectionToTarget(sectionFromCol || sheetName)

      if (!sectionsMap.has(target)) {
        sectionsMap.set(target, { headerName: target, activities: [] })
      }

      sectionsMap.get(target).activities.push({
        zone,
        activity,
        drawingId: String(cell(row, cols.drawingId)).trim(),
        startDate: excelDateToIso(cell(row, cols.startDate)) || '',
        finishDate: excelDateToIso(cell(row, cols.finishDate)) || '',
        lateDate: excelDateToIso(cell(row, cols.lateDate)) || '',
        percentComplete: normalizePercent(cell(row, cols.percent)),
        picRaw: resolveAbbrev(cell(row, cols.pic)),
        status: cols.status != null ? normalizeStatus(cell(row, cols.status)) : 'Not Started',
        review3d: cols.review3d != null ? String(cell(row, cols.review3d)).trim() : '',
        firstUnit: cols.firstUnit != null ? String(cell(row, cols.firstUnit)).trim() : '',
        unitIssueDate: cols.unitIssue != null ? excelDateToIso(cell(row, cols.unitIssue)) || '' : '',
        vvtReview: cols.vvtReview != null ? String(cell(row, cols.vvtReview)).trim() : '',
        ownerReview: cols.ownerReview != null ? String(cell(row, cols.ownerReview)).trim() : '',
      })
    }
  }

  return Array.from(sectionsMap.values())
}

export function fileToArrayBuffer(file) {
  return file.arrayBuffer()
}
