import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// Only three colours carry meaning: amber = waiting, green = good, red = problem. Everything else is grey.
const WAITING = "border-amber-200 bg-amber-50 text-amber-800"
const GOOD = "border-emerald-200 bg-emerald-50 text-emerald-800"
const BAD = "border-red-200 bg-red-50 text-red-800"

const TONES: Record<string, string> = {
  Pending: WAITING,
  "In Repair": WAITING,
  Approved: GOOD,
  Assigned: GOOD,
  Fixed: GOOD,
  Repaired: GOOD,
  Rejected: BAD,
  Scrapped: BAD,
  Urgent: BAD,
}

/** Everyday words shown to people; the stored status values stay the same. */
const DISPLAY: Record<string, string> = {
  Pending: "Waiting",
  Assigned: "Given out",
  "In Repair": "Being repaired",
  Received: "Received",
  Returned: "Given back",
  Unused: "Not used",
}

// eslint-disable-next-line react-refresh/only-export-components
export function statusLabel(status: string) {
  return DISPLAY[status] ?? status
}

export function StatusBadge({ status, className, label }: { status: string; className?: string; label?: string }) {
  return (
    <Badge variant="outline" className={cn(TONES[status] ?? "text-muted-foreground", className)}>
      {label ?? statusLabel(status)}
    </Badge>
  )
}
