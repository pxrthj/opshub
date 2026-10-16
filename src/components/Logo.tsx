import { Zap } from "lucide-react"
import { cn } from "@/lib/utils"

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <div className="flex size-8 items-center justify-center rounded-lg bg-slate-900 text-yellow-400 shadow-sm">
        <Zap className="size-4 fill-current" />
      </div>
      {!compact && (
        <span className="text-base text-slate-900">
          Ops<span className="text-indigo-600">Hub</span>
        </span>
      )}
    </div>
  )
}
