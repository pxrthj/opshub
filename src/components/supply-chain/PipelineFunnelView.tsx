import { useMemo, useState } from "react"
import {
  ArrowDown,
  Calendar,
  CheckCircle,
  Filter,
  Package,
  RefreshCw,
  Send,
  Truck,
  Users,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { GoodsMovementTrail, SupplyChainSiteMetrics } from "@/lib/types"

interface PipelineFunnelViewProps {
  trails: GoodsMovementTrail[]
  siteMetrics: SupplyChainSiteMetrics[]
  onStageClick?: (stageFilter: string) => void
  onSiteClick?: (siteId: string) => void
}

interface FunnelStage {
  id: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  count: number
  units: number
  percentage: number
  dropOffCount: number
  dropOffRate: number
  color: string
  barBg: string
}

export function PipelineFunnelView({
  trails,
  siteMetrics,
  onStageClick,
  onSiteClick,
}: PipelineFunnelViewProps) {
  const [selectedSite, setSelectedSite] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")

  // Filter trails based on controls
  const filtered = useMemo(() => {
    return trails.filter((t) => {
      if (selectedSite !== "all" && t.siteId !== selectedSite && t.sourceSiteId !== selectedSite) {
        return false
      }
      if (dateFrom && new Date(t.requestedAt) < new Date(dateFrom)) {
        return false
      }
      if (dateTo && new Date(t.requestedAt) > new Date(dateTo + "T23:59:59")) {
        return false
      }
      return true
    })
  }, [trails, selectedSite, dateFrom, dateTo])

  // Compute funnel counts and drop-offs
  const stages: FunnelStage[] = useMemo(() => {
    // 1. Requested: Total in dataset
    const totalRequested = filtered.length
    const totalUnitsReq = filtered.reduce((acc, t) => acc + t.totalQtyRequested, 0)

    // 2. Forwarded Upstream: forwarded or inter-site requests
    const forwardedTrails = filtered.filter(
      (t) => t.forwardedAt || (t.sourceSiteId && t.sourceSiteId !== t.siteId)
    )
    const forwardedCount = forwardedTrails.length
    const forwardedUnits = forwardedTrails.reduce((acc, t) => acc + t.totalQtyRequested, 0)

    // 3. Approved: Not rejected, not currently pending at origin
    const approvedTrails = filtered.filter((t) => t.status === "Approved" || t.status === "Assigned")
    const approvedCount = approvedTrails.length
    const approvedUnits = approvedTrails.reduce((acc, t) => acc + t.totalQtyRequested, 0)

    // 4. Dispatched / Assigned: Has active assignment
    const dispatchedTrails = filtered.filter(
      (t) => !!t.assignment || t.stage === "Approved & Dispatched" || t.stage === "In Field"
    )
    const dispatchedCount = dispatchedTrails.length
    const dispatchedUnits = dispatchedTrails.reduce(
      (acc, t) => acc + (t.assignment ? t.assignment.lines.reduce((s, l) => s + l.qty, 0) : t.totalQtyRequested),
      0
    )

    // 5. Consumed or Returned: Has consumption or return
    const consumedOrReturnedTrails = filtered.filter(
      (t) => t.totalConsumed > 0 || t.totalReturned > 0 || t.stage === "Fully Consumed" || t.stage === "Returned / Restocked"
    )
    const finalCount = consumedOrReturnedTrails.length
    const finalUnits = consumedOrReturnedTrails.reduce((acc, t) => acc + t.totalConsumed + t.totalReturned, 0)

    const baseCount = Math.max(1, totalRequested)

    return [
      {
        id: "requested",
        name: "1. Requested",
        description: "Initial material & repair requests logged across offices",
        icon: Package,
        count: totalRequested,
        units: totalUnitsReq,
        percentage: 100,
        dropOffCount: 0,
        dropOffRate: 0,
        color: "text-sky-600 dark:text-sky-400",
        barBg: "bg-sky-500",
      },
      {
        id: "forwarded",
        name: "2. Forwarded Upstream",
        description: "Routed up the hierarchy to regional/central stores",
        icon: Send,
        count: forwardedCount,
        units: forwardedUnits,
        percentage: Math.round((forwardedCount / baseCount) * 100),
        dropOffCount: Math.max(0, totalRequested - forwardedCount),
        dropOffRate: totalRequested > 0 ? Math.round(((totalRequested - forwardedCount) / totalRequested) * 100) : 0,
        color: "text-indigo-600 dark:text-indigo-400",
        barBg: "bg-indigo-500",
      },
      {
        id: "approved",
        name: "3. Approved",
        description: "Evaluated and authorized by supervising store manager",
        icon: CheckCircle,
        count: approvedCount,
        units: approvedUnits,
        percentage: Math.round((approvedCount / baseCount) * 100),
        dropOffCount: Math.max(0, totalRequested - approvedCount),
        dropOffRate: totalRequested > 0 ? Math.round(((totalRequested - approvedCount) / totalRequested) * 100) : 0,
        color: "text-emerald-600 dark:text-emerald-400",
        barBg: "bg-emerald-500",
      },
      {
        id: "dispatched",
        name: "4. Dispatched / Assigned",
        description: "Stock issued and handed over to field staff / technician",
        icon: Truck,
        count: dispatchedCount,
        units: dispatchedUnits,
        percentage: Math.round((dispatchedCount / baseCount) * 100),
        dropOffCount: Math.max(0, approvedCount - dispatchedCount),
        dropOffRate: approvedCount > 0 ? Math.round(((approvedCount - dispatchedCount) / approvedCount) * 100) : 0,
        color: "text-amber-600 dark:text-amber-400",
        barBg: "bg-amber-500",
      },
      {
        id: "consumed",
        name: "5. Consumed / Returned",
        description: "Recorded as used on site or remaining items restocked",
        icon: Users,
        count: finalCount,
        units: finalUnits,
        percentage: Math.round((finalCount / baseCount) * 100),
        dropOffCount: Math.max(0, dispatchedCount - finalCount),
        dropOffRate: dispatchedCount > 0 ? Math.round(((dispatchedCount - finalCount) / dispatchedCount) * 100) : 0,
        color: "text-teal-600 dark:text-teal-400",
        barBg: "bg-teal-500",
      },
    ]
  }, [filtered])

  const clearFilters = () => {
    setSelectedSite("all")
    setDateFrom("")
    setDateTo("")
  }

  const hasActiveFilters = selectedSite !== "all" || !!dateFrom || !!dateTo

  return (
    <div className="space-y-6">
      {/* Filter Controls Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground">Filter Funnel:</span>
            </div>

            {/* Office Filter */}
            <Select
              value={selectedSite}
              onValueChange={(val) => {
                setSelectedSite(val)
                if (val !== "all") onSiteClick?.(val)
              }}
            >
              <SelectTrigger className="w-48 text-xs h-9">
                <SelectValue placeholder="All Offices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Offices</SelectItem>
                {siteMetrics.map((s) => (
                  <SelectItem key={s.siteId} value={s.siteId}>
                    {s.siteName} (Tier {s.tier})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date Range Filters */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="size-4 text-muted-foreground" />
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36 h-9 text-xs"
                placeholder="From date"
              />
              <span>to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36 h-9 text-xs"
                placeholder="To date"
              />
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-9">
                <RefreshCw className="mr-1 size-3.5" /> Reset
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Analyzing <span className="font-semibold text-foreground">{filtered.length}</span> requests in scope
          </div>
        </div>
      </Card>

      {/* Funnel Pipeline Visualisation */}
      <div className="space-y-3">
        {stages.map((stage, idx) => {
          const Icon = stage.icon
          const isLast = idx === stages.length - 1

          return (
            <div key={stage.id} className="relative">
              <Card
                onClick={() => onStageClick?.(stage.id)}
                className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Left: Stage Title & Description */}
                    <div className="flex items-start gap-3.5 sm:max-w-md">
                      <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted p-2 ${stage.color}`}>
                        <Icon className="size-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {stage.name}
                          </h4>
                          <Badge variant="secondary" className="text-xs font-mono font-normal">
                            {stage.percentage}% of total
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{stage.description}</p>
                      </div>
                    </div>

                    {/* Right: Numbers and Drop-off stats */}
                    <div className="flex flex-wrap items-center gap-6 sm:justify-end">
                      <div className="text-right">
                        <div className="text-xl font-bold tracking-tight text-foreground">
                          {stage.count.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {stage.units.toLocaleString()} units
                        </div>
                      </div>

                      {idx > 0 && (
                        <div className="rounded-md border bg-muted/40 px-2.5 py-1 text-right text-xs">
                          <div className="text-muted-foreground">Stage drop-off</div>
                          <div className="font-medium text-amber-600 dark:text-amber-400">
                            -{stage.dropOffCount} ({stage.dropOffRate}%)
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Visual Funnel Bar */}
                  <div className="mt-3.5">
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${stage.barBg}`}
                        style={{ width: `${Math.max(4, stage.percentage)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Connector between stages */}
              {!isLast && (
                <div className="flex justify-center py-1 text-muted-foreground">
                  <ArrowDown className="size-4 animate-bounce" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
