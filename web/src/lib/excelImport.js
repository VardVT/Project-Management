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
        owners_review: act.ownerReview || null,
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
      const d = compactDrawing(act.drawing_id)
      const found = (a && d && byActDraw.get(`${a}|||${d}`)) || (d && byDraw.get(d)) || (a && byAct.get(a))

      const patch = {
        zone: act.zone,
        drawing_id: act.drawing_id || (found ? found.drawing_id : ''),
        start_date: act.start_date || null,
        finish_date: act.finish_date || null,
        late_date: act.late_date || null,
        title: act.activity,
        activity: act.activity,
        percent_complete: act.percent_complete,
        status: act.status,
        review_3d: act.review_3d,
        first_unit: act.first_unit,
        unit_issue_date: act.unit_issue_date,
        vvt_review: act.vvt_review,
        owners_review: act.owners_review,
      }
      if (act.assignee_id) patch.assignee_id = act.assignee_id

      if (found) {
        const { error: upErr } = await supabase.from('tasks').update(patch).eq('id', found.id)
        if (upErr) throw upErr
        updated += 1
      } else {
        const { error: inErr } = await supabase.from('tasks').insert({
          project_id: projectId,
          section_id: section.id,
          ...patch,
        })
        if (inErr) throw inErr
        inserted += 1
      }
    }
  }

  return { inserted, updated, sections: grouped.size }
}

function buildTaskIndexes(tasks) {
  const byActDraw = new Map()
  const byAct = new Map()
  const byDraw = new Map()
  const byZoneAct = new Map()

  ;(tasks || []).forEach((t) => {
    const a = normKey(t.activity)
    const d = compactDrawing(t.drawing_id)
    const z = normKey(t.zone)
    if (a && d) byActDraw.set(`${a}|||${d}`, t)
    if (a && !byAct.has(a)) byAct.set(a, t)
    if (d && !byDraw.has(d)) byDraw.set(d, t)
    if (z && a) byZoneAct.set(`${z}|||${a}`, t)
  })

  return { byActDraw, byAct, byDraw, byZoneAct }
}

function findDbTask(indexes, row) {
  const a = normKey(row.activity)
  const d = compactDrawing(row.drawingId)
  const z = normKey(row.zone)

  if (d && indexes.byDraw.has(d)) return { task: indexes.byDraw.get(d), how: 'drawing' }
  if (a && d && indexes.byActDraw.has(`${a}|||${d}`)) {
    return { task: indexes.byActDraw.get(`${a}|||${d}`), how: 'activity+drawing' }
  }
  if (z && a && indexes.byZoneAct.has(`${z}|||${a}`)) {
    return { task: indexes.byZoneAct.get(`${z}|||${a}`), how: 'zone+activity' }
  }
  if (a && indexes.byAct.has(a)) return { task: indexes.byAct.get(a), how: 'activity' }

  if (a) {
    for (const [key, task] of indexes.byAct.entries()) {
      if (key.includes(a) || a.includes(key)) {
        if (Math.min(key.length, a.length) >= 8) return { task, how: 'activity-fuzzy' }
      }
    }
  }
  return null
}

/**
 * Update assignee + % + status + review fields từ file Excel dạng phẳng
 * (01/02/03/04 progress sheets) — dùng cho nút "Update % / PIC" riêng biệt
 * với "Import Plans".
 *
 * Task có trong Excel nhưng chưa có trong Plan sẽ được INSERT vào section
 * tương ứng (theo sheet), nếu `insertMissing` = true (mặc định).
 */
export async function applyPicPercentImport(projectId, excelTasks, profiles, { insertMissing = true } = {}) {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select(
      'id, activity, drawing_id, zone, assignee_id, percent_complete, status, review_3d, first_unit, unit_issue_date, vvt_review, owners_review'
    )
    .eq('project_id', projectId)
  if (error) throw error

  const dbTasks = tasks || []
  const indexes = buildTaskIndexes(dbTasks)
  const profileByNorm = buildProfileIndex(profiles)

  let matched = 0
  let updated = 0
  let inserted = 0
  let matchedBy = {
    drawing: 0,
    'activity+drawing': 0,
    'zone+activity': 0,
    activity: 0,
    'activity-fuzzy': 0,
  }
  const unmatchedSamples = []
  const toInsert = []

  for (const row of excelTasks) {
    const hit = findDbTask(indexes, row)
    if (!hit) {
      if (unmatchedSamples.length < 5) {
        unmatchedSamples.push({
          activity: row.activity || '',
          drawingId: row.drawingId || '',
          sheet: row.sheetName || '',
        })
      }
      if (insertMissing && (row.activity || row.drawingId)) {
        toInsert.push(row)
      }
      continue
    }

    matched += 1
    matchedBy[hit.how] = (matchedBy[hit.how] || 0) + 1
    const task = hit.task

    const patch = {}
    const assigneeId = resolveAssignee(row.picFullNameNoDiacritics || row.picRaw, profileByNorm)
    if (assigneeId && assigneeId !== task.assignee_id) {
      patch.assignee_id = assigneeId
    }

    // FIX: Cho phép cập nhật % hợp lệ (bao gồm cả 0%) nếu lệch khác nhau > 0.01
    if (
      typeof row.percentComplete === 'number' &&
      !isNaN(row.percentComplete) &&
      Math.abs(row.percentComplete - (Number(task.percent_complete) || 0)) > 0.01
    ) {
      patch.percent_complete = row.percentComplete
    }

    if (row.status && row.status !== task.status) {
      patch.status = row.status
    }
    if (row.review && row.review !== task.review_3d) {
      patch.review_3d = row.review
    }
    if (row.firstUnit && row.firstUnit !== task.first_unit) {
      patch.first_unit = row.firstUnit
    }
    if (row.unitIssueDate && row.unitIssueDate !== task.unit_issue_date) {
      patch.unit_issue_date = row.unitIssueDate
    }
    if (row.vvtReview && row.vvtReview !== task.vvt_review) {
      patch.vvt_review = row.vvtReview
    }
    if (row.ownerReview && row.ownerReview !== task.owners_review) {
      patch.owners_review = row.ownerReview
    }

    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase.from('tasks').update(patch).eq('id', task.id)
      if (upErr) throw upErr
      updated += 1
      Object.assign(task, patch)
    }
  }

  if (insertMissing && toInsert.length) {
    const sectionNames = [
      ...new Set(
        toInsert.map((row) => {
          if (row.isMto || row.targetSection === 'MTO') return 'MTO'
          if (row.targetSection) return row.targetSection
          return mapExcelSectionToTarget(row.sheetName || row.zone || '')
        }),
      ),
    ]
    const sectionByName = await ensureSections(projectId, [...new Set([...CANONICAL_SECTIONS, ...sectionNames])])

    const payloads = []
    for (const row of toInsert) {
      const sectionName =
        row.isMto || row.targetSection === 'MTO'
          ? 'MTO'
          : row.targetSection || mapExcelSectionToTarget(row.sheetName || row.zone || '')
      const section = sectionByName.get(sectionName)
      if (!section) continue
      const assigneeId = resolveAssignee(row.picFullNameNoDiacritics || row.picRaw, profileByNorm)
      const activity = row.activity || row.drawingId || 'Untitled'
      payloads.push({
        project_id: projectId,
        section_id: section.id,
        title: activity,
        activity,
        drawing_id: row.drawingId || '',
        zone: row.zone || sectionName,
        percent_complete: typeof row.percentComplete === 'number' ? row.percentComplete : 0,
        status: row.status || 'Not Started',
        review_3d: row.review || null,
        first_unit: row.firstUnit || null,
        unit_issue_date: row.unitIssueDate || null,
        vvt_review: row.vvtReview || null,
        owners_review: row.ownerReview || null,
        assignee_id: assigneeId,
      })
    }

    const BATCH = 80
    for (let i = 0; i < payloads.length; i += BATCH) {
      const chunk = payloads.slice(i, i + BATCH)
      const { error: inErr } = await supabase.from('tasks').insert(chunk)
      if (inErr) throw inErr
      inserted += chunk.length

      // giữ index cập nhật để tránh insert trùng trong cùng lần sync
      chunk.forEach((p) => {
        const fake = {
          id: `new-${inserted}`,
          activity: p.activity,
          drawing_id: p.drawing_id,
          zone: p.zone,
        }
        const a = normKey(fake.activity)
        const d = compactDrawing(fake.drawing_id)
        const z = normKey(fake.zone)
        if (a && d) indexes.byActDraw.set(`${a}|||${d}`, fake)
        if (a && !indexes.byAct.has(a)) indexes.byAct.set(a, fake)
        if (d && !indexes.byDraw.has(d)) indexes.byDraw.set(d, fake)
        if (z && a) indexes.byZoneAct.set(`${z}|||${a}`, fake)
      })
    }
  }

  return {
    matched,
    updated,
    inserted,
    totalExcel: excelTasks.length,
    dbTasks: dbTasks.length,
    matchedBy,
    unmatchedSamples,
    dbSamples: dbTasks.slice(0, 5).map((t) => ({
      activity: t.activity || '',
      drawingId: t.drawing_id || '',
      zone: t.zone || '',
    })),
  }
}
