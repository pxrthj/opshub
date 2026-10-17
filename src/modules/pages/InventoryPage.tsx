import { useMemo, useState } from "react"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { AlertTriangle, Boxes, Link2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import { validateValues, type FieldErrors } from "@/lib/fields"
import { computeFormula } from "@/lib/formula"
import { roleAtLeast } from "@/lib/roles"
import type { FieldDef, InventoryItem } from "@/lib/types"
import { toastError, useAsync } from "@/lib/useAsync"
import { formatINR } from "@/lib/utils"
import { DynamicForm } from "@/renderer/DynamicForm"
import { formatFieldValue } from "@/lib/format"

interface InventoryResponse {
  items: InventoryItem[]
  linked: boolean
  sourceName: string
  fields: FieldDef[]
}

const ALL = "__all__"

export function InventoryPage() {
  const { config, role, siteApi, changeTick, notifyChange } = useSite()
  const { data, loading, reload } = useAsync(() => siteApi.get<InventoryResponse>("inventory"), [changeTick])
  const [q, setQ] = useState("")
  const [cat, setCat] = useState(ALL)
  const [lowOnly, setLowOnly] = useState(false)
  const [editing, setEditing] = useState<{ id?: string; values: Record<string, unknown> } | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<InventoryItem | null>(null)

  const fields = data?.fields ?? []
  const tableFields = fields.filter((f) => f.showInTable)
  const linked = !!data?.linked
  const canEdit = roleAtLeast(role, "Manager") && !linked
  const canDelete = role === "Admin" && !linked
  const alerts = config.workflow.lowStockAlerts
  const categories = fields.find((f) => f.key === "category")?.options ?? []

  const items = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (data?.items ?? []).filter(
      (i) =>
        (!term || i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term)) &&
        (cat === ALL || i.category === cat) &&
        (!lowOnly || i.qty < i.reorderLevel),
    )
  }, [data, q, cat, lowOnly])

  // footer value sits under the Total column (or the last column if Total is hidden)
  const totalIdx = Math.max(0, tableFields.findIndex((f) => f.key === "total")) || tableFields.length - 1
  const totalValue = items.reduce((s, i) => s + i.qty * i.unitPrice, 0)
  const lowCount = (data?.items ?? []).filter((i) => i.qty < i.reorderLevel).length

  function openNew() {
    setErrors({})
    setEditing({ values: { unit: "Nos", qty: "", unitPrice: "", reorderLevel: "" } })
  }
  function openEdit(item: InventoryItem) {
    setErrors({})
    setEditing({ id: item.id, values: { ...item } })
  }

  function validate(values: Record<string, unknown>) {
    const errs = validateValues(fields, values)
    if (!errs.qty && values.qty !== "" && !Number.isInteger(Number(values.qty))) errs.qty = "Type a whole number, like 12"
    return errs
  }

  async function save() {
    if (!editing) return
    const errs = validate(editing.values)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      if (editing.id) {
        await siteApi.put(`inventory/${editing.id}`, editing.values)
        toast.success(`${editing.values.name} was updated`)
      } else {
        await siteApi.post("inventory", editing.values)
        toast.success(`${editing.values.name} was added`)
      }
      setEditing(null)
      reload()
      notifyChange()
    } catch (e) {
      toastError(e, "Couldn't save item")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Stock"
        icon={<Boxes />}
        description={
          linked ? (
            <span className="inline-flex items-center gap-1.5">
              <Link2 className="size-3.5" /> Stock held in {data?.sourceName}. View only.
            </span>
          ) : (
            "Everything we have, and how many are left."
          )
        }
        actions={
          canEdit ? (
            <Button onClick={openNew}>
              <Plus /> Add item
            </Button>
          ) : !linked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button disabled>
                    <Plus /> Add item
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Only managers and admins can change stock</TooltipContent>
            </Tooltip>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="bg-card pl-9" placeholder="Search for an item" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger className="w-48 bg-card">
            <SelectValue />
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
        {alerts && (
          <Label className="cursor-pointer font-normal">
            <Switch checked={lowOnly} onCheckedChange={setLowOnly} />
            Low stock only
            <Badge variant="destructive">{lowCount}</Badge>
          </Label>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {items.length} of {data?.items.length ?? 0} items
        </span>
      </div>

      {loading && !data ? (
        <TableSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={data?.items.length ? "Nothing matches" : "No stock yet"}
          description={data?.items.length ? "Try a different search or category." : canEdit ? "Add your first item to start." : undefined}
          action={
            data?.items.length ? (
              <Button variant="outline" onClick={() => (setQ(""), setCat(ALL), setLowOnly(false))}>
                Clear filters
              </Button>
            ) : canEdit ? (
              <Button onClick={openNew}>
                <Plus /> Add item
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                {tableFields.map((f) => (
                  <TableHead key={f.key} className={f.type === "number" || f.type === "calculated" ? "text-right" : f.key === "name" ? "pl-4" : ""}>
                    {f.label}
                  </TableHead>
                ))}
                <TableHead>Status</TableHead>
                {(canEdit || canDelete) && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const low = alerts && i.qty < i.reorderLevel
                return (
                  <TableRow key={i.id} className={low ? "bg-red-50/40" : undefined}>
                    {tableFields.map((f) => (
                      <TableCell
                        key={f.key}
                        className={
                          f.type === "number" || f.type === "calculated"
                            ? "text-right tabular-nums"
                            : f.key === "name"
                              ? "pl-4 font-medium"
                              : "text-muted-foreground"
                        }
                      >
                        {f.key === "qty" ? (
                          <span>
                            {i.qty.toLocaleString("en-IN")} <span className="text-xs text-muted-foreground">{i.unit}</span>
                          </span>
                        ) : f.type === "calculated" ? (
                          <span className="font-medium">{formatFieldValue(f, computeFormula(f.formula, i))}</span>
                        ) : (
                          formatFieldValue(f, i[f.key])
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      {low ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                              <AlertTriangle /> Low stock
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Qty {i.qty} is below reorder level {i.reorderLevel}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">In stock</Badge>
                      )}
                    </TableCell>
                    {(canEdit || canDelete) && (
                      <TableCell className="pr-3 text-right whitespace-nowrap">
                        {canEdit && (
                          <Button size="icon-sm" variant="ghost" onClick={() => openEdit(i)} aria-label={`Edit ${i.name}`}>
                            <Pencil />
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(i)} aria-label={`Delete ${i.name}`}>
                            <Trash2 />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="pl-4 font-medium" colSpan={Math.max(1, totalIdx)}>
                  Total stock value ({items.length} items shown)
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatINR(totalValue)}</TableCell>
                <TableCell colSpan={tableFields.length - totalIdx - 1 + (canEdit || canDelete ? 2 : 1)} />
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && !saving && setEditing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit item" : "Add an item"}</DialogTitle>
            <DialogDescription>Fill in the details below. Admins can add more boxes by editing the office.</DialogDescription>
          </DialogHeader>
          {editing && (
            <DynamicForm
              fields={fields}
              values={editing.values}
              errors={errors}
              onChange={(values) => {
                setEditing({ ...editing, values })
                if (Object.keys(errors).length) setErrors(validate(values))
              }}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Spinner />}
              {editing?.id ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="It will be taken off the stock list."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          try {
            await siteApi.del(`inventory/${deleting!.id}`)
            toast.success(`${deleting!.name} was deleted`)
            reload()
            notifyChange()
          } catch (e) {
            toastError(e)
            throw e
          }
        }}
      />
    </div>
  )
}
