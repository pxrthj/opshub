import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertOctagon, Check, CheckCheck, Package, Wrench, X } from "lucide-react"
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
import { requestSummary } from "./RequestsPage"

export function ApprovalsPage() {
  const { config, siteApi, changeTick, notifyChange } = useSite()
  const [tab, setTab] = useState<"pending" | "history">("pending")
  const { data, loading, reload } = useAsync(() => siteApi.get<MaterialRequest[]>("requests"), [changeTick])
  const willAssign = config.modules.includes("assignment") && config.workflow.autoAssignOnApproval
  const repairFlow = config.modules.includes("pcb-repair")
  const { data: inv, reload: reloadInv } = useAsync(
    () => (config.modules.includes("inventory") || willAssign ? siteApi.get<{ items: InventoryItem[]; sourceName: string }>("inventory") : Promise.resolve(null)),
    [changeTick],
  )
  const [approving, setApproving] = useState<MaterialRequest | null>(null)
  const [rejecting, setRejecting] = useState<MaterialRequest | null>(null)
  const [comment, setComment] = useState("")
  const [failures, setFailures] = useState<Record<string, string>>({})

  const pending = useMemo(() => (data ?? []).filter((r) => r.status === "Pending").sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [data])
  const history = useMemo(() => (data ?? []).filter((r) => r.status !== "Pending"), [data])
  const stockOf = (id: string) => inv?.items.find((i) => i.id === id)

  async function approve() {
    const r = approving!
    try {
      const res = await siteApi.post<{ assignmentCode?: string; repairCode?: string }>(`requests/${r.id}/approve`, { comment })
      setFailures((f) => ({ ...f, [r.id]: "" }))
      if (res.assignmentCode)
        toast.success(`${r.code} approved & assigned`, {
          description: `Stock issued from ${inv?.sourceName} in one transaction → ${res.assignmentCode}`,
        })
      else if (res.repairCode) toast.success(`${r.code} approved`, { description: `Repair job ${res.repairCode} created (status: Received)` })
      else toast.success(`${r.code} approved`)
      reload()
      reloadInv()
      notifyChange()
    } catch (e) {
      const msg = errorMessage(e)
      setFailures((f) => ({ ...f, [r.id]: msg }))
      toast.error(`Couldn't approve ${r.code}`, { description: msg, duration: 8000 })
      reloadInv()
    }
  }

  async function reject() {
    const r = rejecting!
    if (config.workflow.requireRejectComment && !comment.trim()) {
      toast.error("Add a comment explaining the rejection")
      return false
    }
    try {
      await siteApi.post(`requests/${r.id}/reject`, { comment })
      toast.success(`${r.code} rejected`)
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
        title="Approve requests"
        icon={<CheckCheck />}
        description={
          willAssign
            ? `Approving a material request runs one all-or-nothing transaction: check stock in ${inv?.sourceName ?? "stores"}, decrement it and create the assignment.`
            : repairFlow
              ? "Approving a repair request opens a PCB repair job."
              : "Approve or reject pending requests with a comment."
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="pending">
            Waiting <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">{pending.length}</span>
          </TabsTrigger>
          <TabsTrigger value="history">Decided ({history.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading && !data ? (
        <TableSkeleton rows={4} />
      ) : tab === "pending" ? (
        pending.length === 0 ? (
          <EmptyState icon={CheckCheck} title="All caught up" description="There are no requests waiting for approval." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {pending.map((r) => {
              const short = r.type === "material" && willAssign && r.lines.some((l) => (stockOf(l.itemId)?.qty ?? 0) < l.qty)
              return (
                <Card key={r.id} className={cn("gap-3 p-4", failures[r.id] && "ring-2 ring-red-300")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{r.code}</span>
                        {r.priority === "Urgent" && <StatusBadge status="Urgent" />}
                      </div>
                      <p className="mt-0.5 text-sm">{r.purpose}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.requestedByName} · {formatDateTime(r.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {r.type === "material" ? (
                    <div className="overflow-hidden rounded-[var(--radius)] border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="px-3 py-1.5 text-left font-medium">Item</th>
                            <th className="px-3 py-1.5 text-right font-medium">Requested</th>
                            {willAssign && <th className="px-3 py-1.5 text-right font-medium">In stock</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {r.lines.map((l) => {
                            const s = stockOf(l.itemId)
                            const ok = (s?.qty ?? 0) >= l.qty
                            return (
                              <tr key={l.itemId} className="border-t">
                                <td className="px-3 py-1.5">
                                  <Package className="mr-1.5 inline size-3.5 text-primary" />
                                  {l.itemName}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {l.qty.toLocaleString("en-IN")} {l.unit}
                                </td>
                                {willAssign && (
                                  <td className={cn("px-3 py-1.5 text-right font-medium tabular-nums", ok ? "text-emerald-700" : "text-red-600")}>
                                    {s ? s.qty.toLocaleString("en-IN") : "—"} {ok ? "✓" : "✗"}
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-sm">
                      <Wrench className="size-4 text-primary" /> {requestSummary(r)} <span className="text-muted-foreground">· {r.repair?.meterType}</span>
                    </div>
                  )}
                  {(failures[r.id] || short) && (
                    <div className="flex gap-2 rounded-[var(--radius)] bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                      <AlertOctagon className="size-4 shrink-0" />
                      <span>{failures[r.id] || `Not enough stock in ${inv?.sourceName} for every line — approving will fail and nothing will change.`}</span>
                    </div>
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
                      <X /> Reject
                    </Button>
                    <Button
                      onClick={() => {
                        setComment("")
                        setApproving(r)
                      }}
                    >
                      <Check /> Approve{willAssign && r.type === "material" ? " & hand over" : ""}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )
      ) : history.length === 0 ? (
        <EmptyState icon={CheckCheck} title="No decisions yet" />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Request</TableHead>
                <TableHead>Items / Job</TableHead>
                <TableHead>Raised by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decided</TableHead>
                <TableHead>Comment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 font-mono text-xs font-semibold">{r.code}</TableCell>
                  <TableCell className="max-w-xs truncate">{requestSummary(r)}</TableCell>
                  <TableCell>{r.requestedByName}</TableCell>
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

      <ConfirmDialog
        open={!!approving}
        onOpenChange={(o) => !o && setApproving(null)}
        title={`Approve ${approving?.code}?`}
        description={
          approving?.type === "material" && willAssign
            ? `Stock will be checked and deducted from ${inv?.sourceName} and an assignment created for ${approving?.requestedByName} — all together, or not at all.`
            : approving?.type === "repair" && repairFlow
              ? "A PCB repair job will be opened for this meter."
              : "The request will be marked Approved."
        }
        confirmLabel={approving?.type === "material" && willAssign ? "Approve & hand over" : "Approve"}
        onConfirm={approve}
      >
        <div className="space-y-1.5">
          <Label>Comment (optional)</Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Approved for phase 2" />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rejecting}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={`Reject ${rejecting?.code}?`}
        description={`${rejecting?.requestedByName} will see this request as Rejected with your comment.`}
        confirmLabel="Reject request"
        destructive
        onConfirm={reject}
      >
        <div className="space-y-1.5">
          <Label>
            Reason {config.workflow.requireRejectComment && <span className="text-destructive">*</span>}
          </Label>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Explain why this is rejected" />
        </div>
      </ConfirmDialog>
    </div>
  )
}
