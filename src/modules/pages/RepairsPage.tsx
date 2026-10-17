import { useMemo, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { CircuitBoard, Pencil, Plus, Search } from "lucide-react"
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
import { fieldsFor } from "@/lib/siteConfig"
import type { RepairJob, RepairStatus } from "@/lib/types"
import { toastError, useAsync } from "@/lib/useAsync"
import { formatDate } from "@/lib/utils"
import { DynamicForm } from "@/renderer/DynamicForm"
import { formatFieldValue } from "@/lib/format"

const STATUSES: RepairStatus[] = ["Received", "In Repair", "Fixed", "Scrapped"]

export function RepairsPage() {
  const { config, siteApi, changeTick, notifyChange } = useSite()
  const fields = fieldsFor(config, "pcb-repair")
  const { data, loading, reload } = useAsync(() => siteApi.get<RepairJob[]>("repairs"), [changeTick])
  const [filter, setFilter] = useState<"All" | RepairStatus>("All")
  const [q, setQ] = useState("")
  const [editing, setEditing] = useState<{ job?: RepairJob; values: Record<string, unknown> } | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, (data ?? []).filter((r) => r.status === s).length])), [data])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (data ?? []).filter(
      (r) => (filter === "All" || r.status === filter) && (!t || [r.meterId, r.code, r.fault, r.technician].join(" ").toLowerCase().includes(t)),
    )
  }, [data, filter, q])
  const tableFields = fields.filter((f) => f.showInTable)

  async function save() {
    if (!editing) return
    const errs = validateValues(fields, editing.values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      if (editing.job) {
        await siteApi.put(`repairs/${editing.job.id}`, editing.values)
        toast.success(`${editing.job.code} was updated`, { description: `Now: ${editing.values.status}` })
      } else {
        const job = await siteApi.post<RepairJob>("repairs", editing.values)
        toast.success(`Repair ${job.code} was added`, { description: `${job.meterId} is marked as received.` })
      }
      setEditing(null)
      reload()
      notifyChange()
    } catch (e) {
      toastError(e, "Couldn't save repair job")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Meter repairs"
        icon={<CircuitBoard />}
        description="Follow each broken meter until it is fixed."
        actions={
          <Button
            onClick={() => {
              setErrors({})
              setEditing({ values: { meterType: "Single Phase Smart Meter" } })
            }}
          >
            <Plus /> Log faulty meter
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="All">
              All <span className="text-muted-foreground tabular-nums">{data?.length ?? 0}</span>
            </TabsTrigger>
            {STATUSES.map((st) => (
              <TabsTrigger key={st} value={st}>
                {statusLabel(st)} <span className="text-muted-foreground tabular-nums">{counts[st] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="bg-card pl-8" placeholder="Search by meter number, fault or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {loading && !data ? (
        <TableSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon={CircuitBoard} title="No repairs yet" description="Add a broken meter to start." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">Repair</TableHead>
                {tableFields.map((f) => (
                  <TableHead key={f.key}>{f.label}</TableHead>
                ))}
                <TableHead>Parts used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4">
                    <div className="text-xs font-semibold">{r.code}</div>
                    <div className="text-xs text-muted-foreground">rcvd {formatDate(r.receivedAt)}</div>
                    <div className="text-xs text-muted-foreground">upd {formatDate(r.updatedAt)}</div>
                  </TableCell>
                  {tableFields.map((f) => (
                    <TableCell key={f.key} className={f.key === "meterId" ? "text-sm font-medium" : "max-w-[200px] text-sm whitespace-normal"}>
                      {f.key === "technician" && !r.technician ? <span className="text-muted-foreground italic">Nobody yet</span> : formatFieldValue(f, r[f.key])}
                    </TableCell>
                  ))}
                  <TableCell className="max-w-[160px] text-sm whitespace-normal text-muted-foreground">{r.partsUsed || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={r.status} />
                      {r.returned && <StatusBadge status="Returned" />}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={r.returned}
                      title={r.returned ? "Put back into stock. This repair is closed." : "Update this repair"}
                      onClick={() => {
                        setErrors({})
                        setEditing({ job: r, values: { ...r } })
                      }}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && !busy && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.job ? `Update ${editing.job.code}` : "Add a broken meter"}</DialogTitle>
            <DialogDescription>{editing?.job ? "Change where this repair is up to." : "It starts as received."}</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
              {editing.job && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={String(editing.values.status)} onValueChange={(v) => setEditing({ ...editing, values: { ...editing.values, status: v } })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DynamicForm
                fields={fields}
                values={editing.values}
                errors={errors}
                disabled={editing.job ? ["meterId"] : []}
                onChange={(values) => setEditing({ ...editing, values })}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Spinner />}
              {editing?.job ? "Save" : "Log job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
