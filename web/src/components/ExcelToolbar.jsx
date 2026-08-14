import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { fileToArrayBuffer } from '../lib/excelParse'
import { parseEngineeringPlansWorkbook } from '../lib/engineeringPlansParse'
import { applyEngineeringPlansImport } from '../lib/engineeringPlansImport'
import { applyPipingVtSectionMapping } from '../lib/pipingVtMapping'
export function ExcelToolbar() {
  const { caps, user } = useAuth()
  const { currentProject, reloadSections, loadProjects, selectProject } = useProject()
  const plansRef = useRef(null)
  const [busy, setBusy] = useState('')
  if (!caps.canImportExcel) return null
  async function onPlansFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!user?.id) {
      window.alert('Cần đăng nhập để import.')
      return
    }
    setBusy('import')
    try {
      const buf = await fileToArrayBuffer(file)
      // FIX: truyền thêm file.name để parser ưu tiên lấy mã tàu (NB số)
      // từ TÊN FILE thay vì từ cột Vessel bên trong file.
      const parsed = parseEngineeringPlansWorkbook(buf, file.name)
      if (!parsed.tasks.length) {
        window.alert('Không thấy task (Vessel số + Activity Name) trong file.')
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
    } catch (err) {
      window.alert(err.message || 'Import Engineering Plans thất bại')
    } finally {
      setBusy('')
    }
  }
  async function onMapping() {
    if (!currentProject?.id) {
      window.alert('Hãy Import Plans / chọn project trước.')
      return
    }
    setBusy('map')
    try {
      const result = await applyPipingVtSectionMapping(currentProject.id)
      await reloadSections()
      if (!result.total) {
        window.alert(result.message || 'Không có task Piping VT để mapping.')
        return
      }
      const detail = Object.entries(result.byTarget || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      window.alert(
        `Mapping Piping VT: ${result.moved}/${result.total} task.\n` +
          `Đã dọn ${result.deletedOtherTasks || 0} task khác team, ${result.deletedSections || 0} section thừa.\n\n${detail}`
      )
    } catch (err) {
      window.alert(err.message || 'Mapping thất bại')
    } finally {
      setBusy('')
    }
  }
  return (
    <>
      <input ref={plansRef} type="file" accept=".xlsx,.xls" hidden onChange={onPlansFile} />
      <button
        type="button"
        className="pm-btn blue"
        disabled={!!busy}
        onClick={() => plansRef.current?.click()}
        title="Import Engineering Plans (WBS + Resources + Drawing/Activity)"
      >
        {busy === 'import' ? 'Importing…' : 'Import Plans'}
      </button>
      <button
        type="button"
        className="pm-btn blue"
        disabled={!!busy}
        onClick={onMapping}
        title="Map task Piping VT vào section chuẩn (giống app desktop)"
      >
        {busy === 'map' ? 'Mapping…' : 'Mapping'}
      </button>
    </>
  )
}
