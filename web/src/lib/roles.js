/** Role helpers — map profiles.position → UI capabilities */
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  SENIOR: 'senior',
  ENGINEER: 'engineer',
  DESIGNER: 'designer',
}
export function normalizeRole(position) {
  const raw = String(position || '')
    .trim()
    .toLowerCase()
  if (!raw) return ROLES.ENGINEER
  if (raw.includes('admin')) return ROLES.ADMIN
  if (raw.includes('manager')) return ROLES.MANAGER
  if (raw.includes('senior')) return ROLES.SENIOR
  if (raw.includes('design')) return ROLES.DESIGNER
  return ROLES.ENGINEER
}
export function getRoleLabel(role) {
  switch (role) {
    case ROLES.ADMIN:
      return 'Admin'
    case ROLES.MANAGER:
      return 'Manager'
    case ROLES.SENIOR:
      return 'Senior'
    case ROLES.DESIGNER:
      return 'Designer'
    default:
      return 'Engineer'
  }
}
/** Shell type drives layout look + menu */
export function getShellType(role) {
  if (role === ROLES.ADMIN || role === ROLES.MANAGER) return 'manager'
  if (role === ROLES.SENIOR) return 'senior'
  return 'engineer'
}
/**
 * Capabilities matrix (Phase 1)
 * Ship Leader override can expand senior later.
 */
export function getCapabilities(role) {
  const shell = getShellType(role)
  const isMgr = shell === 'manager'
  const isSenior = shell === 'senior'
  const isEng = shell === 'engineer'
  return {
    shell,
    role,
    label: getRoleLabel(role),
    // projects
    canLoadProject: isMgr || isSenior,
    canCreateProject: isMgr,
    canDeleteProject: isMgr,
    canManageUsers: isMgr,
    // tasks
    canEditAllTasks: isMgr || isSenior,
    canEditAssignedOnly: isEng,
    canCreateTask: isMgr || isSenior,
    canImportExcel: isMgr || role === ROLES.DESIGNER,
    percentCap: isEng ? 85 : 100,
    // FIX: export report — chỉ Admin/Manager được xuất file
    canExportReport: role === ROLES.ADMIN || role === ROLES.MANAGER,
    // review
    canSubmitReview: isEng || role === ROLES.DESIGNER,
    canReviewTasks: isMgr || isSenior,
    // pages
    showDashboard: isMgr || isSenior,
    showSummary: true,
    showReviewRequests: isMgr || isSenior,
    showActiveUsers: isMgr,
    showTeamDirectory: true,
    showCalendar: true,
    showReports: isMgr || isSenior,
    showPlanDrawing: true,
    showLoadInOut: role === ROLES.ADMIN || role === ROLES.MANAGER,
  }
}
export const CANONICAL_SECTIONS = [
  '3D Pipe Drawing',
  'ISO generation',
  'Pipe 2D drawing',
  'General drawing',
  'MTO',
  '3D Equipment Modeling',
  'General Arrangement',
]
export function displaySectionName(headerName) {
  const raw = String(headerName || '').trim()
  if (raw === '3D Pipe Drawing') return 'Pipe 3D modeling'
  if (raw === 'ISO generation') return 'ISO generating'
  if (raw === 'Pipe 2D drawing') return '2D drawing'
  return raw || 'Section'
}
