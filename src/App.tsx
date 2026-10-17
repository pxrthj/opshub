import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import { Spinner } from "@/components/ui/spinner"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TopBar } from "@/components/TopBar"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { HubProvider } from "@/context/HubContext"
import { LoginPage } from "@/pages/LoginPage"
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage"
import { ResetPasswordPage } from "@/pages/ResetPasswordPage"
import { HubHome } from "@/pages/HubHome"
import { UsersPage } from "@/pages/UsersPage"
import { ModuleCatalogue } from "@/pages/ModuleCatalogue"
import { BuilderIndex } from "@/pages/BuilderIndex"
import { GoodsMovementPage } from "@/pages/GoodsMovementPage"
import { NotFound } from "@/pages/NotFound"
import { SiteRenderer } from "@/renderer/SiteRenderer"
import { BuilderPage } from "@/builder/BuilderPage"
import { DeployHistoryPage } from "@/builder/DeployHistoryPage"

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      <Spinner className="mr-2 size-5" /> Loading Plexus…
    </div>
  )
}

/** Guards every route behind login and provides hub-wide data + the top bar. */
function ProtectedShell() {
  const { user, ready } = useAuth()
  if (!ready) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return (
    // keyed by user so switching person reloads every unit, role and menu
    <HubProvider key={user.id}>
      <div className="flex min-h-screen flex-col bg-background">
        <TopBar />
        <Outlet />
      </div>
    </HubProvider>
  )
}

/** Hub pages: one centred column. */
function HubLayout() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <Outlet />
    </main>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={150}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route element={<ProtectedShell />}>
              <Route element={<HubLayout />}>
                <Route index element={<HubHome />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="movement" element={<GoodsMovementPage />} />
                <Route path="supply-chain" element={<GoodsMovementPage />} />
                <Route path="modules" element={<ModuleCatalogue />} />
                <Route path="builder" element={<BuilderIndex />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path="s/:slug/*" element={<SiteRenderer mode="live" />} />
              <Route path="preview/:slug/*" element={<SiteRenderer mode="preview" />} />
              <Route path="builder/:siteId" element={<BuilderPage />} />
              <Route path="builder/:siteId/history" element={<DeployHistoryPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors closeButton offset={64} />
      </TooltipProvider>
    </AuthProvider>
  )
}
