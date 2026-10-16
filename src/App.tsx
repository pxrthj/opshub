import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom"
import { Spinner } from "@/components/ui/spinner"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ThemeScope } from "@/components/ThemeScope"
import { TopBar } from "@/components/TopBar"
import { AuthProvider, useAuth } from "@/context/AuthContext"
import { HubProvider } from "@/context/HubContext"
import { LoginPage } from "@/pages/LoginPage"
import { HubHome } from "@/pages/HubHome"
import { UsersPage } from "@/pages/UsersPage"
import { ModuleCatalogue } from "@/pages/ModuleCatalogue"
import { BuilderIndex } from "@/pages/BuilderIndex"
import { NotFound } from "@/pages/NotFound"
import { SiteRenderer } from "@/renderer/SiteRenderer"
import { BuilderPage } from "@/builder/BuilderPage"
import { DeployHistoryPage } from "@/builder/DeployHistoryPage"

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center text-slate-500">
      <Spinner className="mr-2 size-5" /> Loading Plexus…
    </div>
  )
}

/** Guards every route behind login and provides hub-wide data + the top bar. */
function ProtectedShell() {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
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

/** Hub pages use the neutral OpsHub theme. */
function HubLayout() {
  return (
    <ThemeScope>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <Outlet />
      </main>
    </ThemeScope>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={150}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedShell />}>
              <Route element={<HubLayout />}>
                <Route index element={<HubHome />} />
                <Route path="users" element={<UsersPage />} />
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
