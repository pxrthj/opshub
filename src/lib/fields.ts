import { computeFormula, validateFormula } from "./formula"
import type { FieldDef } from "./types"

// Generic, config-driven validation for any record described by FieldDef[].
// Shared by the form renderer (UI) and the mock API (server-side re-validation).

export type FieldErrors = Record<string, string>

export function validateValues(fields: FieldDef[], values: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {}
  for (const f of fields) {
    if (f.type === "calculated") continue
    const v = values[f.key]
    const empty = v === undefined || v === null || String(v).trim() === ""
    if (empty) {
      if (f.required) errors[f.key] = `${f.label} is required`
      continue
    }
    if (f.type === "number") {
      const n = Number(v)
      if (!Number.isFinite(n)) errors[f.key] = `${f.label} must be a number`
      else if (f.min !== undefined && n < f.min) errors[f.key] = f.min === 0 ? `${f.label} can't be negative` : `${f.label} must be ≥ ${f.min}`
    }
    if (f.type === "select" && f.options?.length && !f.options.includes(String(v))) {
      errors[f.key] = `${f.label} must be one of: ${f.options.join(", ")}`
    }
    if (f.type === "date" && Number.isNaN(Date.parse(String(v)))) errors[f.key] = `${f.label} must be a valid date`
  }
  return errors
}

/** Coerce raw form values to their types and fill calculated fields. */
export function normalizeValues(fields: FieldDef[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    const v = values[f.key]
    if (f.type === "number") out[f.key] = v === "" || v === undefined || v === null ? null : Number(v)
    else if (f.type !== "calculated") out[f.key] = v === undefined || v === null ? "" : String(v).trim()
  }
  for (const f of fields) {
    if (f.type === "calculated") out[f.key] = computeFormula(f.formula, { ...values, ...out })
  }
  return out
}

export function numericFieldKeys(fields: FieldDef[], exceptKey?: string) {
  return fields.filter((f) => (f.type === "number" || f.type === "calculated") && f.key !== exceptKey).map((f) => f.key)
}

export function slugKey(label: string) {
  const words = label
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ""
  const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("")
  return /^[0-9]/.test(key) ? "f" + key : key
}

/** Formula errors for a field list — used by the builder to block saving. */
export function fieldListErrors(fields: FieldDef[]): string[] {
  const errs: string[] = []
  const keys = new Set<string>()
  for (const f of fields) {
    if (!f.label.trim()) errs.push("Every field needs a name")
    if (!f.key) errs.push(`"${f.label}" needs a different name`)
    else if (keys.has(f.key)) errs.push(`Two fields have the same name ("${f.label}")`)
    keys.add(f.key)
    if (f.type === "calculated") {
      const e = validateFormula(f.formula ?? "", numericFieldKeys(fields, f.key))
      if (e) errs.push(`${f.label}: ${e}`)
    }
    if (f.type === "select" && !(f.options ?? []).length) errs.push(`${f.label}: add at least one choice`)
  }
  return errs
}
