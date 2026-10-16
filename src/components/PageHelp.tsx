import { Lightbulb } from "lucide-react"
import type { Role } from "@/lib/types"

/** A short, plain-language “What is this page?” strip shown at the top of a page. */
export function PageHelp({ what, role, can }: { what: string; role?: Role; can?: string }) {
  return (
    <div className="mb-5 flex gap-3 rounded-[var(--radius)] border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="space-y-0.5">
        <p className="text-foreground">
          <span className="font-semibold">What is this page? </span>
          {what}
        </p>
        {role && can && (
          <p className="text-muted-foreground">
            You are a <span className="font-medium text-foreground">{role}</span> here, so you can {can}
          </p>
        )}
      </div>
    </div>
  )
}
