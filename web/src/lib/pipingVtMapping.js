import { supabase } from './supabase'
import { mapExcelSectionToTarget, isMtoTask } from './progress'
import { CANONICAL_SECTIONS, LIVE_COMMENT_SECTION } from './roles'
import { mergeAliasSectionsToCanonical } from './engineeringPlansImport'

async function ensureCanonicalSections(projectId) {
  const { data: existing, error } = await supabase
    .from('sections')
    .select('id, header_name, sort_order')
    .eq('project_id', projectId)
  if (error) throw error

  const byName = new Map((existing || []).map((s) => [s.header_name, s]))
  let order = (existing || []).reduce((m, s) => Math.max(m, s.sort_order || 0), -1) + 1
  const missing = CANONICAL_SECTIONS.filter((n) => !byName.has(n)).map((header_name) => ({
    project_id: projectId,
    header_name,
    sort_order: CANONICAL_SECTIONS.indexOf(header_name),
  }))

  if (missing.length) {
    const { data: inserted, error: insErr } = await supabase.from('sections').insert(missing).select('*')
    if (insErr) throw insErr
    inserted.forEach((s) => byName.set(s.header_name, s))
  }

  await Promise.all(
    CANONICAL_SECTIONS.map(async (name, sort_order) => {
      const sec = byName.get(name)
      if (!sec || sec.sort_order === sort_order) return
      await supabase.from('sections').update({ sort_order }).eq('id', sec.id)
      sec.sort_order = sort_order
    })
  )

  return byName
}

/**
 * FIX: lấy TOÀN BỘ section của project (kể cả non-canonical), không chỉ 7 section chuẩn.
 * Đây là nguyên nhân chính gây mất task: sectionById cũ chỉ chứa 7 section chuẩn,
 * nên mọi task trỏ tới 1 trong 40 section gốc (Iso generating, Pipe Modeling, ...)
 * đều bị coi như "không tìm thấy section nguồn" và rơi vào fallback sai.
 */
async function fetchAllSections(projectId) {
  const { data, error } = await supabase
    .from('sections')
    .select('id, header_name')
    .eq('project_id', projectId)
  if (error) throw error
  return new Map((data || []).map((s) => [s.id, s]))
}

function sourceSectionName(task, allSectionById) {
  const fromSection = allSectionById.get(task.section_id)?.header_name
  if (fromSection) return fromSection
  if (task.zone) return String(task.zone).trim()
  if (task.wbs_path) {
    const parts = String(task.wbs_path)
      .split('>')
      .map((p) => p.trim())
      .filter(Boolean)
    if (parts.length) return parts[parts.length - 1]
  }
  return ''
}

function isPipingVt(resource, filter) {
  const res = String(resource || '')
    .trim()
    .toLowerCase()
  if (!filter) return true
  // Resource trống: giữ lại để remap (Import Plans hay mất resource khi gặp WBS node)
  if (!res) return true
  return res === filter || res.includes(filter)
}

function isForeignResource(resource, filter) {
  const res = String(resource || '')
    .trim()
    .toLowerCase()
  if (!res) return false
  if (!filter) return false
  return !(res === filter || res.includes(filter))
}

/**
 * Remap Piping VT → canonical sections (như bin), rồi dọn sidebar:
 * chỉ giữ section chuẩn có task.
 *
 * FIX chính so với bản gốc:
 * 1. Dùng allSectionById (toàn bộ section) thay vì sectionById (chỉ 7 canonical)
 *    khi tra tên section nguồn của task → sourceSectionName không còn rơi vào
 *    fallback sai cho các task thuộc section non-canonical.
 * 2. Log rõ các task KHÔNG map được (unmapped) thay vì continue âm thầm,
 *    để dev biết ngay nếu có tên section lạ chưa được khai báo trong SECTION_MAPPING.
 * 3. Xóa section non-canonical CHỈ SAU KHI đã xác nhận không còn task nào trỏ vào nó
 *    (double-check bằng cách đếm lại, thay vì xóa hàng loạt ngay sau vòng update).
 */
export async function applyPipingVtSectionMapping(projectId, { resourceFilter = 'Piping VT' } = {}) {
  if (!projectId) throw new Error('Thiếu project')

  const sectionByName = await ensureCanonicalSections(projectId)
  // FIX #1: map tra cứu theo id phải bao phủ TẤT CẢ section, không chỉ canonical
  const allSectionById = await fetchAllSections(projectId)

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, section_id, zone, wbs_path, resource, activity, drawing_id')
    .eq('project_id', projectId)
  if (error) throw error

  const filter = String(resourceFilter || '')
    .trim()
    .toLowerCase()
  const all = tasks || []
  const candidates = all.filter((t) => isPipingVt(t.resource, filter))
  // Chỉ xóa team khác (Naval/Hydro…) — KHÔNG xóa task resource trống
  const others = all.filter((t) => isForeignResource(t.resource, filter))

  if (!candidates.length) {
    return { moved: 0, total: 0, byTarget: {}, message: `Không có task resource="${resourceFilter}" (hoặc trống)` }
  }

  const byTarget = {}
  let moved = 0
  const BATCH = 40
  const updates = []
  // FIX #2: gom lại các trường hợp không map được để báo cáo, không im lặng bỏ qua
  const unmapped = []

  for (const task of candidates) {
    // Bước 2 - ƯU TIÊN #1: xét MTO trước tiên, bất kể header_name/zone gốc.
    // Danh sách MTO dùng chung mã docs cố định (VD "994-770-9001") không đổi
    // giữa các tàu, chỉ đổi phần ID đầu — nên nhận diện qua isMtoTask (kiểm tra
    // pattern '-770-' trong drawing_id, hoặc activity/zone chứa 'mto') đáng tin
    // cậy hơn nhiều so với việc suy ra target từ tên section.
    // Đây là if/else LOẠI TRỪ LẪN NHAU: mỗi task chỉ nhận đúng 1 giá trị target,
    // nên không có chuyện 1 task vừa vào MTO vừa bị tính vào nhóm khác.
    const isMto = isMtoTask(task)
    const source = isMto ? 'MTO' : sourceSectionName(task, allSectionById)
    const target = isMto ? 'MTO' : mapExcelSectionToTarget(source)
    const dest = sectionByName.get(target)

    if (!dest) {
      unmapped.push({ taskId: task.id, source, attemptedTarget: target })
      continue
    }

    byTarget[target] = (byTarget[target] || 0) + 1
    if (task.section_id === dest.id && task.zone === target) continue

    updates.push({ id: task.id, section_id: dest.id, zone: target })
  }

  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH)
    await Promise.all(
      chunk.map(async (row) => {
        const { error: upErr } = await supabase
          .from('tasks')
          .update({ section_id: row.section_id, zone: row.zone })
          .eq('id', row.id)
        if (upErr) throw upErr
        moved += 1
      })
    )
  }

  // Bỏ task không thuộc Piping VT (Naval/Hydro/… của team khác)
  let deletedOtherTasks = 0
  if (others.length) {
    for (let i = 0; i < others.length; i += BATCH) {
      const ids = others.slice(i, i + BATCH).map((t) => t.id)
      const { error: delErr } = await supabase.from('tasks').delete().in('id', ids)
      if (delErr) throw delErr
      deletedOtherTasks += ids.length
    }
  }

  // FIX #3: re-fetch task hiện có SAU KHI đã update, rồi mới quyết định xóa section nào.
  // Điều này đảm bảo section chỉ bị xóa khi thực sự không còn task nào trỏ vào (kể cả
  // những task vừa unmapped ở trên, vốn vẫn còn giữ section_id cũ).
  const { data: remainTasksAfterUpdate } = await supabase
    .from('tasks')
    .select('section_id')
    .eq('project_id', projectId)
  const usedSectionIds = new Set((remainTasksAfterUpdate || []).map((t) => t.section_id))

  const { data: allSecs } = await supabase
    .from('sections')
    .select('id, header_name')
    .eq('project_id', projectId)
  const canonical = new Set([...CANONICAL_SECTIONS, LIVE_COMMENT_SECTION])

  // Chỉ xóa section non-canonical KHÔNG còn task nào trỏ vào
  const nonCanonicalUnused = (allSecs || []).filter(
    (s) => !canonical.has(s.header_name) && !usedSectionIds.has(s.id)
  )
  if (nonCanonicalUnused.length) {
    const { error: delSecErr } = await supabase
      .from('sections')
      .delete()
      .in('id', nonCanonicalUnused.map((s) => s.id))
    if (delSecErr) throw delSecErr
  }

  // Ẩn (xóa) section canonical trống — chỉ hiện section có task, như bin
  const { data: leftSecs } = await supabase
    .from('sections')
    .select('id, header_name')
    .eq('project_id', projectId)
  const emptyLeft = (leftSecs || []).filter(
    (s) => !usedSectionIds.has(s.id) && s.header_name !== LIVE_COMMENT_SECTION
  )
  if (emptyLeft.length) {
    await supabase.from('sections').delete().in(
      'id',
      emptyLeft.map((s) => s.id)
    )
  }

  const merged = await mergeAliasSectionsToCanonical(projectId)

  return {
    moved,
    total: candidates.length,
    byTarget,
    deletedOtherTasks,
    deletedSections: nonCanonicalUnused.length + emptyLeft.length,
    merged,
    // FIX: trả về danh sách unmapped để bạn kiểm tra ngay thay vì phát hiện sau khi mất dữ liệu
    unmapped,
  }
}
