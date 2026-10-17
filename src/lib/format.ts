import type { FieldDef, MaterialRequest } from "./types"

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

export function requestSummary(r: MaterialRequest) {
  if (r.type === "repair") return `${r.repair?.meterId} — ${r.repair?.fault}`
  return r.lines.map((l) => `${l.itemName} × ${l.qty.toLocaleString("en-IN")}`).join(", ")
}
