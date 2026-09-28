import { BrowserRouter, Route, Routes } from "react-router"

import { RedirectIfAuthenticated, RequireAuth } from "@/components/RouteGuards"
import { AuthLayout } from "@/layouts/AuthLayout"
import { AppShell } from "@/layouts/AppShell"
import { DashboardPage } from "@/pages/DashboardPage"
import { LoginPage } from "@/pages/LoginPage"
import { SignupPage } from "@/pages/SignupPage"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RedirectIfAuthenticated />}>
          <Route element={<AuthLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
          </Route>
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
          </Route>
        </Route>
        <Route path="*" element={<AuthLayout />}>
          <Route path="*" element={<LoginPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
