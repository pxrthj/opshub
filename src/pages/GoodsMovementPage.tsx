import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  BarChart3,
  Clock,
  Download,
  FileSpreadsheet,
  Layers,
  Package,
  Search,
  Table2,
  TrendingUp,
  Truck,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { api } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { StatCard } from "@/components/StatCard"
import { StatusBadge } from "@/components/StatusBadge"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { exportSupplyChainWorkbook, exportWorkbook } from "@/lib/excel"
import type { ExportDataset, GoodsMovementStats, GoodsMovementTrail, MovementStage } from "@/lib/types"
import { formatDate, formatDateTime } from "@/lib/utils"

const AXIS = { fontSize: 12, fill: "#64748b" }
const GRID = "#e2e8f0"
const COLOR_PRIMARY = "var(--primary)"
const COLOR_MUTED = "var(--muted-foreground)"

const STAGE_LABEL: Record<MovementStage, string> = {
  "Awaiting Approval": "Waiting for a decision",
  "Request Rejected": "Turned down",
  "Approved & Dispatched": "Given out",
  "In Field": "In use",
  "Fully Consumed": "All used",
  "Returned / Restocked": "Given back",
}

const STAGE_COLORS: Record<string, string> = {
  "Awaiting Approval": "#eab308",
  "Request Rejected": "#ef4444",
  "Approved & Dispatched": "#3b82f6",
  "In Field": "#8b5cf6",
  "Fully Consumed": "#10b981",
  "Returned / Restocked": "#059669",
}

const STAGE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All stages" },
  ...(Object.keys(STAGE_LABEL) as MovementStage[]).map((s) => ({ value: s, label: STAGE_LABEL[s] })),
]

const FLOW_FILTERS = [
  { value: "all", label: "All supply chain flows" },
  { value: "Tier 1 ➔ Tier 2", label: "Tier 1 ➔ Tier 2 (Stores to Dist)" },
  { value: "Tier 2 ➔ Tier 3", label: "Tier 2 ➔ Tier 3 (Dist to Service)" },
  { value: "Internal / Field", label: "Internal / Field Operations" },
]

const EMPTY_STATS: GoodsMovementStats = {
  totalTracked: 0,
  pendingApprovals: 0,
  activeDispatches: 0,
  completedMovements: 0,
  totalUnitsRequested: 0,
  totalUnitsDispatched: 0,
  totalUnitsConsumed: 0,
  totalUnitsReturned: 0,
  tier1To2Count: 0,
  tier2To3Count: 0,
  bottlenecksCount: 0,
  avgFulfillmentHours: 3.5,
}

function itemsText(t: GoodsMovementTrail) {
  return t.type === "material"
    ? t.items.map((i) => `${i.qty} ${i.unit} ${i.itemName}`).join(", ")
    : `${t.repair?.meterId} (${t.repair?.meterType})`
}

function Step({ title, when, children }: { title: string; when?: string; children: React.ReactNode }) {
  return (
    <li className="relative pb-5 pl-6 last:pb-0">
      <span className="absolute top-1.5 left-0 size-2.5 rounded-full bg-primary" />
      <span className="absolute top-4 bottom-0 left-[4px] w-px bg-border last:hidden" />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{title}</p>
        {when && <span className="shrink-0 text-xs text-muted-foreground">{when}</span>}
      </div>
      <div className="mt-1 space-y-1 text-sm text-muted-foreground">{children}</div>
    </li>
  )
}

export function GoodsMovementPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [trails, setTrails] = useState<GoodsMovementTrail[]>([])
  const [stats, setStats] = useState<GoodsMovementStats>(EMPTY_STATS)

  // Filters
  const [search, setSearch] = useState("")
  const [office, setOffice] = useState("all")
  const [flow, setFlow] = useState("all")
  const [stage, setStage] = useState("all")

  const [active, setActive] = useState<GoodsMovementTrail | null>(null)
  const [exportingView, setExportingView] = useState(false)
  const [exportingWorkbook, setExportingWorkbook] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.raw
      .get<{ trails: GoodsMovementTrail[]; stats: GoodsMovementStats }>("/api/hub/goods-movement")
      .then((res) => {
        if (cancelled) return
        setTrails(res.trails)
        setStats(res.stats)
      })
      .catch(() => toast.error("We couldn't load the supply chain data. Please try again."))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const offices = useMemo(() => [...new Map(trails.map((t) => [t.siteId, t.siteName])).entries()], [trails])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return trails.filter((t) => {
      if (office !== "all" && t.siteId !== office) return false
      if (flow !== "all" && t.supplyChainFlow !== flow) return false
      if (stage !== "all" && t.stage !== stage) return false
      if (!q) return true
      return [
        t.code,
        t.requestedByName,
        t.purpose,
        t.siteName,
        t.sourceSiteName,
        itemsText(t),
        t.assignment?.code ?? "",
      ].some((v) => v.toLowerCase().includes(q))
    })
  }, [trails, search, office, flow, stage])

  const filtersOn = search !== "" || office !== "all" || flow !== "all" || stage !== "all"
  const clearFilters = () => {
    setSearch("")
    setOffice("all")
    setFlow("all")
    setStage("all")
  }

  // Analytics datasets
  const flowDistributionData = useMemo(() => {
    const flows: Record<string, { flow: string; count: number; units: number }> = {
      "Tier 1 ➔ Tier 2": { flow: "Tier 1 ➔ Tier 2", count: 0, units: 0 },
      "Tier 2 ➔ Tier 3": { flow: "Tier 2 ➔ Tier 3", count: 0, units: 0 },
      "Internal / Field": { flow: "Internal / Field", count: 0, units: 0 },
    }
    for (const t of trails) {
      const f = flows[t.supplyChainFlow] || flows["Internal / Field"]
      f.count += 1
      f.units += t.totalQtyRequested
    }
    return Object.values(flows)
  }, [trails])

  const stageBreakdownData = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of trails) {
      const label = STAGE_LABEL[t.stage] || t.stage
      map.set(label, (map.get(label) || 0) + 1)
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [trails])

  const handleExportView = async () => {
    setExportingView(true)
    try {
      const ds: ExportDataset = {
        id: "supply_chain_view",
        label: "Supply Chain Ledger",
        columns: [
          { header: "Request", key: "code", width: 16 },
          { header: "Origin Office", key: "office", width: 22 },
          { header: "Source Warehouse", key: "source", width: 22 },
          { header: "Supply Flow Tier", key: "flow", width: 20 },
          { header: "Asked By", key: "requester", width: 18 },
          { header: "Date Raised", key: "date", width: 20 },
          { header: "Items & Quantities", key: "items", width: 40 },
          { header: "Stage", key: "stage", width: 24 },
          { header: "Decided By", key: "decidedBy", width: 18 },
          { header: "Dispatched Qty", key: "dispatched", width: 14 },
          { header: "Units Used", key: "used", width: 12 },
          { header: "Units Returned", key: "back", width: 14 },
        ],
        rows: filtered.map((t) => ({
          code: t.code,
          office: t.siteName,
          source: t.sourceSiteName,
          flow: t.supplyChainFlow,
          requester: t.requestedByName,
          date: formatDateTime(t.requestedAt),
          items: itemsText(t),
          stage: STAGE_LABEL[t.stage],
          decidedBy: t.decidedBy || "—",
          dispatched: t.assignment ? t.assignment.lines.reduce((s, l) => s + l.qty, 0) : 0,
          used: t.totalConsumed,
          back: t.totalReturned,
        })),
      }
      await exportWorkbook([ds], {
        filename: `Supply_Chain_Tracker_${new Date().toISOString().slice(0, 10)}.xlsx`,
        siteName: "All offices",
        author: user?.name || "Admin",
        color: "#171717",
      })
      toast.success("Excel view downloaded")
    } catch {
      toast.error("Could not export Excel file. Please try again.")
    } finally {
      setExportingView(false)
    }
  }

  const handleExportFullWorkbook = async () => {
    setExportingWorkbook(true)
    try {
      await exportSupplyChainWorkbook(trails, stats, {
        author: user?.name || "Admin",
      })
      toast.success("Complete multi-sheet Supply Chain workbook downloaded")
    } catch {
      toast.error("Could not export full workbook. Please try again.")
    } finally {
      setExportingWorkbook(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central Supply Chain Tracker"
        description="Monitor cross-office material flows, multi-tier dispatches, bottlenecks, and recovery audits across all sites."
        icon={<Truck />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportView} disabled={exportingView || filtered.length === 0}>
              <Download /> {exportingView ? "Exporting…" : "Export View"}
            </Button>
            <Button size="sm" onClick={handleExportFullWorkbook} disabled={exportingWorkbook || trails.length === 0}>
              <FileSpreadsheet /> {exportingWorkbook ? "Preparing…" : "Complete Workbook (.xlsx)"}
            </Button>
          </div>
        }
      />

      {/* TIER ARCHITECTURE VISUAL BANNER */}
      <Card className="bg-muted/30 border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="size-4 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              3-Tier Supply Chain Architecture
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-3 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Tier 1: Central Stores</span>
                <Badge variant="outline" className="text-[10px]">Supplier</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Master inventory & bulk electrical supply</p>
              <div className="mt-2.5 flex items-center justify-between text-xs border-t pt-2">
                <span className="text-muted-foreground">Dispatched to Tier 2:</span>
                <span className="font-semibold tabular-nums">{stats.tier1To2Count} requests</span>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Tier 2: Distribution</span>
                <Badge variant="outline" className="text-[10px]">Hub / Dispatch</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Regional warehousing & technician kits</p>
              <div className="mt-2.5 flex items-center justify-between text-xs border-t pt-2">
                <span className="text-muted-foreground">Dispatched to Tier 3:</span>
                <span className="font-semibold tabular-nums">{stats.tier2To3Count} requests</span>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-3 shadow-xs">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Tier 3: Service Centre</span>
                <Badge variant="outline" className="text-[10px]">Service Bench</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Smart meter testing, repair & refurbishment</p>
              <div className="mt-2.5 flex items-center justify-between text-xs border-t pt-2">
                <span className="text-muted-foreground">Restocked to store:</span>
                <span className="font-semibold tabular-nums text-emerald-600">{stats.totalUnitsReturned.toLocaleString()} units</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI METRIC CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total Requisitions"
          value={stats.totalTracked}
          hint={`${stats.totalUnitsRequested.toLocaleString()} units demanded`}
          icon={Package}
        />
        <StatCard
          label="Waiting on Approval"
          value={stats.pendingApprovals}
          hint={stats.bottlenecksCount && stats.bottlenecksCount > 0 ? `${stats.bottlenecksCount} bottleneck (>24h)` : "Flow on schedule"}
          icon={AlertTriangle}
          tone={stats.bottlenecksCount && stats.bottlenecksCount > 0 ? "danger" : "warning"}
        />
        <StatCard
          label="Given Out / In Field"
          value={stats.totalUnitsDispatched.toLocaleString()}
          hint={`${stats.activeDispatches} active dispatches`}
          icon={Truck}
          tone="primary"
        />
        <StatCard
          label="Used or Restocked"
          value={(stats.totalUnitsConsumed + stats.totalUnitsReturned).toLocaleString()}
          hint={`${stats.totalUnitsConsumed} used · ${stats.totalUnitsReturned} returned`}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Avg Fulfillment Lead Time"
          value={`${stats.avgFulfillmentHours ?? 3.5}h`}
          hint="From requisition to dispatch"
          icon={Clock}
          tone="muted"
        />
      </div>

      {/* MAIN CONTENT TABS */}
      <Tabs defaultValue="trail" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="trail">
              <Table2 className="size-4 mr-1.5" /> Requisition Trail
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="size-4 mr-1.5" /> Flow Analytics
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB 1: REQUISITION TRAIL */}
        <TabsContent value="trail" className="space-y-4">
          {/* FILTER BAR */}
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by code, item name, office, or requester…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={office} onValueChange={setOffice}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="All offices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All offices</SelectItem>
                {offices.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={flow} onValueChange={setFlow}>
              <SelectTrigger className="w-full lg:w-56">
                <SelectValue placeholder="All supply flows" />
              </SelectTrigger>
              <SelectContent>
                {FLOW_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-full lg:w-48">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                {STAGE_FILTERS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No movements found"
              description="No supply chain records matched your active search or filters."
              action={
                filtersOn && (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )
              }
            />
          ) : (
            <Card className="overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requisition</TableHead>
                    <TableHead>Destination & Supplier</TableHead>
                    <TableHead>Flow Tier</TableHead>
                    <TableHead>Asked By</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Stage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setActive(t)}>
                      <TableCell>
                        <p className="font-semibold text-foreground">{t.code}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(t.requestedAt)}</p>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <span className="font-medium text-foreground">{t.siteName}</span>
                          <span className="text-muted-foreground block text-[11px]">from {t.sourceSiteName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {t.supplyChainFlow}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{t.requestedByName}</TableCell>
                      <TableCell className="max-w-64 whitespace-normal text-xs">
                        {t.type === "repair" && <Wrench className="mr-1 inline size-3.5 text-muted-foreground" />}
                        {itemsText(t)}
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: `${STAGE_COLORS[t.stage] || "#94a3b8"}18`,
                            color: STAGE_COLORS[t.stage] || "#475569",
                          }}
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: STAGE_COLORS[t.stage] || "#94a3b8" }}
                          />
                          {STAGE_LABEL[t.stage]}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* TAB 2: SUPPLY CHAIN ANALYTICS */}
        <TabsContent value="analytics" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Chart A: Requisition Count by Flow */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Movements by Supply Chain Flow</CardTitle>
                <CardDescription className="text-xs">Requisitions and material volume across tiers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={flowDistributionData} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={GRID} />
                      <XAxis dataKey="flow" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                      <Bar isAnimationActive={false} dataKey="count" name="Requisitions" fill={COLOR_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={36} />
                      <Bar isAnimationActive={false} dataKey="units" name="Units Requested" fill={COLOR_MUTED} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Chart B: Stage Distribution Donut */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Lifecycle Stage Distribution</CardTitle>
                <CardDescription className="text-xs">Current state of all tracked movements</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex h-72 items-center justify-around">
                  <div className="size-56 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip />
                        <Pie
                          isAnimationActive={false}
                          data={stageBreakdownData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {stageBreakdownData.map((_, idx) => (
                            <Cell
                              key={`cell-${idx}`}
                              fill={Object.values(STAGE_COLORS)[idx % Object.values(STAGE_COLORS).length]}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 max-w-xs text-xs">
                    {stageBreakdownData.map((item, idx) => (
                      <div key={item.name} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: Object.values(STAGE_COLORS)[idx % Object.values(STAGE_COLORS).length] }}
                          />
                          <span className="font-medium text-foreground">{item.name}</span>
                        </div>
                        <span className="text-muted-foreground tabular-nums font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* DETAIL AUDIT JOURNEY MODAL */}
      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          {active && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2 pr-6">
                  <DialogTitle className="text-lg">
                    {active.code} · {active.siteName}
                  </DialogTitle>
                  <Badge variant="outline">{active.supplyChainFlow}</Badge>
                </div>
                <DialogDescription>{active.purpose}</DialogDescription>
              </DialogHeader>

              <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1 mt-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Source Warehouse:</span>
                  <span className="font-medium">{active.sourceSiteName} ({active.sourceTier})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destination Office:</span>
                  <span className="font-medium">{active.destinationSiteName} ({active.destinationTier})</span>
                </div>
              </div>

              <ol className="mt-4">
                <Step title="Requisition Created" when={formatDateTime(active.requestedAt)}>
                  <p>
                    {active.requestedByName} requested <span className="font-medium text-foreground">{itemsText(active)}</span>.
                  </p>
                </Step>

                {active.forwardedAt && (
                  <Step title={`Forwarded to ${active.sourceSiteName}`} when={formatDateTime(active.forwardedAt)}>
                    <p>
                      {active.forwardedBy ?? "Site Manager"} reviewed and forwarded this inter-site requisition upstream.
                    </p>
                    {active.forwardNote && (
                      <p className="italic bg-card border rounded p-2 text-xs mt-1">“{active.forwardNote}”</p>
                    )}
                  </Step>
                )}

                <Step
                  title={active.status === "Rejected" ? "Turned Down" : active.status === "Pending" ? "Awaiting Decision" : "Approved"}
                  when={active.decidedAt ? formatDateTime(active.decidedAt) : undefined}
                >
                  {active.decidedBy ? <p>Reviewed and decided by {active.decidedBy}.</p> : <p>Awaiting manager decision.</p>}
                  {active.decisionComment && <p className="italic text-xs">“{active.decisionComment}”</p>}
                  <div className="mt-1">
                    <StatusBadge status={active.status} />
                  </div>
                </Step>

                {active.assignment && (
                  <Step title="Dispatched from Warehouse" when={formatDateTime(active.assignment.dispatchedAt)}>
                    <p>
                      Dispatched under manifest <span className="font-semibold text-foreground">{active.assignment.code}</span> by {active.assignment.dispatchedBy}.
                    </p>
                    <p className="text-xs">
                      Items handed over to {active.assignment.assigneeName}:{" "}
                      {active.assignment.lines.map((l) => `${l.qty} ${l.unit} ${l.itemName}`).join(", ")}.
                    </p>
                  </Step>
                )}

                {active.consumption.length > 0 && (
                  <Step title={`Field Usage Logged (${active.totalConsumed} units)`}>
                    {active.consumption.map((c) => (
                      <p key={c.id}>
                        {c.qty} × {c.itemName} installed at <span className="font-medium text-foreground">{c.location}</span> on {formatDate(c.date)} (by {c.recordedBy}).
                      </p>
                    ))}
                  </Step>
                )}

                {active.returns.length > 0 && (
                  <Step title={`Returned & Restocked (${active.totalReturned} units)`}>
                    {active.returns.map((r) => (
                      <p key={r.id}>
                        {r.qty} × {r.itemName} returned to stock on {formatDate(r.date)} ({r.condition}, logged by {r.returnedBy}).
                      </p>
                    ))}
                  </Step>
                )}
              </ol>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
