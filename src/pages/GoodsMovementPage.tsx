import { useEffect, useMemo, useState } from "react"
import { Navigate } from "react-router-dom"
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Layers,
  Network,
  Package,
  Search,
  Share2,
  Table2,
  Truck,
  Wrench,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { StatCard } from "@/components/StatCard"
import { StatusBadge } from "@/components/StatusBadge"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import type {
  GoodsMovementStats,
  GoodsMovementTrail,
  MovementStage,
  SupplyChainData,
} from "@/lib/types"
import { formatDate, formatDateTime } from "@/lib/utils"

// Feature 2 Subcomponents
import { NetworkFlowMap } from "@/components/supply-chain/NetworkFlowMap"
import { PipelineFunnelView } from "@/components/supply-chain/PipelineFunnelView"
import { RequestJourneyTimeline } from "@/components/supply-chain/RequestJourneyTimeline"
import { BottleneckHighlights } from "@/components/supply-chain/BottleneckHighlights"
import { SiteComparisonSection } from "@/components/supply-chain/SiteComparisonSection"
import { StockMovementChart } from "@/components/supply-chain/StockMovementChart"
import { exportSupplyChainExcel } from "@/components/supply-chain/SupplyChainExport"

/** Plain wording for the stored stage names. */
const STAGE_LABEL: Record<MovementStage, string> = {
  "Awaiting Approval": "Waiting for a decision",
  "Request Rejected": "Turned down",
  "Approved & Dispatched": "Given out",
  "In Field": "In use",
  "Fully Consumed": "All used",
  "Returned / Restocked": "Given back",
}

const STAGE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All stages" },
  ...(Object.keys(STAGE_LABEL) as MovementStage[]).map((s) => ({ value: s, label: STAGE_LABEL[s] })),
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
}

function itemsText(t: GoodsMovementTrail) {
  return t.type === "material"
    ? t.items.map((i) => `${i.qty} ${i.unit} ${i.itemName}`).join(", ")
    : `${t.repair?.meterId} (${t.repair?.meterType ?? "Board"})`
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
  const { isAnyAdmin, loading: hubLoading } = useHub()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SupplyChainData | null>(null)
  const [activeTab, setActiveTab] = useState("network")

  // Filters for trail table
  const [search, setSearch] = useState("")
  const [office, setOffice] = useState("all")
  const [stage, setStage] = useState("all")
  const [active, setActive] = useState<GoodsMovementTrail | null>(null)
  const [timelineRequestId, setTimelineRequestId] = useState<string>("")
  const [exporting, setExporting] = useState(false)

  const allowed = !hubLoading && isAnyAdmin

  useEffect(() => {
    if (!allowed) return // people who may not open this page are redirected below, without a failed request
    let cancelled = false
    api.raw
      .get<SupplyChainData>("/api/hub/goods-movement")
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch(() => toast.error("We couldn't load the supply chain tracker. Please try again."))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [allowed])

  const trails = data?.trails ?? []
  const stats = data?.stats ?? EMPTY_STATS
  const siteMetrics = data?.siteMetrics ?? []
  const bottlenecks = data?.bottlenecks ?? []
  const edges = data?.edges ?? []

  const offices = useMemo(() => [...new Map(trails.map((t) => [t.siteId, t.siteName])).entries()], [trails])

  // Filtered trail list for Table view
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return trails.filter((t) => {
      if (office !== "all" && t.siteId !== office && t.sourceSiteId !== office) return false
      if (stage !== "all" && t.stage !== stage) return false
      if (!q) return true
      return [t.code, t.requestedByName, t.purpose, t.siteName, itemsText(t), t.assignment?.code ?? ""].some((v) =>
        v.toLowerCase().includes(q)
      )
    })
  }, [trails, search, office, stage])

  const filtersOn = search !== "" || office !== "all" || stage !== "all"
  const clearFilters = () => {
    setSearch("")
    setOffice("all")
    setStage("all")
  }

  // Drill down helpers
  const handleFilterSite = (siteId: string) => {
    setOffice(siteId)
    setActiveTab("movement")
  }

  const handleStageClick = (stageId: string) => {
    if (stageId === "requested") setStage("all")
    else if (stageId === "forwarded") {
      setSearch("")
      setStage("all")
    } else if (stageId === "approved") setStage("Approved & Dispatched")
    else if (stageId === "dispatched") setStage("Approved & Dispatched")
    else if (stageId === "consumed") setStage("Fully Consumed")
    setActiveTab("movement")
  }

  const handleSelectTrailForTimeline = (trail: GoodsMovementTrail) => {
    setTimelineRequestId(trail.id)
    setActiveTab("timeline")
  }

  // Export full multi-sheet workbook
  const handleExport = async () => {
    if (!data) return
    setExporting(true)
    try {
      await exportSupplyChainExcel(data, { author: user?.name || "Global Admin" })
      toast.success("Excel report downloaded with 4 detailed sheets")
    } catch {
      toast.error("Failed to generate Excel export. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  // Hooks above must always run in the same order, so the redirect for non-admins comes after them.
  if (!hubLoading && !isAnyAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supply Chain Tracker"
        description="Comprehensive central admin visibility across all sites, hierarchy corridors, pipelines, and bottlenecks."
        icon={<Network className="size-6 text-primary" />}
        actions={
          <Button onClick={handleExport} disabled={exporting || loading || trails.length === 0}>
            <Download className="mr-1.5 size-4" /> {exporting ? "Generating Excel…" : "Download Full Report"}
          </Button>
        }
      />

      {/* Global Supply Chain KPI Stat Cards with Clickable Drilldown */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          onClick={() => {
            clearFilters()
            setActiveTab("movement")
          }}
          className="cursor-pointer"
        >
          <StatCard
            label="Total Tracked Requests"
            value={stats.totalTracked}
            hint="Across all offices"
            icon={Package}
          />
        </div>

        <div
          onClick={() => {
            setStage("Awaiting Approval")
            setActiveTab("bottlenecks")
          }}
          className="cursor-pointer"
        >
          <StatCard
            label="Pending Decisions"
            value={stats.pendingApprovals}
            hint="Awaiting manager sign-off"
            icon={Clock}
            tone="warning"
          />
        </div>

        <div
          onClick={() => {
            setStage("Approved & Dispatched")
            setActiveTab("movement")
          }}
          className="cursor-pointer"
        >
          <StatCard
            label="Units Dispatched"
            value={stats.totalUnitsDispatched.toLocaleString()}
            hint="Given out to field staff"
            icon={Truck}
          />
        </div>

        <div
          onClick={() => {
            setActiveTab("comparison")
          }}
          className="cursor-pointer"
        >
          <StatCard
            label="Units Consumed / Restocked"
            value={(stats.totalUnitsConsumed + stats.totalUnitsReturned).toLocaleString()}
            hint={`${stats.totalUnitsConsumed} used · ${stats.totalUnitsReturned} returned`}
            icon={CheckCircle2}
            tone="success"
          />
        </div>
      </div>

      {/* Navigation Tabs for Central Admin Views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto p-1.5 gap-1 bg-muted/60">
          <TabsTrigger value="network" className="text-xs py-2 gap-1.5">
            <Share2 className="size-3.5" /> Network Map
          </TabsTrigger>
          <TabsTrigger value="funnel" className="text-xs py-2 gap-1.5">
            <Layers className="size-3.5" /> Pipeline Funnel
          </TabsTrigger>
          <TabsTrigger value="bottlenecks" className="text-xs py-2 gap-1.5">
            <Clock className="size-3.5" /> Bottlenecks
          </TabsTrigger>
          <TabsTrigger value="comparison" className="text-xs py-2 gap-1.5">
            <BarChart3 className="size-3.5" /> Site Comparison
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs py-2 gap-1.5">
            <Activity className="size-3.5" /> Request Journey
          </TabsTrigger>
          <TabsTrigger value="movement" className="text-xs py-2 gap-1.5">
            <Table2 className="size-3.5" /> Movement Logs
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Network Flow Map */}
        <TabsContent value="network" className="mt-4">
          {loading ? (
            <TableSkeleton rows={8} />
          ) : (
            <NetworkFlowMap
              metrics={siteMetrics}
              edgesData={edges}
              trails={trails}
              onFilterSite={handleFilterSite}
              onSelectTrail={handleSelectTrailForTimeline}
            />
          )}
        </TabsContent>

        {/* Tab 2: Pipeline Funnel View */}
        <TabsContent value="funnel" className="mt-4">
          {loading ? (
            <TableSkeleton rows={8} />
          ) : (
            <PipelineFunnelView
              trails={trails}
              siteMetrics={siteMetrics}
              onStageClick={handleStageClick}
              onSiteClick={handleFilterSite}
            />
          )}
        </TabsContent>

        {/* Tab 3: Bottleneck Highlights & Latency */}
        <TabsContent value="bottlenecks" className="mt-4">
          {loading ? (
            <TableSkeleton rows={8} />
          ) : (
            <BottleneckHighlights
              bottlenecks={bottlenecks}
              siteMetrics={siteMetrics}
              trails={trails}
              onSelectRequest={handleSelectTrailForTimeline}
              onFilterSite={handleFilterSite}
            />
          )}
        </TabsContent>

        {/* Tab 4: Per-site Comparison Table & Bar Chart */}
        <TabsContent value="comparison" className="mt-4">
          {loading ? (
            <TableSkeleton rows={8} />
          ) : (
            <SiteComparisonSection siteMetrics={siteMetrics} onFilterSite={handleFilterSite} />
          )}
        </TabsContent>

        {/* Tab 5: Request Journey Timeline */}
        <TabsContent value="timeline" className="mt-4">
          {loading ? (
            <TableSkeleton rows={8} />
          ) : (
            <RequestJourneyTimeline
              trails={trails}
              selectedRequestId={timelineRequestId}
              onSelectRequest={(t) => setTimelineRequestId(t.id)}
            />
          )}
        </TabsContent>

        {/* Tab 6: Stock Movement Logs & Time Chart */}
        <TabsContent value="movement" className="mt-4 space-y-6">
          {/* Movement Over Time Chart */}
          <StockMovementChart trails={trails} edges={edges} />

          {/* Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by code, person, item, or site..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <Select value={office} onValueChange={setOffice}>
              <SelectTrigger className="w-full sm:w-48 text-xs">
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

            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="w-full sm:w-48 text-xs">
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

            {filtersOn && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                <X className="mr-1 size-3.5" /> Clear
              </Button>
            )}
          </div>

          {/* Request Records Table */}
          {loading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No records found"
              description="Try adjusting your search criteria or resetting filters."
              action={
                filtersOn && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
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
                    <TableHead>Request</TableHead>
                    <TableHead>Origin Site</TableHead>
                    <TableHead>Supplying Site</TableHead>
                    <TableHead>Asked by</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40 transition-colors">
                      <TableCell onClick={() => setActive(t)}>
                        <p className="font-semibold text-primary">{t.code}</p>
                        <p className="text-[11px] text-muted-foreground">{formatDate(t.requestedAt)}</p>
                      </TableCell>
                      <TableCell onClick={() => setActive(t)} className="font-medium">
                        {t.siteName}
                      </TableCell>
                      <TableCell onClick={() => setActive(t)} className="text-muted-foreground text-xs">
                        {t.sourceSiteName}
                      </TableCell>
                      <TableCell onClick={() => setActive(t)}>{t.requestedByName}</TableCell>
                      <TableCell onClick={() => setActive(t)} className="max-w-64 whitespace-normal text-xs">
                        {t.type === "repair" && <Wrench className="mr-1 inline size-3.5 text-amber-500" />}
                        {itemsText(t)}
                      </TableCell>
                      <TableCell onClick={() => setActive(t)}>
                        <Badge variant="secondary" className="text-xs">
                          {STAGE_LABEL[t.stage] ?? t.stage}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => handleSelectTrailForTimeline(t)}
                        >
                          Journey
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Detail Slideout Modal for Individual Request */}
      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {active.code} · {active.siteName}
                </DialogTitle>
                <DialogDescription>{active.purpose}</DialogDescription>
              </DialogHeader>
              <ol className="mt-2">
                <Step title="Asked for" when={formatDateTime(active.requestedAt)}>
                  <p>
                    {active.requestedByName} asked for {itemsText(active)}.
                  </p>
                </Step>
                {active.forwardedAt && (
                  <Step title={`Sent on to ${active.sourceSiteName}`} when={formatDateTime(active.forwardedAt)}>
                    <p>
                      {active.forwardedBy ?? `A manager at ${active.siteName}`} passed it to the manager of {active.sourceSiteName}.
                    </p>
                    {active.forwardNote && <p className="italic">"{active.forwardNote}"</p>}
                  </Step>
                )}
                <Step
                  title={
                    active.status === "Rejected"
                      ? "Turned down"
                      : active.status === "Pending"
                      ? "Waiting for a decision"
                      : "Approved"
                  }
                  when={active.decidedAt ? formatDateTime(active.decidedAt) : undefined}
                >
                  {active.decidedBy ? <p>Decided by {active.decidedBy}.</p> : <p>No one has decided yet.</p>}
                  {active.decisionComment && <p className="italic">"{active.decisionComment}"</p>}
                  <StatusBadge status={active.status} />
                </Step>
                {active.assignment && (
                  <Step title="Given out" when={formatDateTime(active.assignment.dispatchedAt)}>
                    <p>
                      {active.assignment.lines.map((l) => `${l.qty} ${l.unit} ${l.itemName}`).join(", ")} went to {active.assignment.assigneeName}. Stock was taken from {active.sourceSiteName}.
                    </p>
                  </Step>
                )}
                {active.consumption.length > 0 && (
                  <Step title={`Used (${active.totalConsumed})`}>
                    {active.consumption.map((c) => (
                      <p key={c.id}>
                        {c.qty} × {c.itemName} at {c.location} on {formatDate(c.date)}
                      </p>
                    ))}
                  </Step>
                )}
                {active.returns.length > 0 && (
                  <Step title={`Given back (${active.totalReturned})`}>
                    {active.returns.map((r) => (
                      <p key={r.id}>
                        {r.qty} × {r.itemName} on {formatDate(r.date)} ({r.condition})
                      </p>
                    ))}
                  </Step>
                )}
              </ol>

              <div className="mt-4 pt-4 border-t flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleSelectTrailForTimeline(active)
                    setActive(null)
                  }}
                  className="text-xs"
                >
                  Inspect in Journey Timeline
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
