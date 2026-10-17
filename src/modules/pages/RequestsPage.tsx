import { useMemo, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { ClipboardList, Plus, Trash2, Wrench, Package, AlertCircle, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge, statusLabel } from "@/components/StatusBadge"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import { validateValues, type FieldErrors } from "@/lib/fields"
import { roleAtLeast } from "@/lib/roles"
import { fieldsFor } from "@/lib/siteConfig"
import type { FieldDef, InventoryItem, MaterialRequest, RequestStatus } from "@/lib/types"
import { errorMessage, toastError, useAsync } from "@/lib/useAsync"
import { cn, formatDateTime } from "@/lib/utils"
import { DynamicForm } from "@/renderer/DynamicForm"
import { formatFieldValue, requestSummary } from "@/lib/format"
import { requestStatusLabel } from "@/lib/requestFlow"

const STATUSES: ("All" | RequestStatus)[] = ["All", "Pending", "Approved", "Assigned", "Rejected"]

type Line = { itemId: string; qty: string }

export function NewRequestDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const { config, siteApi } = useSite()
  const wf = config.workflow
  const defaultType = wf.allowMaterialRequests ? "material" : "repair"
  const [type, setType] = useState<"material" | "repair">(defaultType)
  const [lines, setLines] = useState<Line[]>([{ itemId: "", qty: "" }])
  const [repair, setRepair] = useState({ meterId: "", meterType: "Single Phase Smart Meter", fault: "" })
  const [values, setValues] = useState<Record<string, unknown>>({ priority: "Normal" })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data: inv } = useAsync(
    () => (open && wf.allowMaterialRequests ? siteApi.get<{ items: InventoryItem[]; sourceName: string; higherSiteName?: string; higherSiteManager?: { name: string } }>("inventory") : Promise.resolve(null)),
    [open],
  )
  const fields = fieldsFor(config, "request")
  const repairFields = fieldsFor(config, "pcb-repair")
  const meterTypes = repairFields.find((f) => f.key === "meterType")?.options ?? ["Single Phase Smart Meter", "Three Phase Smart Meter"]
  const faults = repairFields.find((f) => f.key === "fault")?.options ?? ["Display blank", "No communication (RF/GPRS)", "Relay stuck", "Burnt PCB"]
  const formFields = fields.filter((f) => !(type === "repair" && f.key === "purpose"))

  function reset() {
    setType(defaultType)
    setLines([{ itemId: "", qty: "" }])
    setRepair({ meterId: "", meterType: meterTypes[0], fault: "" })
    setValues({ priority: "Normal" })
    setErrors({})
    setFormError(null)
  }

  async function submit() {
    setFormError(null)
    const errs = validateValues(formFields, values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    let body: Record<string, unknown> = { ...values, type }
    if (type === "material") {
      const clean = lines.filter((l) => l.itemId || l.qty)
      if (!clean.length) return setFormError("Add at least one item.")
      for (const [i, l] of clean.entries()) {
        if (!l.itemId) return setFormError(`Row ${i + 1}: pick an item.`)
        const n = Number(l.qty)
        if (!Number.isInteger(n) || n <= 0) return setFormError(`Row ${i + 1}: type a whole number, like 5.`)
        if (n > wf.maxQtyPerLine) return setFormError(`Row ${i + 1}: you can ask for at most ${wf.maxQtyPerLine} of one item.`)
      }
      body = { ...body, lines: clean.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })) }
    } else {
      if (!repair.meterId.trim()) return setFormError("Meter ID is required")
      if (!repair.fault) return setFormError("Pick what is wrong with the meter.")
      body = { ...body, repair, purpose: `Repair ${repair.meterId.trim().toUpperCase()}` }
    }
    setBusy(true)
    try {
      await siteApi.post<MaterialRequest>("requests", body)
      const clean = lines.filter((l) => l.itemId || l.qty)
      const shortages = clean.filter((l) => {
        const s = stock.find((x) => x.id === l.itemId)
        return s && s.qty < Number(l.qty)
      })
      if (shortages.length > 0) {
        toast.success("Your request was submitted to your manager", {
          description: `Contains out-of-stock items. Your manager will escalate to ${inv?.higherSiteName || "higher office"} manager to supply.`,
        })
      } else {
        toast.success("Your request was sent to your manager", {
          description: "Items are in stock locally and waiting for your site manager's approval.",
        })
      }
      reset()
      onOpenChange(false)
      onCreated()
    } catch (e) {
      setFormError(errorMessage(e))
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  const stock = inv?.items ?? []
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New request</DialogTitle>
          <DialogDescription>
            {type === "material" ? `Ask for items from ${config.name} stock.` : "Send in a meter that is not working."} You ask your own manager. If an item is out of stock, they escalate to the higher site manager.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          {wf.allowMaterialRequests && wf.allowRepairRequests && (
            <Tabs value={type} onValueChange={(v) => setType(v as "material" | "repair")}>
              <TabsList>
                <TabsTrigger value="material">
                  <Package /> Items from stock
                </TabsTrigger>
                <TabsTrigger value="repair">
                  <Wrench /> Repair a meter
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {type === "material" ? (
            <div className="space-y-2">
              <Label>What do you need? *</Label>
              {lines.map((l, idx) => {
                const item = stock.find((s) => s.id === l.itemId)
                const over = item && Number(l.qty) > item.qty
                const isOutOfStock = item && item.qty === 0
                return (
                  <div key={idx} className="flex items-start gap-2">
                    <Select value={l.itemId || undefined} onValueChange={(v) => setLines(lines.map((x, i) => (i === idx ? { ...x, itemId: v } : x)))}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={inv ? "Pick an item" : "Loading…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {stock.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="font-medium">{s.name}</span>{" "}
                            {s.qty === 0 ? (
                              <span className="text-xs text-red-600 font-semibold">· Out of stock (0 {s.unit})</span>
                            ) : s.qty < s.reorderLevel ? (
                              <span className="text-xs text-amber-600">· Low stock ({s.qty.toLocaleString("en-IN")} {s.unit})</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">· {s.qty.toLocaleString("en-IN")} {s.unit} in stock</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="w-48">
                      <Input
                        type="number"
                        min={1}
                        placeholder="How many"
                        value={l.qty}
                        onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                      />
                      {item && (
                        <p
                          className={cn(
                            "mt-1 text-xs",
                            isOutOfStock
                              ? "font-semibold text-red-600"
                              : over
                                ? "font-medium text-amber-600"
                                : "text-emerald-700",
                          )}
                        >
                          {isOutOfStock
                            ? `⚠️ Out of stock locally — will escalate to ${inv?.higherSiteName || "higher office"}`
                            : over
                              ? `⚠️ Asked for ${l.qty}, only ${item.qty} in stock`
                              : `✓ In local stock (${item.qty} ${item.unit})`}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== idx))} aria-label="Remove this row">
                      <Trash2 />
                    </Button>
                  </div>
                )
              })}
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, { itemId: "", qty: "" }])}>
                <Plus /> Add another item
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Meter number *</Label>
                <Input placeholder="e.g. SM-PN-212345" value={repair.meterId} onChange={(e) => setRepair({ ...repair, meterId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Type of meter *</Label>
                <Select value={repair.meterType} onValueChange={(v) => setRepair({ ...repair, meterType: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meterTypes.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>What is wrong? *</Label>
                <Select value={repair.fault || undefined} onValueChange={(v) => setRepair({ ...repair, fault: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Pick one" />
                  </SelectTrigger>
                  <SelectContent>
                    {faults.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DynamicForm fields={formFields} values={values} errors={errors} onChange={setValues} />
          {formError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Spinner />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RequestsPage() {
  const { config, role, siteApi, changeTick, notifyChange } = useSite()
  const isAdmin = role === "Admin"
  const isManager = roleAtLeast(role, "Manager")
  const [scope, setScope] = useState<"all" | "mine">(isManager || isAdmin ? "all" : "mine")
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All")
  const [open, setOpen] = useState(false)
  const { data, loading, reload } = useAsync(() => siteApi.get<MaterialRequest[]>("requests", { scope }), [changeTick, scope])
  const extraFields: FieldDef[] = fieldsFor(config, "request").filter((f) => f.showInTable && f.key !== "purpose")
  const list = useMemo(() => (data ?? []).filter((r) => status === "All" || r.status === status), [data, status])
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, (data ?? []).filter((r) => s === "All" || r.status === s).length])), [data])
  const canRequest = config.workflow.allowMaterialRequests || config.workflow.allowRepairRequests
  const canMakeRequest = canRequest && !isAdmin
  const hasApproval = config.modules.includes("approval")

  return (
    <div>
      <PageHeader
        title="Requests"
        icon={<ClipboardList />}
        description={
          isAdmin
            ? "Site Admin oversight: Track request lifecycle and audit supply chain movements."
            : isManager
              ? "Everything people in this office have asked for."
              : "Ask for what you need and see how it is going."
        }
        actions={
          canMakeRequest && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> New request
            </Button>
          )
        }
      />
      {isAdmin && (
        <Alert className="mb-4 border-primary/20 bg-primary/5">
          <Info className="text-primary" />
          <AlertDescription>
            <span className="font-semibold text-foreground">Site Admin Oversight:</span> You have view-only access to oversee the flow of requests and track audit trails. Submitting requests is performed by Members, and approvals are handled by Managers.
          </AlertDescription>
        </Alert>
      )}
      {!hasApproval && (
        <Alert className="mb-4">
          <Info />
          <AlertDescription>Nobody can approve requests in this office yet, so they will stay waiting. Ask an Admin to switch approvals on.</AlertDescription>
        </Alert>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <TabsList>
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {statusLabel(s)} <span className="ml-1 text-xs opacity-60">{counts[s] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {isManager && (
          <Tabs value={scope} onValueChange={(v) => setScope(v as "all" | "mine")}>
            <TabsList>
              <TabsTrigger value="all">Everyone</TabsTrigger>
              <TabsTrigger value="mine">Mine</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {loading && !data ? (
        <TableSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={data?.length ? `No ${statusLabel(status).toLowerCase()} requests` : "No requests yet"}
          description={canRequest ? "Press the button above to ask for something." : undefined}
          action={
            canRequest && (
              <Button onClick={() => setOpen(true)}>
                <Plus /> New request
              </Button>
            )
          }
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Request</TableHead>
                <TableHead>What</TableHead>
                <TableHead>What for</TableHead>
                {extraFields.map((f) => (
                  <TableHead key={f.key}>{f.label}</TableHead>
                ))}
                {isManager && <TableHead>Asked by</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Answer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4">
                    <div className="text-xs font-semibold">{r.code}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</div>
                    {r.isOutOfStockLocally && (
                      <span className="mt-0.5 inline-block rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                        ⚠️ Out of stock locally
                      </span>
                    )}
                    {r.targetSiteName && r.targetSiteId !== config.siteId && (
                      <span className="mt-0.5 inline-block rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        To: {r.targetSiteName}
                      </span>
                    )}
                    {r.originSiteName && r.originSiteId !== config.siteId && (
                      <span className="mt-0.5 inline-block rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        From: {r.originSiteName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex items-start gap-1.5 text-sm whitespace-normal">
                      {r.type === "repair" ? <Wrench className="mt-0.5 size-3.5 shrink-0 text-primary" /> : <Package className="mt-0.5 size-3.5 shrink-0 text-primary" />}
                      {requestSummary(r)}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal text-muted-foreground">
                    {r.purpose}
                  </TableCell>
                  {extraFields.map((f) => (
                    <TableCell key={f.key}>{f.key === "priority" && r.priority ? <StatusBadge status={String(r.priority)} /> : formatFieldValue(f, r[f.key])}</TableCell>
                  ))}
                  {isManager && <TableCell>{r.requestedByName}</TableCell>}
                  <TableCell>
                    <StatusBadge status={r.status} label={requestStatusLabel(r, { siteId: config.siteId, isManager }) ?? undefined} />
                  </TableCell>
                  <TableCell className="max-w-64 text-xs whitespace-normal text-muted-foreground">
                    {r.decidedBy ? (
                      <>
                        <span className="font-medium text-foreground">{r.decidedBy}</span>
                        {r.decisionComment && <> — “{r.decisionComment}”</>}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <NewRequestDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          reload()
          notifyChange()
        }}
      />
    </div>
  )
}
