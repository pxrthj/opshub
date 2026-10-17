import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shows, in plain words, who a request passes through: you, your own manager, and (when the stock
 * is kept in another office) that office's manager. Members only ever talk to their own manager.
 */
export function RequestRoute({ officeName, supplierName, className }: { officeName: string; supplierName?: string | null; className?: string }) {
  const steps = [
    { who: "You", what: "ask" },
    { who: `Your manager`, what: officeName },
    ...(supplierName ? [{ who: `${supplierName} manager`, what: "decides and gives out" }] : []),
  ]
  if (!supplierName) steps[1] = { who: "Your manager", what: "decides" }
  return (
    <ol className={cn("flex flex-wrap items-center gap-x-2 gap-y-2 text-sm", className)} aria-label="Where your request goes">
      {steps.map((s, i) => (
        <li key={s.who} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
          <span className="rounded-lg border bg-card px-3 py-1.5">
            <span className="block leading-tight font-medium">{s.who}</span>
            <span className="block text-xs text-muted-foreground">{s.what}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
