import { useEffect, type ReactNode } from "react"
import { applyTheme, DEFAULT_THEME } from "@/lib/theme"
import type { SiteTheme } from "@/lib/types"

/** Applies a theme's CSS variables to <html> while mounted (so portals are themed too). */
export function ThemeScope({ theme = DEFAULT_THEME, children }: { theme?: SiteTheme; children: ReactNode }) {
  const key = JSON.stringify(theme)
  useEffect(() => applyTheme(JSON.parse(key) as SiteTheme), [key])
  return <>{children}</>
}
