import { Link, useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CircuitBoard,
  ClipboardList,
  Gauge,
  IndianRupee,
  LayoutDashboard,
  PackageCheck,
  Undo2,
  Wrench,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/PageHeader"
import { StatCard } from "@/components/StatCard"
import { StatusBadge } from "@/components/StatusBadge"
import { CardsSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useSite } from "@/context/SiteContext"
import { roleAtLeast } from "@/lib/roles"
import type { InventoryItem, MaterialRequest, RepairJob, SiteStats } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { formatDate, formatINR } from "@/lib/utils"
import { getModuleDef } from "@/modules/definitions"

export function DashboardPage() {
  const { config, role, siteApi, changeTick, basePath } = useSite()
  const { user } = useAuth()
  const navigate = useNavigate()
  const has = (m: string) => config.modules.includes(m as never)
  const canSee = (path: string) => config.pages.some((p) => p.path === path && roleAtLeast(role, p.minRole))
  const linked = !!config.workflow.stockSourceSiteId

  const { data: stats, loading } = useAsync(() => siteApi.get<SiteStats>("stats"), [changeTick])
  const { data: requests } = useAsync(
    () => (has("request") && roleAtLeast(role, "Member") ? siteApi.get<MaterialRequest[]>("requests") : Promise.resolve([])),
    [changeTick],
  )
  const { data: inv } = useAsync(
    () =>
      has("inventory") && roleAtLeast(role, "Member")
        ? siteApi.get<{ items: InventoryItem[]; sourceName: string }>("inventory")
        : Promise.resolve(null),
    [changeTick],
  )
  const { data: repairs } = useAsync(
    () => (has("pcb-repair") && roleAtLeast(role, "Member") ? siteApi.get<RepairJob[]>("repairs") : Promise.resolve([])),
    [changeTick],
  )

  const go = (path: string) => () => canSee(path) && navigate(`${basePath}/${path}`)
  const low = (inv?.items ?? []).filter((i) => i.qty < i.reorderLevel)

  return (
    <div>
      <PageHeader
        title={`${config.name} overview`}
        description={
          <>
            {config.description} Signed in as <b>{user?.name}</b> ({role}).
          </>
        }
        icon={<LayoutDashboard />}
      />

      {loading && !stats ? (
        <CardsSkeleton />
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {has("request") && (
            <StatCard label="Pending requests" value={stats.pendingRequests} hint={canSee("approvals") ? "Waiting for approval" : "Across this unit"} icon={ClipboardList} tone={stats.pendingRequests ? "warning" : "muted"} onClick={canSee("approvals") ? go("approvals") : canSee("requests") ? go("requests") : undefined} />
          )}
          {has("inventory") && (
            <StatCard label="Stock items" value={stats.totalItems} hint={linked ? `Linked from ${inv?.sourceName ?? "stores"}` : "SKUs in this store"} icon={Boxes} onClick={canSee("inventory") ? go("inventory") : undefined} />
          )}
          {has("inventory") && (
            <StatCard label="Low-stock items" value={stats.lowStock} hint="Below reorder level" icon={AlertTriangle} tone={stats.lowStock ? "danger" : "success"} onClick={canSee("inventory") ? go("inventory") : undefined} />
          )}
          {has("inventory") && !linked && <StatCard label="Stock value" value={formatINR(stats.stockValue)} hint="Qty × unit price" icon={IndianRupee} />}
          {has("assignment") && (
            <StatCard label="Assignments" value={stats.assignments} hint="Material issued to teams" icon={PackageCheck} tone="success" onClick={canSee("assignments") ? go("assignments") : canSee("my-materials") ? go("my-materials") : undefined} />
          )}
          {has("consumption") && <StatCard label="Units consumed" value={stats.consumptionUnits.toLocaleString("en-IN")} hint="Recorded usage" icon={Gauge} onClick={go("consumption")} />}
          {has("pcb-repair") && (
            <StatCard label="Open repair jobs" value={stats.openRepairs} hint="Received + In repair" icon={Wrench} tone={stats.openRepairs ? "warning" : "muted"} onClick={go("repairs")} />
          )}
          {has("pcb-repair") && <StatCard label="Meters fixed" value={stats.fixedRepairs} hint="Ready or returned to stores" icon={CircuitBoard} tone="success" onClick={go("repairs")} />}
          {has("returns") && <StatCard label="Returns" value={stats.returnsCount} hint="Items back in stock" icon={Undo2} onClick={go("returns")} />}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {has("request") && roleAtLeast(role, "Member") && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{roleAtLeast(role, "Manager") ? "Latest requests" : "My latest requests"}</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`${basePath}/requests`}>
                  View all <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {(requests ?? []).slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span> · {r.purpose}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.requestedByName} · {formatDate(r.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
              {requests && requests.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No requests yet.</p>}
            </CardContent>
          </Card>
        )}
        {has("inventory") && roleAtLeast(role, "Member") && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Low stock {linked && <span className="text-xs font-normal text-muted-foreground">({inv?.sourceName})</span>}</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`${basePath}/inventory`}>
                  Inventory <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {low.slice(0, 6).map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.name}</p>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.min(100, (i.qty / i.reorderLevel) * 100)}%` }} />
                    </div>
                  </div>
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                    {i.qty} / {i.reorderLevel} {i.unit}
                  </span>
                </div>
              ))}
              {inv && low.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">All items are above reorder level.</p>}
            </CardContent>
          </Card>
        )}
        {has("pcb-repair") && roleAtLeast(role, "Member") && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Repair bench</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to={`${basePath}/repairs`}>
                  Repair log <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {(repairs ?? []).slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <span className="font-mono">{r.meterId}</span> · {r.fault}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.code} · {r.technician || "Unassigned"}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Modules on this unit</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {config.pages
              .filter((p) => p.path && roleAtLeast(role, p.minRole))
              .map((p) => {
                const def = getModuleDef(p.moduleId)
                return (
                  <Link key={p.id} to={`${basePath}/${p.path}`} className="flex items-center gap-2.5 rounded-[var(--radius)] border px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent">
                    <def.icon className="size-4 text-primary" />
                    <span className="text-sm font-medium">{p.label}</span>
                    <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
                  </Link>
                )
              })}
            {role === "Public" && <p className="text-sm text-muted-foreground">Your Public role can only view this dashboard.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
