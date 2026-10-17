import { Calculator } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { FieldErrors } from "@/lib/fields"
import { formatFieldValue } from "@/lib/format"
import { computeFormula } from "@/lib/formula"
import type { FieldDef } from "@/lib/types"
import { cn } from "@/lib/utils"

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
                <Badge variant="secondary" className="font-normal">
                  <Calculator /> {f.formula}
                </Badge>
              )}
            </Label>
            {f.type === "calculated" ? (
              <Input id={id} readOnly tabIndex={-1} value={formatFieldValue(f, computeFormula(f.formula, values))} className="bg-muted font-medium tabular-nums" />
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
