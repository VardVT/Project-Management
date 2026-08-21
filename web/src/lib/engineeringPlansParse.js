import * as XLSX from 'xlsx'
import { excelDateToIso, normalizePercent, normalizeVietnamese } from './progress'

function leadingSpaces(value) {
  const m = String(value ?? '').match(/^[ ]*/)
  return (m?.[0] || '').length
}

function cell(row, idx) {
  if (idx == null || idx < 0) return ''
  const v = row[idx]
  return v == null ? '' : v
}

function mapHeader(headerRow) {
  const cols = {}
  headerRow.forEach((raw, idx) => {
    const h = normalizeVietnamese(String(raw || ''))
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    if (!h) return
    if (h === 'vessel') cols.vessel = idx
    else if (h === 'drawing id' || h === 'drawingid') cols.drawingId = idx
    else if (h === 'activity id' || h === 'activityid') cols.activityId = idx
    else if (h === 'activity name' || h === 'activity') cols.activityName = idx
    else if (h === 'engineer') cols.engineer = idx
    else if (h === 'activity status' || h === 'status') cols.status = idx
    else if (h === 'start') cols.start = idx
    else if (h === 'finish') cols.finish = idx
    else if (h.includes('late finish') || h === 'late') cols.late = idx
    else if (h.includes('expected finish')) cols.expectedFinish = idx
    else if (h.includes('performance') && h.includes('%')) cols.percent = idx
    else if (h.includes('% complete') && cols.percent == null) cols.percent = idx
  })
  return cols
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase()
  if (s.includes('complete')) return 'Completed'
  if (s.includes('progress')) return 'In Progress'
  if (s.includes('hold')) return 'On Hold'
  if (s.includes('not started') || !s) return 'Not Started'
  return String(raw || 'Not Started').trim()
}

/**
 * Quy tắc % theo status, do file "Technical Activities" không có cột % riêng:
 *   - Completed    -> 100
 *   - Not Started  -> 0
 *   - In Progress  -> 10 (mốc cố định, KHÔNG có số % thật trong file nguồn)
 * Nếu cột % (performance/% complete) thực sự có giá trị > 0 trong sheet,
 * ưu tiên dùng giá trị đó thay vì suy ra từ status.
 */
function percentFromStatusOrColumn(status, rawPercentCell) {
  const fromColumn = normalizePercent(rawPercentCell)
  if (fromColumn > 0) return fromColumn

  if (status === 'Completed') return 100
  if (status === 'In Progress') return 10
  return 0 // Not Started, On Hold, hoặc bất kỳ trạng thái khác chưa định nghĩa
}

function parseExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  const s = String(value || '').trim()
  if (!s) return null
  // e.g. "20-Jan-25 A" / "29-Aug-25 A"
  const cleaned = s.replace(/\s*A\s*$/i, '').trim()
  return excelDateToIso(cleaned) || excelDateToIso(value)
}

function isResourceLabel(label) {
  return /^resources\s*:/i.test(label)
}

function resourceName(label) {
  return String(label).replace(/^resources\s*:\s*/i, '').trim()
}

/**
 * FIX: ưu tiên lấy mã tàu (NB number) từ TÊN FILE thay vì cột Vessel.
 * VD "NB1005__4484__-_Engineering_Plans_All_-_W19.xlsx" → lấy "1005"
 * (số ngay sau chữ "NB"), vì đây là mã hợp đồng dễ nhận diện, khác với
 * mã hull nội bộ (4484) đang nằm trong cột Vessel của từng dòng task.
 */
function shipHintFromFileName(fileName) {
  if (!fileName) return null
  const m = String(fileName).match(/NB\s*[-_]?\s*(\d+)/i)
  return m ? m[1] : null
}

function isTaskRow(row, cols) {
  const activity = String(cell(row, cols.activityName)).trim()
  if (!activity) return false
  const label = String(cell(row, cols.vessel)).trim()
  // Leaf tasks: vessel số (1994/994/…) + Activity Name; Drawing ID optional (Pipe Modeling)
  return /^\d+$/.test(label)
}

/**
 * Parse Engineering Plans export (single sheet, indented WBS in column A).
 *
 * Hierarchy by leading spaces:
 *   smaller spaces = higher WBS
 *   "Resources: X" = resource team (not a task)
 *   row vessel số + Activity Name = task (Drawing ID có thể trống)
 *
 * FIX so với bản gốc:
 * 1. type: 'array' thay vì 'buffer' — code chạy trên GitHub Pages (browser),
 *    fileToArrayBuffer() trả về ArrayBuffer từ File API, không phải Node Buffer.
 *    Dùng sai type khiến SheetJS đọc sai offset, có thể gây dựng sai matrix
 *    (đọc dư/sai dòng, lệch cột) — đây là nguyên nhân chính của hiện tượng
 *    "dữ liệu lấy nhiều hơn thứ được show ra".
 * 2. percentFromStatusOrColumn(): áp đúng quy tắc Completed=100 / Not Started=0 /
 *    In Progress=10, thay vì chỉ xử lý mỗi case Completed và bỏ ngỏ In Progress
 *    (khiến In Progress luôn bị tính nhầm thành 0%).
 * 3. Thêm đọc cột "Expected Finish" (trước đây bị bỏ hoàn toàn).
 */
export function parseEngineeringPlansWorkbook(arrayBuffer, fileName) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: true,
  })
  if (!matrix.length) {
    return { shipHint: null, tasks: [], sections: [], stats: { totalRows: 0 } }
  }

  const cols = mapHeader(matrix[0] || [])
  if (cols.vessel == null) cols.vessel = 0
  if (cols.drawingId == null || cols.activityName == null) {
    throw new Error('File thiếu cột Drawing ID / Activity Name')
  }

  const stack = [] // { spaces, name }
  let currentResource = null
  const tasks = []
  const sectionMap = new Map() // sectionName -> count
  // FIX: ưu tiên shipHint lấy từ tên file (mã NB) ngay từ đầu — nếu có,
  // vòng lặp bên dưới sẽ KHÔNG ghi đè nó bằng giá trị cột Vessel nữa
  // (điều kiện `!shipHint` sẽ luôn false khi đã có giá trị từ tên file).
  let shipHint = shipHintFromFileName(fileName)
  let skippedResourceRows = 0
  let skippedSummaryRows = 0

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r]
    const rawVessel = String(cell(row, cols.vessel) ?? '')
    const label = rawVessel.trim()
    const spaces = leadingSpaces(rawVessel)

    if (isTaskRow(row, cols)) {
      const drawingId = String(cell(row, cols.drawingId)).trim()
      const activity = String(cell(row, cols.activityName)).trim()
      const activityId = String(cell(row, cols.activityId)).trim()
      const engineer = String(cell(row, cols.engineer)).trim()
      const status = normalizeStatus(cell(row, cols.status))
      const percent = percentFromStatusOrColumn(status, cell(row, cols.percent))
      const startDate = parseExcelDate(cell(row, cols.start))
      const finishDate = parseExcelDate(cell(row, cols.finish))
      const lateDate = parseExcelDate(cell(row, cols.late))
      const expectedFinishDate = parseExcelDate(cell(row, cols.expectedFinish))

      const vesselNum = label.replace(/\D/g, '')
      if (vesselNum && !shipHint) {
        // 1994 -> prefer 994 if looks like NB994 style, keep both hints
        shipHint = vesselNum.length === 4 && vesselNum.startsWith('1') ? vesselNum.slice(1) : vesselNum
      }

      const sectionName = stack.length ? stack[stack.length - 1].name : 'Unassigned'
      const wbsPath = stack.map((s) => s.name).join(' > ')
      sectionMap.set(sectionName, (sectionMap.get(sectionName) || 0) + 1)

      tasks.push({
        sectionName,
        wbsPath,
        resource: currentResource,
        zone: sectionName,
        activity,
        drawingId,
        externalActivityId: activityId || null,
        engineerAbbrev: engineer || null,
        status,
        percentComplete: percent,
        startDate,
        finishDate,
        lateDate,
        expectedFinishDate,
        rowIndex: r + 1,
      })
      continue
    }

    if (!label) continue

    // numeric vessel without activity already handled / skipped
    if (/^\d+$/.test(label)) {
      skippedSummaryRows += 1
      continue
    }

    if (isResourceLabel(label)) {
      currentResource = resourceName(label)
      skippedResourceRows += 1
      continue
    }

    // WBS node: pop deeper/equal levels, then push
    // KHÔNG xóa currentResource — resource vẫn áp dụng cho các task dưới header này
    // cho đến khi gặp dòng "Resources: ..." mới.
    while (stack.length && stack[stack.length - 1].spaces >= spaces) {
      stack.pop()
    }
    stack.push({ spaces, name: label })
    skippedSummaryRows += 1
  }

  const sections = [...sectionMap.entries()]
    .map(([name, taskCount]) => ({ name, taskCount }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    sheetName,
    shipHint,
    tasks,
    sections,
    stats: {
      totalRows: matrix.length - 1,
      taskCount: tasks.length,
      sectionCount: sections.length,
      skippedResourceRows,
      skippedSummaryRows,
    },
  }
}

export function fileToArrayBuffer(file) {
  return file.arrayBuffer()
}
