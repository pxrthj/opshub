import { useMemo, useState } from "react"
import {
  ArrowDownUp,
  CalendarDays,
  Filter,
  History,
  PackageMinus,
  PackagePlus,
  Search,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import type { AuditChangeType, ProductAuditRecord } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"

// ── helpers ───────────────────────────────────────────────────────────────────

const ALL = "__all__"

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const CHANGE_META: Record<
  AuditChangeType,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  create: {
    label: "Created",
    icon: <PackagePlus className="h-3.5 w-3.5" />,
    color: "text-emerald-600",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  delete: {
    label: "Deleted",
    icon: <Trash2 className="h-3.5 w-3.5" />,
    color: "text-red-500",
    bg: "bg-red-50 text-red-700 border-red-200",
  },
  quantity: {
    label: "Qty change",
    icon: <ArrowDownUp className="h-3.5 w-3.5" />,
    color: "text-sky-600",
    bg: "bg-sky-50 text-sky-700 border-sky-200",
  },
  price: {
    label: "Price change",
    icon: <Tag className="h-3.5 w-3.5" />,
    color: "text-violet-600",
    bg: "bg-violet-50 text-violet-700 border-violet-200",
  },
  threshold: {
    label: "Reorder level",
    icon: <Filter className="h-3.5 w-3.5" />,
    color: "text-amber-600",
    bg: "bg-amber-50 text-amber-700 border-amber-200",
  },
  dispatch: {
    label: "Dispatched",
    icon: <PackageMinus className="h-3.5 w-3.5" />,
    color: "text-orange-600",
    bg: "bg-orange-50 text-orange-700 border-orange-200",
  },
  return: {
    label: "Returned",
    icon: <PackagePlus className="h-3.5 w-3.5" />,
    color: "text-teal-600",
    bg: "bg-teal-50 text-teal-700 border-teal-200",
  },
}

function DeltaBadge({ diff, unit }: { diff?: string; unit: string }) {
  if (!diff) return null
  const pos = diff.startsWith("+")
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold ${
        pos ? "text-emerald-600" : "text-red-500"
      }`}
    >
      {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {diff} {unit}
    </span>
  )
}

function ChangeTypeBadge({ type }: { type: AuditChangeType }) {
  const meta = CHANGE_META[type]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${meta.bg}`}
    >
      {meta.icon}
      {meta.label}
    </span>
  )
}

// ── main component ────────────────────────────────────────────────────────────

interface AuditResponse {
  audits: ProductAuditRecord[]
}

export function AuditLogPage() {
  const { siteApi, changeTick } = useSite()

  const [search, setSearch] = useState("")
  const [changeType, setChangeType] = useState<string>(ALL)
  const [category, setCategory] = useState<string>(ALL)
  const [actor, setActor] = useState<string>(ALL)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const { data, loading } = useAsync(
    () => siteApi.get<AuditResponse>("audit-log"),
    [changeTick],
  )

  const allAudits = data?.audits ?? []

  const categories = useMemo(
    () => [...new Set(allAudits.map((a) => a.category))].sort(),
    [allAudits],
  )
  const actors = useMemo(
    () =>
      [...new Map(allAudits.map((a) => [a.actorId, a.actorName])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [allAudits],
  )

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allAudits.filter(
      (a) =>
        (changeType === ALL || a.changeType === changeType) &&
        (category === ALL || a.category === category) &&
        (actor === ALL || a.actorId === actor) &&
        (!term ||
          a.itemName.toLowerCase().includes(term) ||
          a.actorName.toLowerCase().includes(term) ||
          (a.reason ?? "").toLowerCase().includes(term) ||
          (a.refCode ?? "").toLowerCase().includes(term)) &&
        (!dateFrom || a.timestamp >= dateFrom) &&
        (!dateTo || a.timestamp <= dateTo + "T23:59:59Z"),
    )
  }, [allAudits, search, changeType, category, actor, dateFrom, dateTo])

  const hasFilters =
    !!search || changeType !== ALL || category !== ALL || actor !== ALL || !!dateFrom || !!dateTo

  function clearFilters() {
    setSearch("")
    setChangeType(ALL)
    setCategory(ALL)
    setActor(ALL)
    setDateFrom("")
    setDateTo("")
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<History className="h-5 w-5" />}
        title="Product Audit Log"
        description="Every change to inventory — quantities, prices, thresholds, additions and removals."
      />

      {/* Filter bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="audit-search"
              className="pl-9"
              placeholder="Item name, actor, reason…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-w-[150px]">
            <Select value={changeType} onValueChange={setChangeType}>
              <SelectTrigger id="audit-filter-type">
                <SelectValue placeholder="Change type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All change types</SelectItem>
                {(Object.keys(CHANGE_META) as AuditChangeType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CHANGE_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {categories.length > 0 && (
            <div className="min-w-[150px]">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="audit-filter-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {actors.length > 0 && (
            <div className="min-w-[150px]">
              <Select value={actor} onValueChange={setActor}>
                <SelectTrigger id="audit-filter-actor">
                  <SelectValue placeholder="Changed by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All users</SelectItem>
                  {actors.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              id="audit-date-from"
              type="date"
              className="w-36 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From date"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              id="audit-date-to"
              type="date"
              className="w-36 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To date"
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : `${rows.length} record${rows.length !== 1 ? "s" : ""}`}
          {hasFilters && !loading && ` (filtered from ${allAudits.length})`}
        </p>
      </Card>

      {/* Table */}
      {loading ? (
        <TableSkeleton cols={8} rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No audit records yet"
          description={
            hasFilters
              ? "No changes match your current filters. Try adjusting or clearing them."
              : "Changes to inventory items will be logged here automatically."
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Before → After</TableHead>
                <TableHead>Delta</TableHead>
                <TableHead>Changed by</TableHead>
                <TableHead>Reason / Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((audit) => {
                const meta = CHANGE_META[audit.changeType]
                return (
                  <TableRow
                    key={audit.id}
                    className="group hover:bg-muted/40 transition-colors"
                  >
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(audit.timestamp)}
                    </TableCell>

                    <TableCell
                      className="max-w-[180px] truncate font-medium"
                      title={audit.itemName}
                    >
                      {audit.itemName}
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">
                        {audit.category}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <ChangeTypeBadge type={audit.changeType} />
                    </TableCell>

                    <TableCell className="text-sm">
                      {audit.oldValue != null || audit.newValue != null ? (
                        <span className="flex items-center gap-1 text-muted-foreground">
                          {audit.oldValue != null ? (
                            <span className="line-through">{audit.oldValue}</span>
                          ) : (
                            <span className="opacity-40">—</span>
                          )}
                          <span className="text-xs">→</span>
                          {audit.newValue != null ? (
                            <span className={`font-semibold ${meta.color}`}>
                              {audit.newValue}
                            </span>
                          ) : (
                            <span className="opacity-40">—</span>
                          )}
                          <span className="text-xs text-muted-foreground">{audit.unit}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <DeltaBadge diff={audit.diff} unit={audit.unit} />
                    </TableCell>

                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default text-sm">{audit.actorName}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">
                            {audit.actorRole} · {audit.actorId}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    <TableCell
                      className="max-w-[200px] truncate text-xs text-muted-foreground"
                      title={audit.reason}
                    >
                      {audit.reason || "—"}
                      {audit.refCode && (
                        <span className="ml-1 font-mono text-primary">[{audit.refCode}]</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
