import { useState } from "react"
import { Calculator, Lock, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { numericFieldKeys, slugKey } from "@/lib/fields"
import { computeFormula, validateFormula } from "@/lib/formula"
import type { FieldDef, FieldType } from "@/lib/types"
import { cn } from "@/lib/utils"

const TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "date", label: "Date" },
  { value: "calculated", label: "Calculated" },
]

/** Formula errors for a field list — used by the builder to block saving. */
export function fieldListErrors(fields: FieldDef[]): string[] {
  const errs: string[] = []
  const keys = new Set<string>()
  for (const f of fields) {
    if (!f.label.trim()) errs.push("Every field needs a label")
    if (!f.key) errs.push(`"${f.label}" needs a valid name`)
    else if (keys.has(f.key)) errs.push(`Two fields are called "${f.key}"`)
    keys.add(f.key)
    if (f.type === "calculated") {
      const e = validateFormula(f.formula ?? "", numericFieldKeys(fields, f.key))
      if (e) errs.push(`${f.label}: ${e}`)
    }
    if (f.type === "select" && !(f.options ?? []).length) errs.push(`${f.label}: add at least one option`)
  }
  return errs
}

/** Comma-separated options; edited as free text and parsed when the input loses focus. */
function OptionsInput({ options, onCommit }: { options: string[]; onCommit: (o: string[]) => void }) {
  const joined = options.join(", ")
  const [text, setText] = useState(joined)
  const [prev, setPrev] = useState(joined)
  if (prev !== joined) {
    setPrev(joined)
    setText(joined)
  }
  const commit = () => onCommit(text.split(",").map((s) => s.trim()).filter(Boolean))
  return (
    <Input
      className="h-7 text-xs"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      placeholder="Comma-separated options"
    />
  )
}

export function FieldEditor({ fields, onChange }: { fields: FieldDef[]; onChange: (fields: FieldDef[]) => void }) {
  const [newLabel, setNewLabel] = useState("")
  const [newType, setNewType] = useState<FieldType>("text")
  const update = (i: number, patch: Partial<FieldDef>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  const numeric = numericFieldKeys(fields)
  const sample = Object.fromEntries(numeric.map((k, i) => [k, [10, 250, 4, 2][i % 4]]))

  function add() {
    const label = newLabel.trim()
    if (!label) return
    let key = slugKey(label) || "field"
    while (fields.some((f) => f.key === key)) key += "2"
    const f: FieldDef = { key, label, type: newType, showInTable: false }
    if (newType === "select") f.options = ["Option A", "Option B"]
    if (newType === "calculated") f.formula = numeric.slice(0, 2).join(" * ") || "0"
    if (newType === "number") f.min = 0
    onChange([...fields, f])
    setNewLabel("")
    setNewType("text")
  }

  return (
    <div className="space-y-2">
      {fields.map((f, i) => {
        const formulaErr = f.type === "calculated" ? validateFormula(f.formula ?? "", numericFieldKeys(fields, f.key)) : null
        return (
          <div key={f.key + i} className={cn("space-y-2 rounded-lg border bg-white p-2.5", formulaErr && "border-red-300 bg-red-50/50")}>
            <div className="flex items-center gap-1.5">
              <Input className="h-7 flex-1 text-sm" value={f.label} onChange={(e) => update(i, { label: e.target.value })} aria-label="Field label" />
              <Select value={f.type} disabled={f.builtin} onValueChange={(v) => update(i, { type: v as FieldType, ...(v === "calculated" && !f.formula ? { formula: "0" } : {}), ...(v === "select" && !f.options ? { options: ["Option A"] } : {}) })}>
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {f.builtin ? (
                <span className="flex size-7 items-center justify-center text-slate-400" title="Built-in field — can be relabelled but not removed">
                  <Lock className="size-3.5" />
                </span>
              ) : (
                <Button size="icon-sm" variant="ghost" className="text-red-600" onClick={() => onChange(fields.filter((_, j) => j !== i))} aria-label={`Remove ${f.label}`}>
                  <Trash2 />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <code className="rounded bg-slate-100 px-1">{f.key}</code>
              {f.type !== "calculated" && (
                <label className="flex items-center gap-1">
                  <Switch size="sm" checked={!!f.required} disabled={f.builtin && f.required} onCheckedChange={(v) => update(i, { required: v })} /> Required
                </label>
              )}
              <label className="flex items-center gap-1">
                <Switch size="sm" checked={!!f.showInTable} onCheckedChange={(v) => update(i, { showInTable: v })} /> In table
              </label>
            </div>
            {f.type === "select" && <OptionsInput options={f.options ?? []} onCommit={(options) => update(i, { options })} />}
            {f.type === "calculated" && (
              <div className="space-y-1">
                <div className="relative">
                  <Calculator className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    className="h-7 pl-7 font-mono text-xs"
                    value={f.formula ?? ""}
                    onChange={(e) => update(i, { formula: e.target.value })}
                    placeholder="e.g. qty * unitPrice"
                    aria-invalid={!!formulaErr}
                  />
                </div>
                {formulaErr ? (
                  <p className="text-[11px] text-red-600">{formulaErr}</p>
                ) : (
                  <p className="text-[11px] text-emerald-700">
                    ✓ Valid · e.g. {numericFieldKeys(fields, f.key).filter((k) => (f.formula ?? "").includes(k)).map((k) => `${k}=${sample[k] ?? 0}`).join(", ")} →{" "}
                    {computeFormula(f.formula, sample).toLocaleString("en-IN")}
                  </p>
                )}
                <p className="text-[11px] text-slate-400">Allowed: + − × ÷ ( ) and {numericFieldKeys(fields, f.key).join(", ") || "no numeric fields yet"}</p>
              </div>
            )}
          </div>
        )
      })}
      <div className="flex items-center gap-1.5 rounded-lg border border-dashed p-2">
        <Input className="h-7 flex-1 text-sm" placeholder="New field label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Select value={newType} onValueChange={(v) => setNewType(v as FieldType)}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="icon-sm" onClick={add} disabled={!newLabel.trim()} aria-label="Add field">
          <Plus />
        </Button>
      </div>
    </div>
  )
}
