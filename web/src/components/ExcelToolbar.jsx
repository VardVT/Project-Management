import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { supabase } from '../lib/supabase'
import { fileToArrayBuffer, parsePicPercentWorkbook, shipHintFromProgressFileName } from '../lib/excelParse'
import { parseEngineeringPlansWorkbook } from '../lib/engineeringPlansParse'
import { applyEngineeringPlansImport } from '../lib/engineeringPlansImport'
import { applyPicPercentImport } from '../lib/excelImport'
import { applyPipingVtSectionMapping } from '../lib/pipingVtMapping'
import { downloadReportXlsx } from '../lib/exportReport'
import { IconUpload, IconMap, IconRefresh, IconDownload } from './Icons'
import { useNotification } from './NotificationContext'

export function ExcelToolbar() {
  const { caps, user } = useAuth()
  const { currentProject, projects, reloadSections, loadProjects, selectProject } = useProject()
  const { toast } = useNotification()
  const plansRef = useRef(null)
  const percentRef = useRef(null)
  const [busy, setBusy] = useState('')

  async function onPlansFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!user?.id) {
      toast.error('Not signed in', 'Please sign in to import plans.')
      return
    }
    setBusy('import')
    try {
      const buf = await fileToArrayBuffer(file)
      const parsed = parseEngineeringPlansWorkbook(buf, file.name)
      if (!parsed.tasks.length) {
        toast.warning('Empty Workbook', 'No engineering tasks found in workbook.')
        return
      }
      const shipGuess = parsed.shipHint || currentProject?.ship_id || ''
      const useCurrent =
        currentProject?.id &&
        (!shipGuess || String(currentProject.ship_id) === String(shipGuess))
      const result = await applyEngineeringPlansImport({
        parsed,
        userId: user.id,
        shipId: shipGuess,
        projectId: useCurrent ? currentProject.id : undefined,
        assignEngineers: true,
      })
      await loadProjects()
      await selectProject(result.project)
      await reloadSections()
      toast.success('Import Complete', `Engineering plans imported successfully for Vessel ${shipGuess || result.project?.ship_id}.`)
    } catch (err) {
      toast.error('Import Failed', err.message || 'Import Engineering Plans failed')
    } finally {
      setBusy('')
    }
  }

  async function resolveSyncTargetProject(shipHint) {
    let list = projects?.length ? projects : await loadProjects()
    if (shipHint) {
      const matched = list.find(
        (p) => String(p.ship_id) === String(shipHint) || String(p.name) === String(shipHint),
      )
      if (matched) return matched
    }
    return currentProject || null
  }

  async function applyVesselNameFromFile(project, shipHint) {
    if (!project?.id || !shipHint) return project
    if (String(project.ship_id) === String(shipHint) && String(project.name) === String(shipHint)) {
      return project
    }
    const { data, error } = await supabase
      .from('projects')
      .update({ ship_id: shipHint, name: shipHint })
      .eq('id', project.id)
      .select('*')
      .single()
    if (error) throw error
    await loadProjects()
    return data
  }

  async function onPercentFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const shipHint = shipHintFromProgressFileName(file.name)
    setBusy('percent')
    try {
      let target = await resolveSyncTargetProject(shipHint)
      if (!target?.id) {
        toast.warning(
          'No Vessel Selected',
          shipHint
            ? `No vessel "${shipHint}" found. Import plans or select a vessel first.`
            : 'Please select a vessel project first.',
        )
        return
      }

      if (shipHint) {
        target = await applyVesselNameFromFile(target, shipHint)
        await selectProject(target)
      }

      const buf = await fileToArrayBuffer(file)
      const parsed = parsePicPercentWorkbook(buf, file.name)
      if (!parsed.tasks.length) {
        toast.warning('Empty File', 'No tasks read from file. Verify sheets 01/02/03/04.')
        return
      }
      const { data: profiles } = await supabase.from('profiles').select('id, display_name, email')
      const result = await applyPicPercentImport(target.id, parsed.tasks, profiles || [])
      await reloadSections()
      toast.success(
        'Sync Complete',
        `Vessel ${shipHint || target.ship_id}: matched ${result.matched}/${result.totalExcel} — ${result.updated} updated.`,
      )
    } catch (err) {
      toast.error('Sync Failed', err.message || 'Update Progress / PIC failed')
    } finally {
      setBusy('')
    }
  }

  async function onMapping() {
    if (!currentProject?.id) {
      toast.warning('No Vessel Selected', 'Please select a vessel first.')
      return
    }
    setBusy('map')
    try {
      const result = await applyPipingVtSectionMapping(currentProject.id)
      await reloadSections()
      if (!result.total) {
        toast.info('Nothing to Map', result.message || 'No Piping VT tasks found to map.')
        return
      }
      toast.success(
        'Mapping Complete',
        `${result.moved}/${result.total} tasks routed into standard technical sections.`
      )
    } catch (err) {
      toast.error('Mapping Failed', err.message || 'Mapping failed')
    } finally {
      setBusy('')
    }
  }

  async function onExportReport() {
    if (!currentProject?.id) {
      toast.warning('No Vessel Selected', 'Please select a vessel project first.')
      return
    }
    setBusy('export')
    try {
      const counts = await downloadReportXlsx(currentProject.id, currentProject.ship_id)
      toast.success(
        'Export Complete',
        `3D: ${counts.threeD} · ISO: ${counts.iso} · 2D: ${counts.twoD} · MTO: ${counts.mto} tasks exported.`
      )
    } catch (err) {
      toast.error('Export Failed', err.message || 'Export report failed')
    } finally {
      setBusy('')
    }
  }

  if (!caps.canImportExcel && !caps.canExportReport) return null

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      {caps.canImportExcel && (
        <>
          <input ref={plansRef} type="file" accept=".xlsx,.xls" hidden onChange={onPlansFile} />
          <button
            type="button"
            className="pm-btn secondary"
            disabled={!!busy}
            onClick={() => plansRef.current?.click()}
            title="Import Engineering Plans (WBS + Activities + Drawings)"
          >
            <IconUpload size={14} />
            <span>{busy === 'import' ? 'Importing…' : 'Import Plans'}</span>
          </button>

          <button
            type="button"
            className="pm-btn secondary"
            disabled={!!busy}
            onClick={onMapping}
            title="Auto-map Piping VT tasks into 4 technical sections"
          >
            <IconMap size={14} />
            <span>{busy === 'map' ? 'Mapping…' : 'Route Sections'}</span>
          </button>

          <input ref={percentRef} type="file" accept=".xlsx,.xls,.xlsm" hidden onChange={onPercentFile} />
          <button
            type="button"
            className="pm-btn secondary"
            disabled={!!busy}
            onClick={() => percentRef.current?.click()}
            title="Sync % progress and engineer assignments from 01/02/03/04 sheets"
          >
            <IconRefresh size={14} />
            <span>{busy === 'percent' ? 'Syncing…' : 'Sync % / PIC'}</span>
          </button>
        </>
      )}

      {caps.canExportReport && (
        <button
          type="button"
          className="pm-btn success"
          disabled={!!busy || !currentProject?.id}
          onClick={onExportReport}
          title="Export 4 raw data sheets (01/02/03/04) to Excel"
        >
          <IconDownload size={14} />
          <span>{busy === 'export' ? 'Exporting…' : 'Export Excel'}</span>
        </button>
      )}
    </div>
  )
}
