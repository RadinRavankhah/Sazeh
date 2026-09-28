import { BrowserRouter, Route, Routes } from "react-router"

import { RedirectIfAuthenticated, RequireAuth } from "@/components/RouteGuards"
import { AuthLayout } from "@/layouts/AuthLayout"
import { AppShell } from "@/layouts/AppShell"
import { DashboardPage } from "@/pages/DashboardPage"
import { GeneratePage } from "@/pages/GeneratePage"
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
          </Route>
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="sites/:siteId/generate" element={<GeneratePage />} />
            <Route path="sites/:siteId/settings" element={<SiteSettingsPage />} />
          </Route>
          {/* The preview is full-bleed — no dashboard chrome or padding. */}
          <Route path="sites/:siteId/preview" element={<SitePreviewPage />} />
        </Route>
        <Route path="*" element={<AuthLayout />}>
          <Route path="*" element={<LoginPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
