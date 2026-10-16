import { Skeleton } from "@/components/ui/skeleton"

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 rounded-[var(--radius)] border bg-card p-4">
      <div className="flex gap-4 pb-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-[var(--radius)]" />
      ))}
    </div>
  )
}
