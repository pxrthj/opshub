import { useMemo } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ArrowRight, TrendingUp, Truck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { GoodsMovementTrail, SupplyChainHierarchyEdge } from "@/lib/types"
import { formatDate } from "@/lib/utils"

interface StockMovementChartProps {
  trails: GoodsMovementTrail[]
  edges: SupplyChainHierarchyEdge[]
  onFilterEdge?: (sourceSiteId: string, targetSiteId: string) => void
}

export function StockMovementChart({
  trails,
  edges,
  onFilterEdge,
}: StockMovementChartProps) {
  // Aggregate movement by date
  const timeData = useMemo(() => {
    const datesMap = new Map<string, { date: string; [corridorKey: string]: number | string }>()

    // Sort trails chronologically
    const sorted = [...trails].sort(
      (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime()
    )

    for (const t of sorted) {
      const d = formatDate(t.requestedAt)
      let entry = datesMap.get(d)
      if (!entry) {
        entry = { date: d }
        datesMap.set(d, entry)
      }

      const corridor = t.supplyChainFlow || "Internal / Field"
      const current = (entry[corridor] as number) || 0
      const units = t.assignment ? t.assignment.lines.reduce((acc, l) => acc + l.qty, 0) : t.totalQtyRequested
      entry[corridor] = current + units
    }

    return Array.from(datesMap.values())
  }, [trails])

  // Get distinct corridors
  const corridors = useMemo(() => {
    return Array.from(new Set(trails.map((t) => t.supplyChainFlow || "Internal / Field")))
  }, [trails])

  const corridorColors = ["#3b82f6", "#6366f1", "#10b981", "#f59e0b", "#8b5cf6"]

  return (
    <div className="space-y-6">
      {/* Corridor Volume Summary Badges */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {edges.map((edge) => (
          <Card
            key={edge.id}
            onClick={() => onFilterEdge?.(edge.sourceSiteId, edge.targetSiteId)}
            className="cursor-pointer p-4 transition-all hover:border-primary hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1 font-medium text-foreground">
                <Truck className="size-3.5 text-primary" /> Corridor
              </span>
              <span>{edge.requestsCount} requests</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
              <span className="truncate">{edge.sourceSiteName}</span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{edge.targetSiteName}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Volume Transferred:</span>
              <span className="font-bold text-foreground">{edge.volumeUnits.toLocaleString()} units</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Movement Over Time Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" /> Stock Movement Over Time
          </CardTitle>
          <CardDescription className="text-xs">
            Units transferred and dispatched across corridors day by day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  {corridors.map((c, i) => {
                    const color = corridorColors[i % corridorColors.length]
                    return (
                      <linearGradient key={c} id={`color-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                      </linearGradient>
                    )
                  })}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
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
                {corridors.map((c, i) => {
                  const color = corridorColors[i % corridorColors.length]
                  return (
                    <Area
                      key={c}
                      type="monotone"
                      dataKey={c}
                      stroke={color}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill={`url(#color-${i})`}
                    />
                  )
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
