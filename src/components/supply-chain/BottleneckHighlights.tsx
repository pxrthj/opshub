import { useMemo, useState } from "react"
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  ExternalLink,
  Hourglass,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { GoodsMovementTrail, SupplyChainBottleneck, SupplyChainSiteMetrics } from "@/lib/types"
import { formatDate } from "@/lib/utils"

interface BottleneckHighlightsProps {
  bottlenecks: SupplyChainBottleneck[]
  siteMetrics: SupplyChainSiteMetrics[]
  trails: GoodsMovementTrail[]
  onSelectRequest?: (trail: GoodsMovementTrail) => void
  onFilterSite?: (siteId: string) => void
}

export function BottleneckHighlights({
  bottlenecks,
  siteMetrics,
  trails,
  onSelectRequest,
  onFilterSite,
}: BottleneckHighlightsProps) {
  // Configurable threshold (default 3 days)
  const [thresholdDays, setThresholdDays] = useState<number>(3)

  const now = Date.now()
  const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000

  // Dynamically calculate stuck requests based on the selected threshold
  const stuckRequests = useMemo(() => {
    return trails
      .filter((t) => t.status === "Pending")
      .map((t) => {
        const waitMs = now - new Date(t.requestedAt).getTime()
        const waitDays = Math.round((waitMs / (1000 * 60 * 60 * 24)) * 10) / 10
        return {
          trail: t,
          waitDays,
          isStuck: waitMs > thresholdMs,
        }
      })
      .filter((item) => item.isStuck)
      .sort((a, b) => b.waitDays - a.waitDays)
  }, [trails, thresholdMs, now])

  // Office with longest wait
  const highestWaitSite = useMemo(() => {
    return [...bottlenecks].sort((a, b) => b.avgWaitHours - a.avgWaitHours)[0]
  }, [bottlenecks])

  // Overall oldest request
  const oldestRequest = useMemo(() => {
    const pending = trails.filter((t) => t.status === "Pending")
    if (pending.length === 0) return null
    const sorted = [...pending].sort(
      (a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime()
    )
    const req = sorted[0]
    const waitDays = Math.round(((now - new Date(req.requestedAt).getTime()) / (1000 * 60 * 60 * 24)) * 10) / 10
    return { req, waitDays }
  }, [trails, now])

  return (
    <div className="space-y-6">
      {/* Configuration & Overview Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <SlidersHorizontal className="size-4 text-primary" /> Bottleneck Configuration & Alert Thresholds
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Identify where requests linger in queues and exceed operational turnaround limits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Stuck Threshold:</span>
            <Select
              value={String(thresholdDays)}
              onValueChange={(val) => setThresholdDays(Number(val))}
            >
              <SelectTrigger className="w-36 h-9 text-xs">
                <SelectValue placeholder="Threshold" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Day (Strict)</SelectItem>
                <SelectItem value="2">2 Days</SelectItem>
                <SelectItem value="3">3 Days (Default)</SelectItem>
                <SelectItem value="5">5 Days</SelectItem>
                <SelectItem value="7">7 Days (Relaxed)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Top Bottleneck Stat Highlights */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Longest Average Wait Office */}
        <Card className="border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
          <div className="flex items-center justify-between text-xs text-amber-700 dark:text-amber-400">
            <span className="font-medium">Longest Average Wait</span>
            <Clock className="size-4" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {highestWaitSite?.siteName ?? "All Normal"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {highestWaitSite ? `${highestWaitSite.avgWaitHours} hrs average wait` : "No pending backlog"}
          </div>
        </Card>

        {/* Card 2: Stuck Requests beyond threshold */}
        <Card
          className={`p-4 ${
            stuckRequests.length > 0
              ? "border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20"
              : "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/60 dark:bg-emerald-950/20"
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span
              className={`font-medium ${
                stuckRequests.length > 0 ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              Stuck Requests (&gt;{thresholdDays}d)
            </span>
            <AlertTriangle
              className={`size-4 ${
                stuckRequests.length > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"
              }`}
            />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {stuckRequests.length}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {stuckRequests.length > 0 ? "Exceeding turnaround threshold" : "All queues moving on schedule"}
          </div>
        </Card>

        {/* Card 3: Oldest Open Request */}
        <Card className="p-4 border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/60 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-400">
            <span className="font-medium">Oldest Open Request</span>
            <Hourglass className="size-4" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {oldestRequest ? oldestRequest.req.code : "None"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {oldestRequest ? `Waiting ${oldestRequest.waitDays} days at ${oldestRequest.req.siteName}` : "Zero backlog"}
          </div>
        </Card>

        {/* Card 4: Network Decision Turnaround */}
        <Card className="p-4 border-sky-200 bg-sky-50/40 dark:border-sky-900/60 dark:bg-sky-950/20">
          <div className="flex items-center justify-between text-xs text-sky-700 dark:text-sky-400">
            <span className="font-medium">Fastest Resolving Office</span>
            <TrendingUp className="size-4" />
          </div>
          <div className="mt-2 text-xl font-bold text-foreground">
            {siteMetrics.length > 0 ? [...siteMetrics].sort((a, b) => a.avgTurnaroundHours - b.avgTurnaroundHours)[0]?.siteName : "—"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {siteMetrics.length > 0 ? `${[...siteMetrics].sort((a, b) => a.avgTurnaroundHours - b.avgTurnaroundHours)[0]?.avgTurnaroundHours}h avg response` : ""}
          </div>
        </Card>
      </div>

      {/* Office Bottleneck Metrics Table */}
      <Card className="overflow-hidden">
        <CardHeader className="p-4 pb-2 border-b">
          <CardTitle className="text-sm font-semibold">Office Queue Latency & Aging Breakdown</CardTitle>
          <CardDescription className="text-xs">
            Average wait time and aged requests per office stage.
          </CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Office</TableHead>
              <TableHead>Primary Bottleneck Stage</TableHead>
              <TableHead>Avg Wait Time</TableHead>
              <TableHead>Stuck Requests (&gt;{thresholdDays}d)</TableHead>
              <TableHead>Oldest Open Request</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bottlenecks.map((b) => {
              const siteStuckCount = stuckRequests.filter((r) => r.trail.siteId === b.siteId).length
              return (
                <TableRow key={b.siteId}>
                  <TableCell className="font-medium">
                    <div>{b.siteName}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs bg-muted/40">
                      {b.stage}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`font-semibold ${b.avgWaitHours > 24 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                      {b.avgWaitHours} hrs
                    </span>
                  </TableCell>
                  <TableCell>
                    {siteStuckCount > 0 ? (
                      <span className="inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-400">
                        <AlertTriangle className="size-3.5" /> {siteStuckCount} stuck
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">0 stuck</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {b.oldestOpenRequest ? (
                      <div
                        onClick={() => {
                          const matched = trails.find((t) => t.id === b.oldestOpenRequest?.id)
                          if (matched) onSelectRequest?.(matched)
                        }}
                        className="cursor-pointer font-medium text-primary hover:underline flex items-center gap-1 text-xs"
                      >
                        {b.oldestOpenRequest.code} ({b.oldestOpenRequest.waitDays}d)
                        <ExternalLink className="size-3" />
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onFilterSite?.(b.siteId)}
                      className="text-xs h-8"
                    >
                      Filter site
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Stuck Requests List beyond threshold */}
      {stuckRequests.length > 0 && (
        <Card className="overflow-hidden border-red-200/70 dark:border-red-900/50">
          <CardHeader className="bg-red-50/30 dark:bg-red-950/10 p-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 text-red-600 dark:text-red-400" />
                <CardTitle className="text-sm font-semibold text-red-900 dark:text-red-300">
                  Critical Delayed Requests ({stuckRequests.length})
                </CardTitle>
              </div>
              <span className="text-xs text-muted-foreground">
                Exceeded {thresholdDays} day delay threshold
              </span>
            </div>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Office</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Requested Date</TableHead>
                <TableHead>Aging</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Inspect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stuckRequests.map(({ trail, waitDays }) => (
                <TableRow
                  key={trail.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => onSelectRequest?.(trail)}
                >
                  <TableCell className="font-semibold text-primary">{trail.code}</TableCell>
                  <TableCell>{trail.siteName}</TableCell>
                  <TableCell>{trail.requestedByName}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{formatDate(trail.requestedAt)}</TableCell>
                  <TableCell>
                    <Badge variant="destructive" className="font-mono text-xs">
                      {waitDays} days overdue
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {trail.items.map((i) => `${i.qty} ${i.unit} ${i.itemName}`).join(", ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      View Timeline
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
