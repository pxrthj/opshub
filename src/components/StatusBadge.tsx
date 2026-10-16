import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Colour per status, applied on top of shadcn's outline Badge.
const TONES: Record<string, string> = {
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  Approved: "border-sky-200 bg-sky-50 text-sky-700",
  Rejected: "border-red-200 bg-red-50 text-red-700",
  Assigned: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Received: "border-slate-200 bg-slate-100 text-slate-700",
  "In Repair": "border-amber-200 bg-amber-50 text-amber-700",
  Fixed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Scrapped: "border-red-200 bg-red-50 text-red-700",
  Returned: "border-violet-200 bg-violet-50 text-violet-700",
  Urgent: "border-red-200 bg-red-50 text-red-700",
  Normal: "border-slate-200 bg-slate-50 text-slate-600",
  Unused: "border-sky-200 bg-sky-50 text-sky-700",
  Repaired: "border-emerald-200 bg-emerald-50 text-emerald-700",
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
  return (
    <Badge variant="outline" className={cn(TONES[status] ?? "border-slate-200 bg-slate-50 text-slate-600", className)}>
      {label ?? statusLabel(status)}
    </Badge>
  )
}
