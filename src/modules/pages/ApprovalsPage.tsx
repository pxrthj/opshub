import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertOctagon, Check, CheckCheck, Clock, Send, Wrench, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import type { InventoryItem, MaterialRequest } from "@/lib/types"
import { errorMessage, useAsync } from "@/lib/useAsync"
import { cn, formatDateTime } from "@/lib/utils"
import { requestSummary } from "@/lib/format"
import { isSupplied, managerAction } from "@/lib/requestFlow"
import { Input } from "@/components/ui/input"

export function ApprovalsPage() {
  const { config, siteApi, changeTick, notifyChange } = useSite()
  const [tab, setTab] = useState<"pending" | "history">("pending")
  const { data, loading, reload } = useAsync(() => siteApi.get<MaterialRequest[]>("requests"), [changeTick])
  const hasInventory = config.modules.includes("inventory")
  // Does approving this request also hand the items over (and lower stock)?
  const gives = (r: MaterialRequest) =>
    r.type === "material" && config.workflow.autoAssignOnApproval && (isSupplied(r) ? hasInventory : config.modules.includes("assignment"))
  const repairFlow = config.modules.includes("pcb-repair")
  const { data: inv, reload: reloadInv } = useAsync(
    () => (hasInventory || config.modules.includes("assignment") ? siteApi.get<{ items: InventoryItem[]; sourceName: string }>("inventory") : Promise.resolve(null)),
    [changeTick],
  )
  // The stock this office holds itself, used when it is the one supplying a request.
  const { data: ownInv, reload: reloadOwnInv } = useAsync(
    () => (hasInventory ? siteApi.get<{ items: InventoryItem[]; sourceName: string }>("inventory", { own: "1" }) : Promise.resolve(null)),
    [changeTick],
  )
  const [approving, setApproving] = useState<MaterialRequest | null>(null)
  const [rejecting, setRejecting] = useState<MaterialRequest | null>(null)
  const [sending, setSending] = useState<MaterialRequest | null>(null)
  const [comment, setComment] = useState("")
  const [failures, setFailures] = useState<Record<string, string>>({})

  // Waiting requests split three ways: ones this office decides, ones to send on, ones sitting with another office.
  const pending = useMemo(
    () =>
      (data ?? [])
        .filter((r) => ["decide", "send-on"].includes(managerAction(r, config.siteId) ?? ""))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [data, config.siteId],
  )
  const withOtherOffice = useMemo(() => (data ?? []).filter((r) => managerAction(r, config.siteId) === "waiting-for-other-office"), [data, config.siteId])
  const history = useMemo(() => (data ?? []).filter((r) => r.status !== "Pending"), [data])
  const stockOf = (r: MaterialRequest, id: string) =>
    (isSupplied(r) && r.targetSiteId === config.siteId ? ownInv : inv)?.items.find((i) => i.id === id)

  async function approve() {
    const r = approving!
    try {
      const res = await siteApi.post<{ assignmentCode?: string; repairCode?: string }>(`requests/${r.id}/approve`, { comment })
      setFailures((f) => ({ ...f, [r.id]: "" }))
      if (res.assignmentCode)
        toast.success(`${r.code} was approved`, { description: "The items were given out." })
      else if (res.repairCode) toast.success(`${r.code} was approved`, { description: "The repair has been started." })
      else toast.success(`${r.code} was approved`)
      reload()
      reloadInv()
      reloadOwnInv()
      notifyChange()
    } catch (e) {
      const msg = errorMessage(e)
      setFailures((f) => ({ ...f, [r.id]: msg }))
      toast.error(`We couldn't approve ${r.code}`, { description: msg, duration: 8000 })
      reloadInv()
      reloadOwnInv()
    }
  }

  async function sendOn() {
    const r = sending!
    try {
      await siteApi.post(`requests/${r.id}/forward`, { note: comment })
      toast.success(`${r.code} was sent to ${r.targetSiteName}`, { description: `Their manager will decide. You will see the answer here.` })
      reload()
      notifyChange()
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  async function reject() {
    const r = rejecting!
    if (config.workflow.requireRejectComment && !comment.trim()) {
      toast.error("Please write a short reason.")
      return false
    }
    try {
      await siteApi.post(`requests/${r.id}/reject`, { comment })
      toast.success(`${r.code} was turned down`)
      reload()
      notifyChange()
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  return (
    <div>
      <PageHeader
        title="Decide on requests"
        icon={<CheckCheck />}
        description="Requests from your own team, and requests other offices have sent to you. Nothing reaches another office until its manager is asked."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">
            Waiting <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{pending.length}</span>
          </TabsTrigger>
          <TabsTrigger value="history">Decided ({history.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading && !data ? (
        <TableSkeleton rows={4} />
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <EmptyState icon={CheckCheck} title="All done" description="Nothing is waiting for you." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pending.map((r) => {
              const sendOnly = managerAction(r, config.siteId) === "send-on"
              const short = !sendOnly && gives(r) && r.lines.some((l) => (stockOf(r, l.itemId)?.qty ?? 0) < l.qty)
              return (
                <Card key={r.id} className={cn("gap-3 p-4", failures[r.id] && "ring-2 ring-red-300")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{r.code}</span>
                        {r.priority === "Urgent" && <StatusBadge status="Urgent" />}
                        {r.originSiteName && r.originSiteId !== config.siteId && (
                          <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">
                            From: {r.originSiteName}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm">{r.purpose}</p>
                      {r.forwardedBy && (
                        <p className="text-xs text-muted-foreground">
                          Sent on by {r.forwardedBy} ({r.originSiteName}){r.forwardNote ? `: “${r.forwardNote}”` : ""}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {r.requestedByName}
                        {r.originSiteName && r.originSiteId !== config.siteId ? ` (${r.originSiteName})` : ""} · {formatDateTime(r.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} label={sendOnly ? "Needs sending on" : undefined} />
                  </div>
                  {r.type === "material" ? (
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Asked for</TableHead>
                            {gives(r) && !sendOnly && <TableHead className="text-right">In stock</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {r.lines.map((l) => {
                            const s = stockOf(r, l.itemId)
                            const ok = (s?.qty ?? 0) >= l.qty
                            return (
                              <TableRow key={l.itemId}>
                                <TableCell>{l.itemName}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {l.qty.toLocaleString("en-IN")} {l.unit}
                                </TableCell>
                                {gives(r) && !sendOnly && (
                                  <TableCell className={cn("text-right font-medium tabular-nums", ok ? "text-emerald-700" : "text-red-600")}>
                                    {s ? s.qty.toLocaleString("en-IN") : "—"}
                                  </TableCell>
                                )}
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <Alert>
                      <Wrench />
                      <AlertDescription>
                        {requestSummary(r)} · {r.repair?.meterType}
                      </AlertDescription>
                    </Alert>
                  )}
                  {(failures[r.id] || short) && (
                    <Alert variant="destructive">
                      <AlertOctagon />
                      <AlertDescription>{failures[r.id] || "There is not enough stock for this request."}</AlertDescription>
                    </Alert>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      className="text-destructive"
                      onClick={() => {
                        setComment("")
                        setRejecting(r)
                      }}
                    >
                      <X /> Turn down
                    </Button>
                    {sendOnly ? (
                      <Button
                        onClick={() => {
                          setComment("")
                          setSending(r)
                        }}
                      >
                        <Send /> Send to {r.targetSiteName}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          setComment("")
                          setApproving(r)
                        }}
                      >
                        <Check /> Approve{gives(r) ? " and give out" : ""}
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        )
      ) : history.length === 0 ? (
        <EmptyState icon={CheckCheck} title="No answers yet" />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Request</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Asked by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decided on</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 text-xs font-semibold">{r.code}</TableCell>
                  <TableCell className="max-w-xs truncate">{requestSummary(r)}</TableCell>
                  <TableCell>
                    <span>{r.requestedByName}</span>
                    {r.originSiteName && r.originSiteId !== config.siteId && (
                      <span className="block text-xs text-muted-foreground">From: {r.originSiteName}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.decidedBy}
                    <br />
                    {r.decidedAt && formatDateTime(r.decidedAt)}
                  </TableCell>
                  <TableCell className="max-w-xs text-xs whitespace-normal text-muted-foreground">{r.decisionComment ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {tab === "pending" && withOtherOffice.length > 0 && (
        <Card className="mt-6 gap-3 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Clock className="size-4 text-muted-foreground" /> You sent these on. Waiting for the other office to answer
          </p>
          <ul className="divide-y text-sm">
            {withOtherOffice.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{r.code}</span> · {requestSummary(r)}
                  <span className="block text-xs text-muted-foreground">
                    {r.requestedByName} · sent to {r.targetSiteName}
                    {r.forwardedAt ? ` on ${formatDateTime(r.forwardedAt)}` : ""}
                  </span>
                </span>
                <StatusBadge status="Pending" label={`With ${r.targetSiteName}`} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!sending}
        onOpenChange={(o) => !o && setSending(null)}
        title={`Send ${sending?.code} to ${sending?.targetSiteName}?`}
        description={`The manager of ${sending?.targetSiteName} will see this request and decide. ${sending?.requestedByName} will see where it is.`}
        confirmLabel="Send it"
        onConfirm={sendOn}
      >
        <div className="space-y-1.5">
          <Label>Message for their manager (optional)</Label>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="For example: needed before Friday" />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title={`Approve ${approving?.code}?`}
        description={
          approving && gives(approving)
            ? `Stock will be taken from ${isSupplied(approving) ? config.name : inv?.sourceName} and given to ${approving.requestedByName}${approving.originSiteName && approving.originSiteId !== config.siteId ? ` (${approving.originSiteName})` : ""}. Either all of it happens, or nothing does.`
            : approving?.type === "repair" && repairFlow
              ? "A PCB repair job will be opened for this meter."
              : "The request will be marked as approved."
        }
        confirmLabel={approving && gives(approving) ? "Approve and give out" : "Approve"}
        onConfirm={approve}
      >
        <div className="space-y-1.5">
          <Label>Note (optional)</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="For example: fine for this week" />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Turn down ${rejecting?.code}?`}
        description={`${rejecting?.requestedByName} will see that it was turned down, with your reason.`}
        confirmLabel="Turn it down"
        destructive
        onConfirm={reject}
      >
        <div className="space-y-1.5">
          <Label>
            Reason {config.workflow.requireRejectComment && <span className="text-destructive">*</span>}
          </Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a short reason" />
        </div>
      </ConfirmDialog>
    </div>
  )
}
