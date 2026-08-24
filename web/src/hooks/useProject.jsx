import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CANONICAL_SECTIONS, LIVE_COMMENT_SECTION, SIDEBAR_SECTIONS } from '../lib/roles'
import { useAuth } from './useAuth'

const ProjectContext = createContext(null)
const STORAGE_KEY = 'pm_current_project_id'

export function ProjectProvider({ children }) {
  const { user, caps } = useAuth()
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadProjects = useCallback(async () => {
    setError('')
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, name, ship_id, department, status, start_date, end_date, owner_id, ship_leader_id, created_at, group_weights')
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setProjects([])
      return []
    }
    setProjects(data || [])
    return data || []
  }, [])

  const loadSections = useCallback(async (projectId) => {
    if (!projectId) {
      setSections([])
      return []
    }
    const { data, error: err } = await supabase
      .from('sections')
      .select('id, header_name, sort_order, project_id')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
    if (err) {
      setError(err.message)
      setSections([])
      return []
    }
    // Sidebar: engineering canonical sections + Live Comment (drawing markup inbox)
    const sidebarIndex = new Map(SIDEBAR_SECTIONS.map((n, i) => [n, i]))
    const filtered = (data || [])
      .filter((s) => sidebarIndex.has(s.header_name))
      .sort((a, b) => (sidebarIndex.get(a.header_name) ?? 99) - (sidebarIndex.get(b.header_name) ?? 99))
    setSections(filtered)
    return filtered
  }, [])

  const selectProject = useCallback(
    async (project) => {
      setCurrentProject(project)
      if (project?.id) {
        localStorage.setItem(STORAGE_KEY, project.id)
        await loadSections(project.id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
        setSections([])
      }
    },
    [loadSections]
  )

  const createProject = useCallback(
    async ({ shipId, department = 'Piping', startDate, endDate }) => {
      if (!user || !caps.canCreateProject) {
        throw new Error('Bạn không có quyền tạo project.')
      }
      const ship = String(shipId || '').trim()
      if (!ship) throw new Error('Ship ID bắt buộc.')

      const { data: project, error: createErr } = await supabase
        .from('projects')
        .insert({
          name: ship,
          ship_id: ship,
          department,
          start_date: startDate || null,
          end_date: endDate || null,
          status: 'In Progress',
          owner_id: user.id,
        })
        .select('*')
        .single()

      if (createErr) throw createErr

      const { error: memberErr } = await supabase.from('project_members').insert({
        project_id: project.id,
        user_id: user.id,
        role: 'owner',
      })
      if (memberErr) throw memberErr

      const sectionRows = [
        ...CANONICAL_SECTIONS.map((header_name, sort_order) => ({
          project_id: project.id,
          header_name,
          sort_order,
        })),
        {
          project_id: project.id,
          header_name: LIVE_COMMENT_SECTION,
          sort_order: CANONICAL_SECTIONS.length,
        },
      ]
      const { error: secErr } = await supabase.from('sections').insert(sectionRows)
      if (secErr) throw secErr

      await loadProjects()
      await selectProject(project)
      return project
    },
    [user, caps.canCreateProject, loadProjects, selectProject]
  )

  const deleteProject = useCallback(
    async (projectId) => {
      if (!user || !caps.canDeleteProject) {
        throw new Error('Bạn không có quyền xóa project.')
      }
      const id = projectId || currentProject?.id
      if (!id) throw new Error('Không có project để xóa.')

      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error

      localStorage.removeItem(STORAGE_KEY)
      const list = await loadProjects()
      const next = list[0] || null
      await selectProject(next)
      return true
    },
    [user, caps.canDeleteProject, currentProject, loadProjects, selectProject]
  )

  const updateGroupWeights = useCallback(
    async (weights, projectId) => {
      if (!user || !caps.canManageUsers) {
        throw new Error('Only Manager/Admin can edit group weights.')
      }
      const id = projectId || currentProject?.id
      if (!id) throw new Error('No vessel selected.')
      const cleaned = {}
      for (const [k, v] of Object.entries(weights || {})) {
        const n = Number(v)
        cleaned[k] = Number.isFinite(n) && n >= 0 ? n : 0
      }
      const { data, error } = await supabase
        .from('projects')
        .update({ group_weights: cleaned })
        .eq('id', id)
        .select('id, name, ship_id, department, status, start_date, end_date, owner_id, ship_leader_id, created_at, group_weights')
        .single()
      if (error) throw error
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)))
      setCurrentProject((prev) => (prev?.id === id ? { ...prev, ...data } : prev))
      return data
    },
    [user, caps.canManageUsers, currentProject?.id]
  )

  useEffect(() => {
    if (!user) {
      setProjects([])
      setCurrentProject(null)
      setSections([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const list = await loadProjects()
      if (cancelled) return
      const saved = localStorage.getItem(STORAGE_KEY)
      const found = list.find((p) => p.id === saved) || list[0] || null
      if (found) await selectProject(found)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, loadProjects, selectProject])

  const value = useMemo(
    () => ({
      projects,
      currentProject,
      sections,
      loading,
      error,
      loadProjects,
      selectProject,
      createProject,
      deleteProject,
      updateGroupWeights,
      reloadSections: () => loadSections(currentProject?.id),
    }),
    [
      projects,
      currentProject,
      sections,
      loading,
      error,
      loadProjects,
      selectProject,
      createProject,
      deleteProject,
      updateGroupWeights,
      loadSections,
    ]
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}
