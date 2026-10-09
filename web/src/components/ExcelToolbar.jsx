import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { supabase } from '../lib/supabase'
import {
  fileToArrayBuffer,
  parsePicPercentWorkbook,
  shipHintFromProgressFileName,
  listPicPercentSheetOptions,
  defaultSelectedSheetNames,
} from '../lib/excelParse'
import { parseEngineeringPlansWorkbook } from '../lib/engineeringPlansParse'
import { applyEngineeringPlansImport, mergeAliasSectionsToCanonical } from '../lib/engineeringPlansImport'
import { applyPicPercentImport } from '../lib/excelImport'
import { applyPipingVtSectionMapping } from '../lib/pipingVtMapping'
import { downloadReportXlsx } from '../lib/exportReport'
import { IconUpload, IconMap, IconRefresh, IconDownload, IconChevronDown } from './Icons'
import { useNotification } from './NotificationContext'
import { SyncSheetPickerModal } from './SyncSheetPickerModal'

export function ExcelToolbar() {
  const { caps, user } = useAuth()
  const { currentProject, projects, reloadSections, loadProjects, selectProject } = useProject()
  const { toast } = useNotification()
  const plansRef = useRef(null)
  const percentRef = useRef(null)
  const dropdownRef = useRef(null)
  const [busy, setBusy] = useState('')
  const [syncPicker, setSyncPicker] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Close dropdown on click outside
  useEffect(() => {
    function handleOutsideClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
      return () => document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [menuOpen])

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
      const sheets = listPicPercentSheetOptions(buf)
      if (!sheets.length) {
        toast.warning('Empty File', 'No progress sheets found. Verify sheets 01/02/03/04 or ISO variants.')
        return
      }

      setSyncPicker({
        fileName: file.name,
        shipHint: shipHint || target.ship_id,
        projectId: target.id,
        buffer: buf,
        sheets,
        initialSelected: defaultSelectedSheetNames(sheets),
      })
    } catch (err) {
      toast.error('Sync Failed', err.message || 'Could not read progress workbook')
    } finally {
      setBusy('')
    }
  }

  async function confirmSyncSheets(selectedSheetNames) {
    if (!syncPicker) return
    const { buffer, fileName, projectId, shipHint } = syncPicker
    setSyncPicker(null)
    setBusy('percent')
    try {
      const parsed = parsePicPercentWorkbook(buffer, fileName, { sheetNames: selectedSheetNames })
      if (!parsed.tasks.length) {
        toast.warning('Empty Selection', 'No tasks found in the selected sheets.')
        return
      }
      const { data: profiles } = await supabase.from('profiles').select('id, display_name, email')
      const result = await applyPicPercentImport(projectId, parsed.tasks, profiles || [], {
        insertMissing: true,
      })
      await mergeAliasSectionsToCanonical(projectId)
      await reloadSections()
      const added = result.inserted ? ` · ${result.inserted} new` : ''
      const moved = result.remapped ? ` · ${result.remapped} remapped` : ''
      toast.success(
        'Sync Complete',
        `Vessel ${shipHint || projectId}: matched ${result.matched}/${result.totalExcel}, updated ${result.updated}${added}${moved}.`,
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
    <>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        {caps.canImportExcel && (
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <input ref={plansRef} type="file" accept=".xlsx,.xls" hidden onChange={onPlansFile} />
            <input ref={percentRef} type="file" accept=".xlsx,.xls,.xlsm" hidden onChange={onPercentFile} />

            <button
              type="button"
              className="pm-btn secondary"
              disabled={!!busy}
              onClick={() => setMenuOpen((o) => !o)}
              title="Batch and Engineering Plan Operations"
              style={{
                borderColor: menuOpen ? 'var(--secondary)' : undefined,
                color: menuOpen ? 'var(--secondary)' : undefined,
              }}
            >
              <IconMap size={14} />
              <span>{busy ? `${busy.toUpperCase()}…` : 'Operations'}</span>
              <IconChevronDown size={13} style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
            </button>

            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  minWidth: '220px',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-default)',
                  boxShadow: 'var(--shadow-lg)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '4px',
                  zIndex: 40,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                <button
                  type="button"
                  className="pm-menu-item"
                  style={{ fontSize: '12px', padding: '7px 10px' }}
                  onClick={() => {
                    setMenuOpen(false)
                    plansRef.current?.click()
                  }}
                  title="Import Engineering Plans (WBS + Activities + Drawings)"
                >
                  <IconUpload size={14} />
                  <span>Import Engineering Plans</span>
                </button>

                <button
                  type="button"
                  className="pm-menu-item"
                  style={{ fontSize: '12px', padding: '7px 10px' }}
                  onClick={() => {
                    setMenuOpen(false)
                    onMapping()
                  }}
                  title="Auto-map Piping VT tasks into 4 technical sections"
                >
                  <IconMap size={14} />
                  <span>Route Technical Sections</span>
                </button>

                <button
                  type="button"
                  className="pm-menu-item"
                  style={{ fontSize: '12px', padding: '7px 10px' }}
                  onClick={() => {
                    setMenuOpen(false)
                    percentRef.current?.click()
                  }}
                  title="Sync % progress and engineer assignments from 01/02/03/04 sheets"
                >
                  <IconRefresh size={14} />
                  <span>Sync % Progress / PIC</span>
                </button>
              </div>
            )}
          </div>
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
            <span>{busy === 'export' ? 'Exporting…' : 'Export'}</span>
          </button>
        )}
      </div>

    {syncPicker && (
      <SyncSheetPickerModal
        fileName={syncPicker.fileName}
        shipHint={syncPicker.shipHint}
        sheets={syncPicker.sheets}
        initialSelected={syncPicker.initialSelected}
        onCancel={() => setSyncPicker(null)}
        onConfirm={confirmSyncSheets}
      />
    )}
    </>
  )
}
