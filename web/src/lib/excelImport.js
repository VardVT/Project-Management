import { supabase } from './supabase'
import { isMtoTask, mapExcelSectionToTarget, normalizeVietnamese } from './progress'
import { CANONICAL_SECTIONS } from './roles'

function normKey(s) {
  return normalizeVietnamese(String(s || ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function compactDrawing(s) {
  return normKey(s).replace(/[\s._]/g, '')
}

async function ensureSections(projectId, neededNames) {
  const { data: existing, error } = await supabase
    .from('sections')
    .select('id, header_name, sort_order')
    .eq('project_id', projectId)
  if (error) throw error

  const byName = new Map((existing || []).map((s) => [s.header_name, s]))
  const toInsert = []
  let order = (existing || []).reduce((m, s) => Math.max(m, s.sort_order || 0), -1) + 1

  for (const name of neededNames) {
    if (!byName.has(name)) {
      toInsert.push({ project_id: projectId, header_name: name, sort_order: order++ })
    }
  }

  if (toInsert.length) {
    const { data: inserted, error: insErr } = await supabase.from('sections').insert(toInsert).select('*')
    if (insErr) throw insErr
    inserted.forEach((s) => byName.set(s.header_name, s))
  }

  return byName
}

// Resolve PIC (tên đã chuẩn hóa từ picRaw) sang assignee_id thật trong bảng profiles.
function buildProfileIndex(profiles) {
  const profileByNorm = new Map()
  ;(profiles || []).forEach((p) => {
    const name = normalizeVietnamese(p.display_name || '').toLowerCase()
    if (name) profileByNorm.set(name, p)
    if (p.email) {
      const local = normalizeVietnamese(p.email.split('@')[0]).toLowerCase().replace(/[._]/g, ' ')
      profileByNorm.set(local, p)
    }
  })
  return profileByNorm
}

function resolveAssignee(picRaw, profileByNorm) {
  const picNorm = normKey(picRaw)
  if (!picNorm) return null
  let profile = profileByNorm.get(picNorm)
  if (!profile) {
    for (const [key, p] of profileByNorm.entries()) {
      if (key.includes(picNorm) || picNorm.includes(key)) {
        profile = p
        break
      }
    }
  }
  return profile ? profile.id : null
}

/**
 * Apply Piping VT excel sections into current project (upsert by activity+drawing within target section).
 *
 * FIX so với bản gốc:
 * 1. Nhận thêm tham số `profiles` để resolve PIC (picRaw) → assignee_id thật.
 * 2. KHÔNG hard-code percent_complete: 0 / status: 'Not Started' khi insert —
 *    dùng đúng giá trị đã parse từ Excel.
 * 3. Ghi đủ 5 field mới: status, review_3d, first_unit, unit_issue_date,
 *    vvt_review, owner_review.
 * 4. Khi UPDATE task đã tồn tại, patch đầy đủ các field trên (bản gốc chỉ
 *    update zone/drawing_id/dates/activity, bỏ sót percent/status/reviews).
 */
export async function applyPipingVtImport(projectId, excelSections, profiles = []) {
  const grouped = new Map()
  const profileByNorm = buildProfileIndex(profiles)

  for (const sec of excelSections) {
    for (const act of sec.activities || []) {
      let target = mapExcelSectionToTarget(sec.headerName)
      const task = {
        zone: act.zone || sec.headerName,
        activity: act.activity,
        drawing_id: act.drawingId || '',
        start_date: act.startDate || null,
        finish_date: act.finishDate || null,
        late_date: act.lateDate || null,
        percent_complete: act.percentComplete || 0,
        status: act.status || 'Not Started',
        review_3d: act.review3d || null,
        first_unit: act.firstUnit || null,
        unit_issue_date: act.unitIssueDate || null,
        vvt_review: act.vvtReview || null,
        owner_review: act.ownerReview || null,
        assignee_id: resolveAssignee(act.picRaw, profileByNorm),
      }
      if (isMtoTask({ ...task, drawingId: task.drawing_id })) {
        target = 'MTO'
      }
      if (!grouped.has(target)) grouped.set(target, [])
      grouped.get(target).push(task)
    }
  }

  const names = [...new Set([...CANONICAL_SECTIONS, ...grouped.keys()])]
  const sectionByName = await ensureSections(projectId, names)

  let inserted = 0
  let updated = 0

  for (const [headerName, activities] of grouped.entries()) {
    const section = sectionByName.get(headerName)
    if (!section) continue

    const { data: existingTasks, error } = await supabase
      .from('tasks')
      .select('id, activity, drawing_id, assignee_id, percent_complete, status')
      .eq('section_id', section.id)
    if (error) throw error

    const byActDraw = new Map()
    const byAct = new Map()
    const byDraw = new Map()
    ;(existingTasks || []).forEach((t) => {
      const a = normKey(t.activity)
      const d = compactDrawing(t.drawing_id)
      if (a && d) byActDraw.set(`${a}|||${d}`, t)
      if (a) byAct.set(a, t)
      if (d) byDraw.set(d, t)
    })

    for (const act of activities) {
      const a = normKey(act.activity)
      const d
