import { NavLink } from "react-router-dom"
import { ArrowLeft, Workflow } from "lucide-react"
import { useSite } from "@/context/SiteContext"
import { roleAtLeast } from "@/lib/roles"
import type { SiteStats } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { cn } from "@/lib/utils"
import { getModuleDef } from "@/modules/definitions"

/** Sidebar menu built purely from config.pages (which come from the enabled modules). */
export function SiteSidebar() {
  const { config, role, basePath, siteApi, changeTick, preview } = useSite()
  const { data: stats } = useAsync(() => siteApi.get<SiteStats>("stats"), [config.siteId, changeTick, preview])

  const badges: Record<string, number | undefined> = {
    approval: stats?.pendingRequests,
    inventory: config.workflow.lowStockAlerts ? stats?.lowStock : undefined,
    "pcb-repair": stats?.openRepairs,
  }
  const visible = config.pages.filter((p) => roleAtLeast(role, p.minRole))

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm ring-2 ring-white/20">
            {config.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{config.name}</p>
            <p className="truncate text-xs opacity-70">You are: {role}</p>
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
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" : "opacity-85 hover:bg-sidebar-accent/50 hover:opacity-100",
                )
              }
            >
              <def.icon className="size-4 shrink-0" />
              <span className="flex-1 truncate">{p.label}</span>
              {!!badge && (
                <span className="rounded-full bg-amber-500 px-1.5 py-px text-xs font-bold text-white tabular-nums">{badge}</span>
              )}
            </NavLink>
          )
        })}
      </nav>
      <div className="space-y-1 border-t border-sidebar-border p-2.5 text-sm">
        {role === "Admin" && !preview && (
          <NavLink to={`/builder/${config.siteId}`} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 opacity-85 hover:bg-sidebar-accent/50 hover:opacity-100">
            <Workflow className="size-4" /> Change this office
          </NavLink>
        )}
        <NavLink to="/" className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 opacity-85 hover:bg-sidebar-accent/50 hover:opacity-100">
          <ArrowLeft className="size-4" /> Home
        </NavLink>
      </div>
    </aside>
  )
}
