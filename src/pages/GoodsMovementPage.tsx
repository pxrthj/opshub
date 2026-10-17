import { useEffect, useMemo, useState } from "react"
import { Download, Package, Search, Truck, Wrench } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { StatCard } from "@/components/StatCard"
import { StatusBadge } from "@/components/StatusBadge"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { exportWorkbook } from "@/lib/excel"
import type { ExportDataset, GoodsMovementStats, GoodsMovementTrail, MovementStage } from "@/lib/types"
import { formatDate, formatDateTime } from "@/lib/utils"

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
  { value: "all", label: "Everything" },
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
  return t.type === "material" ? t.items.map((i) => `${i.qty} ${i.unit} ${i.itemName}`).join(", ") : `${t.repair?.meterId} (${t.repair?.meterType})`
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
  const [search, setSearch] = useState("")
  const [office, setOffice] = useState("all")
  const [stage, setStage] = useState("all")
  const [active, setActive] = useState<GoodsMovementTrail | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.raw
      .get<{ trails: GoodsMovementTrail[]; stats: GoodsMovementStats }>("/api/hub/goods-movement")
      .then((res) => {
        if (cancelled) return
        setTrails(res.trails)
        setStats(res.stats)
      })
      .catch(() => toast.error("We couldn't load the stock trail. Please try again."))
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
      if (stage !== "all" && t.stage !== stage) return false
      if (!q) return true
      return [t.code, t.requestedByName, t.purpose, t.siteName, itemsText(t), t.assignment?.code ?? ""].some((v) => v.toLowerCase().includes(q))
    })
  }, [trails, search, office, stage])

  const filtersOn = search !== "" || office !== "all" || stage !== "all"
  const clearFilters = () => {
    setSearch("")
    setOffice("all")
    setStage("all")
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const ds: ExportDataset = {
        id: "stock_trail",
        label: "Stock trail",
        columns: [
          { header: "Request", key: "code", width: 16 },
          { header: "Office", key: "office", width: 22 },
          { header: "Asked by", key: "requester", width: 18 },
          { header: "Date", key: "date", width: 20 },
          { header: "What", key: "items", width: 40 },
          { header: "Where it stands", key: "stage", width: 24 },
          { header: "Decided by", key: "decidedBy", width: 18 },
          { header: "Used", key: "used", width: 10 },
          { header: "Given back", key: "back", width: 12 },
        ],
        rows: filtered.map((t) => ({
          code: t.code,
          office: t.siteName,
          requester: t.requestedByName,
          date: formatDateTime(t.requestedAt),
          items: itemsText(t),
          stage: STAGE_LABEL[t.stage],
          decidedBy: t.decidedBy || "—",
          used: t.totalConsumed,
          back: t.totalReturned,
        })),
      }
      await exportWorkbook([ds], {
        filename: `Stock_trail_${new Date().toISOString().slice(0, 10)}.xlsx`,
        siteName: "All offices",
        author: user?.name || "Admin",
        color: "#171717",
      })
      toast.success("Excel file downloaded")
    } catch {
      toast.error("We couldn't create the Excel file. Please try again.")
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock trail"
        description="Follow every request from the moment it was asked to the moment the stock was used or given back."
        icon={<Truck />}
        actions={
          <Button onClick={handleExport} disabled={exporting || filtered.length === 0}>
            <Download /> {exporting ? "Preparing…" : "Download to Excel"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requests" value={stats.totalTracked} icon={Package} />
        <StatCard label="Waiting for a decision" value={stats.pendingApprovals} icon={Package} tone="warning" />
        <StatCard label="Given out" value={stats.totalUnitsDispatched.toLocaleString()} hint="items" icon={Truck} />
        <StatCard label="Used or given back" value={(stats.totalUnitsConsumed + stats.totalUnitsReturned).toLocaleString()} hint="items" icon={Package} tone="success" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, item or request number" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={office} onValueChange={setOffice}>
          <SelectTrigger className="w-full sm:w-48">
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
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder="Everything" />
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
          title="Nothing found"
          description="Try a different search or filter."
          action={
            filtersOn && (
              <Button variant="outline" onClick={clearFilters}>
                Clear search
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
                <TableHead>Office</TableHead>
                <TableHead>Asked by</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Where it stands</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => setActive(t)}>
                  <TableCell>
                    <p className="font-medium">{t.code}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.requestedAt)}</p>
                  </TableCell>
                  <TableCell>{t.siteName}</TableCell>
                  <TableCell>{t.requestedByName}</TableCell>
                  <TableCell className="max-w-64 whitespace-normal">
                    {t.type === "repair" && <Wrench className="mr-1 inline size-3.5 text-muted-foreground" />}
                    {itemsText(t)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{STAGE_LABEL[t.stage]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

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
                      {active.forwardedBy ?? `A manager at ${active.siteName}`} ({active.siteName}) passed it to the manager of {active.sourceSiteName}.
                    </p>
                    {active.forwardNote && <p>“{active.forwardNote}”</p>}
                  </Step>
                )}
                <Step title={active.status === "Rejected" ? "Turned down" : active.status === "Pending" ? "Waiting for a decision" : "Approved"} when={active.decidedAt ? formatDateTime(active.decidedAt) : undefined}>
                  {active.decidedBy ? <p>Decided by {active.decidedBy}.</p> : <p>No one has decided yet.</p>}
                  {active.decisionComment && <p>“{active.decisionComment}”</p>}
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
