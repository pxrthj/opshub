import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  Download,
  Eye,
  History,
  Info,
  Network,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  TrendingUp,
} from "lucide-react"
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import { exportWorkbook } from "@/lib/excel"
import { roleAtLeast } from "@/lib/roles"
import type { ExportDataset, StockDashboardData, StockDashboardItemDetail } from "@/lib/types"
import { toastError, useAsync } from "@/lib/useAsync"
import { formatDateTime, formatINR } from "@/lib/utils"

const ALL = "__all__"

const CATEGORY_COLORS: Record<string, string> = {
  Meters: "#3b82f6", // blue
  "Cables & Wires": "#10b981", // emerald
  Transformers: "#8b5cf6", // purple
  "Line Hardware": "#f59e0b", // amber
  Protection: "#ef4444", // red
  Earthing: "#14b8a6", // teal
  Spares: "#ec4899", // pink
}

export function StockDashboardPage() {
  const { config, role, siteApi, basePath, changeTick, notifyChange } = useSite()
  const isAdmin = role === "Admin"
  const isManager = roleAtLeast(role, "Manager")

  const { data, loading, reload } = useAsync(() => siteApi.get<StockDashboardData>("stock/dashboard"), [changeTick])

  // Filters for stock table
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState<"All" | "In Stock" | "Low Stock" | "Out of Stock">("All")

  // Modals state
  const [replenishItem, setReplenishItem] = useState<StockDashboardItemDetail | null>(null)
  const [replenishQty, setReplenishQty] = useState("10")
  const [replenishNote, setReplenishNote] = useState("")
  const [replenishing, setReplenishing] = useState(false)

  const [adjustItem, setAdjustItem] = useState<StockDashboardItemDetail | null>(null)
  const [adjustQty, setAdjustQty] = useState("")
  const [adjustReason, setAdjustReason] = useState("")
  const [adjusting, setAdjusting] = useState(false)

  const categories = useMemo(() => {
    const set = new Set<string>()
    data?.items.forEach((i) => set.add(i.category))
    return Array.from(set)
  }, [data])

  const filteredItems = useMemo(() => {
    if (!data?.items) return []
    const q = search.trim().toLowerCase()
    return data.items.filter((item) => {
      const matchesSearch = !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)
      const matchesCat = selectedCategory === ALL || item.category === selectedCategory
      const matchesStatus = statusFilter === "All" || item.status === statusFilter
      return matchesSearch && matchesCat && matchesStatus
    })
  }, [data, search, selectedCategory, statusFilter])

  // Quick Action: Replenish from Higher Site
  async function submitReplenishment() {
    if (!replenishItem) return
    const qty = Number(replenishQty)
    if (!Number.isInteger(qty) || qty <= 0) {
      toast.error("Please enter a valid positive whole number for quantity")
      return
    }
    setReplenishing(true)
    try {
      await siteApi.post("stock/replenish", {
        itemId: replenishItem.id,
        qty,
        note: replenishNote.trim() || undefined,
      })
      toast.success(`Replenishment request submitted`, {
        description: `Requested ${qty} ${replenishItem.unit} of ${replenishItem.name} from ${data?.higherSite?.name || "higher office"}.`,
      })
      setReplenishItem(null)
      setReplenishNote("")
      reload()
      notifyChange()
    } catch (e) {
      toastError(e, "Could not submit replenishment request")
    } finally {
      setReplenishing(false)
    }
  }

  // Quick Action: Adjust Stock (Manager only)
  async function submitStockAdjustment() {
    if (!adjustItem) return
    const qty = Number(adjustQty)
    if (!Number.isInteger(qty) || qty < 0) {
      toast.error("Please enter a valid positive integer or 0")
      return
    }
    if (!adjustReason.trim()) {
      toast.error("Please provide a reason for stock adjustment (required for audit logging)")
      return
    }
    setAdjusting(true)
    try {
      await siteApi.put(`inventory/${adjustItem.id}`, {
        ...adjustItem,
        qty,
        reason: adjustReason.trim(),
      })
      toast.success(`${adjustItem.name} stock adjusted to ${qty} ${adjustItem.unit}`, {
        description: `Logged in immutable Product Audit Log.`,
      })
      setAdjustItem(null)
      setAdjustReason("")
      reload()
      notifyChange()
    } catch (e) {
      toastError(e, "Could not adjust stock")
    } finally {
      setAdjusting(false)
    }
  }

  // Export to Excel
  async function handleExportExcel() {
    if (!data?.items) return
    const dataset: ExportDataset = {
      id: "stock-ledger",
      label: `${config.name} Stock`,
      columns: [
        { header: "SKU / Code", key: "id", width: 18 },
        { header: "Item Name", key: "name", width: 34 },
        { header: "Category", key: "category", width: 20 },
        { header: "Quantity", key: "qty", width: 14, numFmt: "#,##0" },
        { header: "Unit", key: "unit", width: 12 },
        { header: "Unit Price (₹)", key: "unitPrice", width: 16, numFmt: "₹#,##0" },
        { header: "Valuation (₹)", key: "totalValue", width: 18, numFmt: "₹#,##0" },
        { header: "Reorder Threshold", key: "reorderLevel", width: 18, numFmt: "#,##0" },
        { header: "Stock Health", key: "status", width: 16 },
        { header: "Higher Site Available", key: "higherSiteStock", width: 20 },
      ],
      rows: data.items.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        qty: i.qty,
        unit: i.unit,
        unitPrice: i.unitPrice,
        totalValue: i.totalValue,
        reorderLevel: i.reorderLevel,
        status: i.status,
        higherSiteStock: i.higherSiteStock ?? "N/A (Apex Hub)",
      })),
    }

    try {
      await exportWorkbook([dataset], {
        filename: `${config.slug}-stock-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`,
        siteName: config.name,
        author: role,
        color: "#1e3a8a",
      })
      toast.success("Stock sheet exported to Excel")
    } catch (e) {
      toastError(e, "Could not export to Excel")
    }
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Stock Dashboard" icon={<Boxes />} description="Loading site stock intelligence…" />
        <TableSkeleton rows={6} />
      </div>
    )
  }

  const kpis = data?.kpis
  const outOfStockItems = data?.outOfStockItems ?? []
  const lowStockItems = data?.lowStockItems ?? []
  const categoryBreakdown = data?.categoryBreakdown ?? []
  const higherSite = data?.higherSite
  const recentMovements = data?.recentMovements ?? []

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Stock Dashboard"
        icon={<Boxes />}
        description={
          isAdmin
            ? `Site Admin Oversight — Monitoring physical inventory health, valuation, and replenishment flows for ${config.name}.`
            : `Physical Stock Control — Monitor stock levels, handle out-of-stock items, and request replenishments from higher offices.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`${basePath}/inventory`}>
                <Package className="size-4 mr-1.5" /> View Stock Table
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel}>
              <Download className="size-4 mr-1.5" /> Export Excel
            </Button>
            {isManager && !isAdmin && higherSite && (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  const firstOut = outOfStockItems[0] || lowStockItems[0] || data?.items[0]
                  if (firstOut) {
                    setReplenishItem(firstOut)
                    setReplenishQty(String(Math.max(10, firstOut.reorderLevel * 2)))
                    setReplenishNote(`Urgent stock replenishment requested for ${config.name}`)
                  }
                }}
              >
                <Plus className="size-4 mr-1.5" /> Request Replenishment
              </Button>
            )}
          </div>
        }
      />

      {/* Role & Hierarchy Context Banner */}
      <div className="grid gap-3 md:grid-cols-3">
        {/* Site Hierarchy Card */}
        <Card className="border-l-4 border-l-primary bg-card/60 backdrop-blur-xs">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Network className="size-4 text-primary" /> Office Tier
            </div>
            <CardTitle className="text-base font-bold">{data?.tierLabel || "Utility Site"}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            {higherSite ? (
              <span>
                Supplied by Higher Office:{" "}
                <strong className="text-foreground">{higherSite.name}</strong> ({higherSite.managerName} · {higherSite.managerTitle})
              </span>
            ) : (
              <span>Top-tier Apex Supply Store (supplies distribution network and coordinates vendor procurement)</span>
            )}
          </CardContent>
        </Card>

        {/* Operating Role Banner */}
        <Card className="border-l-4 border-l-emerald-500 bg-card/60 backdrop-blur-xs">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="size-4 text-emerald-600" /> Active Role Mode
            </div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              {isAdmin ? "Site Admin (Oversight Mode)" : "Site Manager (Full Operational Control)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            {isAdmin ? (
              <span>Read-only supervisory mode. Audit log tracking, escalation oversight, and visual reports enabled.</span>
            ) : (
              <span>Full operational permissions. Approve local member requests, adjust physical counts, and trigger replenishment orders.</span>
            )}
          </CardContent>
        </Card>

        {/* Stock Health Quick Status */}
        <Card className="border-l-4 border-l-amber-500 bg-card/60 backdrop-blur-xs">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="size-4 text-amber-500" /> Stock Health Overview
            </div>
            <CardTitle className="text-base font-bold">
              {outOfStockItems.length > 0 ? (
                <span className="text-destructive flex items-center gap-1.5">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex size-2.5 rounded-full bg-red-500"></span>
                  </span>
                  {outOfStockItems.length} Stockout{outOfStockItems.length > 1 ? "s" : ""} Active
                </span>
              ) : lowStockItems.length > 0 ? (
                <span className="text-amber-600">
                  {lowStockItems.length} Low Stock Alert{lowStockItems.length > 1 ? "s" : ""}
                </span>
              ) : (
                <span className="text-emerald-700">All Catalog Items In Stock</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            {outOfStockItems.length > 0
              ? `${outOfStockItems.length} item(s) are completely out of stock and require escalation to higher site manager.`
              : `${kpis?.healthyCount || 0} of ${kpis?.totalItems || 0} items safely above reorder threshold.`}
          </CardContent>
        </Card>
      </div>

      {/* Admin Oversight Notice Alert */}
      {isAdmin && (
        <Alert className="border-primary/20 bg-primary/5">
          <Info className="size-4 text-primary" />
          <AlertTitle className="text-sm font-semibold">Admin Oversight Notice</AlertTitle>
          <AlertDescription className="text-xs text-muted-foreground">
            You are overseeing <strong className="text-foreground">{config.name}</strong>'s individual stock. As Site Admin, your role is to oversee the site and inspect movements, audit trails, and replenishment flow without making operational requests or mutations.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4 transition-all hover:shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Total Valuation</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
              <span className="text-base font-bold">₹</span>
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{formatINR(kpis?.totalValuation || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{kpis?.totalUnits?.toLocaleString("en-IN") || 0} total physical units on hand</p>
        </Card>

        <Card className="p-4 transition-all hover:shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Active SKUs</span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
              <Boxes className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{kpis?.totalItems || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">Across {categoryBreakdown.length} catalog categories</p>
        </Card>

        <Card className="p-4 transition-all hover:shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">In Stock (Healthy)</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-700">{kpis?.healthyCount || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">Stock quantity exceeds reorder level</p>
        </Card>

        <Card className="p-4 transition-all hover:shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Low Stock Alerts</span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
              <AlertTriangle className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-amber-600">{kpis?.lowStockCount || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">At or below minimum reorder point</p>
        </Card>

        <Card className={`p-4 transition-all hover:shadow-sm ${(kpis?.outOfStockCount || 0) > 0 ? "border-red-300 bg-red-50/30 ring-1 ring-red-400/40" : ""}`}>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Stockouts (0 Qty)</span>
            <div className="rounded-lg bg-red-500/10 p-2 text-red-600">
              <AlertOctagon className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-red-600">{kpis?.outOfStockCount || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {(kpis?.outOfStockCount || 0) > 0 ? "Requires escalation to higher site" : "Zero stockouts active"}
          </p>
        </Card>
      </div>

      {/* OUT OF STOCK & ESCALATION CENTER (Crucial User Requirement Feature) */}
      <Card className="border-red-200 shadow-xs">
        <CardHeader className="bg-red-50/40 p-4 pb-3 border-b border-red-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-red-600 text-white">
                <AlertOctagon className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base text-red-900">
                  Stockout & Escalation Center ({outOfStockItems.length} item{outOfStockItems.length !== 1 ? "s" : ""} at 0 quantity)
                </CardTitle>
                <CardDescription className="text-xs text-red-700/80">
                  {higherSite
                    ? `Members cannot receive items that are out of stock locally. Escalate or request replenishment from ${higherSite.name} Manager (${higherSite.managerName}).`
                    : `Central apex store stockouts must be replenished via vendor purchase orders.`}
                </CardDescription>
              </div>
            </div>
            {data?.pendingEscalations && data.pendingEscalations.length > 0 && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                {data.pendingEscalations.length} Escalated Request{data.pendingEscalations.length > 1 ? "s" : ""} Pending
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {outOfStockItems.length === 0 ? (
            <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <span>Great news! There are currently no items out of stock at {config.name}.</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Item Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Local Stock</TableHead>
                  <TableHead className="text-right">Reorder Level</TableHead>
                  <TableHead>Higher Site Stock</TableHead>
                  <TableHead>Escalation Status</TableHead>
                  <TableHead className="text-right pr-4">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outOfStockItems.map((item) => (
                  <TableRow key={item.id} className="bg-red-50/20 hover:bg-red-50/40">
                    <TableCell className="pl-4 font-semibold text-foreground">
                      <div>
                        {item.name}
                        <span className="block text-xs font-normal text-muted-foreground">ID: {item.id}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold text-red-600 tabular-nums">
                      0 <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.reorderLevel} {item.unit}
                    </TableCell>
                    <TableCell>
                      {item.higherSiteStock != null ? (
                        item.higherSiteStock > 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                            <CheckCircle2 className="size-3.5" />
                            {item.higherSiteStock} {item.unit} available in {higherSite?.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                            <AlertTriangle className="size-3.5" /> Also 0 at {higherSite?.name}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">— (Apex Central Store)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.activeEscalationCode ? (
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                          {item.activeEscalationCode} · {item.activeEscalationStatus}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-red-200 bg-red-100 text-red-800">
                          Needs Escalation / Replenishment
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4 whitespace-nowrap">
                      {isManager && !isAdmin && higherSite ? (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 gap-1 text-xs bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => {
                            setReplenishItem(item)
                            setReplenishQty(String(Math.max(10, item.reorderLevel * 2)))
                            setReplenishNote(`Critical stockout: Requesting ${item.name} from ${higherSite.name}`)
                          }}
                        >
                          <Send className="size-3" /> Request from {higherSite.name}
                        </Button>
                      ) : isAdmin ? (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Eye className="size-3" /> Overseeing
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Visual Charts: Category Valuation and Stock Levels vs Reorder Level */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Category Valuation Chart */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base font-semibold">Inventory Valuation by Category</CardTitle>
            <CardDescription className="text-xs">Monetary value distribution of physical stock</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {categoryBreakdown.length === 0 ? (
              <EmptyState icon={Boxes} title="No categories" description="Inventory has no categories" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      dataKey="totalValue"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                    >
                      {categoryBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.category] || "#64748b"} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(val: any) => [formatINR(Number(val) || 0), "Stock Valuation"]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}
                    />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stock Level vs Reorder Level Comparison */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base font-semibold">Stock Quantity vs Reorder Threshold</CardTitle>
            <CardDescription className="text-xs">Comparing on-hand quantity against minimum safety threshold</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {data?.items.length === 0 ? (
              <EmptyState icon={Package} title="No data" description="No inventory items to compare" />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(data?.items ?? []).slice(0, 7)}
                    margin={{ top: 20, right: 20, left: -10, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip
                      formatter={(val: any, name: any) => [
                        Number(val || 0).toLocaleString("en-IN"),
                        name === "qty" ? "On Hand Quantity" : "Reorder Safety Level",
                      ]}
                      contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0" }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    <Bar dataKey="qty" name="On Hand Quantity" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="reorderLevel" name="Reorder Safety Level" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Complete Filterable Site Stock Ledger */}
      <Card>
        <CardHeader className="p-4 pb-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold">Physical Stock Ledger</CardTitle>
              <CardDescription className="text-xs">
                All items physically managed at {config.name}. Members request these items from their manager.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search item or SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <TabsList className="h-8">
                  <TabsTrigger value="All" className="text-xs px-2.5">All</TabsTrigger>
                  <TabsTrigger value="In Stock" className="text-xs px-2.5 text-emerald-700">In Stock</TabsTrigger>
                  <TabsTrigger value="Low Stock" className="text-xs px-2.5 text-amber-600">Low Stock</TabsTrigger>
                  <TabsTrigger value="Out of Stock" className="text-xs px-2.5 text-red-600">Out of Stock</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredItems.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No inventory items match your current filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Item & SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Available Qty</TableHead>
                  <TableHead className="text-right">Safety Level</TableHead>
                  <TableHead className="text-right">Price Each</TableHead>
                  <TableHead className="text-right">Total Valuation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id} className={item.status === "Out of Stock" ? "bg-red-50/20" : item.status === "Low Stock" ? "bg-amber-50/20" : undefined}>
                    <TableCell className="pl-4">
                      <div className="font-medium text-foreground">{item.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{item.id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      <span className={item.status === "Out of Stock" ? "text-red-600" : item.status === "Low Stock" ? "text-amber-600" : "text-foreground"}>
                        {item.qty.toLocaleString("en-IN")}
                      </span>{" "}
                      <span className="text-xs font-normal text-muted-foreground">{item.unit}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground text-xs">
                      {item.reorderLevel} {item.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {formatINR(item.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-xs">
                      {formatINR(item.totalValue)}
                    </TableCell>
                    <TableCell>
                      {item.status === "Out of Stock" ? (
                        <Badge variant="destructive" className="text-xs">
                          Out of Stock
                        </Badge>
                      ) : item.status === "Low Stock" ? (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-xs">
                          Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800 text-xs">
                          In Stock
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4 whitespace-nowrap">
                      {isManager && !isAdmin ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => {
                              setAdjustItem(item)
                              setAdjustQty(String(item.qty))
                              setAdjustReason("")
                            }}
                            title="Adjust quantity"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          {higherSite && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2 text-primary hover:text-primary"
                              onClick={() => {
                                setReplenishItem(item)
                                setReplenishQty(String(Math.max(10, item.reorderLevel * 2)))
                                setReplenishNote(`Stock replenishment for ${item.name}`)
                              }}
                            >
                              Replenish
                            </Button>
                          )}
                        </div>
                      ) : isAdmin ? (
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Eye className="size-3" /> Overseeing
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Stock Movements Ledger */}
      <Card>
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="size-4 text-primary" /> Recent Stock Movements & Audits
          </CardTitle>
          <CardDescription className="text-xs">
            Immutable physical stock audit history for {config.name} (Inflows from higher office, dispatches to members, and manager adjustments)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {recentMovements.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">No recent stock movements recorded.</p>
          ) : (
            <div className="space-y-2 pt-2">
              {recentMovements.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border p-2.5 text-xs transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
                        m.type === "inflow"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : m.type === "outflow"
                            ? "bg-blue-500/10 text-blue-600"
                            : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {m.type === "inflow" ? (
                        <ArrowDownRight className="size-4" />
                      ) : m.type === "outflow" ? (
                        <ArrowUpRight className="size-4" />
                      ) : (
                        <RefreshCw className="size-3.5" />
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{m.title}</p>
                      <p className="text-muted-foreground">{m.description}</p>
                    </div>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <p className="font-medium text-foreground">{m.actorName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatDateTime(m.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Replenish Request Modal (Dialog) */}
      <Dialog open={!!replenishItem} onOpenChange={(o) => !o && !replenishing && setReplenishItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="size-5 text-primary" /> Request Replenishment
            </DialogTitle>
            <DialogDescription>
              Submit an official stock replenishment request to <strong className="text-foreground">{higherSite?.name}</strong> Manager ({higherSite?.managerName}).
            </DialogDescription>
          </DialogHeader>

          {replenishItem && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product:</span>
                  <span className="font-semibold text-foreground">{replenishItem.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Local Stock:</span>
                  <span className={`font-semibold ${replenishItem.qty === 0 ? "text-red-600" : "text-amber-600"}`}>
                    {replenishItem.qty} {replenishItem.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available at {higherSite?.name}:</span>
                  <span className="font-semibold text-emerald-700">
                    {replenishItem.higherSiteStock ?? "N/A"} {replenishItem.unit}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rep-qty">Quantity to Request * ({replenishItem.unit})</Label>
                <Input
                  id="rep-qty"
                  type="number"
                  min="1"
                  value={replenishQty}
                  onChange={(e) => setReplenishQty(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rep-note">Urgency Note / Justification</Label>
                <Input
                  id="rep-note"
                  placeholder="e.g. Critical stockout for incoming customer service requests"
                  value={replenishNote}
                  onChange={(e) => setReplenishNote(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReplenishItem(null)} disabled={replenishing}>
              Cancel
            </Button>
            <Button onClick={submitReplenishment} disabled={replenishing}>
              {replenishing ? "Submitting…" : "Send Replenishment Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Stock Modal (Dialog) */}
      <Dialog open={!!adjustItem} onOpenChange={(o) => !o && !adjusting && setAdjustItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5 text-primary" /> Adjust Physical Stock Count
            </DialogTitle>
            <DialogDescription>
              Direct physical count update. Every adjustment requires a reason and is saved to the immutable Product Audit Log.
            </DialogDescription>
          </DialogHeader>

          {adjustItem && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Item:</span>
                  <span className="font-semibold text-foreground">{adjustItem.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Recorded Count:</span>
                  <span className="font-semibold text-foreground">
                    {adjustItem.qty} {adjustItem.unit}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adj-qty">New Physical Count * ({adjustItem.unit})</Label>
                <Input
                  id="adj-qty"
                  type="number"
                  min="0"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adj-reason">Audit Reason *</Label>
                <Input
                  id="adj-reason"
                  placeholder="e.g. Monthly physical inventory reconciliation count"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={adjusting}>
              Cancel
            </Button>
            <Button onClick={submitStockAdjustment} disabled={adjusting}>
              {adjusting ? "Saving…" : "Save Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
