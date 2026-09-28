import { Navigate, Outlet } from "react-router"

import { useAuthStore } from "@/stores/auth"

/** Renders the protected tree when authenticated; anonymous users go to /login. */
export function RequireAuth() {
  const { status, user } = useAuthStore()
  if (status === "loading") return null // AppShell renders its own skeleton
  if (status === "anonymous" || user === null) return <Navigate to="/login" replace />
  return <Outlet />
}

/** Public auth pages redirect to the dashboard when already logged in. */
export function RedirectIfAuthenticated() {
  const { status } = useAuthStore()
  if (status === "authenticated") return <Navigate to="/" replace />
  return <Outlet />
}
