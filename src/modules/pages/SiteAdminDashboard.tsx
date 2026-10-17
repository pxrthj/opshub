import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Clock,
  Download,
  LayoutDashboard,
  Package,
  PackageCheck,
  RefreshCw,
  Table2,
  TrendingUp,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/PageHeader"
import { StatCard } from "@/components/StatCard"
import { useAuth } from "@/context/AuthContext"
import { useSite } from "@/context/SiteContext"
import { exportWidgetWorkbook, exportWorkbook } from "@/lib/excel"
import type { ExportDataset, SiteAdminDashboardData } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { formatDateTime, formatINR } from "@/lib/utils"

const AXIS = { fontSize: 12, fill: "#64748b" }
const GRID = "#e2e8f0"

// Neutral palette mapping
const COLOR_PRIMARY = "var(--primary)"
const COLOR_MUTED = "var(--muted-foreground)"
const STATUS_COLORS: Record<string, string> = {
  Pending: "#eab308", // amber
  Approved: "#22c55e", // green
  Assigned: "#3b82f6", // blue
  Rejected: "#ef4444", // red
}

type RangeOption = "today" | "7d" | "30d" | "all" | "custom"

interface WidgetCardProps {
  title: string
  description?: string
  onExport: () => void
  tableData?: { head: string[]; rows: (string | number)[][] }
  children: React.ReactNode
}

function WidgetCard({ title, description, onExport, tableData, children }: WidgetCardProps) {
  const [showTable, setShowTable] = useState(false)

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        <div className="flex items-center gap-1">
          {tableData && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowTable(!showTable)}
              title={showTable ? "View chart" : "View data table"}
              aria-label={showTable ? "View chart" : "View data table"}
            >
              {showTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onExport}
            title="Download data to Excel"
            aria-label="Download data to Excel"
          >
            <Download className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-2">
        {showTable && tableData ? (
          <div className="max-h-72 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  {tableData.head.map((h, i) => (
                    <TableHead key={h} className={i ? "text-right text-xs" : "text-xs"}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableData.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tableData.head.length} className="py-6 text-center text-xs text-muted-foreground">
                      No data recorded for this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  tableData.rows.map((row, idx) => (
                    <TableRow key={idx}>
                      {row.map((cell, cIdx) => (
                        <TableCell key={cIdx} className={cIdx ? "text-right text-xs tabular-nums" : "text-xs font-medium"}>
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="h-72">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

export function SiteAdminDashboard() {
  const { config, siteApi, changeTick, basePath } = useSite()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [range, setRange] = useState<RangeOption>("7d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [exportingAll, setExportingAll] = useState(false)

  const has = (m: string) => config.modules.includes(m as never)

  // Fetch admin dashboard data with active filters
  const { data, loading, reload } = useAsync(() => {
    const params: Record<string, string> = { range }
    if (range === "custom") {
      if (customFrom) params.from = customFrom
      if (customTo) params.to = customTo
    }
    return siteApi.get<SiteAdminDashboardData>("dashboard/admin", params)
  }, [changeTick, range, customFrom, customTo])

  // Single widget exports
  const exportKpiSummary = async () => {
    if (!data) return
    const ds: ExportDataset = {
      id: "kpis",
      label: "KPI Overview",
      columns: [
        { header: "Key Metric", key: "metric", width: 36 },
        { header: "Value", key: "value", width: 18 },
        { header: "Context", key: "context", width: 24 },
      ],
      rows: [
        { metric: "Total Stock Items", value: data.kpis.totalStockItems, context: "Unique catalog SKUs" },
        { metric: "Total Units on Hand", value: data.kpis.totalUnitsOnHand.toLocaleString("en-IN"), context: "Physical inventory" },
        { metric: "Total Stock Value", value: formatINR(data.kpis.totalStockValue), context: "Calculated inventory valuation" },
        { metric: "Low Stock Items", value: data.kpis.lowStockCount, context: "Below reorder threshold" },
        { metric: "Waiting Requests for Manager", value: data.kpis.waitingRequestsCount, context: "Needs action" },
        { metric: "Requests Raised in Period", value: data.kpis.periodRequests.total, context: `Selected range: ${range}` },
        { metric: "Requests Approved in Period", value: data.kpis.periodRequests.approved, context: "Approved" },
        { metric: "Requests Dispatched in Period", value: data.kpis.periodRequests.assigned, context: "Materials issued" },
        { metric: "Requests Rejected in Period", value: data.kpis.periodRequests.rejected, context: "Declined" },
        { metric: "Units Issued in Period", value: data.kpis.periodItemsIssued.toLocaleString("en-IN"), context: "Material quantity handed out" },
        { metric: "Boards in Repair", value: data.kpis.openRepairsCount, context: "Active bench repair jobs" },
      ],
    }
    await exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
    toast.success("KPI Summary downloaded")
  }

  const exportRequestsTimeline = async () => {
    if (!data) return
    const ds: ExportDataset = {
      id: "requests_timeline",
      label: "Requests Timeline",
      columns: [
        { header: "Period / Date", key: "label", width: 18 },
        { header: "Total Raised", key: "total", width: 14 },
        { header: "Pending", key: "pending", width: 12 },
        { header: "Approved", key: "approved", width: 12 },
        { header: "Assigned (Issued)", key: "assigned", width: 18 },
        { header: "Rejected", key: "rejected", width: 12 },
      ],
      rows: data.requestsTimeline.map((p) => ({
        label: p.label,
        total: p.total,
        pending: p.pending,
        approved: p.approved,
        assigned: p.assigned,
        rejected: p.rejected,
      })),
    }
    await exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
    toast.success("Requests timeline downloaded")
  }

  const exportStockByCategory = async () => {
    if (!data) return
    const ds: ExportDataset = {
      id: "stock_by_category",
      label: "Stock By Category",
      columns: [
        { header: "Category", key: "category", width: 24 },
        { header: "Unique Items", key: "itemCount", width: 14 },
        { header: "Units in Stock", key: "qty", width: 16 },
        { header: "Stock Value (₹)", key: "value", width: 18, numFmt: "₹#,##0.00" },
        { header: "Reorder Threshold Sum", key: "reorderLevelTotal", width: 22 },
        { header: "Low Stock Items", key: "lowStockCount", width: 16 },
      ],
      rows: data.stockByCategory.map((c) => ({
        category: c.category,
        itemCount: c.itemCount,
        qty: c.qty,
        value: c.value,
        reorderLevelTotal: c.reorderLevelTotal,
        lowStockCount: c.lowStockCount,
      })),
    }
    await exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
    toast.success("Stock by category downloaded")
  }

  const exportTopRequested = async () => {
    if (!data) return
    const ds: ExportDataset = {
      id: "top_requested_items",
      label: "Top Requested Items",
      columns: [
        { header: "Item Name", key: "name", width: 34 },
        { header: "Category", key: "category", width: 18 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Requisition Count", key: "requestCount", width: 18 },
        { header: "Total Units Demanded", key: "totalQty", width: 20 },
      ],
      rows: data.topRequestedItems.map((i) => ({
        name: i.name,
        category: i.category,
        unit: i.unit,
        requestCount: i.requestCount,
        totalQty: i.totalQty,
      })),
    }
    await exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
    toast.success("Top requested items downloaded")
  }

  const exportStatusBreakdown = async () => {
    if (!data) return
    const total = data.statusBreakdown.reduce((s, b) => s + b.value, 0) || 1
    const ds: ExportDataset = {
      id: "status_breakdown",
      label: "Status Breakdown",
      columns: [
        { header: "Status", key: "name", width: 16 },
        { header: "Count", key: "value", width: 12 },
        { header: "Percentage (%)", key: "pct", width: 16 },
      ],
      rows: data.statusBreakdown.map((b) => ({
        name: b.name,
        value: b.value,
        pct: `${Math.round((b.value / total) * 100)}%`,
      })),
    }
    await exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
    toast.success("Status breakdown downloaded")
  }

  const exportNeedsAttention = async () => {
    if (!data) return
    const ds: ExportDataset = {
      id: "needs_attention",
      label: "Needs Attention",
      columns: [
        { header: "Severity", key: "severity", width: 12 },
        { header: "Type", key: "type", width: 16 },
        { header: "Issue Title", key: "title", width: 36 },
        { header: "Details", key: "subtitle", width: 44 },
        { header: "Recommended Action", key: "action", width: 20 },
      ],
      rows: data.needsAttention.map((n) => ({
        severity: n.severity.toUpperCase(),
        type: n.type.replace("_", " ").toUpperCase(),
        title: n.title,
        subtitle: n.subtitle,
        action: n.actionLabel,
      })),
    }
    await exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
    toast.success("Needs attention list downloaded")
  }

  const exportActivityFeed = async () => {
    if (!data) return
    const ds: ExportDataset = {
      id: "activity_log",
      label: "Recent Activity Log",
      columns: [
        { header: "Timestamp", key: "time", width: 20 },
        { header: "Actor", key: "actor", width: 20 },
        { header: "Action Taken", key: "action", width: 28 },
        { header: "Target Entity / Details", key: "target", width: 40 },
        { header: "Event Type", key: "type", width: 16 },
      ],
      rows: data.activityFeed.map((a) => ({
        time: formatDateTime(a.timestamp),
        actor: a.actor,
        action: a.action,
        target: a.target,
        type: a.type.toUpperCase(),
      })),
    }
    await exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
    toast.success("Activity log downloaded")
  }

  // Master Executive Workbook (All datasets combined)
  const exportFullDashboard = async () => {
    if (!data) return
    setExportingAll(true)
    try {
      const stamp = new Date().toISOString().slice(0, 10)

      const kpiSheet: ExportDataset = {
        id: "kpis",
        label: "KPI Overview",
        columns: [
          { header: "Key Metric", key: "metric", width: 36 },
          { header: "Value", key: "value", width: 20 },
          { header: "Context", key: "context", width: 30 },
        ],
        rows: [
          { metric: "Total Stock Items", value: data.kpis.totalStockItems, context: "Unique catalog SKUs" },
          { metric: "Total Units on Hand", value: data.kpis.totalUnitsOnHand.toLocaleString("en-IN"), context: "Physical inventory" },
          { metric: "Total Stock Value", value: formatINR(data.kpis.totalStockValue), context: "Inventory valuation" },
          { metric: "Low Stock Items", value: data.kpis.lowStockCount, context: "Below reorder threshold" },
          { metric: "Waiting Requests for Manager", value: data.kpis.waitingRequestsCount, context: "Needs action" },
          { metric: "Requests Raised in Period", value: data.kpis.periodRequests.total, context: `Range: ${range}` },
          { metric: "Requests Approved", value: data.kpis.periodRequests.approved, context: "Approved" },
          { metric: "Requests Dispatched", value: data.kpis.periodRequests.assigned, context: "Materials issued" },
          { metric: "Requests Rejected", value: data.kpis.periodRequests.rejected, context: "Declined" },
          { metric: "Units Issued in Period", value: data.kpis.periodItemsIssued.toLocaleString("en-IN"), context: "Material quantity handed out" },
          { metric: "Boards in Repair", value: data.kpis.openRepairsCount, context: "Active bench repair jobs" },
          { metric: "Avg Approval Lead Time", value: `${data.leadTimes.avgApprovalHours} hrs`, context: "Request to approval" },
          { metric: "Avg Dispatch Lead Time", value: `${data.leadTimes.avgDispatchHours} hrs`, context: "Approval to issuance" },
        ],
      }

      const timelineSheet: ExportDataset = {
        id: "timeline",
        label: "Requests Trend",
        columns: [
          { header: "Period", key: "label", width: 18 },
          { header: "Total Raised", key: "total", width: 14 },
          { header: "Pending", key: "pending", width: 12 },
          { header: "Approved", key: "approved", width: 12 },
          { header: "Assigned", key: "assigned", width: 14 },
          { header: "Rejected", key: "rejected", width: 12 },
        ],
        rows: data.requestsTimeline.map((p) => ({
          label: p.label,
          total: p.total,
          pending: p.pending,
          approved: p.approved,
          assigned: p.assigned,
          rejected: p.rejected,
        })),
      }

      const categorySheet: ExportDataset = {
        id: "categories",
        label: "Category Inventory",
        columns: [
          { header: "Category", key: "category", width: 24 },
          { header: "Items Count", key: "itemCount", width: 14 },
          { header: "Units on Hand", key: "qty", width: 16 },
          { header: "Total Value (₹)", key: "value", width: 18, numFmt: "₹#,##0.00" },
          { header: "Reorder Total", key: "reorderLevelTotal", width: 18 },
          { header: "Low Stock Items", key: "lowStockCount", width: 16 },
        ],
        rows: data.stockByCategory.map((c) => ({
          category: c.category,
          itemCount: c.itemCount,
          qty: c.qty,
          value: c.value,
          reorderLevelTotal: c.reorderLevelTotal,
          lowStockCount: c.lowStockCount,
        })),
      }

      const topItemsSheet: ExportDataset = {
        id: "top_items",
        label: "Top Demanded Items",
        columns: [
          { header: "Item Name", key: "name", width: 34 },
          { header: "Category", key: "category", width: 20 },
          { header: "Unit", key: "unit", width: 10 },
          { header: "Requisitions", key: "requestCount", width: 16 },
          { header: "Total Units Demanded", key: "totalQty", width: 20 },
        ],
        rows: data.topRequestedItems.map((i) => ({
          name: i.name,
          category: i.category,
          unit: i.unit,
          requestCount: i.requestCount,
          totalQty: i.totalQty,
        })),
      }

      const needsAttentionSheet: ExportDataset = {
        id: "needs_attention",
        label: "Action Items",
        columns: [
          { header: "Severity", key: "severity", width: 12 },
          { header: "Type", key: "type", width: 16 },
          { header: "Item Title", key: "title", width: 34 },
          { header: "Details", key: "subtitle", width: 44 },
          { header: "Action", key: "action", width: 18 },
        ],
        rows: data.needsAttention.map((n) => ({
          severity: n.severity.toUpperCase(),
          type: n.type.replace("_", " ").toUpperCase(),
          title: n.title,
          subtitle: n.subtitle,
          action: n.actionLabel,
        })),
      }

      const activitySheet: ExportDataset = {
        id: "activity_feed",
        label: "Audit Activity",
        columns: [
          { header: "Timestamp", key: "time", width: 20 },
          { header: "Actor", key: "actor", width: 20 },
          { header: "Action", key: "action", width: 28 },
          { header: "Target Entity", key: "target", width: 38 },
          { header: "Module Type", key: "type", width: 16 },
        ],
        rows: data.activityFeed.map((a) => ({
          time: formatDateTime(a.timestamp),
          actor: a.actor,
          action: a.action,
          target: a.target,
          type: a.type.toUpperCase(),
        })),
      }

      await exportWorkbook(
        [kpiSheet, timelineSheet, categorySheet, topItemsSheet, needsAttentionSheet, activitySheet],
        {
          filename: `${config.slug}-executive-dashboard-${stamp}.xlsx`,
          siteName: config.name,
          author: user?.name ?? "Admin",
          color: "#171717",
        },
      )
      toast.success("Executive dashboard workbook downloaded")
    } catch {
      toast.error("Could not export dashboard workbook. Please try again.")
    } finally {
      setExportingAll(false)
    }
  }

  // Precomputed chart data
  const totalRequestsStatusCount = useMemo(() => {
    return data?.statusBreakdown.reduce((sum, b) => sum + b.value, 0) ?? 0
  }, [data])

  return (
    <div className="space-y-6">
      {/* Header & Date Range Filter Bar */}
      <PageHeader
        title={`${config.name} — Admin Dashboard`}
        description="Comprehensive real-time overview of inventory, requisitions, operations, and field logistics."
        icon={<LayoutDashboard />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportKpiSummary}
              disabled={loading || !data}
            >
              <Download /> Export KPIs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportFullDashboard}
              disabled={exportingAll || loading || !data}
            >
              <Download /> {exportingAll ? "Exporting…" : "Export Dashboard"}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={reload} title="Refresh data">
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        }
      />

      {/* Date Range Selector Pill */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Calendar className="size-4" /> Period:
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "today", label: "Today" },
              { id: "7d", label: "Last 7 Days" },
              { id: "30d", label: "Last 30 Days" },
              { id: "all", label: "All Time" },
              { id: "custom", label: "Custom" },
            ] as const
          ).map((btn) => (
            <Button
              key={btn.id}
              variant={range === btn.id ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setRange(btn.id)}
            >
              {btn.label}
            </Button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2 pt-2 sm:pt-0">
            <Input
              type="date"
              className="h-7 w-32 text-xs"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              placeholder="Start"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              className="h-7 w-32 text-xs"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              placeholder="End"
            />
          </div>
        )}
      </div>

      {/* Skeletons on initial load */}
      {loading && !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-80 rounded-lg" />
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          {/* TOP ROW: KPI CARDS */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* 1. Total Stock Items */}
            {has("inventory") && (
              <StatCard
                label="Stock on hand"
                value={data.kpis.totalUnitsOnHand.toLocaleString("en-IN")}
                hint={`${data.kpis.totalStockItems} SKUs · ${formatINR(data.kpis.totalStockValue)}`}
                icon={Package}
                tone="primary"
                onClick={() => navigate(`${basePath}/inventory`)}
              />
            )}

            {/* 2. Low-stock Items */}
            {has("inventory") && (
              <StatCard
                label="Low stock items"
                value={data.kpis.lowStockCount}
                hint={data.kpis.lowStockCount > 0 ? "Requires reordering" : "Inventory healthy"}
                icon={AlertTriangle}
                tone={data.kpis.lowStockCount > 0 ? "danger" : "success"}
                onClick={() => navigate(`${basePath}/inventory`)}
              />
            )}

            {/* 3. Open requests waiting for me */}
            {(has("request") || has("approval")) && (
              <StatCard
                label="Waiting for me"
                value={data.kpis.waitingRequestsCount}
                hint={data.kpis.waitingRequestsCount > 0 ? "Action required" : "All decided"}
                icon={ClipboardList}
                tone={data.kpis.waitingRequestsCount > 0 ? "warning" : "muted"}
                onClick={() => navigate(`${basePath}/approvals`)}
              />
            )}

            {/* 4. Requests in Period */}
            {has("request") && (
              <StatCard
                label={`Requests (${range})`}
                value={data.kpis.periodRequests.total}
                hint={`${data.kpis.periodRequests.approved} approved, ${data.kpis.periodRequests.assigned} issued`}
                icon={TrendingUp}
                tone="primary"
                onClick={() => navigate(`${basePath}/requests`)}
              />
            )}

            {/* 5. Items issued in Period */}
            {has("assignment") && (
              <StatCard
                label={`Items issued (${range})`}
                value={data.kpis.periodItemsIssued.toLocaleString("en-IN")}
                hint="Units handed out to team"
                icon={PackageCheck}
                tone="success"
                onClick={() => navigate(`${basePath}/assignments`)}
              />
            )}

            {/* 6. Boards in repair */}
            {has("pcb-repair") && (
              <StatCard
                label="Boards in repair"
                value={data.kpis.openRepairsCount}
                hint={`${data.repairStages?.find((s) => s.stage === "Fixed")?.count ?? 0} fixed`}
                icon={Wrench}
                tone={data.kpis.openRepairsCount > 0 ? "warning" : "muted"}
                onClick={() => navigate(`${basePath}/repairs`)}
              />
            )}
          </div>

          {/* MIDDLE SECTION: "NEEDS ATTENTION" & "RECENT ACTIVITY" */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Needs Attention Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <CircleAlert className="size-5 text-amber-600" />
                  <div>
                    <CardTitle className="text-base font-semibold">Needs attention</CardTitle>
                    <CardDescription className="text-xs">
                      {data.needsAttention.length === 0
                        ? "Everything is running smoothly."
                        : `${data.needsAttention.length} item(s) require action.`}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={data.needsAttention.length > 0 ? "destructive" : "secondary"}>
                    {data.needsAttention.length}
                  </Badge>
                  <Button variant="ghost" size="icon-sm" onClick={exportNeedsAttention} title="Export to Excel">
                    <Download className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-2">
                {data.needsAttention.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                    <CheckCircle2 className="size-8 text-emerald-600 mb-2" />
                    <p className="text-sm font-medium">No items require immediate attention.</p>
                    <p className="text-xs text-muted-foreground">All pending approvals, stock thresholds, and repair benches are clear.</p>
                  </div>
                ) : (
                  data.needsAttention.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`mt-1 size-2 rounded-full shrink-0 ${
                            item.severity === "urgent" ? "bg-red-500" : "bg-amber-500"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 text-xs"
                        onClick={() => navigate(`${basePath}/${item.actionPath}`)}
                      >
                        {item.actionLabel} <ArrowRight className="size-3 ml-1" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Recent Activity Feed Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="size-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base font-semibold">Recent activity</CardTitle>
                    <CardDescription className="text-xs">Latest 10 logged operations in this office</CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={exportActivityFeed} title="Export to Excel">
                  <Download className="size-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 pt-2">
                {data.activityFeed.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">No recent activity recorded.</p>
                ) : (
                  data.activityFeed.slice(0, 6).map((act) => (
                    <div key={act.id} className="flex items-center justify-between gap-3 py-1.5 border-b last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground truncate">
                          <span className="font-semibold">{act.actor}</span>{" "}
                          <span className="text-muted-foreground">{act.action}</span>{" "}
                          <span className="font-medium">{act.target}</span>
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{act.timeAgo}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* CHARTS GRID */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Chart 1: Requests Over Time */}
            {has("request") && (
              <WidgetCard
                title="Requests over time"
                description={`Grouped velocity · Selected period: ${range}`}
                onExport={exportRequestsTimeline}
                tableData={{
                  head: ["Period", "Pending", "Approved", "Assigned", "Rejected", "Total"],
                  rows: data.requestsTimeline.map((p) => [p.label, p.pending, p.approved, p.assigned, p.rejected, p.total]),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.requestsTimeline} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: "rgba(100,116,139,0.06)" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar isAnimationActive={false} dataKey="pending" name="Pending" stackId="a" fill={STATUS_COLORS.Pending} />
                    <Bar isAnimationActive={false} dataKey="approved" name="Approved" stackId="a" fill={STATUS_COLORS.Approved} />
                    <Bar isAnimationActive={false} dataKey="assigned" name="Assigned" stackId="a" fill={STATUS_COLORS.Assigned} />
                    <Bar isAnimationActive={false} dataKey="rejected" name="Rejected" stackId="a" fill={STATUS_COLORS.Rejected} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </WidgetCard>
            )}

            {/* Chart 2: Stock Levels by Category */}
            {has("inventory") && (
              <WidgetCard
                title="Stock levels by category"
                description="Units on hand vs reorder threshold"
                onExport={exportStockByCategory}
                tableData={{
                  head: ["Category", "Units in Stock", "Value", "Low Items"],
                  rows: data.stockByCategory.map((c) => [c.category, c.qty.toLocaleString("en-IN"), formatINR(c.value), c.lowStockCount]),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.stockByCategory} margin={{ top: 12, right: 12, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis
                      dataKey="category"
                      tick={AXIS}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={45}
                    />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toLocaleString("en-IN")} />
                    <Tooltip
                      formatter={(v, name, item) => [
                        `${Number(v).toLocaleString("en-IN")} units (${formatINR((item.payload as { value: number }).value)})`,
                        name === "qty" ? "On Hand" : "Reorder Level",
                      ]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar isAnimationActive={false} dataKey="qty" name="In Stock" fill={COLOR_PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Bar isAnimationActive={false} dataKey="reorderLevelTotal" name="Reorder Alert Level" fill={COLOR_MUTED} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </WidgetCard>
            )}

            {/* Chart 3: Top 10 Most Requested Items */}
            {has("request") && (
              <WidgetCard
                title="Top 10 most requested items"
                description="Highest requisition volume across all orders"
                onExport={exportTopRequested}
                tableData={{
                  head: ["Item", "Category", "Orders", "Total Qty"],
                  rows: data.topRequestedItems.map((i) => [i.name, i.category, i.requestCount, `${i.totalQty} ${i.unit}`]),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={data.topRequestedItems}
                    margin={{ top: 8, right: 30, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ ...AXIS, width: 140 }}
                      tickLine={false}
                      axisLine={false}
                      width={140}
                    />
                    <Tooltip formatter={(v, _n, item) => [`${Number(v).toLocaleString()} ${(item.payload as { unit: string }).unit}`, "Demanded"]} />
                    <Bar
                      isAnimationActive={false}
                      dataKey="totalQty"
                      name="Units Demanded"
                      fill={COLOR_PRIMARY}
                      radius={[0, 4, 4, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </WidgetCard>
            )}

            {/* Chart 4: Request Status Breakdown */}
            {has("request") && (
              <WidgetCard
                title="Request status distribution"
                description={`Total tracked: ${totalRequestsStatusCount} requisitions`}
                onExport={exportStatusBreakdown}
                tableData={{
                  head: ["Status", "Count", "Percentage"],
                  rows: data.statusBreakdown.map((b) => [
                    b.name,
                    b.value,
                    `${Math.round((b.value / (totalRequestsStatusCount || 1)) * 100)}%`,
                  ]),
                }}
              >
                <div className="flex h-full flex-col sm:flex-row items-center justify-around gap-4">
                  <div className="size-52 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip formatter={(v) => [`${v} requests`, "Count"]} />
                        <Pie
                          isAnimationActive={false}
                          data={data.statusBreakdown}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={3}
                        >
                          {data.statusBreakdown.map((entry) => (
                            <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || COLOR_PRIMARY} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 w-full max-w-xs">
                    {data.statusBreakdown.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: STATUS_COLORS[item.name] || COLOR_PRIMARY }}
                          />
                          <span className="font-medium text-foreground">{item.name}</span>
                        </div>
                        <span className="text-muted-foreground tabular-nums">
                          {item.value} ({Math.round((item.value / (totalRequestsStatusCount || 1)) * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </WidgetCard>
            )}

            {/* Chart 5: Approval and Dispatch Lead Times */}
            {(has("approval") || has("assignment")) && (
              <WidgetCard
                title="Lead times & dispatch velocity"
                description="Average response turnaround time in hours"
                onExport={() => {
                  const ds: ExportDataset = {
                    id: "lead_times",
                    label: "Lead Times",
                    columns: [
                      { header: "Metric", key: "metric", width: 30 },
                      { header: "Average Hours", key: "hours", width: 18 },
                      { header: "Equivalent", key: "equiv", width: 20 },
                    ],
                    rows: [
                      { metric: "Average Approval Time", hours: data.leadTimes.avgApprovalHours, equiv: `${(data.leadTimes.avgApprovalHours / 24).toFixed(1)} days` },
                      { metric: "Average Dispatch Time", hours: data.leadTimes.avgDispatchHours, equiv: `${(data.leadTimes.avgDispatchHours / 24).toFixed(1)} days` },
                    ],
                  }
                  exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
                  toast.success("Lead times downloaded")
                }}
              >
                <div className="grid h-full grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div className="rounded-lg border p-4 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground">Avg. Approval Turnaround</p>
                    <p className="text-3xl font-bold tabular-nums mt-1">{data.leadTimes.avgApprovalHours} hrs</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">From submission to manager decision</p>
                    <div className="h-16 mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.leadTimes.approvalSparkline}>
                          <Line isAnimationActive={false} type="monotone" dataKey="hours" stroke={COLOR_PRIMARY} strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground">Avg. Dispatch Fulfillment</p>
                    <p className="text-3xl font-bold tabular-nums mt-1">{data.leadTimes.avgDispatchHours} hrs</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">From approval to warehouse handoff</p>
                    <div className="h-16 mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.leadTimes.dispatchSparkline}>
                          <Line isAnimationActive={false} type="monotone" dataKey="hours" stroke={COLOR_MUTED} strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </WidgetCard>
            )}

            {/* Chart 6: Repair Pipeline Stages */}
            {has("pcb-repair") && data.repairStages && (
              <WidgetCard
                title="PCB repair pipeline"
                description="Status distribution across technical service benches"
                onExport={() => {
                  const ds: ExportDataset = {
                    id: "repair_stages",
                    label: "Repair Stages",
                    columns: [
                      { header: "Pipeline Stage", key: "stage", width: 20 },
                      { header: "Board Count", key: "count", width: 14 },
                    ],
                    rows: (data.repairStages ?? []).map((s) => ({ stage: s.stage, count: s.count })),
                  }
                  exportWidgetWorkbook(ds, { siteName: config.name, author: user?.name ?? "Admin" })
                  toast.success("Repair pipeline downloaded")
                }}
                tableData={{
                  head: ["Stage", "Count"],
                  rows: data.repairStages.map((s) => [s.stage, s.count]),
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.repairStages} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="stage" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      isAnimationActive={false}
                      dataKey="count"
                      name="Boards"
                      fill={COLOR_PRIMARY}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </WidgetCard>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
