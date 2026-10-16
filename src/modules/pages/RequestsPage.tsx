import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ClipboardList, Loader2, Plus, Trash2, Wrench, Package } from "lucide-react"
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
import { DynamicForm, formatFieldValue } from "@/renderer/DynamicForm"
import { getModuleDef } from "@/modules/definitions"

const STATUSES: ("All" | RequestStatus)[] = ["All", "Pending", "Approved", "Assigned", "Rejected"]

export function requestSummary(r: MaterialRequest) {
  if (r.type === "repair") return `${r.repair?.meterId} — ${r.repair?.fault}`
  return r.lines.map((l) => `${l.itemName} × ${l.qty.toLocaleString("en-IN")}`).join(", ")
}

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
    () => (open && wf.allowMaterialRequests ? siteApi.get<{ items: InventoryItem[]; sourceName: string }>("inventory") : Promise.resolve(null)),
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
      if (!clean.length) return setFormError("Add at least one item")
      for (const [i, l] of clean.entries()) {
        if (!l.itemId) return setFormError(`Line ${i + 1}: choose an item`)
        const n = Number(l.qty)
        if (!Number.isInteger(n) || n <= 0) return setFormError(`Line ${i + 1}: quantity must be a positive whole number`)
        if (n > wf.maxQtyPerLine) return setFormError(`Line ${i + 1}: max ${wf.maxQtyPerLine} per line`)
      }
      body = { ...body, lines: clean.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })) }
    } else {
      if (!repair.meterId.trim()) return setFormError("Meter ID is required")
      if (!repair.fault) return setFormError("Choose the fault")
      body = { ...body, repair, purpose: `Repair ${repair.meterId.trim().toUpperCase()}` }
    }
    setBusy(true)
    try {
      await siteApi.post<MaterialRequest>("requests", body)
      toast.success("Request sent", { description: "A manager will review it." })
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
            {type === "material" ? `Items are issued from ${inv?.sourceName ?? "stores"} once a Manager approves.` : "Raise a repair job for a faulty meter."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          {wf.allowMaterialRequests && wf.allowRepairRequests && (
            <Tabs value={type} onValueChange={(v) => setType(v as "material" | "repair")}>
              <TabsList>
                <TabsTrigger value="material">
                  <Package /> Material
                </TabsTrigger>
                <TabsTrigger value="repair">
                  <Wrench /> Repair job
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {type === "material" ? (
            <div className="space-y-2">
              <Label>Items *</Label>
              {lines.map((l, idx) => {
                const item = stock.find((s) => s.id === l.itemId)
                const over = item && Number(l.qty) > item.qty
                return (
                  <div key={idx} className="flex items-start gap-2">
                    <Select value={l.itemId || undefined} onValueChange={(v) => setLines(lines.map((x, i) => (i === idx ? { ...x, itemId: v } : x)))}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={inv ? "Choose item" : "Loading items…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {stock.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name} <span className="text-xs text-muted-foreground">· {s.qty.toLocaleString("en-IN")} {s.unit} in stock</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="w-32">
                      <Input
                        type="number"
                        min={1}
                        placeholder="Qty"
                        value={l.qty}
                        onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))}
                      />
                      {item && <p className={cn("mt-1 text-[11px]", over ? "text-amber-600" : "text-muted-foreground")}>{over ? "More than in stock" : item.unit}</p>}
                    </div>
                    <Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== idx))} aria-label="Remove line">
                      <Trash2 />
                    </Button>
                  </div>
                )
              })}
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, { itemId: "", qty: "" }])}>
                <Plus /> Add line
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Meter ID *</Label>
                <Input placeholder="e.g. SM-PN-212345" value={repair.meterId} onChange={(e) => setRepair({ ...repair, meterId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Meter type *</Label>
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
                <Label>Fault *</Label>
                <Select value={repair.fault || undefined} onValueChange={(v) => setRepair({ ...repair, fault: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose fault" />
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
          {formError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{formError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RequestsPage() {
  const { config, role, siteApi, changeTick, notifyChange } = useSite()
  const isManager = roleAtLeast(role, "Manager")
  const [scope, setScope] = useState<"all" | "mine">(isManager ? "all" : "mine")
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("All")
  const [open, setOpen] = useState(false)
  const { data, loading, reload } = useAsync(() => siteApi.get<MaterialRequest[]>("requests", { scope }), [changeTick, scope])
  const extraFields: FieldDef[] = fieldsFor(config, "request").filter((f) => f.showInTable && f.key !== "purpose")
  const list = useMemo(() => (data ?? []).filter((r) => status === "All" || r.status === status), [data, status])
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, (data ?? []).filter((r) => s === "All" || r.status === s).length])), [data])
  const canRequest = config.workflow.allowMaterialRequests || config.workflow.allowRepairRequests
  const hasApproval = config.modules.includes("approval")

  return (
    <div>
      <PageHeader
        title="Requests"
        icon={<ClipboardList />}
        description={isManager ? "All requests in this office." : "Ask for material and track your requests."}
        actions={
          canRequest && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> New request
            </Button>
          )
        }
      />
      {!hasApproval && (
        <div className="mb-4 rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          The {getModuleDef("approval").name} module is not enabled, so requests stay Pending until an Admin adds it in the Builder.
        </div>
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
          description={canRequest ? "Ask for material or a repair." : undefined}
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
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Request</TableHead>
                <TableHead>Items / Job</TableHead>
                <TableHead>Purpose</TableHead>
                {extraFields.map((f) => (
                  <TableHead key={f.key}>{f.label}</TableHead>
                ))}
                {isManager && <TableHead>Raised by</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4">
                    <div className="font-mono text-xs font-semibold">{r.code}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</div>
                    {r.targetSiteName && r.targetSiteId !== config.siteId && (
                      <span className="mt-0.5 inline-block rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                        To: {r.targetSiteName}
                      </span>
                    )}
                    {r.originSiteName && r.originSiteId !== config.siteId && (
                      <span className="mt-0.5 inline-block rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700">
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
                  <TableCell className="max-w-[220px] truncate text-muted-foreground" title={r.purpose}>
                    {r.purpose}
                  </TableCell>
                  {extraFields.map((f) => (
                    <TableCell key={f.key}>{f.key === "priority" && r.priority ? <StatusBadge status={String(r.priority)} /> : formatFieldValue(f, r[f.key])}</TableCell>
                  ))}
                  {isManager && <TableCell>{r.requestedByName}</TableCell>}
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="max-w-[240px] text-xs whitespace-normal text-muted-foreground">
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
