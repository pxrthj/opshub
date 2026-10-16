import { useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Download, FileSpreadsheet, FileUp, Info, Loader2, Lock, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { PageHeader } from "@/components/PageHeader"
import { useAuth } from "@/context/AuthContext"
import { useSite } from "@/context/SiteContext"
import { downloadTemplate, exportWorkbook, parseInventoryFile, type ParsedImport } from "@/lib/excel"
import { validateValues } from "@/lib/fields"
import { roleAtLeast } from "@/lib/roles"
import { fieldsFor } from "@/lib/siteConfig"
import type { ExportDataset, FieldDef, InventoryItem } from "@/lib/types"
import { errorMessage, toastError, useAsync } from "@/lib/useAsync"
import { cn, formatINR } from "@/lib/utils"

/** Button that is disabled with an explanatory tooltip when the role isn't allowed. */
function Gated({ allowed, reason, children }: { allowed: boolean; reason: string; children: ReactNode }) {
  if (allowed) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex cursor-not-allowed">
          <span className="pointer-events-none">{children}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <Lock className="mr-1 inline size-3" />
        {reason}
      </TooltipContent>
    </Tooltip>
  )
}

const BUILTIN = ["name", "category", "unit", "qty", "unitPrice", "reorderLevel"]

export function ReportsPage() {
  const { config, role, siteApi, changeTick, notifyChange } = useSite()
  const { user } = useAuth()
  const canExport = roleAtLeast(role, "Manager")
  const isAdmin = role === "Admin"
  const has = (m: string) => config.modules.includes(m as never)
  const { data: inv, reload } = useAsync(() => siteApi.get<{ items: InventoryItem[]; linked: boolean; sourceName: string; fields: FieldDef[] }>("inventory"), [changeTick])
  const linked = !!inv?.linked
  const canImport = isAdmin && !linked
  const [exporting, setExporting] = useState<string | null>(null)
  const [parsed, setParsed] = useState<(ParsedImport & { fileName: string }) | null>(null)
  const [parsing, setParsing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const datasets = [
    { id: "inventory", label: "Inventory register", desc: `All stock items with calculated totals${linked ? ` (${inv?.sourceName})` : ""}.` },
    has("request") && { id: "requests", label: "Requests", desc: "Every request with status and decision." },
    has("assignment") && { id: "assignments", label: "Assignments & consumption", desc: "Issued, used, returned and remaining per line." },
    has("pcb-repair") && { id: "repairs", label: "Repair log", desc: "PCB repair jobs with status and parts." },
  ].filter(Boolean) as { id: string; label: string; desc: string }[]

  async function doExport(ids: string[], key: string) {
    setExporting(key)
    try {
      const sets = await Promise.all(ids.map((id) => siteApi.get<ExportDataset>("reports/export", { dataset: id })))
      const stamp = new Date().toISOString().slice(0, 10)
      await exportWorkbook(sets, {
        filename: `${config.slug}-${ids.length > 1 ? "all-reports" : ids[0]}-${stamp}.xlsx`,
        siteName: config.name,
        author: user?.name ?? "OpsHub",
        color: config.theme.primary,
      })
      toast.success("Excel file downloaded", { description: `${sets.map((s) => `${s.label} (${s.rows.length} rows)`).join(", ")}` })
    } catch (e) {
      toastError(e, "Export failed")
    } finally {
      setExporting(null)
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setParsing(true)
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error("Please choose an .xlsx file")
      const result = await parseInventoryFile(file)
      if (result.missingColumns.includes("name")) throw new Error('Could not find an "Item" column in the first row')
      if (!result.rows.length) throw new Error("No data rows found below the header")
      setParsed({ ...result, fileName: file.name })
      toast.info(`Read ${result.rows.length} rows from ${file.name}`, { description: "Review the preview, then confirm the import." })
    } catch (e) {
      toast.error("Couldn't read that file", { description: errorMessage(e) })
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const importFields = fieldsFor(config, "inventory").filter((f) => BUILTIN.includes(f.key))
  const preview = (parsed?.rows ?? []).map((r) => {
    const errs = validateValues(importFields, r as unknown as Record<string, unknown>)
    const existing = inv?.items.find((i) => i.name.toLowerCase() === r.name.toLowerCase())
    return { row: r, error: Object.values(errs)[0], existing }
  })
  const bad = preview.filter((p) => p.error).length
  const updates = preview.filter((p) => !p.error && p.existing).length
  const creates = preview.filter((p) => !p.error && !p.existing).length

  return (
    <div>
      <PageHeader title="Excel reports" icon={<FileSpreadsheet />} description="Excel export for Managers & Admins. Excel import of inventory for Admins, with a preview before anything changes." />

      {!canExport && (
        <div className="mb-5 flex items-center gap-2 rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Info className="size-4" /> Your role here is <b>{role}</b>. Export needs Manager or Admin; import needs Admin.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Download className="size-4 text-primary" /> Export to Excel
              </CardTitle>
              <CardDescription>Generated in your browser with ExcelJS — nothing leaves this device.</CardDescription>
            </div>
            <Gated allowed={canExport} reason={`Export is available to Managers and Admins. Your role on ${config.name} is ${role}.`}>
              <Button size="sm" disabled={!canExport || !!exporting} onClick={() => doExport(datasets.map((d) => d.id), "all")}>
                {exporting === "all" ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} All sheets
              </Button>
            </Gated>
          </CardHeader>
          <CardContent className="space-y-2">
            {datasets.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2.5">
                <FileSpreadsheet className="size-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{d.desc}</p>
                </div>
                <Gated allowed={canExport} reason={`Export is available to Managers and Admins. Your role on ${config.name} is ${role}.`}>
                  <Button size="sm" variant="outline" disabled={!canExport || !!exporting} onClick={() => doExport([d.id], d.id)}>
                    {exporting === d.id ? <Loader2 className="animate-spin" /> : <Download />} .xlsx
                  </Button>
                </Gated>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="size-4 text-primary" /> Import inventory
            </CardTitle>
            <CardDescription>
              Upload an .xlsx with columns Item, Category, Unit, Qty, Unit Price, Reorder Level. Matching item names are updated, new names are added. A
              single invalid row rejects the whole import.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <div
              className={cn(
                "flex flex-col items-center justify-center rounded-[var(--radius)] border-2 border-dashed px-4 py-8 text-center",
                canImport ? "border-primary/30 bg-primary/5" : "bg-muted/40",
              )}
              onDragOver={(e) => canImport && e.preventDefault()}
              onDrop={(e) => {
                if (!canImport) return
                e.preventDefault()
                onFile(e.dataTransfer.files?.[0])
              }}
            >
              <FileUp className={cn("mb-2 size-8", canImport ? "text-primary" : "text-muted-foreground")} />
              <p className="text-sm font-medium">{canImport ? "Drop an .xlsx file here" : "Import locked"}</p>
              <p className="mb-3 text-xs text-muted-foreground">
                {linked ? `Inventory is linked from ${inv?.sourceName} — import it there.` : canImport ? "or choose a file" : "Only Admins can import inventory."}
              </p>
              <Gated
                allowed={canImport}
                reason={linked ? `This unit uses ${inv?.sourceName}'s inventory. Import from that unit instead.` : `Import is Admin-only. Your role on ${config.name} is ${role}.`}
              >
                <Button disabled={!canImport || parsing} onClick={() => fileRef.current?.click()}>
                  {parsing ? <Loader2 className="animate-spin" /> : <Upload />} Choose file
                </Button>
              </Gated>
            </div>
            <Button variant="link" size="sm" className="px-0" onClick={() => downloadTemplate(fieldsFor(config, "inventory").find((f) => f.key === "category")?.options ?? [])}>
              <Download /> Download a blank template
            </Button>
          </CardContent>
        </Card>
      </div>

      {parsed && (
        <Card className="mt-6">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Import preview — {parsed.fileName}</CardTitle>
              <CardDescription>
                Sheet "{parsed.sheetName}": {preview.length} rows · <span className="text-emerald-700">{creates} new</span> ·{" "}
                <span className="text-sky-700">{updates} updates</span> · <span className={bad ? "font-semibold text-red-600" : ""}>{bad} with errors</span>
                {parsed.missingColumns.length > 0 && <> · missing columns: {parsed.missingColumns.join(", ")}</>}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setParsed(null)}>
                <X /> Discard
              </Button>
              <Button disabled={bad > 0} onClick={() => setConfirmOpen(true)}>
                <Upload /> Import {preview.length} rows
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto rounded-[var(--radius)] border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted">
                  <TableRow>
                    <TableHead className="pl-3">Row</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((p, i) => (
                    <TableRow key={i} className={p.error ? "bg-red-50" : undefined}>
                      <TableCell className="pl-3 text-xs text-muted-foreground">{i + 2}</TableCell>
                      <TableCell className="font-medium">{p.row.name}</TableCell>
                      <TableCell>{p.row.category || "—"}</TableCell>
                      <TableCell>{p.row.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number.isFinite(p.row.qty) ? p.row.qty : "—"}
                        {p.existing && Number.isFinite(p.row.qty) && p.existing.qty !== p.row.qty && (
                          <span className="ml-1 text-xs text-muted-foreground">(was {p.existing.qty})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{Number.isFinite(p.row.unitPrice) ? formatINR(p.row.unitPrice) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number.isFinite(p.row.qty * p.row.unitPrice) ? formatINR(p.row.qty * p.row.unitPrice) : "—"}</TableCell>
                      <TableCell className="text-xs">
                        {p.error ? (
                          <span className="font-medium text-red-600">{p.error}</span>
                        ) : p.existing ? (
                          <span className="text-sky-700">Update</span>
                        ) : (
                          <span className="text-emerald-700">New item</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {bad > 0 && <p className="mt-2 text-sm text-red-600">Fix the {bad} highlighted row(s) in Excel and upload again — import is all-or-nothing.</p>}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Import ${preview.length} rows into ${config.name}?`}
        description={`${creates} new items will be added and ${updates} existing items overwritten (qty, price, reorder level). This changes live stock.`}
        confirmLabel="Import now"
        onConfirm={async () => {
          try {
            const res = await siteApi.post<{ created: number; updated: number }>("inventory/import", { rows: parsed!.rows })
            toast.success("Inventory imported", { description: `${res.created} added · ${res.updated} updated` })
            setParsed(null)
            reload()
            notifyChange()
          } catch (e) {
            toastError(e, "Import rejected")
            throw e
          }
        }}
      />
    </div>
  )
}
