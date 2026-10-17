import { useMemo, useState } from "react"
import {
  AlertTriangle,
  BarChart3,
  Building2,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { SupplyChainSiteMetrics } from "@/lib/types"

interface SiteComparisonSectionProps {
  siteMetrics: SupplyChainSiteMetrics[]
  onFilterSite?: (siteId: string) => void
}

export function SiteComparisonSection({
  siteMetrics,
  onFilterSite,
}: SiteComparisonSectionProps) {
  const [metricView, setMetricView] = useState<"requests" | "units">("requests")

  // Prepare chart data
  const chartData = useMemo(() => {
    return siteMetrics.map((m) => ({
      name: m.siteName,
      tier: `Tier ${m.tier}`,
      Requests: m.totalRequests,
      Fulfilled: m.approvedRequests,
      Pending: m.pendingRequests,
      "Fulfilment Rate (%)": m.fulfilmentRate,
      "Units Dispatched": m.unitsDispatched,
      "Units Received": m.unitsReceived,
      "Units Consumed": m.unitsConsumed,
    }))
  }, [siteMetrics])

  return (
    <div className="space-y-6">
      {/* Top Bar Chart Card */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" /> Cross-Office Operational Performance
            </CardTitle>
            <CardDescription className="text-xs">
              Comparing request volume, fulfilment rates, and dispatch throughput across network offices.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={metricView === "requests" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setMetricView("requests")}
              className="text-xs h-8"
            >
              Request Volume
            </Button>
            <Button
              variant={metricView === "units" ? "secondary" : "outline"}
              size="sm"
              onClick={() => setMetricView("units")}
              className="text-xs h-8"
            >
              Units Dispatched vs Received
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {metricView === "requests" ? (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Fulfilled" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Units Dispatched" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Units Received" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Units Consumed" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Comprehensive Per-Site Comparison Table */}
      <Card className="overflow-hidden">
        <CardHeader className="p-4 pb-2 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold">Per-Site Comparison Metrics Table</CardTitle>
              <CardDescription className="text-xs">
                Click any site name or metric to drill down to its filtered request list.
              </CardDescription>
            </div>
            <span className="text-xs text-muted-foreground">{siteMetrics.length} network sites</span>
          </div>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Office</TableHead>
              <TableHead>Tier & Upstream Supplier</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Fulfilment</TableHead>
              <TableHead className="text-right">Avg Turnaround</TableHead>
              <TableHead className="text-right">Low Stock</TableHead>
              <TableHead className="text-right">Dispatched</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Consumed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {siteMetrics.map((m) => (
              <TableRow
                key={m.siteId}
                className="hover:bg-muted/40 cursor-pointer transition-colors"
                onClick={() => onFilterSite?.(m.siteId)}
              >
                <TableCell className="font-semibold text-foreground">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="size-4 text-primary" />
                    <span>{m.siteName}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-[10px] py-0">
                      Tier {m.tier}
                    </Badge>
                    <span>{m.stockSourceName ? `← ${m.stockSourceName}` : "Top of Chain"}</span>
                  </div>
                </TableCell>

                <TableCell className="text-right font-medium">
                  <span className="font-semibold text-primary">{m.totalRequests}</span>
                  {m.pendingRequests > 0 && (
                    <span className="ml-1 text-[11px] text-amber-600 dark:text-amber-400">
                      ({m.pendingRequests} pend)
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right">
                  <span
                    className={`font-semibold ${
                      m.fulfilmentRate >= 80
                        ? "text-emerald-600 dark:text-emerald-400"
                        : m.fulfilmentRate >= 50
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {m.fulfilmentRate}%
                  </span>
                </TableCell>

                <TableCell className="text-right text-muted-foreground text-xs font-mono">
                  {m.avgTurnaroundHours}h
                </TableCell>

                <TableCell className="text-right">
                  {m.lowStockCount > 0 ? (
                    <Badge variant="destructive" className="text-[10px] py-0 gap-1 font-mono">
                      <AlertTriangle className="size-3" /> {m.lowStockCount}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">0</span>
                  )}
                </TableCell>

                <TableCell className="text-right font-mono text-xs">{m.unitsDispatched}</TableCell>
                <TableCell className="text-right font-mono text-xs">{m.unitsReceived}</TableCell>
                <TableCell className="text-right font-mono text-xs">{m.unitsConsumed}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
