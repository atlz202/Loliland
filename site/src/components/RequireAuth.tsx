import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/** Пускает только вошедших с выбранным ником. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const location = useLocation()
  if (user === undefined) return <div className="center muted">Загрузка…</div>
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile) return <Navigate to="/nickname" replace state={{ from: location.pathname }} />
  return <>{children}</>
}
