import type { Assignment, AssignmentView, SiteConfig, SiteData } from "@/lib/types"

export function stockSiteOf(cfg: SiteConfig): string {
  return cfg.workflow.stockSourceSiteId || cfg.siteId
}

export function isLinkedInventory(cfg: SiteConfig) {
  return !!cfg.workflow.stockSourceSiteId && cfg.workflow.stockSourceSiteId !== cfg.siteId
}

/** remaining = assigned − used − returned, per line */
export function assignmentView(data: SiteData, a: Assignment): AssignmentView {
  return {
    ...a,
    lines: a.lines.map((l) => {
      const used = data.consumption
        .filter((c) => c.assignmentId === a.id && c.itemId === l.itemId)
        .reduce((s, c) => s + c.qty, 0)
      const returned = data.returns
        .filter((r) => r.source === "assignment" && r.refId === a.id && r.itemId === l.itemId)
        .reduce((s, r) => s + r.qty, 0)
      return { ...l, used, returned, remaining: l.qty - used - returned }
    }),
  }
}

export function byNewest<T extends { createdAt?: string; date?: string; receivedAt?: string }>(a: T, b: T) {
  const ka = a.createdAt ?? a.date ?? a.receivedAt ?? ""
  const kb = b.createdAt ?? b.date ?? b.receivedAt ?? ""
  return kb.localeCompare(ka)
}

export function weekBuckets(weeks: number) {
  const out: { start: number; end: number; label: string }[] = []
  const now = new Date()
  now.setHours(23, 59, 59, 999)
  for (let i = weeks - 1; i >= 0; i--) {
    const end = now.getTime() - i * 7 * 86_400_000
    const start = end - 7 * 86_400_000
    const label = new Date(start + 86_400_000).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    out.push({ start, end, label })
  }
  return out
}
