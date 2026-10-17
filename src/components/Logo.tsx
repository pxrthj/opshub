import { cn } from "@/lib/utils"

export function Logo({
  className,
  compact,
  size = "md",
}: {
  className?: string
  compact?: boolean
  size?: "sm" | "md" | "lg"
}) {
  const iconSizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-14 w-14",
  }

  const textSizes = {
    sm: "text-sm tracking-wider",
    md: "text-base tracking-widest",
    lg: "text-xl tracking-[0.2em]",
  }

  return (
    <div className={cn("inline-flex items-center gap-2.5 font-bold select-none", className)}>
      <img
        src="/plexus-icon.png"
        alt="Plexus"
        className={cn("object-contain transition-transform duration-200 hover:scale-105", iconSizes[size])}
      />
      {!compact && (
        <span className={cn("font-extrabold text-foreground", textSizes[size])}>
          PLE<span className="text-primary">X</span>US
        </span>
      )}
    </div>
  )
}

