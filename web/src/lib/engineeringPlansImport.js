import { supabase } from './supabase'
import { normalizeVietnamese, statusFromPercent, mapExcelSectionToTarget } from './progress'
import { CANONICAL_SECTIONS } from './roles'

async function ensureProject(shipId, userId) {
  const ship = String(shipId || '').trim()
  if (!ship) throw new Error('Thiếu Ship ID')

  const { data: existing, error: findErr } = await supabase
    .from('projects')
    .select('*')
    .eq('ship_id', ship)
    .order('created_at', { ascending: false })
    .limit(1)
  if (findErr) throw findErr

  if (existing?.[0]) return existing[0]

  const { data: created, error: createErr } = await supabase
    .from('projects')
    .insert({
      name: ship,
      ship_id: ship,
      department: 'Piping',
      status: 'In Progress',
      owner_id: userId,
    })
    .select('*')
    .single()
  if (createErr) throw createErr

  await supabase.from('project_members').insert({
    project_id: created.id,
    user_id: userId,
    role: 'owner',
  })

  return created
}

async function ensureSections(projectId, sectionNames) {
  const { data: existing, error } = await supabase
    .from('sections')
    .select('id, header_name, sort_order')
    .eq('project_id', projectId)
  if (error) throw error

  const byName = new Map((existing || []).map((s) => [s.header_name, s]))
  let order = (existing || []).reduce((m, s) => Math.max(m, s.sort_order || 0), -1) + 1
  const missing = sectionNames.filter((n) => n && !byName.has(n))

  if (missing.length) {
    const rows = missing.map((header_name) => ({
      project_id: projectId,
      header_name,
      sort_order: order++,
    }))
    const { data: inserted, error: insErr } = await supabase.from('sections').insert(rows).select('*')
    if (insErr) throw insErr
    inserted.forEach((s) => byName.set(s.header_name, s))
  }

  return byName
}

/**
 * Gộp section alias (vd. "2D drawing") vào tên chuẩn ("Pipe 2D drawing")
 * để task hiện đúng trên sidebar.
 */
export async function mergeAliasSectionsToCanonical(projectId) {
  const { data: sections, error } = await supabase
    .from('sections')
    .select('id, header_name')
    .eq('project_id', projectId)
  if (error) throw error

  const canonByName = await ensureSections(projectId, CANONICAL_SECTIONS)
  let moved = 0

  for (const section of sections || []) {
    const targetName = mapExcelSectionToTarget(section.header_name)
    if (!targetName || targetName === section.header_name) continue
    const dest = canonByName.get(targetName)
    if (!dest || dest.id === section.id) continue

    const { data: movedRows, error: upErr } = await supabase
      .from('tasks')
      .update({ section_id: dest.id })
      .eq('section_id', section.id)
      .select('id')
    if (upErr) throw upErr
    moved += (movedRows || []).length

    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', section.id)
    if (!count) {
      await supabase.from('sections').delete().eq('id', section.id)
    }
  }

  return moved
}

function buildProfileIndex(profiles) {
  const map = new Map()
  for (const p of profiles || []) {
    const name = normalizeVietnamese(p.display_name || '').toLowerCase()
    if (name) map.set(name, p)
    if (p.email) {
      const local = normalizeVietnamese(p.email.split('@')[0])
        .toLowerCase()
        .replace(/[._]/g, '')
      map.set(local, p)
    }
  }
  return map
}

function matchEngineer(abbrev, profileIndex) {
  if (!abbrev) return null
  const key = normalizeVietnamese(abbrev).toLowerCase().replace(/[._\s]/g, '')
  if (profileIndex.has(key)) return profileIndex.get(key)
  // try starts-with on email local / name compact
  for (const [k, p] of profileIndex.entries()) {
    const compact = k.replace(/\s+/g, '')
    if (compact === key || compact.startsWith(key) || key.startsWith(compact)) return p
  }
  return null
}

/**
 * Upsert Engineering Plans tasks into a project.
 * Match key priority: external_activity_id → drawing_id+activity → insert new
 *
 * @param {object} opts
 * @param {object} opts.parsed - from parseEngineeringPlansWorkbook
 * @param {string} opts.userId - auth user (owner when creating project)
 * @param {string} [opts.shipId] - override ship (default: parsed.shipHint)
 * @param {string} [opts.projectId] - use existing project instead of ensure-by-ship
 * @param {boolean} [opts.assignEngineers]
 */
export async function applyEngineeringPlansImport({
  parsed,
  userId,
  shipId,
  projectId,
  assignEngineers = true,
}) {
  if (!parsed?.tasks?.length) throw new Error('Không có task để import')

  let project
  if (projectId) {
    const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
    if (error) throw error
    project = data
  } else {
    const ship = String(shipId || parsed.shipHint || '').trim()
    project = await ensureProject(ship, userId)
  }

  const sectionNames = [
    ...new Set(
      parsed.tasks
        .map((t) => mapExcelSectionToTarget(t.sectionName))
        .filter(Boolean),
    ),
  ]
  const sectionByName = await ensureSections(project.id, sectionNames)

  const { data: profiles } = await supabase.from('profiles').select('id, display_name, email')
  const profileIndex = buildProfileIndex(profiles)

  const { data: existingTasks, error: exErr } = await supabase
    .from('tasks')
    .select('id, external_activity_id, drawing_id, activity, assignee_id')
    .eq('project_id', project.id)
  if (exErr) throw exErr

  const byExternal = new Map()
  const byDrawAct = new Map()
  for (const t of existingTasks || []) {
    if (t.external_activity_id) byExternal.set(String(t.external_activity_id), t)
    const key = `${String(t.drawing_id || '').trim().toLowerCase()}|||${String(t.activity || '').trim().toLowerCase()}`
    byDrawAct.set(key, t)
  }

  let inserted = 0
  let updated = 0
  let assigned = 0
  const BATCH = 80
  const pendingInsert = []
  const pendingUpdate = []

  for (const row of parsed.tasks) {
    const sectionName = mapExcelSectionToTarget(row.sectionName)
    const section = sectionByName.get(sectionName)
    if (!section) continue

    let assigneeId = null
    if (assignEngineers && row.engineerAbbrev) {
      const p = matchEngineer(row.engineerAbbrev, profileIndex)
      if (p) {
        assigneeId = p.id
        assigned += 1
      }
    }

    const payload = {
      project_id: project.id,
      section_id: section.id,
      title: row.activity,
      activity: row.activity,
      drawing_id: row.drawingId,
      zone: row.zone || row.sectionName,
      resource: row.resource,
      wbs_path: row.wbsPath,
      external_activity_id: row.externalActivityId,
      status: statusFromPercent(row.percentComplete || 0),
      percent_complete: row.percentComplete || 0,
      start_date: row.startDate,
      finish_date: row.finishDate,
      late_date: row.lateDate,
      assignee_id: assigneeId,
    }

    const existing =
      (row.externalActivityId && byExternal.get(String(row.externalActivityId))) ||
      byDrawAct.get(`${row.drawingId.toLowerCase()}|||${row.activity.toLowerCase()}`)

    if (existing) {
      pendingUpdate.push({ id: existing.id, ...payload })
    } else {
      pendingInsert.push(payload)
    }
  }

  for (let i = 0; i < pendingInsert.length; i += BATCH) {
    const chunk = pendingInsert.slice(i, i + BATCH)
    const { error } = await supabase.from('tasks').insert(chunk)
    if (error) throw error
    inserted += chunk.length
  }

  for (let i = 0; i < pendingUpdate.length; i += BATCH) {
    const chunk = pendingUpdate.slice(i, i + BATCH)
    await Promise.all(
      chunk.map(async (row) => {
        const { id, ...rest } = row
        // don't blank assignee if excel has no engineer and we already assigned
        if (!rest.assignee_id) delete rest.assignee_id
        const { error } = await supabase.from('tasks').update(rest).eq('id', id)
        if (error) throw error
        updated += 1
      })
    )
  }

  const merged = await mergeAliasSectionsToCanonical(project.id)

  return {
    project,
    inserted,
    updated,
    assigned,
    merged,
    sectionCount: sectionNames.length,
    taskCount: parsed.tasks.length,
  }
}
