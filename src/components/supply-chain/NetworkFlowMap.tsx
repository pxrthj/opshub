import { useMemo, useState } from "react"
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Package,
  TrendingUp,
  Truck,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { GoodsMovementTrail, SupplyChainHierarchyEdge, SupplyChainSiteMetrics } from "@/lib/types"

// Custom Node for Offices
interface OfficeNodeData extends Record<string, unknown> {
  metric: SupplyChainSiteMetrics
  isSource: boolean
  onSelect: (metric: SupplyChainSiteMetrics) => void
}

function OfficeNode({ data }: NodeProps<Node<OfficeNodeData>>) {
  const { metric, onSelect } = data
  const hasPending = metric.pendingRequests > 0
  const hasLowStock = metric.lowStockCount > 0

  const tierColors: Record<number, { border: string; bg: string; badge: string }> = {
    1: {
      border: "border-sky-500 hover:border-sky-600 shadow-sky-500/10",
      bg: "bg-gradient-to-b from-sky-50/70 to-card dark:from-sky-950/20",
      badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300",
    },
    2: {
      border: "border-indigo-500 hover:border-indigo-600 shadow-indigo-500/10",
      bg: "bg-gradient-to-b from-indigo-50/70 to-card dark:from-indigo-950/20",
      badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300",
    },
    3: {
      border: "border-emerald-500 hover:border-emerald-600 shadow-emerald-500/10",
      bg: "bg-gradient-to-b from-emerald-50/70 to-card dark:from-emerald-950/20",
      badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300",
    },
  }

  const theme = tierColors[metric.tier] ?? tierColors[2]

  return (
    <div
      onClick={() => onSelect(metric)}
      className={`group relative min-w-[240px] max-w-[270px] cursor-pointer rounded-xl border-2 p-3.5 shadow-md transition-all hover:scale-[1.02] hover:shadow-lg ${theme.border} ${theme.bg}`}
    >
      <Handle type="target" position={Position.Top} className="!size-2.5 !bg-primary" />

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold leading-tight text-foreground">{metric.siteName}</h4>
            <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${theme.badge}`}>
              Tier {metric.tier}: {metric.stockSourceName ? `via ${metric.stockSourceName}` : "Master Store"}
            </span>
          </div>
        </div>

        {hasPending && (
          <span className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
            {metric.pendingRequests}
          </span>
        )}
      </div>

      {/* Metrics Row */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 border-t pt-2.5 text-center text-[11px]">
        <div className="rounded bg-muted/50 p-1">
          <div className="text-muted-foreground">Requests</div>
          <div className="font-semibold text-foreground">{metric.totalRequests}</div>
        </div>
        <div className="rounded bg-muted/50 p-1">
          <div className="text-muted-foreground">Fulfilment</div>
          <div className="font-semibold text-foreground">{metric.fulfilmentRate}%</div>
        </div>
        <div className="rounded bg-muted/50 p-1">
          <div className="text-muted-foreground">Dispatched</div>
          <div className="font-semibold text-foreground">{metric.unitsDispatched}</div>
        </div>
      </div>

      {/* Badges footer */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {hasLowStock && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <AlertTriangle className="mr-0.5 size-2.5 text-amber-600" />
            {metric.lowStockCount} low stock
          </Badge>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground group-hover:text-primary flex items-center gap-0.5">
          View details <ExternalLink className="size-2.5" />
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!size-2.5 !bg-primary" />
    </div>
  )
}

const nodeTypes = {
  office: OfficeNode,
}

interface NetworkFlowMapProps {
  metrics: SupplyChainSiteMetrics[]
  edgesData: SupplyChainHierarchyEdge[]
  trails: GoodsMovementTrail[]
  onFilterSite?: (siteId: string) => void
  onSelectTrail?: (trail: GoodsMovementTrail) => void
}

export function NetworkFlowMap({
  metrics,
  edgesData,
  trails,
  onFilterSite,
  onSelectTrail,
}: NetworkFlowMapProps) {
  const [selectedSite, setSelectedSite] = useState<SupplyChainSiteMetrics | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<SupplyChainHierarchyEdge | null>(null)

  // Layout nodes hierarchically by tier
  const nodes: Node[] = useMemo(() => {
    // Group sites by tier
    const tiers: Record<number, SupplyChainSiteMetrics[]> = {}
    for (const m of metrics) {
      if (!tiers[m.tier]) tiers[m.tier] = []
      tiers[m.tier].push(m)
    }

    const result: Node[] = []
    const tierNumbers = Object.keys(tiers)
      .map(Number)
      .sort((a, b) => a - b)

    tierNumbers.forEach((tierNum, tierIdx) => {
      const sitesAtTier = tiers[tierNum]
      const totalSites = sitesAtTier.length
      const spacingX = 320
      const startX = Math.max(40, (3 - totalSites) * 160 + 40)
      const posY = 50 + tierIdx * 190

      sitesAtTier.forEach((site, siteIdx) => {
        result.push({
          id: site.siteId,
          type: "office",
          position: {
            x: startX + siteIdx * spacingX,
            y: posY,
          },
          data: {
            metric: site,
            isSource: !site.stockSourceSiteId,
            onSelect: (m: SupplyChainSiteMetrics) => {
              setSelectedSite(m)
              setSelectedEdge(null)
            },
          },
        })
      })
    })

    return result
  }, [metrics])

  // Build edges with thickness reflecting volume
  const edges: Edge[] = useMemo(() => {
    const maxVolume = Math.max(1, ...edgesData.map((e) => e.volumeUnits))

    return edgesData.map((e) => {
      // Calculate stroke width proportional to volume (2px to 7px)
      const ratio = e.volumeUnits / maxVolume
      const strokeWidth = Math.max(2, Math.min(7, Math.round(2 + ratio * 5)))

      return {
        id: e.id,
        source: e.sourceSiteId,
        target: e.targetSiteId,
        animated: e.pendingCount > 0,
        type: "smoothstep",
        label: `${e.requestsCount} req (${e.volumeUnits} units)`,
        labelStyle: { fill: "var(--foreground)", fontSize: 11, fontWeight: 500 },
        labelBgStyle: {
          fill: "var(--card)",
          fillOpacity: 0.9,
          rx: 6,
          ry: 6,
          stroke: "var(--border)",
          strokeWidth: 1,
        },
        style: {
          stroke: e.pendingCount > 0 ? "#f59e0b" : "#3b82f6",
          strokeWidth,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: e.pendingCount > 0 ? "#f59e0b" : "#3b82f6",
        },
      }
    })
  }, [edgesData])

  // Get corridor requests for selected edge
  const edgeRequests = useMemo(() => {
    if (!selectedEdge) return []
    return trails.filter(
      (t) => t.sourceSiteId === selectedEdge.sourceSiteId && t.siteId === selectedEdge.targetSiteId
    )
  }, [selectedEdge, trails])

  // Get site requests for selected site
  const siteRequests = useMemo(() => {
    if (!selectedSite) return []
    return trails.filter((t) => t.siteId === selectedSite.siteId)
  }, [selectedSite, trails])

  return (
    <div className="space-y-4">
      {/* Map header info */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-sky-500" /> Tier 1: Master Store
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-indigo-500" /> Tier 2: Lab & Field Service
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> Tier 3: Sub-offices
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-amber-500 animate-pulse" /> Pending Movement
          </span>
        </div>
        <span>Click any office node or corridor edge to view details</span>
      </div>

      {/* Main Flow Canvas and Detail Drawer */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* ReactFlow Canvas */}
        <div className={`relative h-[540px] rounded-xl border bg-card shadow-xs transition-all ${selectedSite || selectedEdge ? "lg:col-span-3" : "lg:col-span-4"}`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={true}
            nodesConnectable={false}
            elementsSelectable={true}
            onEdgeClick={(_, edge) => {
              const matched = edgesData.find((e) => e.id === edge.id)
              if (matched) {
                setSelectedEdge(matched)
                setSelectedSite(null)
              }
            }}
            minZoom={0.5}
            maxZoom={1.5}
          >
            <Background gap={18} size={1} className="opacity-40" />
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap
              nodeColor={(n) => {
                const metric = n.data?.metric as SupplyChainSiteMetrics | undefined
                if (!metric) return "#94a3b8"
                if (metric.tier === 1) return "#0284c7"
                if (metric.tier === 2) return "#6366f1"
                return "#10b981"
              }}
              className="!bottom-2 !left-2 !m-0 !rounded-lg !border !bg-card"
            />
          </ReactFlow>
        </div>

        {/* Selected Node Details Drawer */}
        {selectedSite && (
          <Card className="flex flex-col h-[540px] overflow-hidden lg:col-span-1">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="outline" className="mb-1 text-[10px]">
                    Tier {selectedSite.tier} Office
                  </Badge>
                  <CardTitle className="text-base">{selectedSite.siteName}</CardTitle>
                  <CardDescription className="text-xs">
                    Supplied by: {selectedSite.stockSourceName ?? "Component Stores (Root)"}
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedSite(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex-1 space-y-4 overflow-y-auto p-4 pt-2 text-sm">
              {/* Stat grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Package className="size-3.5 text-primary" /> Total Requests
                  </div>
                  <div className="mt-1 text-base font-semibold">{selectedSite.totalRequests}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3.5 text-amber-500" /> Pending
                  </div>
                  <div className="mt-1 text-base font-semibold text-amber-600">{selectedSite.pendingRequests}</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="size-3.5 text-emerald-500" /> Fulfilment
                  </div>
                  <div className="mt-1 text-base font-semibold text-emerald-600">{selectedSite.fulfilmentRate}%</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="size-3.5 text-sky-500" /> Turnaround
                  </div>
                  <div className="mt-1 text-base font-semibold">{selectedSite.avgTurnaroundHours}h avg</div>
                </div>
              </div>

              {/* Inventory summary */}
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <Boxes className="size-3.5 text-muted-foreground" /> Inventory Status
                  </span>
                  <span>{selectedSite.totalInventoryItems} tracked items</span>
                </div>
                {selectedSite.lowStockCount > 0 ? (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span>{selectedSite.lowStockCount} items below reorder threshold</span>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-muted-foreground">All items currently within safe thresholds.</div>
                )}
              </div>

              {/* Units movement */}
              <div className="rounded-lg border p-3 text-xs space-y-1.5">
                <div className="font-medium text-foreground mb-1">Stock Movement</div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Units Dispatched:</span>
                  <span className="font-semibold text-foreground">{selectedSite.unitsDispatched}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Units Received:</span>
                  <span className="font-semibold text-foreground">{selectedSite.unitsReceived}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Units Consumed:</span>
                  <span className="font-semibold text-foreground">{selectedSite.unitsConsumed}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Units Returned:</span>
                  <span className="font-semibold text-foreground">{selectedSite.unitsReturned}</span>
                </div>
              </div>

              {/* Recent Requests at this site */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">Recent Requests ({siteRequests.length})</span>
                  {onFilterSite && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary"
                      onClick={() => onFilterSite(selectedSite.siteId)}
                    >
                      Filter trail
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {siteRequests.slice(0, 5).map((req) => (
                    <div
                      key={req.id}
                      onClick={() => onSelectTrail?.(req)}
                      className="cursor-pointer rounded border p-2 text-xs transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span>{req.code}</span>
                        <Badge variant="secondary" className="text-[10px] py-0">
                          {req.stage}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        {req.requestedByName} · {req.totalQtyRequested} units
                      </div>
                    </div>
                  ))}
                  {siteRequests.length === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground">No requests logged yet.</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selected Edge Details Drawer */}
        {selectedEdge && (
          <Card className="flex flex-col h-[540px] overflow-hidden lg:col-span-1">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <Badge variant="outline" className="mb-1 text-[10px] bg-primary/10 text-primary">
                    Corridor Flow
                  </Badge>
                  <CardTitle className="text-base flex items-center gap-1.5">
                    {selectedEdge.sourceSiteName}
                    <ArrowRight className="size-4 text-muted-foreground" />
                    {selectedEdge.targetSiteName}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Configured supply chain pipeline
                  </CardDescription>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedEdge(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex-1 space-y-4 overflow-y-auto p-4 pt-2 text-sm">
              {/* Corridor metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Truck className="size-3.5 text-primary" /> Volume Moved
                  </div>
                  <div className="mt-1 text-base font-semibold">{selectedEdge.volumeUnits} units</div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <div className="text-muted-foreground flex items-center gap-1">
                    <Layers className="size-3.5 text-indigo-500" /> Requests
                  </div>
                  <div className="mt-1 text-base font-semibold">{selectedEdge.requestsCount}</div>
                </div>
              </div>

              {selectedEdge.pendingCount > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  <div>
                    <span className="font-semibold">{selectedEdge.pendingCount} pending requests</span> currently awaiting decision or dispatch on this corridor.
                  </div>
                </div>
              )}

              {/* Requests in this corridor */}
              <div className="space-y-2">
                <div className="font-medium text-xs text-foreground">
                  Requests in this corridor ({edgeRequests.length})
                </div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {edgeRequests.map((req) => (
                    <div
                      key={req.id}
                      onClick={() => onSelectTrail?.(req)}
                      className="cursor-pointer rounded border p-2 text-xs transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span>{req.code}</span>
                        <Badge variant="outline" className="text-[10px] py-0">
                          {req.stage}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                        Asked by {req.requestedByName} · {req.totalQtyRequested} units
                      </div>
                    </div>
                  ))}
                  {edgeRequests.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      No active requests between these offices.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
