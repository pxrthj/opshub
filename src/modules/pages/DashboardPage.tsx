import type { ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, ArrowRight, CircuitBoard, ClipboardList, IndianRupee, LayoutDashboard, PackageCheck, Wrench, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/PageHeader"
import { StatCard } from "@/components/StatCard"
import { StatusBadge } from "@/components/StatusBadge"
import { CardsSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import { roleAtLeast } from "@/lib/roles"
import type { InventoryItem, MaterialRequest, RepairJob, SiteStats } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { formatDate, formatINR } from "@/lib/utils"

interface Tile {
  label: string
  value: string | number
  icon: LucideIcon
  tone: "primary" | "warning" | "danger" | "success" | "muted"
  path?: string
}

function ListCard({ title, to, children }: { title: string; to: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to={to}>
            See all <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  )
}

export function DashboardPage() {
  const { config, role, siteApi, changeTick, basePath } = useSite()
  const navigate = useNavigate()
  const has = (m: string) => config.modules.includes(m as never)
  const canSee = (path: string) => config.pages.some((p) => p.path === path && roleAtLeast(role, p.minRole))
  const ownStock = has("inventory") && !config.workflow.stockSourceSiteId

  const { data: stats, loading } = useAsync(() => siteApi.get<SiteStats>("stats"), [changeTick])
  const { data: requests } = useAsync(
    () => (has("request") && canSee("requests") ? siteApi.get<MaterialRequest[]>("requests") : Promise.resolve([])),
    [changeTick],
  )
  const { data: inv } = useAsync(
    () => (ownStock && canSee("inventory") ? siteApi.get<{ items: InventoryItem[] }>("inventory") : Promise.resolve(null)),
    [changeTick],
  )
  const { data: repairs } = useAsync(
    () => (has("pcb-repair") && canSee("repairs") ? siteApi.get<RepairJob[]>("repairs") : Promise.resolve([])),
    [changeTick],
  )

  // At most four numbers, most useful first.
  const tiles: Tile[] = stats
    ? (
        [
          has("request") && { label: "Waiting requests", value: stats.pendingRequests, icon: ClipboardList, tone: stats.pendingRequests ? "warning" : "muted", path: canSee("approvals") ? "approvals" : "requests" },
          ownStock && { label: "Running low", value: stats.lowStock, icon: AlertTriangle, tone: stats.lowStock ? "danger" : "success", path: "inventory" },
          has("pcb-repair") && { label: "On repair bench", value: stats.openRepairs, icon: Wrench, tone: stats.openRepairs ? "warning" : "muted", path: "repairs" },
          ownStock && { label: "Stock value", value: formatINR(stats.stockValue), icon: IndianRupee, tone: "primary", path: "inventory" },
          has("assignment") && { label: "Handed out", value: stats.assignments, icon: PackageCheck, tone: "success", path: canSee("assignments") ? "assignments" : "my-materials" },
          has("pcb-repair") && { label: "Fixed meters", value: stats.fixedRepairs, icon: CircuitBoard, tone: "success", path: "repairs" },
        ].filter(Boolean) as Tile[]
      ).slice(0, 4)
    : []

  const low = (inv?.items ?? []).filter((i) => i.qty < i.reorderLevel)
  const lists: ReactNode[] = []
  if (requests?.length)
    lists.push(
      <ListCard key="req" title="Latest requests" to={`${basePath}/requests`}>
        {requests.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.purpose}</p>
              <p className="text-xs text-muted-foreground">
                {r.requestedByName} · {formatDate(r.createdAt)}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </ListCard>,
    )
  if (inv)
    lists.push(
      <ListCard key="low" title="Running low" to={`${basePath}/inventory`}>
        {low.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing is running low.</p>}
        {low.slice(0, 6).map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 py-1">
            <span className="truncate text-sm">{i.name}</span>
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {i.qty} left · reorder at {i.reorderLevel}
            </span>
          </div>
        ))}
      </ListCard>,
    )
  if (repairs?.length)
    lists.push(
      <ListCard key="rep" title="Repair bench" to={`${basePath}/repairs`}>
        {repairs.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                <span className="font-medium">{r.meterId}</span> · {r.fault}
              </p>
              <p className="text-xs text-muted-foreground">{r.technician || "Not assigned yet"}</p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </ListCard>,
    )

  return (
    <div>
      <PageHeader title={config.name} description={config.description} icon={<LayoutDashboard />} />

      {loading && !stats ? (
        <CardsSkeleton />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t) => (
            <StatCard
              key={t.label}
              label={t.label}
              value={t.value}
              icon={t.icon}
              tone={t.tone}
              onClick={t.path && canSee(t.path) ? () => navigate(`${basePath}/${t.path}`) : undefined}
            />
          ))}
        </div>
      )}

      {lists.length > 0 && <div className="mt-6 grid gap-6 lg:grid-cols-2">{lists.slice(0, 2)}</div>}

      {role === "Public" && <p className="mt-6 text-sm text-muted-foreground">You can view this summary only.</p>}
    </div>
  )
}
