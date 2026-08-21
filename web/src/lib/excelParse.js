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
]

function isMtoSheet(name) {
  const n = normSheet(name)
  return n.includes('04.') || n === 'mto' || n.endsWith(' mto') || n.includes('. mto')
}

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
    } else if (cols.status == null && h === 'status') cols.status = idx
    // FIX: "Disc. Review" (sheet 01) hoặc "3D Review" (sheet 02) — cùng ý
    // nghĩa (ngày review theo discipline), gộp chung vào 1 field `review`.
    else if (cols.review == null && (h.includes('disc') || h.includes('3d')) && h.includes('review')) {
      cols.review = idx
    } else if (cols.unitRelevant == null && h.includes('unit relevant')) cols.unitRelevant = idx
  })
  if (cols.drawingId == null && cols._idSoft != null) cols.drawingId = cols._idSoft
  delete cols._idSoft
  return cols
}

/**
 * FIX: mở rộng đọc thêm First Unit / Unit release / Unit issue / VVT / Owner
 * theo Zone — trước đây chỉ đọc PIC. Các giá trị này áp dụng CHUNG cho mọi
 * task cùng Zone (không phải theo từng task riêng lẻ).
 */
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
    } else if (cols.firstUnit == null && h.includes('first unit')) cols.firstUnit = idx
    else if (cols.unitIssue == null && h.includes('unit issue')) cols.unitIssue = idx
    else if (cols.vvt == null && h === 'vvt') cols.vvt = idx
    else if (cols.owner == null && h === 'owner') cols.owner = idx
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

/**
 * FIX: giờ trả về map theo zone chứa cả 4 field (không chỉ PIC), để
 * parsePicPercentWorkbook join vào từng task theo đúng Zone.
 */
function parseZoneListSheet(wb) {
  const zoneInfo = {} // zone -> { picAbbrev, firstUnit, unitIssue, vvt, owner }
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
      const info = {
        picAbbrev: pic,
        firstUnit: cols.firstUnit != null ? String(cell(row, cols.firstUnit)).trim() : '',
        unitIssue: cols.unitIssue != null ? excelDateToIso(cell(row, cols.unitIssue)) || '' : '',
        vvt: cols.vvt != null ? String(cell(row, cols.vvt)).trim() : '',
        owner: cols.owner != null ? String(cell(row, cols.owner)).trim() : '',
      }
      zoneInfo[zone] = info
      zoneInfo[normalizeVietnamese(zone)] = info
    }
  }

  return { zoneInfo, sheetNameUsed }
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
      if (isZoneListSheet(sheetName) || isMtoSheet(sheetName)) continue
      const matrix = sheetToMatrix(wb.Sheets[sheetName])
      const found = findHeader(matrix, mapProgressColumns, (c) => c.activity != null && c.percent != null)
      if (found) picked.push(sheetName)
    }
  }

  return picked
}

/**
 * FIX: sheet MTO có cấu trúc HOÀN TOÀN khác (Docs No | Description |
 * File name | PIC | Status | Progress | QC status | Rev | Date | Remark)
 * — không có "Activity Name"/"% Complete" như 3 sheet kia, nên cần parser
 * riêng, không dùng chung mapProgressColumns.
 */
function mapMtoColumns(headerRow) {
  const cols = {}
  headerRow.forEach((raw, idx) => {
    const h = normHeader(raw)
    if (!h) return
    if (cols.docsNo == null && h.includes('docs no')) cols.docsNo = idx
    else if (cols.description == null && h === 'description') cols.description = idx
    else if (cols.fileName == null && h.includes('file name')) cols.fileName = idx
    else if (cols.pic == null && h === 'pic') cols.pic = idx
    else if (cols.status == null && h === 'status') cols.status = idx
    else if (cols.progress == null && h === 'progress') cols.progress = idx
    else if (cols.qcStatus == null && h.includes('qc status')) cols.qcStatus = idx
    else if (cols.rev == null && h === 'rev') cols.rev = idx
    else if (cols.date == null && h === 'date') cols.date = idx
    else if (cols.remark == null && h === 'remark') cols.remark = idx
  })
  return cols
}

function parseMtoSheet(wb, sheetName) {
  const matrix = sheetToMatrix(wb.Sheets[sheetName])
  const found = findHeader(matrix, mapMtoColumns, (c) => c.docsNo != null && c.pic != null)
  if (!found) return []
  const { headerRowIdx, cols } = found
  const rows = []
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r]
    if (!row || row.every((c) => String(c).trim() === '')) continue
    const docsNo = String(cell(row, cols.docsNo)).trim()
    if (!docsNo) continue
    const picRaw = resolveAbbrev(cell(row, cols.pic))
    rows.push({
      drawingId: docsNo, // Docs No dùng làm khóa khớp, giống drawing_id
      activity: String(cell(row, cols.description)).trim(),
      zone: '',
      percentComplete: normalizePercent(cell(row, cols.progress)),
      status: cols.status != null ? normalizeStatus(cell(row, cols.status)) : 'Not Started',
      picRaw,
      picFullNameNoDiacritics: normalizeVietnamese(picRaw),
      sheetName,
      isMto: true,
    })
  }
  return rows
}

/**
 * Desktop-compatible PIC/% parser:
 * - Zone list vs review plan → zone → PIC abbrev + First Unit/Unit issue/VVT/Owner
 * - Sheets 01..03 → Activity, Zone, Drawing ID, %, Review
 * - Sheet 04 (MTO) → parser riêng (parseMtoSheet)
 * - PIC full name = mapping[zoneToPIC[zone]]
 */
export function parsePicPercentWorkbook(arrayBuffer, fileName) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const { zoneInfo, sheetNameUsed: zoneSheet } = parseZoneListSheet(wb)
  const progressSheets = pickProgressSheets(wb)
  const tasks = []
  const sheetStats = []
  const shipHint = shipHintFromProgressFileName(fileName)

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

      // FIX: PIC ưu tiên lấy trực tiếp từ cột PIC của sheet progress (nếu có),
      // fallback sang Zone list nếu sheet này không có cột PIC riêng.
      const zi = zone ? zoneInfo[zone] || zoneInfo[normalizeVietnamese(zone)] : null
      const abbrevDirect = cols.pic != null ? String(cell(row, cols.pic)).trim() : ''
      const abbrev = abbrevDirect || zi?.picAbbrev || ''
      const picRaw = resolveAbbrev(abbrev)

      count += 1
      tasks.push({
        activity,
        zone,
        drawingId,
        percentComplete,
        status: cols.status != null ? normalizeStatus(cell(row, cols.status)) : undefined,
        picRaw,
        picFullNameNoDiacritics: normalizeVietnamese(picRaw),
        picAbbrev: abbrev,
        review: cols.review != null ? excelDateToIso(cell(row, cols.review)) || '' : '',
        unitRelevant: cols.unitRelevant != null ? String(cell(row, cols.unitRelevant)).trim() : '',
        // FIX: join thêm 4 field theo Zone list — dùng chung cho mọi task cùng zone
        firstUnit: zi?.firstUnit || '',
        unitIssueDate: zi?.unitIssue || '',
        vvtReview: zi?.vvt || '',
        ownerReview: zi?.owner || '',
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

  // FIX: parse riêng sheet MTO, gộp chung vào cùng danh sách tasks
  const mtoSheetName = wb.SheetNames.find(isMtoSheet)
  if (mtoSheetName) {
    const mtoRows = parseMtoSheet(wb, mtoSheetName)
    tasks.push(...mtoRows)
    sheetStats.push({ sheetName: mtoSheetName, rows: mtoRows.length })
  }

  return {
    tasks,
    shipHint,
    sheetStats,
    zoneSheet,
    zoneMappingCount: Object.keys(zoneInfo).length,
    progressSheets: mtoSheetName ? [...progressSheets, mtoSheetName] : progressSheets,
    allSheetNames: wb.SheetNames,
  }
}

/**
 * Parse Piping VT style workbook → sections[{ headerName, activities[] }]
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
      })
    }
  }

  return Array.from(sectionsMap.values())
}

export function fileToArrayBuffer(file) {
  return file.arrayBuffer()
}

/**
 * Lấy mã tàu từ tên file Sync % / PIC.
 * VD: "994 progress management ongoing.xlsx" → "994"
 *     "1005 progress management ônging.xlsx" → "1005"
 *     "NB1005__....xlsx" → "1005"
 *
 * Ưu tiên số đứng trước chữ "progress" (đúng convention file sync),
 * không lấy mã hull/quốc tế trong nội dung sheet.
 */
export function shipHintFromProgressFileName(fileName) {
  if (!fileName) return null
  const base = String(fileName)
    .replace(/^.*[\\/]/, '')
    .replace(/\.(xlsx|xls|xlsm)$/i, '')
    .trim()

  const beforeProgress = base.match(/^(\d{3,5})\s*[-_]?\s*progress\b/i)
  if (beforeProgress) return beforeProgress[1]

  const nb = base.match(/NB\s*[-_]?\s*(\d{3,5})\b/i)
  if (nb) return nb[1]

  const leading = base.match(/^(\d{3,5})\b/)
  if (leading) return leading[1]

  return null
}
