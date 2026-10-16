import { useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  GitBranch,
  Grid2X2,
  Layers,
  LayoutList,
  MapPin,
  Package,
  PackageCheck,
  RotateCcw,
  Search,
  ShieldCheck,
  Truck,
  User,
  Wrench,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { exportWorkbook } from "@/lib/excel"
import type { ExportDataset, GoodsMovementStats, GoodsMovementTrail, MovementStage, SupplyChainFlow } from "@/lib/types"
import { cn, formatDate, formatDateTime } from "@/lib/utils"

function relativeTime(iso?: string) {
  if (!iso) return ""
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return "Just now"
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function stageColor(stage: MovementStage) {
  switch (stage) {
    case "Awaiting Approval":
      return "bg-amber-50 text-amber-700 ring-amber-200"
    case "Request Rejected":
      return "bg-red-50 text-red-700 ring-red-200"
    case "Approved & Dispatched":
      return "bg-sky-50 text-sky-700 ring-sky-200"
    case "In Field":
      return "bg-purple-50 text-purple-700 ring-purple-200"
    case "Fully Consumed":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200"
    case "Returned / Restocked":
      return "bg-teal-50 text-teal-700 ring-teal-200"
    default:
      return "bg-slate-50 text-slate-600 ring-slate-200"
  }
}

function flowBadge(flow: SupplyChainFlow) {
  switch (flow) {
    case "Tier 1 ➔ Tier 2":
      return {
        label: "Tier 1 ➔ Tier 2 (Central → Distribution)",
        badgeClass: "bg-blue-50 text-blue-700 ring-blue-200",
      }
    case "Tier 2 ➔ Tier 3":
      return {
        label: "Tier 2 ➔ Tier 3 (Distribution → Service)",
        badgeClass: "bg-orange-50 text-orange-700 ring-orange-200",
      }
    case "Internal / Field":
      return {
        label: "Distribution ➔ Field Operations",
        badgeClass: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      }
    default:
      return {
        label: flow,
        badgeClass: "bg-slate-50 text-slate-700 ring-slate-200",
      }
  }
}

export function GoodsMovementPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ trails: GoodsMovementTrail[]; stats: GoodsMovementStats }>({
    trails: [],
    stats: {
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
    },
  })

  const [search, setSearch] = useState("")
  const [selectedUnit, setSelectedUnit] = useState<string>("all")
  const [selectedFlow, setSelectedFlow] = useState<string>("all")
  const [selectedStage, setSelectedStage] = useState<string>("all")
  const [selectedType, setSelectedType] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"table" | "pipeline">("table")
  const [activeTrail, setActiveTrail] = useState<GoodsMovementTrail | null>(null)
  const [exporting, setExporting] = useState(false)

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await api.raw.get<{ trails: GoodsMovementTrail[]; stats: GoodsMovementStats }>(
        "/api/hub/goods-movement",
      )
      setData(res)
    } catch {
      toast.error("Failed to load supply chain movements")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filter list
  const filtered = useMemo(() => {
    return data.trails.filter((trail) => {
      // Unit filter
      if (selectedUnit !== "all" && trail.siteId !== selectedUnit) return false

      // Supply Chain Flow filter
      if (selectedFlow !== "all" && trail.supplyChainFlow !== selectedFlow) return false

      // Stage filter
      if (selectedStage !== "all") {
        if (selectedStage === "pending" && trail.status !== "Pending") return false
        if (selectedStage === "rejected" && trail.status !== "Rejected") return false
        if (selectedStage === "dispatched" && trail.stage !== "Approved & Dispatched") return false
        if (selectedStage === "in_field" && trail.stage !== "In Field") return false
        if (selectedStage === "completed" && trail.stage !== "Fully Consumed") return false
        if (selectedStage === "returned" && trail.stage !== "Returned / Restocked") return false
      }

      // Type filter
      if (selectedType !== "all" && trail.type !== selectedType) return false

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase()
        const matchesCode = trail.code.toLowerCase().includes(q)
        const matchesRequester = trail.requestedByName.toLowerCase().includes(q)
        const matchesPurpose = trail.purpose.toLowerCase().includes(q)
        const matchesAsn = trail.assignment?.code.toLowerCase().includes(q)
        const matchesItem = trail.items.some((i) => i.itemName.toLowerCase().includes(q))
        const matchesMeter = trail.repair?.meterId.toLowerCase().includes(q)
        const matchesSource = trail.sourceSiteName.toLowerCase().includes(q)
        const matchesDest = trail.destinationSiteName.toLowerCase().includes(q)
        if (
          !matchesCode &&
          !matchesRequester &&
          !matchesPurpose &&
          !matchesAsn &&
          !matchesItem &&
          !matchesMeter &&
          !matchesSource &&
          !matchesDest
        ) {
          return false
        }
      }

      return true
    })
  }, [data.trails, search, selectedUnit, selectedFlow, selectedStage, selectedType])

  // Get unique unit names for filter
  const units = useMemo(() => {
    const map = new Map<string, string>()
    data.trails.forEach((t) => map.set(t.siteId, t.siteName))
    return Array.from(map.entries())
  }, [data.trails])

  // Export to Excel
  const handleExport = async () => {
    try {
      setExporting(true)
      const ds: ExportDataset = {
        id: "goods_movement",
        label: "Supply Chain Audit Log",
        columns: [
          { header: "Request Code", key: "code", width: 16 },
          { header: "Supply Chain Flow", key: "flow", width: 30 },
          { header: "Source Facility", key: "source", width: 22 },
          { header: "Destination Facility", key: "destination", width: 22 },
          { header: "Type", key: "type", width: 14 },
          { header: "Requested By", key: "requester", width: 18 },
          { header: "Requested Date", key: "requestedAt", width: 20 },
          { header: "Purpose", key: "purpose", width: 34 },
          { header: "Stage", key: "stage", width: 22 },
          { header: "Approval Status", key: "status", width: 16 },
          { header: "Decided By", key: "decidedBy", width: 18 },
          { header: "Dispatch Code", key: "assignmentCode", width: 16 },
          { header: "Items & Qty", key: "itemsSummary", width: 34 },
          { header: "Units Consumed", key: "consumed", width: 16 },
          { header: "Units Returned", key: "returned", width: 16 },
        ],
        rows: filtered.map((t) => ({
          code: t.code,
          flow: t.supplyChainFlow,
          source: `${t.sourceTier}: ${t.sourceSiteName}`,
          destination: `${t.destinationTier}: ${t.destinationSiteName}`,
          type: t.type === "material" ? "Material Request" : "Meter Repair",
          requester: t.requestedByName,
          requestedAt: formatDateTime(t.requestedAt),
          purpose: t.purpose,
          stage: t.stage,
          status: t.status,
          decidedBy: t.decidedBy || "—",
          assignmentCode: t.assignment?.code || "—",
          itemsSummary:
            t.type === "material"
              ? t.items.map((i) => `${i.qty} ${i.unit} ${i.itemName}`).join("; ")
              : `${t.repair?.meterId} (${t.repair?.meterType})`,
          consumed: t.totalConsumed,
          returned: t.totalReturned,
        })),
      }

      await exportWorkbook([ds], {
        filename: `Supply_Chain_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`,
        siteName: "Multi-Tier Supply Chain",
        author: user?.name || "Admin",
        color: "#1e3a8a",
      })
      toast.success("Supply chain report downloaded")
    } catch {
      toast.error("Failed to export Excel report")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Standard OpsHub PageHeader */}
      <PageHeader
        title="Supply Chain & Movement of Goods"
        description="Hierarchical chain of custody: Central Stores (master inventory) ➔ Distribution Centres (regional hubs) ➔ Service Centres (repairs & services)."
        icon={<Truck className="size-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5">
              <RotateCcw className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleExport}
              disabled={exporting || filtered.length === 0}
              className="gap-1.5"
            >
              <Download className="size-3.5" />
              {exporting ? "Exporting…" : "Export Excel"}
            </Button>
          </div>
        }
      />

      {/* Interactive 3-Tier Supply Chain Architecture Card */}
      <Card className="border-primary/20 bg-muted/20 p-5">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
              <GitBranch className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Supply Chain Flow Architecture</h3>
              <p className="text-xs text-muted-foreground">
                Strict multi-tier hierarchy: Central Store supplies Distribution; Distribution supplies Service Centres.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs bg-background">
            <ShieldCheck className="mr-1 size-3 text-emerald-600" />
            Admin Monitored
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Tier 1 Card */}
          <div
            onClick={() => setSelectedFlow("Tier 1 ➔ Tier 2")}
            className={cn(
              "group cursor-pointer rounded-lg border bg-card p-4 transition-all hover:border-blue-400 hover:shadow-xs",
              selectedFlow === "Tier 1 ➔ Tier 2" && "border-blue-600 ring-1 ring-blue-600 bg-blue-50/10",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                Tier 1 • Top of Chain
              </span>
              <span className="text-xs font-semibold text-foreground">
                {data.stats.tier1To2Count} Orders
              </span>
            </div>
            <h4 className="mt-2 text-base font-semibold text-foreground">Central Stores</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Holds all master inventory. Receives product requests from Distribution Centres and dispatches stock.
            </p>
            <div className="mt-3 flex items-center justify-between pt-2 border-t text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Master Stockholder</span>
              <span className="text-blue-700 font-medium group-hover:underline flex items-center gap-1">
                Filter Tier 1 ➔ 2 <ArrowRight className="size-3" />
              </span>
            </div>
          </div>

          {/* Tier 2 Card */}
          <div
            onClick={() => setSelectedFlow("Tier 2 ➔ Tier 3")}
            className={cn(
              "group cursor-pointer rounded-lg border bg-card p-4 transition-all hover:border-orange-400 hover:shadow-xs",
              selectedFlow === "Tier 2 ➔ Tier 3" && "border-orange-600 ring-1 ring-orange-600 bg-orange-50/10",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200">
                Tier 2 • Mid-Tier Hub
              </span>
              <span className="text-xs font-semibold text-foreground">
                {data.stats.tier2To3Count} Orders
              </span>
            </div>
            <h4 className="mt-2 text-base font-semibold text-foreground">Distribution Centres</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Requests products ONLY from Central Stores. Receives and fulfills product requisitions from Service Centres.
            </p>
            <div className="mt-3 flex items-center justify-between pt-2 border-t text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Regional Fulfillments</span>
              <span className="text-orange-700 font-medium group-hover:underline flex items-center gap-1">
                Filter Tier 2 ➔ 3 <ArrowRight className="size-3" />
              </span>
            </div>
          </div>

          {/* Tier 3 Card */}
          <div
            onClick={() => setSelectedUnit("sc-002")}
            className={cn(
              "group cursor-pointer rounded-lg border bg-card p-4 transition-all hover:border-purple-400 hover:shadow-xs",
              selectedUnit === "sc-002" && "border-purple-600 ring-1 ring-purple-600 bg-purple-50/10",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 ring-1 ring-purple-200">
                Tier 3 • Bottom of Chain
              </span>
              <span className="text-xs font-semibold text-foreground">
                Service & Repair
              </span>
            </div>
            <h4 className="mt-2 text-base font-semibold text-foreground">Service Centres</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              At the bottom of the chain. Requests products ONLY from Distribution. Repairs meters and sends restored units back up.
            </p>
            <div className="mt-3 flex items-center justify-between pt-2 border-t text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Testing & Repairs</span>
              <span className="text-purple-700 font-medium group-hover:underline flex items-center gap-1">
                Filter Service <ArrowRight className="size-3" />
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Goods Tracked
            </CardTitle>
            <span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary">
              <Layers className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {data.stats.totalTracked}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{data.stats.totalUnitsRequested.toLocaleString("en-IN")}</span> units requested across all tiers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-amber-700">
              Awaiting Approval
            </CardTitle>
            <span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-amber-50 text-amber-700">
              <Clock className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-amber-700">
              {data.stats.pendingApprovals}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Requiring manager or administrator sign-off
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Dispatched & In Transit
            </CardTitle>
            <span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-sky-50 text-sky-700">
              <Truck className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {data.stats.activeDispatches}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-sky-700">{data.stats.totalUnitsDispatched.toLocaleString("en-IN")}</span> units released from upstream stores
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Consumed / Restocked
            </CardTitle>
            <span className="flex size-8 items-center justify-center rounded-[var(--radius)] bg-emerald-50 text-emerald-700">
              <PackageCheck className="size-4" />
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {data.stats.totalUnitsConsumed.toLocaleString("en-IN")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Installed in field + <span className="font-medium text-teal-700">{data.stats.totalUnitsReturned}</span> returned to inventory
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Controls using shadcn Input, Select, Tabs */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by code (REQ/ASN), requester, facility, item, or meter ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Supply Chain Flow Filter using shadcn Select */}
          <div className="w-full sm:w-56">
            <Select value={selectedFlow} onValueChange={setSelectedFlow}>
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2 truncate">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="All Flow Tiers" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Supply Chain Flows</SelectItem>
                <SelectItem value="Tier 1 ➔ Tier 2">Tier 1 ➔ 2: Central → Distribution</SelectItem>
                <SelectItem value="Tier 2 ➔ Tier 3">Tier 2 ➔ 3: Distribution → Service</SelectItem>
                <SelectItem value="Internal / Field">Distribution → Field Operations</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Facility / Office Filter using shadcn Select */}
          <div className="w-full sm:w-44">
            <Select value={selectedUnit} onValueChange={setSelectedUnit}>
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  <SelectValue placeholder="All Offices" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Offices</SelectItem>
                {units.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* View Mode Toggle Buttons */}
          <div className="flex items-center rounded-lg border p-0.5 bg-muted">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5"
              onClick={() => setViewMode("table")}
            >
              <LayoutList className="size-4" />
            </Button>
            <Button
              variant={viewMode === "pipeline" ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5"
              onClick={() => setViewMode("pipeline")}
            >
              <Grid2X2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Stage Filter Tabs using shadcn Tabs */}
        <div className="mt-3 border-t pt-3 flex flex-wrap items-center justify-between gap-2">
          <Tabs value={selectedStage} onValueChange={setSelectedStage}>
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
              <TabsTrigger value="all" className="rounded-full text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                All ({data.trails.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="rounded-full text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Awaiting Approval ({data.stats.pendingApprovals})
              </TabsTrigger>
              <TabsTrigger value="dispatched" className="rounded-full text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Dispatched
              </TabsTrigger>
              <TabsTrigger value="in_field" className="rounded-full text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                In Field / In Transit
              </TabsTrigger>
              <TabsTrigger value="completed" className="rounded-full text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Fully Consumed
              </TabsTrigger>
              <TabsTrigger value="returned" className="rounded-full text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Restocked
              </TabsTrigger>
              <TabsTrigger value="rejected" className="rounded-full text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Rejected
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {(selectedFlow !== "all" || selectedUnit !== "all" || selectedStage !== "all" || search) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSelectedFlow("all")
                setSelectedUnit("all")
                setSelectedStage("all")
                setSearch("")
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Movement Records Content */}
      {loading ? (
        <TableSkeleton rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No supply chain movement records found"
          description="Try adjusting your filter selection or search query."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("")
                setSelectedUnit("all")
                setSelectedFlow("all")
                setSelectedStage("all")
                setSelectedType("all")
              }}
            >
              Clear Filters
            </Button>
          }
        />
      ) : viewMode === "table" ? (
        /* TABLE VIEW */
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Requisition</TableHead>
                <TableHead>Supply Chain Hierarchy Flow</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Items Requested</TableHead>
                <TableHead>Manager Review</TableHead>
                <TableHead>Store Movement / Dispatch</TableHead>
                <TableHead>Lifecycle Stage</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((trail) => {
                const isApproved = trail.status === "Approved" || trail.status === "Assigned"
                const hasAssignment = !!trail.assignment
                const flowInfo = flowBadge(trail.supplyChainFlow)

                return (
                  <TableRow
                    key={trail.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => setActiveTrail(trail)}
                  >
                    {/* Code & Purpose */}
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">{trail.code}</span>
                        <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {trail.purpose}
                        </span>
                        <span className="text-[11px] text-muted-foreground/75">
                          {formatDate(trail.requestedAt)}
                        </span>
                      </div>
                    </TableCell>

                    {/* Supply Chain Flow */}
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset w-fit", flowInfo.badgeClass)}>
                          {flowInfo.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <strong>{trail.sourceSiteName}</strong> ➔ <strong>{trail.destinationSiteName}</strong>
                        </span>
                      </div>
                    </TableCell>

                    {/* Requester */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{trail.requestedByName}</span>
                        <span className="text-xs text-muted-foreground">{relativeTime(trail.requestedAt)}</span>
                      </div>
                    </TableCell>

                    {/* Items Requested */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {trail.type === "material" ? (
                          trail.items.map((it) => (
                            <Badge key={it.itemId} variant="secondary" className="text-[11px] font-normal">
                              {it.qty} {it.unit} {it.itemName}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="secondary" className="text-[11px] font-normal text-amber-700 bg-amber-50">
                            {trail.repair?.meterId} ({trail.repair?.meterType})
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Manager Review */}
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={trail.status} />
                        {trail.decidedBy && (
                          <span className="text-xs text-muted-foreground">by {trail.decidedBy}</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Store Movement / Dispatch */}
                    <TableCell>
                      {hasAssignment ? (
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-sky-700">
                            {trail.assignment?.code}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            from {trail.sourceSiteName}
                          </span>
                        </div>
                      ) : isApproved ? (
                        <span className="text-xs text-amber-600">Awaiting Dispatch</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Lifecycle Stage */}
                    <TableCell>
                      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", stageColor(trail.stage))}>
                        {trail.stage}
                      </span>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveTrail(trail)
                        }}
                      >
                        <Eye className="size-3.5" />
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        /* PIPELINE / STEPPER CARD VIEW */
        <div className="space-y-4">
          {filtered.map((trail) => {
            const isApproved = trail.status === "Approved" || trail.status === "Assigned"
            const isRejected = trail.status === "Rejected"
            const isPending = trail.status === "Pending"
            const hasAssignment = !!trail.assignment
            const hasConsumption = trail.totalConsumed > 0
            const hasReturns = trail.totalReturned > 0
            const flowInfo = flowBadge(trail.supplyChainFlow)

            return (
              <Card
                key={trail.id}
                onClick={() => setActiveTrail(trail)}
                className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-xs"
              >
                <CardContent className="p-5">
                  {/* Top Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {trail.code}
                      </span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", flowInfo.badgeClass)}>
                        {flowInfo.label}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {trail.type === "material" ? "Material Request" : "Meter Repair"}
                      </Badge>
                      {trail.priority === "Urgent" && (
                        <Badge variant="destructive" className="text-xs">
                          Urgent
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", stageColor(trail.stage))}>
                        {trail.stage}
                      </span>
                      <span className="text-xs text-muted-foreground">{relativeTime(trail.requestedAt)}</span>
                    </div>
                  </div>

                  {/* Flow Route & Requester Info */}
                  <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <span>{trail.sourceTier} ({trail.sourceSiteName})</span>
                        <ArrowRight className="size-3 text-muted-foreground" />
                        <span className="text-primary font-semibold">{trail.destinationTier} ({trail.destinationSiteName})</span>
                      </div>
                      <h4 className="mt-1 text-sm font-medium text-foreground">{trail.purpose}</h4>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Requested by <strong className="text-foreground">{trail.requestedByName}</strong> on{" "}
                        {formatDate(trail.requestedAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {trail.type === "material" ? (
                        trail.items.map((it) => (
                          <Badge key={it.itemId} variant="secondary" className="text-xs font-normal">
                            <Package className="mr-1 size-3 text-muted-foreground" />
                            {it.qty} {it.unit} {it.itemName}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="secondary" className="text-xs font-normal text-amber-700 bg-amber-50">
                          <Wrench className="mr-1 size-3 text-amber-600" />
                          {trail.repair?.meterId} — {trail.repair?.fault}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* 4-Stage Chain of Custody Pipeline */}
                  <div className="mt-4 rounded-lg border bg-muted/30 p-3.5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                      {/* Step 1 */}
                      <div className="flex items-start gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <CheckCircle2 className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            1. Requisition
                          </div>
                          <div className="truncate text-sm font-medium text-foreground">{trail.requestedByName}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(trail.requestedAt)}</div>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full",
                            isApproved
                              ? "bg-emerald-50 text-emerald-700"
                              : isRejected
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700",
                          )}
                        >
                          {isApproved ? (
                            <CheckCircle2 className="size-4" />
                          ) : isRejected ? (
                            <XCircle className="size-4" />
                          ) : (
                            <Clock className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            2. Review & Approval
                          </div>
                          <div className="truncate text-sm font-medium text-foreground">
                            {trail.decidedBy || (isPending ? "Pending Review" : "—")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {trail.status === "Approved" || trail.status === "Assigned"
                              ? "Approved"
                              : trail.status === "Rejected"
                                ? "Rejected"
                                : "Awaiting Action"}
                          </div>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full",
                            hasAssignment ? "bg-sky-50 text-sky-700" : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Truck className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            3. Tier Movement
                          </div>
                          <div className="truncate text-sm font-medium text-foreground">
                            {hasAssignment ? trail.assignment?.code : "Not Dispatched"}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {hasAssignment ? `from ${trail.sourceSiteName}` : "Pending approval"}
                          </div>
                        </div>
                      </div>

                      {/* Step 4 */}
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-full",
                            hasReturns
                              ? "bg-teal-50 text-teal-700"
                              : hasConsumption
                                ? "bg-purple-50 text-purple-700"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {hasReturns ? (
                            <RotateCcw className="size-4" />
                          ) : (
                            <MapPin className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            4. Handover / Restock
                          </div>
                          <div className="truncate text-sm font-medium text-foreground">
                            {hasReturns
                              ? `${trail.totalReturned} Restocked`
                              : hasConsumption
                                ? `${trail.totalConsumed} Consumed`
                                : trail.stage === "Approved & Dispatched"
                                  ? "In Possession"
                                  : "—"}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {hasReturns
                              ? "Returned to stores"
                              : hasConsumption
                                ? "Field installation"
                                : trail.status === "Rejected"
                                  ? "Canceled"
                                  : "Awaiting execution"}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer note & action */}
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                      {trail.decisionComment && (
                        <span className="italic">"{trail.decisionComment}" — {trail.decidedBy}</span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 font-medium text-primary hover:underline">
                      View Supply Chain Passport <ArrowRight className="size-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Movement Passport / Chain of Custody Dialog */}
      <Dialog open={!!activeTrail} onOpenChange={(open) => !open && setActiveTrail(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {activeTrail && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs font-semibold">
                    {activeTrail.code}
                  </Badge>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", flowBadge(activeTrail.supplyChainFlow).badgeClass)}>
                    {activeTrail.supplyChainFlow}
                  </span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset", stageColor(activeTrail.stage))}>
                    {activeTrail.stage}
                  </span>
                </div>
                <DialogTitle className="mt-2 text-lg font-semibold text-foreground">
                  {activeTrail.purpose}
                </DialogTitle>
                <DialogDescription>
                  Supply chain chain-of-custody verification for requisition {activeTrail.code}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-6">
                {/* Supply Chain Flow Route Card */}
                <Card className="p-4 bg-muted/30">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Supply Chain Routing & Hierarchy Validation
                  </h4>
                  <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                    <div className="rounded-md bg-background border p-3 flex-1 w-full">
                      <div className="text-[11px] font-semibold text-blue-700 uppercase">Upstream Provider</div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{activeTrail.sourceSiteName}</div>
                      <div className="text-xs text-muted-foreground">{activeTrail.sourceTier}</div>
                    </div>

                    <ArrowRight className="size-5 text-muted-foreground hidden sm:block shrink-0" />
                    <ArrowDown className="size-5 text-muted-foreground sm:hidden shrink-0" />

                    <div className="rounded-md bg-background border p-3 flex-1 w-full">
                      <div className="text-[11px] font-semibold text-orange-700 uppercase">Downstream Requester</div>
                      <div className="text-sm font-bold text-foreground mt-0.5">{activeTrail.destinationSiteName}</div>
                      <div className="text-xs text-muted-foreground">{activeTrail.destinationTier}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50/50 p-2 rounded-md border border-emerald-100">
                    <ShieldCheck className="size-4 shrink-0" />
                    <span>Rule Confirmed: Requisition strictly complies with supply chain flow rules.</span>
                  </div>
                </Card>

                {/* Balance Sheet Ledger Card */}
                <Card className="bg-muted/40 p-4">
                  <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Material Movement Ledger
                  </h4>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
                    <div className="rounded-[var(--radius)] bg-background p-2.5 border">
                      <div className="text-xs text-muted-foreground">Requested</div>
                      <div className="text-lg font-bold text-foreground">
                        {activeTrail.type === "material" ? activeTrail.totalQtyRequested : 1}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius)] bg-background p-2.5 border">
                      <div className="text-xs text-muted-foreground">Dispatched</div>
                      <div className="text-lg font-bold text-sky-700">
                        {activeTrail.assignment
                          ? activeTrail.assignment.lines.reduce((s, l) => s + l.qty, 0)
                          : activeTrail.status === "Approved"
                            ? 1
                            : 0}
                      </div>
                    </div>
                    <div className="rounded-[var(--radius)] bg-background p-2.5 border">
                      <div className="text-xs text-muted-foreground">Consumed</div>
                      <div className="text-lg font-bold text-purple-700">{activeTrail.totalConsumed}</div>
                    </div>
                    <div className="rounded-[var(--radius)] bg-background p-2.5 border">
                      <div className="text-xs text-muted-foreground">Restocked</div>
                      <div className="text-lg font-bold text-teal-700">{activeTrail.totalReturned}</div>
                    </div>
                  </div>
                </Card>

                {/* Step-by-Step Chain of Custody Timeline */}
                <div className="relative space-y-5 pl-6 before:absolute before:left-2.5 before:top-2 before:h-[calc(100%-16px)] before:w-0.5 before:bg-border">
                  {/* Step 1: Requisition */}
                  <div className="relative">
                    <span className="absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background">
                      <User className="size-3" />
                    </span>
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <h5 className="font-semibold text-foreground text-sm">1. Goods Requested</h5>
                        <span className="text-xs text-muted-foreground">{formatDateTime(activeTrail.requestedAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Raised by <strong className="text-foreground">{activeTrail.requestedByName}</strong> at{" "}
                        <strong className="text-foreground">{activeTrail.destinationSiteName}</strong> ({activeTrail.destinationTier})
                      </p>
                      <div className="mt-3">
                        <div className="text-xs font-medium text-foreground">Items Requested:</div>
                        <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                          {activeTrail.type === "material" ? (
                            activeTrail.items.map((i) => (
                              <li key={i.itemId} className="flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5">
                                <span className="text-foreground">{i.itemName}</span>
                                <span className="font-semibold text-foreground">
                                  {i.qty} {i.unit}
                                </span>
                              </li>
                            ))
                          ) : (
                            <li className="rounded-md bg-muted px-2.5 py-1.5">
                              <strong>Meter:</strong> {activeTrail.repair?.meterId} ({activeTrail.repair?.meterType}) — Fault: {activeTrail.repair?.fault}
                            </li>
                          )}
                        </ul>
                      </div>
                    </Card>
                  </div>

                  {/* Step 2: Manager Decision */}
                  <div className="relative">
                    <span
                      className={cn(
                        "absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full text-white ring-4 ring-background",
                        activeTrail.status === "Approved" || activeTrail.status === "Assigned"
                          ? "bg-emerald-600"
                          : activeTrail.status === "Rejected"
                            ? "bg-red-600"
                            : "bg-amber-500",
                      )}
                    >
                      {activeTrail.status === "Rejected" ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
                    </span>
                    <Card className="p-4">
                      <div className="flex items-center justify-between">
                        <h5 className="font-semibold text-foreground text-sm">2. Upstream Review & Approval</h5>
                        <span className="text-xs text-muted-foreground">{activeTrail.decidedAt ? formatDateTime(activeTrail.decidedAt) : "Pending"}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Decision by <strong>{activeTrail.sourceSiteName}</strong> ({activeTrail.sourceTier}):{" "}
                        <strong
                          className={cn(
                            activeTrail.status === "Rejected"
                              ? "text-red-700"
                              : activeTrail.status === "Pending"
                                ? "text-amber-700"
                                : "text-emerald-700",
                          )}
                        >
                          {activeTrail.status === "Assigned" ? "Approved & Assigned" : activeTrail.status}
                        </strong>
                        {activeTrail.decidedBy && ` by ${activeTrail.decidedBy}`}
                      </p>
                      {activeTrail.decisionComment && (
                        <div className="mt-2 rounded-md bg-muted p-2 text-xs italic text-foreground">
                          "{activeTrail.decisionComment}"
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Step 3: Warehouse Dispatch */}
                  {activeTrail.assignment && (
                    <div className="relative">
                      <span className="absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full bg-sky-600 text-white ring-4 ring-background">
                        <Truck className="size-3" />
                      </span>
                      <Card className="p-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold text-foreground text-sm">3. Supply Chain Stock Release</h5>
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(activeTrail.assignment.dispatchedAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Stock deducted from <strong className="text-foreground">{activeTrail.sourceSiteName}</strong> and dispatched to{" "}
                          <strong className="text-foreground">{activeTrail.assignment.assigneeName}</strong> at {activeTrail.destinationSiteName}
                        </p>
                        <div className="mt-2 text-xs font-semibold text-sky-700">
                          Dispatch Manifest: {activeTrail.assignment.code}
                        </div>
                        <div className="mt-3">
                          <div className="text-xs font-medium text-foreground">Released Inventory:</div>
                          <ul className="mt-1 space-y-1 text-xs">
                            {activeTrail.assignment.lines.map((l) => (
                              <li key={l.itemId} className="flex items-center justify-between rounded-md bg-sky-50/50 px-2.5 py-1.5 text-sky-900 border border-sky-100">
                                <span>{l.itemName}</span>
                                <span className="font-semibold">{l.qty} {l.unit}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </Card>
                    </div>
                  )}

                  {/* Step 4: Field Consumption */}
                  {activeTrail.consumption.length > 0 && (
                    <div className="relative">
                      <span className="absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full bg-purple-600 text-white ring-4 ring-background">
                        <MapPin className="size-3" />
                      </span>
                      <Card className="p-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold text-foreground text-sm">4. Field Installation & Execution</h5>
                          <span className="text-xs font-semibold text-purple-700">
                            {activeTrail.totalConsumed} Units Logged
                          </span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {activeTrail.consumption.map((c) => (
                            <div key={c.id} className="rounded-md border bg-muted/30 p-2.5 text-xs">
                              <div className="flex items-center justify-between font-medium text-foreground">
                                <span>{c.itemName} — {c.qty} units</span>
                                <span className="text-muted-foreground">{formatDate(c.date)}</span>
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                                <MapPin className="size-3" />
                                <span>Location: <strong className="text-foreground">{c.location}</strong></span>
                              </div>
                              <div className="mt-0.5 text-muted-foreground">
                                Handled by {c.recordedBy}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </div>
                  )}

                  {/* Step 5: Returns */}
                  {activeTrail.returns.length > 0 && (
                    <div className="relative">
                      <span className="absolute -left-6 top-1 flex size-5 items-center justify-center rounded-full bg-teal-600 text-white ring-4 ring-background">
                        <RotateCcw className="size-3" />
                      </span>
                      <Card className="p-4">
                        <div className="flex items-center justify-between">
                          <h5 className="font-semibold text-foreground text-sm">5. Upstream Restock & Returns</h5>
                          <span className="text-xs font-semibold text-teal-700">
                            {activeTrail.totalReturned} Units Restocked
                          </span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {activeTrail.returns.map((r) => (
                            <div key={r.id} className="rounded-md border border-teal-100 bg-teal-50/50 p-2.5 text-xs text-teal-900">
                              <div className="flex items-center justify-between font-medium">
                                <span>{r.itemName} — {r.qty} returned</span>
                                <span className="text-teal-700">{formatDate(r.date)}</span>
                              </div>
                              <div className="mt-1 text-teal-800">
                                Condition: <strong>{r.condition}</strong> • Restocked to upstream facility
                              </div>
                              <div className="mt-0.5 text-teal-700">Processed by {r.returnedBy}</div>
                            </div>
                          ))}
                        </div>
                      </Card>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
