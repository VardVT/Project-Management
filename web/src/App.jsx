import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ProjectProvider } from './hooks/useProject'
import { NotificationProvider } from './components/NotificationContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { SummaryPage } from './pages/SummaryPage'
import { SectionTasksPage } from './pages/SectionTasksPage'
import { SectionReviewPage } from './pages/SectionReviewPage'
import { ReviewsPage } from './pages/ReviewsPage'
import { CalendarPage } from './pages/CalendarPage'
import { UsersPage } from './pages/UsersPage'
import { ReportsPage } from './pages/ReportsPage'
import { DrawingsListPage } from './pages/DrawingsListPage'
import { DrawingDetailPage } from './pages/DrawingDetailPage'

function HomeRedirect() {
  const { caps } = useAuth()
  if (caps.showDashboard) return <Navigate to="/dashboard" replace />
  return <Navigate to="/summary" replace />
}

function AuthedTree() {
  return (
    <ProjectProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomeRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="summary" element={<SummaryPage />} />
          <Route path="sections/:sectionId" element={<SectionTasksPage />} />
          <Route path="sections/:sectionId/reviews" element={<SectionReviewPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="plan-drawing" element={<DrawingsListPage />} />
          <Route path="plan-drawing/:drawingId" element={<DrawingDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ProjectProvider>
  )
}

export default function App() {
  return (
    <NotificationProvider>
      <AuthProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/*" element={<AuthedTree />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </NotificationProvider>
  )
}
