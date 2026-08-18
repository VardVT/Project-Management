import * as XLSX from 'xlsx'
import { supabase } from './supabase'

/**
 * Xuất báo cáo Excel dạng DỮ LIỆU THÔ (không công thức, không chart, không
 * Table object) — để người dùng tự copy-paste vào file Excel chủ (giữ
 * nguyên chart/formula/Table gốc của file đó).
 *
 * Lý do không tái tạo công thức/chart trong chính file xuất ra:
 * - Thư viện `xlsx` (SheetJS bản free) đang dùng để đọc Excel trong app
 *   KHÔNG hỗ trợ ghi native chart.
 * - Nếu mở file gốc bằng SheetJS rồi ghi đè lại, toàn bộ chart + Excel
 *   Table object (kể cả Table1 — nền tảng mọi công thức SUMIF/COUNTIF
 *   trong sheet Summary) đều bị mất — đã kiểm chứng thực tế.
 * → An toàn nhất: xuất riêng 1 file chỉ chứa dữ liệu, đúng thứ tự cột như
 *   4 sheet gốc, để dán tay vào, không đụng tới file Excel chủ.
 *
 * Section chuẩn (CANONICAL_SECTIONS) → sheet gốc tương ứng:
 *   '3D Pipe Drawing'  → "01. 3D model Prog."   (Zone-based, cột Disc. Review)
 *   'ISO generation'   → "02. ISO export"       (Zone-based, cột 3D Review)
 *   'Pipe 2D drawing'  → "03. Sys diagram & 2D drawing" (Drawing ID-based)
 *   'MTO'              → "04. MTO"              (Docs No-based)
 * Các section khác (General drawing, 3D Equipment Modeling, General
 * Arrangement) không thuộc 4 sheet gốc — KHÔNG xuất, vì không có vị trí
 * tương ứng trong file Excel chủ.
 */

const SECTION_TO_SHEET = {
  '3D Pipe Drawing': '01. 3D model Prog.',
  'ISO generation': '02. ISO export',
  'Pipe 2D drawing': '03. Sys diagram & 2D drawing',
  MTO: '04. MTO',
}

function profileNameOf(assigneeId, profiles) {
  if (!assigneeId) return ''
  const p = profiles.find((x) => x.id === assigneeId)
  return p?.display_name || p?.email || ''
}

/** % Complete trong file gốc lưu dạng phân số 0..1, không phải 0..100. */
function toFraction(percent) {
  const n = Number(percent) || 0
  return Math.round(n) / 100
}

function build3dOrIsoRows(tasks, sections, profiles, reviewColLabel) {
  const sectionNameById = new Map(sections.map((s) => [s.id, s.header_name]))
  const header = [
    'No',
    'Zone',
    'Activity Name',
    'P.I.C',
    'Start date',
    'Finish date',
    '% Complete',
    'Status',
    'Description',
    reviewColLabel,
    'Unit relevant',
  ]
  const rows = tasks.map((t, idx) => [
    idx + 1,
    t.zone || '',
    t.activity || '',
    profileNameOf(t.assignee_id, profiles),
    t.start_date || '',
    t.finish_date || '',
    toFraction(t.percent_complete),
    t.status || 'Not Started',
    t.description || '', // NOTE: chưa có nguồn dữ liệu rõ ràng cho "Description" — để trống nếu tasks.description rỗng
    t.review_3d || '',
    '', // NOTE: "Unit relevant" chưa có cột riêng trong DB — để trống, cần bổ sung sau nếu cần
  ])
  return [header, ...rows]
}

function build2dRows(tasks, profiles) {
  const header = [
    'No',
    'Drawing ID',
    'Activity Name',
    'P.I.C',
    'Start',
    'Finish',
    '% Complete',
    'Status',
    'Drawing for QC',
    'Drawing Official',
    'Rev.',
  ]
  const rows = tasks.map((t, idx) => [
    idx,
    t.drawing_id || '',
    t.activity || '',
    profileNameOf(t.assignee_id, profiles),
    t.start_date || '',
    t.finish_date || '',
    toFraction(t.percent_complete),
    t.status || 'Not Started',
    '', // NOTE: "Drawing for QC" chưa có cột DB tương ứng
    '', // NOTE: "Drawing Official" chưa có cột DB tương ứng
    '', // NOTE: "Rev." chưa có cột DB tương ứng
  ])
  return [header, ...rows]
}

function buildMtoRows(tasks, profiles) {
  const header = [
    'No.',
    'Docs No',
    'Description',
    'File name',
    'PIC',
    'Status',
    'Progress',
    'QC status',
    'Rev',
    'Date',
    'Remark',
  ]
  const rows = tasks.map((t, idx) => [
    idx + 1,
    t.drawing_id || '',
    t.activity || t.description || '',
    '', // NOTE: "File name" chưa có cột DB tương ứng
    profileNameOf(t.assignee_id, profiles),
    t.status || 'Not Started',
    toFraction(t.percent_complete),
    '', // NOTE: "QC status" chưa có cột DB tương ứng
    '', // NOTE: "Rev" chưa có cột DB tương ứng
    '', // NOTE: "Date" chưa có cột DB tương ứng
    '', // NOTE: "Remark" chưa có cột DB tương ứng
  ])
  return [header, ...rows]
}

/**
 * Lấy toàn bộ dữ liệu cần thiết (tasks/sections/profiles) rồi build workbook.
 * @param {string} projectId
 */
export async function exportReportWorkbook(projectId) {
  if (!projectId) throw new Error('Thiếu project')

  const [{ data: sections, error: secErr }, { data: tasks, error: taskErr }, { data: profiles, error: profErr }] =
    await Promise.all([
      supabase.from('sections').select('id, header_name').eq('project_id', projectId),
      supabase
        .from('tasks')
        .select(
          'id, section_id, zone, activity, drawing_id, assignee_id, start_date, finish_date, percent_complete, status, description, review_3d'
        )
        .eq('project_id', projectId),
      supabase.from('profiles').select('id, display_name, email'),
    ])
  if (secErr) throw secErr
  if (taskErr) throw taskErr
  if (profErr) throw profErr

  const sectionNameById = new Map((sections || []).map((s) => [s.id, s.header_name]))
  const byTargetSheet = new Map(Object.values(SECTION_TO_SHEET).map((sheetName) => [sheetName, []]))

  ;(tasks || []).forEach((t) => {
    const sectionName = sectionNameById.get(t.section_id)
    const sheetName = SECTION_TO_SHEET[sectionName]
    if (!sheetName) return // section không thuộc 4 sheet gốc — bỏ qua
    byTargetSheet.get(sheetName).push(t)
  })

  const wb = XLSX.utils.book_new()

  const iso = byTargetSheet.get('02. ISO export')
  const threeD = byTargetSheet.get('01. 3D model Prog.')
  const twoD = byTargetSheet.get('03. Sys diagram & 2D drawing')
  const mto = byTargetSheet.get('04. MTO')

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(build3dOrIsoRows(threeD, sections || [], profiles || [], 'Disc. Review')),
    '01. 3D model Prog.'
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(build3dOrIsoRows(iso, sections || [], profiles || [], '3D Review')),
    '02. ISO export'
  )
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(build2dRows(twoD, profiles || [])), '03. Sys diagram & 2D drawing')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(buildMtoRows(mto, profiles || [])), '04. MTO')

  return { workbook: wb, counts: { threeD: threeD.length, iso: iso.length, twoD: twoD.length, mto: mto.length } }
}

/**
 * Xuất và tải file .xlsx ngay trên trình duyệt.
 * @param {string} projectId
 * @param {string} shipId dùng để đặt tên file
 */
export async function downloadReportXlsx(projectId, shipId) {
  const { workbook, counts } = await exportReportWorkbook(projectId)
  const fileName = `Report_${shipId || 'project'}_${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(workbook, fileName)
  return counts
}
