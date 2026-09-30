import { BrowserRouter, Route, Routes } from "react-router"

import { RedirectIfAuthenticated, RequireAuth } from "@/components/RouteGuards"
import { AuthLayout } from "@/layouts/AuthLayout"
import { AppShell } from "@/layouts/AppShell"
import { DashboardPage } from "@/pages/DashboardPage"
import { EditorShell } from "@/editor/EditorShell"
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage"
import { GeneratePage } from "@/pages/GeneratePage"
import { ResetPasswordPage } from "@/pages/ResetPasswordPage"
import { SitePreviewPage } from "@/pages/SitePreviewPage"
import { SiteSettingsPage } from "@/pages/SiteSettingsPage"
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
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
          </Route>
        </Route>
        {/* The reset email links here — reachable even while logged in. */}
        <Route element={<AuthLayout />}>
          <Route path="auth/reset-password" element={<ResetPasswordPage />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="sites/:siteId/generate" element={<GeneratePage />} />
            <Route path="sites/:siteId/settings" element={<SiteSettingsPage />} />
          </Route>
          {/* The preview is full-bleed — no dashboard chrome or padding. */}
          <Route path="sites/:siteId/preview" element={<SitePreviewPage />} />
          {/* The editor is full-bleed too; pageId is optional (defaults to Home). */}
          <Route path="sites/:siteId/edit/:pageId?" element={<EditorShell />} />
        </Route>
        <Route path="*" element={<AuthLayout />}>
          <Route path="*" element={<LoginPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
