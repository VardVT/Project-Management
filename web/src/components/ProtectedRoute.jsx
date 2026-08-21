import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { ChangePasswordPage } from '../pages/ChangePasswordPage'

export function ProtectedRoute() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return <p className="boot">Đang kiểm tra phiên đăng nhập…</p>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (profile?.must_change_password) {
    return <ChangePasswordPage />
  }

  return <Outlet />
}
