import { supabase } from './supabase'

const BUCKET = 'project-drawings'

export function drawingPublicUrl(filePath) {
  if (!filePath) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath)
  return data?.publicUrl || null
}

export async function listDrawings(projectId) {
  const { data, error } = await supabase
    .from('drawings')
    .select(
      'id, project_id, title, file_path, file_size, file_type, version, page_count, status, created_by, created_at, archived_at'
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getDrawing(drawingId) {
  const { data, error } = await supabase
    .from('drawings')
    .select('*')
    .eq('id', drawingId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listAnnotations(drawingId) {
  const { data, error } = await supabase
    .from('drawing_annotations')
    .select(
      `
      id, drawing_id, page_number, task_id, type, x_percent, y_percent,
      vector_data, color, label, created_by, created_at,
      task:tasks(id, title, activity, status, percent_complete, assignee_id, section_id)
    `
    )
    .eq('drawing_id', drawingId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function uploadDrawingPdf({ projectId, file, title, version, userId }) {
  if (!projectId || !file) throw new Error('Project and file are required.')
  const safeName = String(file.name || 'drawing.pdf').replace(/[^\w.\-()+ ]+/g, '_')
  const drawingId = crypto.randomUUID()
  const filePath = `${projectId}/${drawingId}/${safeName}`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, file, {
    contentType: file.type || 'application/pdf',
    upsert: false,
  })
  if (upErr) throw upErr

  const { data, error } = await supabase
    .from('drawings')
    .insert({
      id: drawingId,
      project_id: projectId,
      title: (title || file.name || 'Untitled drawing').trim(),
      file_path: filePath,
      file_size: file.size || null,
      file_type: 'pdf',
      version: version || 'Rev 1',
      status: 'in_review',
      created_by: userId || null,
    })
    .select('*')
    .single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([filePath])
    throw error
  }
  return data
}

export async function updateDrawingPageCount(drawingId, pageCount) {
  const { error } = await supabase
    .from('drawings')
    .update({ page_count: pageCount, updated_at: new Date().toISOString() })
    .eq('id', drawingId)
  if (error) throw error
}

export async function deleteDrawing(drawing) {
  if (!drawing?.id) return
  if (drawing.file_path) {
    await supabase.storage.from(BUCKET).remove([drawing.file_path])
  }
  const { error } = await supabase.from('drawings').delete().eq('id', drawing.id)
  if (error) throw error
}

/**
 * Create engineering task + rectangle callout annotation.
 * x/y = top-left %; width/height stored in vector_data.
 */
export async function createPinWithTask({
  drawing,
  pageNumber,
  xPercent,
  yPercent,
  widthPercent,
  heightPercent,
  activity,
  sectionId,
  assigneeId,
  zone,
  userId,
  color = '#EF4444',
}) {
  const title = String(activity || '').trim()
  if (!title) throw new Error('Task title is required.')
  if (!drawing?.project_id) throw new Error('Drawing project is missing.')
  if (!sectionId) throw new Error('Section is required.')

  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .insert({
      project_id: drawing.project_id,
      section_id: sectionId,
      title,
      activity: title,
      zone: zone || null,
      drawing_id: drawing.title || null,
      assignee_id: assigneeId || null,
      status: 'Not Started',
      percent_complete: 0,
    })
    .select('id, title, activity, status, percent_complete, assignee_id, section_id')
    .single()
  if (taskErr) throw taskErr

  const pinLabel = `#${String(title).slice(0, 24)}`
  const { data: annotation, error: annErr } = await supabase
    .from('drawing_annotations')
    .insert({
      drawing_id: drawing.id,
      page_number: pageNumber || 1,
      task_id: task.id,
      type: 'rect',
      x_percent: xPercent,
      y_percent: yPercent,
      color,
      label: pinLabel,
      created_by: userId || null,
      vector_data: {
        width_percent: widthPercent,
        height_percent: heightPercent,
      },
    })
    .select(
      `
      id, drawing_id, page_number, task_id, type, x_percent, y_percent,
      vector_data, color, label, created_by, created_at
    `
    )
    .single()

  if (annErr) {
    await supabase.from('tasks').delete().eq('id', task.id)
    throw annErr
  }

  return { task, annotation: { ...annotation, task } }
}
