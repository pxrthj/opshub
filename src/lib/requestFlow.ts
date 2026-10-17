import type { MaterialRequest } from "./types"

/**
 * How a request travels between offices.
 *
 *  - A member asks. The request goes to THEIR OWN office's managers only.
 *  - If the office gets its stock from another office, that manager can "send it on".
 *    Only then does the other office's manager see it and decide.
 *  - A member can never send anything straight to another office's manager.
 *
 * Repairs and requests for an office's own stock never leave the office.
 */

/** True when the stock for this request comes from a different office than the one that asked. */
export function isSupplied(r: MaterialRequest): boolean {
  return r.type === "material" && !!r.targetSiteId && !!r.originSiteId && r.targetSiteId !== r.originSiteId
}

export function isSentOn(r: MaterialRequest): boolean {
  return !!r.forwardedAt
}

/** What an office's manager can do with a waiting request, or null if it is not theirs to act on. */
export type ManagerAction = "decide" | "send-on" | "waiting-for-other-office"

export function managerAction(r: MaterialRequest, siteId: string): ManagerAction | null {
  if (r.status !== "Pending") return null
  const origin = r.originSiteId ?? siteId
  if (!isSupplied(r)) return origin === siteId ? "decide" : null
  if (siteId === origin) return isSentOn(r) ? "waiting-for-other-office" : "send-on"
  if (siteId === r.targetSiteId) return isSentOn(r) ? "decide" : null
  return null
}

/** Does this request need something from a manager of this office right now? */
export function needsMyManager(r: MaterialRequest, siteId: string): boolean {
  const a = managerAction(r, siteId)
  return a === "decide" || a === "send-on"
}

/** Plain-words status for the person who asked. */
export function requestStatusLabel(r: MaterialRequest): string | null {
  if (r.status !== "Pending" || !isSupplied(r)) return null
  return isSentOn(r) ? `With ${r.targetSiteName ?? "the other office"}` : "With your manager"
}
