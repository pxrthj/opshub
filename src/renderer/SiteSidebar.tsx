import { NavLink } from "react-router-dom"
import { ArrowLeft, Workflow } from "lucide-react"
import { useSite } from "@/context/SiteContext"
import { roleAtLeast } from "@/lib/roles"
import type { SiteStats } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { cn } from "@/lib/utils"
import { getModuleDef } from "@/modules/definitions"

function useSiteMenu() {
  const { config, role, siteApi, changeTick, preview } = useSite()
  const { data: stats } = useAsync(() => siteApi.get<SiteStats>("stats"), [config.siteId, changeTick, preview])
  const badges: Record<string, number | undefined> = {
    approval: stats?.pendingRequests,
    inventory: config.workflow.lowStockAlerts ? stats?.lowStock : undefined,
    "pcb-repair": stats?.openRepairs,
  }
  return { badges, visible: config.pages.filter((p) => roleAtLeast(role, p.minRole)) }
}

/** On phones the sidebar is hidden, so the same pages show as a strip you can scroll sideways. */
export function SiteMobileNav() {
  const { basePath } = useSite()
  const { badges, visible } = useSiteMenu()
  return (
    <nav className="sticky top-14 z-30 flex gap-1 overflow-x-auto border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
      {visible.map((p) => {
        const badge = badges[p.moduleId]
        return (
          <NavLink
            key={p.id}
            to={p.path ? `${basePath}/${p.path}` : basePath}
            end={!p.path}
            className={({ isActive }) =>
              cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
                isActive ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )
            }
          >
            {p.label}
            {!!badge && <span className="rounded-full bg-muted px-1.5 text-xs font-medium text-foreground tabular-nums">{badge}</span>}
          </NavLink>
        )
      })}
    </nav>
  )
}

/** Sidebar menu built purely from config.pages (which come from the enabled modules). */
export function SiteSidebar() {
  const { config, role, basePath, preview } = useSite()
  const { badges, visible } = useSiteMenu()

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground">
            {config.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{config.name}</p>
            <p className="truncate text-xs text-muted-foreground">Your role: {role}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
        {visible.map((p) => {
          const def = getModuleDef(p.moduleId)
          const badge = badges[p.moduleId]
          return (
            <NavLink
              key={p.id}
              to={p.path ? `${basePath}/${p.path}` : basePath}
              end={!p.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  isActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )
              }
            >
              <def.icon className="size-4 shrink-0" />
              <span className="flex-1 truncate">{p.label}</span>
              {!!badge && (
                <span className="rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums">{badge}</span>
              )}
            </NavLink>
          )
        })}
      </nav>
      <div className="space-y-1 border-t border-sidebar-border p-2.5 text-sm">
        {role === "Admin" && !preview && (
          <NavLink to={`/builder/${config.siteId}`} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <Workflow className="size-4" /> Edit this office
          </NavLink>
        )}
        <NavLink to="/" className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <ArrowLeft className="size-4" /> Home
        </NavLink>
      </div>
    </aside>
  )
}
