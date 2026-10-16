import { cn } from "@/lib/utils"

const STYLES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Approved: "bg-sky-50 text-sky-700 ring-sky-200",
  Rejected: "bg-red-50 text-red-700 ring-red-200",
  Assigned: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Received: "bg-slate-100 text-slate-700 ring-slate-200",
  "In Repair": "bg-amber-50 text-amber-700 ring-amber-200",
  Fixed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Scrapped: "bg-red-50 text-red-700 ring-red-200",
  Returned: "bg-violet-50 text-violet-700 ring-violet-200",
  Live: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Low: "bg-red-50 text-red-700 ring-red-200",
  "Low stock": "bg-red-50 text-red-700 ring-red-200",
  OK: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Urgent: "bg-red-50 text-red-700 ring-red-200",
  Normal: "bg-slate-50 text-slate-600 ring-slate-200",
  Low_priority: "bg-slate-50 text-slate-500 ring-slate-200",
  Unused: "bg-sky-50 text-sky-700 ring-sky-200",
  Repaired: "bg-emerald-50 text-emerald-700 ring-emerald-200",
}

/** Everyday words shown to people; the stored status values stay the same. */
const DISPLAY: Record<string, string> = {
  Pending: "Waiting",
  Assigned: "Handed over",
  "In Repair": "Being repaired",
}

// eslint-disable-next-line react-refresh/only-export-components
export function statusLabel(status: string) {
  return DISPLAY[status] ?? status
}

export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  const pulse = status === "Pending" || status === "In Repair" ? "animate-pulse" : ""
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        STYLES[status] ?? "bg-slate-50 text-slate-600 ring-slate-200",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", pulse)} />
      {label ?? statusLabel(status)}
    </span>
  )
}
