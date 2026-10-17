import type { SiteTheme } from "./types"

// Turns a site's theme into shadcn-style CSS variables.

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return [37, 99, 235]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")
}

export function mix(hexA: string, hexB: string, weightB: number) {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  return rgbToHex(a[0] + (b[0] - a[0]) * weightB, a[1] + (b[1] - a[1]) * weightB, a[2] + (b[2] - a[2]) * weightB)
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function readableOn(hex: string) {
  return luminance(hex) > 0.45 ? "#0f172a" : "#ffffff"
}

export const DEFAULT_THEME: SiteTheme = {
  primary: "#171717",
  accent: "#f5f5f5",
  background: "#fafafa",
  radius: 0.625,
  sidebar: "light",
}

export function themeToCssVars(theme: SiteTheme): Record<string, string> {
  const p = theme.primary
  const fg = "#0f172a"
  const vars: Record<string, string> = {
    "--primary": p,
    "--primary-foreground": readableOn(p),
    "--ring": mix(p, "#ffffff", 0.35),
    "--accent": theme.accent,
    "--accent-foreground": mix(p, "#000000", 0.35),
    "--background": theme.background,
    "--foreground": fg,
    "--card": "#ffffff",
    "--card-foreground": fg,
    "--popover": "#ffffff",
    "--popover-foreground": fg,
    "--secondary": mix(theme.background, p, 0.07),
    "--secondary-foreground": mix(p, "#000000", 0.4),
    "--muted": mix(theme.background, "#64748b", 0.07),
    "--muted-foreground": "#64748b",
    "--border": mix(theme.background, p, 0.14),
    "--input": mix(theme.background, p, 0.18),
    "--radius": `${theme.radius}rem`,
    "--chart-1": p,
    "--chart-2": mix(p, "#000000", 0.35),
    "--chart-3": mix(p, "#ffffff", 0.45),
    "--chart-4": "#94a3b8",
    "--chart-5": "#f59e0b",
  }
  if (theme.sidebar === "solid") {
    vars["--sidebar"] = mix(p, "#000000", 0.25)
    vars["--sidebar-foreground"] = "#e2e8f0"
    vars["--sidebar-accent"] = mix(p, "#ffffff", 0.12)
    vars["--sidebar-accent-foreground"] = "#ffffff"
    vars["--sidebar-border"] = mix(p, "#000000", 0.35)
    vars["--sidebar-muted"] = mix(p, "#ffffff", 0.55)
  } else if (theme.sidebar === "tinted") {
    vars["--sidebar"] = mix("#ffffff", p, 0.08)
    vars["--sidebar-foreground"] = mix(p, "#000000", 0.55)
    vars["--sidebar-accent"] = p
    vars["--sidebar-accent-foreground"] = readableOn(p)
    vars["--sidebar-border"] = mix("#ffffff", p, 0.18)
    vars["--sidebar-muted"] = mix(p, "#ffffff", 0.2)
  } else {
    vars["--sidebar"] = "#ffffff"
    vars["--sidebar-foreground"] = "#334155"
    vars["--sidebar-accent"] = theme.accent
    vars["--sidebar-accent-foreground"] = mix(p, "#000000", 0.25)
    vars["--sidebar-border"] = mix("#ffffff", p, 0.12)
    vars["--sidebar-muted"] = "#94a3b8"
  }
  return vars
}

/** Apply theme vars to <html> so portalled content (dialogs, menus, toasts) is themed too. Returns a cleanup fn. */
export function applyTheme(theme: SiteTheme): () => void {
  const root = document.documentElement
  const vars = themeToCssVars(theme)
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  return () => {
    for (const k of Object.keys(vars)) root.style.removeProperty(k)
  }
}

export const THEME_SWATCHES = ["#1e40af", "#ea580c", "#15803d", "#7c3aed", "#0f766e", "#be123c", "#0369a1", "#4f46e5", "#a16207", "#334155"]
