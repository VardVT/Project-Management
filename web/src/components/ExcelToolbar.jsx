import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import { supabase } from '../lib/supabase'
import { fileToArrayBuffer, parsePicPercentWorkbook } from '../lib/excelParse'
import { parseEngineeringPlansWorkbook } from '../lib/engineeringPlansParse'
import { applyEngineeringPlansImport } from '../lib/engineeringPlansImport'
import { applyPicPercentImport } from '../lib/excelImport'
import { applyPipingVtSectionMapping } from '../lib/pipingVtMapping'
import { downloadReportXlsx } from '../lib/exportReport'

export function ExcelToolbar() {
  const { caps, user } = useAuth()
  const { currentProject, reloadSections, loadProjects, selectProject } = useProject()
  const plansRef = useRef(null)
  const percentRef = useRef(null)
  const [busy, setBusy] = useState('')

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

  // FIX: luồng RIÊNG, tách khỏi "Import Plans" — dùng file Excel dạng
  // phẳng (01/02/03/04 progress sheets) để cập nhật %/Status/PIC/Review
  // vào các task đã có sẵn trên web (không tạo task mới, không tạo project mới).
  async function onPercentFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!currentProject?.id) {
      window.alert('Hãy chọn project trước.')
      return
    }
    setBusy('percent')
    try {
      const buf = await fileToArrayBuffer(file)
      const parsed = parsePicPercentWorkbook(buf)
      if (!parsed.tasks.length) {
        window.alert('Không đọc được task nào từ file (kiểm tra lại sheet 01/02/03/04).')
        return
      }
      const { data: profiles } = await supabase.from('profiles').select('id, display_name, email')
      const result = await applyPicPercentImport(currentProject.id, parsed.tasks, profiles || [])
      await reloadSections()
      window.alert(
        `Update % / PIC: khớp ${result.matched}/${result.totalExcel} task, đã cập nhật ${result.updated}.\n` +
          `Khớp theo: ${Object.entries(result.matchedBy)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}` +
          (result.unmatchedSamples.length
            ? `\n\nMột vài task không khớp được (ví dụ):\n${result.unmatchedSamples
                .map((s) => `- ${s.activity} (${s.drawingId || 'no drawing'})`)
                .join('\n')}`
            : '')
      )
    } catch (err) {
      window.alert(err.message || 'Update % / PIC thất bại')
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

  // FIX: xuất báo cáo dạng dữ liệu thô (4 sheet 01/02/03/04), chỉ Admin/Manager
  async function onExportReport() {
    if (!currentProject?.id) {
      window.alert('Hãy chọn project trước.')
      return
    }
    setBusy('export')
    try {
      const counts = await downloadReportXlsx(currentProject.id, currentProject.ship_id)
      window.alert(
        `Đã xuất file.\n3D model: ${counts.threeD} task\nISO export: ${counts.iso} task\n` +
          `2D drawing: ${counts.twoD} task\nMTO: ${counts.mto} task`
      )
    } catch (err) {
      window.alert(err.message || 'Export thất bại')
    } finally {
      setBusy('')
    }
  }

  if (!caps.canImportExcel && !caps.canExportReport) return null

  return (
    <>
      {caps.canImportExcel && (
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
          {/* FIX: nút riêng — file phẳng 01/02/03/04, chỉ update task có sẵn */}
          <input ref={percentRef} type="file" accept=".xlsx,.xls,.xlsm" hidden onChange={onPercentFile} />
          <button
            type="button"
            className="pm-btn blue"
            disabled={!!busy}
            onClick={() => percentRef.current?.click()}
            title="Cập nhật %/Status/PIC/Review từ file Excel dạng 01/02/03/04 (không tạo task mới)"
          >
            {busy === 'percent' ? 'Updating…' : 'Update % / PIC'}
          </button>
        </>
      )}
      {caps.canExportReport && (
        <button
          type="button"
          className="pm-btn green"
          disabled={!!busy || !currentProject?.id}
          onClick={onExportReport}
          title="Xuất dữ liệu thô 4 sheet (01/02/03/04) để copy-paste vào file Excel chủ"
        >
          {busy === 'export' ? 'Exporting…' : 'Export Report'}
        </button>
      )}
    </>
  )
}
