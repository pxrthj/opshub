import { useMemo, useState } from "react"
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Package,
  Search,
  Send,
  Truck,
  User,
  Wrench,
  XCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/StatusBadge"
import type { GoodsMovementTrail } from "@/lib/types"
import { formatDate, formatDateTime } from "@/lib/utils"

interface RequestJourneyTimelineProps {
  trails: GoodsMovementTrail[]
  selectedRequestId?: string
  onSelectRequest?: (trail: GoodsMovementTrail) => void
}

/** Format duration into human readable hours/days */
function fmtDuration(ms: number): string {
  if (ms <= 0) return "instant"
  const hours = Math.round(ms / (1000 * 60 * 60))
  if (hours < 24) return `${hours} hr${hours !== 1 ? "s" : ""}`
  const days = Math.round((hours / 24) * 10) / 10
  return `${days} day${days !== 1 ? "s" : ""}`
}

export function RequestJourneyTimeline({
  trails,
  selectedRequestId,
  onSelectRequest,
}: RequestJourneyTimelineProps) {
  const [search, setSearch] = useState("")
  const [activeId, setActiveId] = useState<string>(selectedRequestId || trails[0]?.id || "")

  // Sync prop changes
  const activeTrail = useMemo(() => {
    return trails.find((t) => t.id === (selectedRequestId || activeId)) || trails[0]
  }, [trails, selectedRequestId, activeId])

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return trails.slice(0, 15)
    return trails.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.requestedByName.toLowerCase().includes(q) ||
        t.siteName.toLowerCase().includes(q) ||
        t.purpose.toLowerCase().includes(q) ||
        t.items.some((i) => i.itemName.toLowerCase().includes(q))
    )
  }, [trails, search])

  // Calculate stage wait times for activeTrail
  const waitTimes = useMemo(() => {
    if (!activeTrail) return { forwardWait: 0, approvalWait: 0, dispatchWait: 0 }
    const reqTime = new Date(activeTrail.requestedAt).getTime()
    const fwdTime = activeTrail.forwardedAt ? new Date(activeTrail.forwardedAt).getTime() : 0
    const decTime = activeTrail.decidedAt ? new Date(activeTrail.decidedAt).getTime() : 0
    const dispTime = activeTrail.assignment?.dispatchedAt ? new Date(activeTrail.assignment.dispatchedAt).getTime() : 0

    const forwardWait = fwdTime ? Math.max(0, fwdTime - reqTime) : 0
    const approvalWait = decTime ? Math.max(0, decTime - (fwdTime || reqTime)) : 0
    const dispatchWait = dispTime && decTime ? Math.max(0, dispTime - decTime) : 0

    return { forwardWait, approvalWait, dispatchWait }
  }, [activeTrail])

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      {/* Left Column: Request Search & Picker */}
      <div className="space-y-3 lg:col-span-4">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search request code, person, item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
          {filteredList.map((t) => {
            const isSelected = activeTrail?.id === t.id
            return (
              <div
                key={t.id}
                onClick={() => {
                  setActiveId(t.id)
                  onSelectRequest?.(t)
                }}
                className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-foreground">{t.code}</span>
                  <StatusBadge status={t.status} />
                </div>
                <div className="mt-1 flex items-center justify-between text-muted-foreground">
                  <span>{t.siteName}</span>
                  <span>{formatDate(t.requestedAt)}</span>
                </div>
                <div className="mt-1 text-muted-foreground truncate">
                  {t.type === "repair" ? (
                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <Wrench className="size-3" /> Repair {t.repair?.meterId}
                    </span>
                  ) : (
                    t.items.map((i) => `${i.qty} ${i.unit} ${i.itemName}`).join(", ")
                  )}
                </div>
              </div>
            )
          })}
          {filteredList.length === 0 && (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No matching requests found.
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Detailed Journey Timeline */}
      <div className="lg:col-span-8">
        {!activeTrail ? (
          <Card className="flex h-72 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Pick a request from the left list to inspect its journey.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{activeTrail.code}</CardTitle>
                    <StatusBadge status={activeTrail.status} />
                    <Badge variant="outline" className="text-xs">
                      {activeTrail.stage}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Purpose: <span className="text-foreground">{activeTrail.purpose}</span> · Office:{" "}
                    <span className="font-medium text-foreground">{activeTrail.siteName}</span>
                  </p>
                </div>

                <div className="text-right text-xs text-muted-foreground">
                  <div>Requested on {formatDateTime(activeTrail.requestedAt)}</div>
                  <div className="mt-0.5 text-foreground font-medium">By {activeTrail.requestedByName}</div>
                </div>
              </div>

              {/* RequestRoute Visual Language Ribbon */}
              <div className="mt-4 pt-3 border-t">
                <div className="text-[11px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                  Hierarchy Route Pathway
                </div>
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs">
                      <span className="block leading-tight font-medium text-xs">{activeTrail.requestedByName}</span>
                      <span className="block text-[10px] text-muted-foreground">Origin: {activeTrail.siteName}</span>
                    </span>
                  </li>

                  {activeTrail.sourceSiteId !== activeTrail.siteId && (
                    <>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                      <li className="flex items-center gap-2">
                        <span className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs">
                          <span className="block leading-tight font-medium text-xs">
                            {activeTrail.forwardedBy ?? "Office Manager"}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">Forwarded upstream</span>
                        </span>
                      </li>
                    </>
                  )}

                  <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  <li className="flex items-center gap-2">
                    <span className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs">
                      <span className="block leading-tight font-medium text-xs">
                        {activeTrail.decidedBy ?? `${activeTrail.sourceSiteName} Manager`}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {activeTrail.status === "Approved" ? "Approved" : activeTrail.status === "Rejected" ? "Rejected" : "Deciding"}
                      </span>
                    </span>
                  </li>

                  {activeTrail.assignment && (
                    <>
                      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                      <li className="flex items-center gap-2">
                        <span className="rounded-lg border bg-card px-3 py-1.5 shadow-2xs">
                          <span className="block leading-tight font-medium text-xs">
                            {activeTrail.assignment.assigneeName}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">Dispatched stock</span>
                        </span>
                      </li>
                    </>
                  )}
                </ol>
              </div>
            </CardHeader>

            <CardContent className="p-6">
              {/* Chronological Step Journey */}
              <div className="relative border-l-2 border-border ml-4 space-y-6 pl-6 text-sm">
                {/* Step 1: Request Created */}
                <div className="relative">
                  <div className="absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full bg-sky-500 text-white shadow-xs">
                    <Package className="size-3.5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground text-sm">1. Request Logged</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="size-3" /> {formatDateTime(activeTrail.requestedAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{activeTrail.requestedByName}</span> created a request for {activeTrail.totalQtyRequested} units at {activeTrail.siteName}.
                    </p>
                    <div className="mt-2 rounded-lg border bg-muted/30 p-2.5 text-xs">
                      {activeTrail.items.map((line, idx) => (
                        <div key={idx} className="flex justify-between py-0.5">
                          <span>{line.itemName}</span>
                          <span className="font-semibold">{line.qty} {line.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Step 2: Forwarded Upstream (if applicable) */}
                {activeTrail.forwardedAt && (
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full bg-indigo-500 text-white shadow-xs">
                      <Send className="size-3.5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">2. Forwarded to Upstream Store</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="size-3" /> {formatDateTime(activeTrail.forwardedAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[11px] gap-1 text-indigo-700 bg-indigo-50 border-indigo-200">
                          <Clock className="size-3" /> Waited {fmtDuration(waitTimes.forwardWait)} before forwarding
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Passed to {activeTrail.sourceSiteName} manager by {activeTrail.forwardedBy ?? "Branch Manager"}.
                      </p>
                      {activeTrail.forwardNote && (
                        <div className="mt-1 rounded bg-muted/40 p-2 text-xs italic text-foreground">
                          "{activeTrail.forwardNote}"
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: Decision (Approval / Rejection) */}
                <div className="relative">
                  <div className={`absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full text-white shadow-xs ${
                    activeTrail.status === "Approved" || activeTrail.status === "Assigned"
                      ? "bg-emerald-500"
                      : activeTrail.status === "Rejected"
                      ? "bg-red-500"
                      : "bg-amber-500"
                  }`}>
                    {activeTrail.status === "Approved" || activeTrail.status === "Assigned" ? (
                      <CheckCircle2 className="size-3.5" />
                    ) : activeTrail.status === "Rejected" ? (
                      <XCircle className="size-3.5" />
                    ) : (
                      <Clock className="size-3.5" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-foreground text-sm">
                        {activeTrail.status === "Approved" || activeTrail.status === "Assigned"
                          ? "3. Approved by Store Manager"
                          : activeTrail.status === "Rejected"
                          ? "3. Rejected by Store Manager"
                          : "3. Pending Decision"}
                      </span>
                      {activeTrail.decidedAt && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="size-3" /> {formatDateTime(activeTrail.decidedAt)}
                        </span>
                      )}
                    </div>

                    {activeTrail.decidedAt ? (
                      <>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="outline" className="text-[11px] gap-1 text-emerald-700 bg-emerald-50 border-emerald-200">
                            <Clock className="size-3" /> Waited {fmtDuration(waitTimes.approvalWait)} for decision
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Decided by <span className="font-medium text-foreground">{activeTrail.decidedBy ?? "Store Manager"}</span> at {activeTrail.sourceSiteName}.
                        </p>
                        {activeTrail.decisionComment && (
                          <div className="mt-1 rounded bg-muted/40 p-2 text-xs italic text-foreground">
                            "{activeTrail.decisionComment}"
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        Currently waiting for decision at {activeTrail.sourceSiteName}.
                      </p>
                    )}
                  </div>
                </div>

                {/* Step 4: Dispatched / Stock Handover */}
                {activeTrail.assignment && (
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full bg-teal-500 text-white shadow-xs">
                      <Truck className="size-3.5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">4. Stock Dispatched & Assigned</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="size-3" /> {formatDateTime(activeTrail.assignment.dispatchedAt)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[11px] gap-1 text-teal-700 bg-teal-50 border-teal-200">
                          <Clock className="size-3" /> Handed over in {fmtDuration(waitTimes.dispatchWait)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Stock issued from warehouse <span className="font-medium text-foreground">{activeTrail.assignment.sourceWarehouseName}</span> to <span className="font-medium text-foreground">{activeTrail.assignment.assigneeName}</span>.
                      </p>
                      <div className="mt-2 rounded-lg border bg-muted/30 p-2.5 text-xs">
                        <div className="font-medium text-muted-foreground mb-1">Dispatched Items ({activeTrail.assignment.code})</div>
                        {activeTrail.assignment.lines.map((l, idx) => (
                          <div key={idx} className="flex justify-between py-0.5">
                            <span>{l.itemName}</span>
                            <span className="font-semibold">{l.qty} {l.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 5: Consumed or Returned */}
                {(activeTrail.totalConsumed > 0 || activeTrail.totalReturned > 0) && (
                  <div className="relative">
                    <div className="absolute -left-[31px] top-0 flex size-6 items-center justify-center rounded-full bg-violet-500 text-white shadow-xs">
                      <User className="size-3.5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-foreground text-sm">5. Field Consumption & Restocking</span>
                      </div>
                      <div className="mt-2 space-y-2 text-xs">
                        {activeTrail.consumption.map((c) => (
                          <div key={c.id} className="rounded border bg-muted/20 p-2">
                            <span className="font-semibold text-foreground">{c.qty} × {c.itemName}</span> recorded as consumed at {c.location} on {formatDate(c.date)}.
                          </div>
                        ))}
                        {activeTrail.returns.map((r) => (
                          <div key={r.id} className="rounded border border-teal-200 bg-teal-50/50 p-2 text-teal-900 dark:bg-teal-950/20 dark:text-teal-300">
                            <span className="font-semibold">{r.qty} × {r.itemName}</span> returned in {r.condition} condition on {formatDate(r.date)}.
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
