import { useState, type ReactNode } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Hammer,
  Inbox,
  CircuitBoard,
  ClipboardList,
  Eye,
  IndianRupee,
  LayoutDashboard,
  PackageCheck,
  Shield,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/PageHeader"
import { StatCard } from "@/components/StatCard"
import { StatusBadge } from "@/components/StatusBadge"
import { CardsSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import { roleAtLeast } from "@/lib/roles"
import type { InventoryItem, MaterialRequest, RepairJob, ServiceCase, SiteStats } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { formatDate, formatINR } from "@/lib/utils"
import { SiteAdminDashboard } from "./SiteAdminDashboard"

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
  const isAdmin = role === "Admin"

  // For Admins, default to the rich Site Admin Dashboard, with an option to toggle standard overview
  const [viewMode, setViewMode] = useState<"admin" | "standard">(isAdmin ? "admin" : "standard")

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
  // Repair cases: the client's own, everything at the hub, or what was sent to this team.
  const caseMode = has("case-desk") ? "hub" : has("case-work") ? "work" : has("cases") ? "client" : null
  const casePath = caseMode === "hub" ? "case-desk" : caseMode === "work" ? "case-work" : "cases"
  const { data: caseData } = useAsync(
    () => (caseMode && canSee(casePath) ? siteApi.get<{ cases: ServiceCase[] }>("cases") : Promise.resolve(null)),
    [changeTick],
  )
  const cases = caseData?.cases ?? []
  const openCases = cases.filter((c) => c.status !== "Closed" && c.status !== "Rejected")
  const myTrack = (c: ServiceCase) => (c.fieldSiteId === config.siteId ? c.fieldStatus : c.labSiteId === config.siteId ? c.labStatus : undefined)

  // If Admin and in Admin view mode, render Site Admin Dashboard with switch button
  if (isAdmin && viewMode === "admin") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => setViewMode("standard")}
          >
            <Eye className="size-3.5 mr-1" /> View Standard Overview
          </Button>
        </div>
        <SiteAdminDashboard />
      </div>
    )
  }

  const caseTiles: Tile[] = !caseData
    ? []
    : caseMode === "hub"
      ? [
          { label: "New cases to route", value: cases.filter((c) => c.status === "Submitted").length, icon: Inbox, tone: cases.some((c) => c.status === "Submitted") ? "warning" : "muted", path: casePath },
          { label: "Repaired, to close", value: cases.filter((c) => c.status === "Repaired").length, icon: CheckCircle2, tone: cases.some((c) => c.status === "Repaired") ? "warning" : "muted", path: casePath },
        ]
      : caseMode === "work"
        ? [
            { label: "Cases to assign", value: openCases.filter((c) => myTrack(c) === "Open").length, icon: Inbox, tone: openCases.some((c) => myTrack(c) === "Open") ? "warning" : "muted", path: casePath },
            { label: "Cases being worked", value: openCases.filter((c) => myTrack(c) === "Assigned").length, icon: Hammer, tone: "primary", path: casePath },
          ]
        : [
            { label: "Open cases", value: openCases.length, icon: Briefcase, tone: openCases.length ? "warning" : "muted", path: casePath },
            { label: "Repaired", value: cases.filter((c) => c.status === "Repaired").length, icon: Wrench, tone: "success", path: casePath },
            { label: "Closed", value: cases.filter((c) => c.status === "Closed").length, icon: CheckCircle2, tone: "muted", path: casePath },
          ]

  // At most four numbers, most useful first.
  const tiles: Tile[] = stats
    ? (
        [
          ...caseTiles,
          (has("request") || has("approval")) && {
            label: has("request") ? "Waiting requests" : "Waiting for approval",
            value: stats.pendingRequests,
            icon: ClipboardList,
            tone: stats.pendingRequests ? "warning" : "muted",
            path: canSee("approvals") ? "approvals" : "requests",
          },
          ownStock && {
            label: "Running low",
            value: stats.lowStock,
            icon: AlertTriangle,
            tone: stats.lowStock ? "danger" : "success",
            path: "inventory",
          },
          has("pcb-repair") && {
            label: "Being repaired",
            value: stats.openRepairs,
            icon: Wrench,
            tone: stats.openRepairs ? "warning" : "muted",
            path: "repairs",
          },
          ownStock && {
            label: "Stock value",
            value: formatINR(stats.stockValue),
            icon: IndianRupee,
            tone: "primary",
            path: "inventory",
          },
          has("assignment") && {
            label: "Handed out",
            value: stats.assignments,
            icon: PackageCheck,
            tone: "success",
            path: canSee("assignments") ? "assignments" : "my-materials",
          },
          has("pcb-repair") && {
            label: "Repaired boards",
            value: stats.fixedRepairs,
            icon: CircuitBoard,
            tone: "success",
            path: "repairs",
          },
        ].filter(Boolean) as Tile[]
      ).slice(0, 4)
    : []

  const low = (inv?.items ?? []).filter((i) => i.qty < i.reorderLevel)
  const lists: ReactNode[] = []
  if (caseData)
    lists.push(
      <ListCard key="cases" title="Latest repair cases" to={`${basePath}/${casePath}`}>
        {cases.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No repair cases yet.</p>}
        {cases.slice(0, 5).map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {c.code} · {c.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {caseMode === "client" ? c.createdByName : c.clientName} · {formatDate(c.createdAt)}
              </p>
            </div>
            <StatusBadge status={c.status} />
          </div>
        ))}
      </ListCard>,
    )
  if (requests?.length)
    lists.push(
      <ListCard key="req" title="Latest requests" to={`${basePath}/requests`}>
        {requests.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.purpose}</p>
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
      <ListCard key="low" title="Almost out" to={`${basePath}/inventory`}>
        {low.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing is almost out.</p>}
        {low.slice(0, 6).map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3 py-1">
            <span className="text-sm">{i.name}</span>
            <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {i.qty} left · reorder at {i.reorderLevel}
            </span>
          </div>
        ))}
      </ListCard>,
    )
  if (repairs?.length)
    lists.push(
      <ListCard key="rep" title="Repairs" to={`${basePath}/repairs`}>
        {repairs.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <span className="font-medium">{r.meterId}</span> · {r.fault}
              </p>
              <p className="text-xs text-muted-foreground">{r.technician || "Nobody yet"}</p>
            </div>
            <StatusBadge status={r.status} />
          </div>
        ))}
      </ListCard>,
    )

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title={config.name}
          description={config.description}
          icon={<LayoutDashboard />}
          actions={
            caseMode === "client" &&
            canSee("cases") &&
            !isAdmin && (
              <Button onClick={() => navigate(`${basePath}/cases`)}>
                <Briefcase /> Raise a repair case
              </Button>
            )
          }
        />
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2 text-xs"
            onClick={() => setViewMode("admin")}
          >
            <Shield className="size-3.5 mr-1" /> Open Admin Dashboard
          </Button>
        )}
      </div>

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

      {role === "Public" && <p className="mt-6 text-sm text-muted-foreground">You can look, but not change anything.</p>}
    </div>
  )
}
