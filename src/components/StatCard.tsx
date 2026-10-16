import type { LucideIcon } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  onClick,
}: {
  label: string
  value: string | number
  hint?: string
  icon: LucideIcon
  tone?: "primary" | "warning" | "danger" | "success" | "muted"
  onClick?: () => void
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
    success: "bg-emerald-100 text-emerald-700",
    muted: "bg-slate-100 text-slate-600",
  }
  return (
    <Card
      className={cn("gap-0 p-4 transition-shadow", onClick && "cursor-pointer hover:shadow-md hover:ring-primary/30")}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)]", tones[tone])}>
          <Icon className="size-4.5" />
        </div>
      </div>
    </Card>
  )
}
