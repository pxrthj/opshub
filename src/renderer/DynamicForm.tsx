import { Calculator } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FieldErrors } from "@/lib/fields"
import { computeFormula } from "@/lib/formula"
import type { FieldDef } from "@/lib/types"
import { cn } from "@/lib/utils"

export function formatFieldValue(f: FieldDef, v: unknown): string {
  if (v === undefined || v === null || v === "") return "—"
  if (f.type === "calculated" || f.type === "number") {
    const raw = Number(v)
    if (!Number.isFinite(raw)) return "—"
    const n = raw === 0 ? 0 : raw // avoid "-0"
    const money = /price|cost|total|value|₹/i.test(f.key + f.label)
    return money ? "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
  }
  if (f.type === "date") return new Date(String(v)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  return String(v)
}

/**
 * Generic form renderer: draws any FieldDef[] from a site's config.
 * Calculated fields are read-only and recompute live from the other values.
 */
export function DynamicForm({
  fields,
  values,
  onChange,
  errors = {},
  disabled = [],
  className,
}: {
  fields: FieldDef[]
  values: Record<string, unknown>
  onChange: (values: Record<string, unknown>) => void
  errors?: FieldErrors
  disabled?: string[]
  className?: string
}) {
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v })
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {fields.map((f) => {
        const err = errors[f.key]
        const id = `f_${f.key}`
        const raw = values[f.key]
        const isDisabled = disabled.includes(f.key)
        return (
          <div key={f.key} className={cn("space-y-1.5", f.type === "text" && f.key === "name" && "sm:col-span-2")}>
            <Label htmlFor={id} className="flex items-center gap-1">
              {f.label}
              {f.required && f.type !== "calculated" && <span className="text-destructive">*</span>}
              {f.type === "calculated" && (
                <span className="ml-1 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-px font-mono text-[10px] font-normal text-primary">
                  <Calculator className="size-3" /> = {f.formula}
                </span>
              )}
            </Label>
            {f.type === "calculated" ? (
              <div
                id={id}
                className="flex h-8 items-center rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2.5 text-sm font-semibold text-primary tabular-nums"
                aria-readonly
              >
                {formatFieldValue(f, computeFormula(f.formula, values))}
              </div>
            ) : f.type === "select" ? (
              <Select value={raw ? String(raw) : undefined} onValueChange={(v) => set(f.key, v)} disabled={isDisabled}>
                <SelectTrigger id={id} className="w-full" aria-invalid={!!err}>
                  <SelectValue placeholder={`Select ${f.label.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {(f.options ?? []).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                min={f.type === "number" ? f.min : undefined}
                step={f.type === "number" ? "any" : undefined}
                value={raw === undefined || raw === null ? "" : String(raw)}
                onChange={(e) => set(f.key, e.target.value)}
                aria-invalid={!!err}
                disabled={isDisabled}
              />
            )}
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
        )
      })}
    </div>
  )
}
