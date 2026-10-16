import type { Assignment, Database, MaterialRequest, SiteData, User } from "@/lib/types"
import { uid } from "@/lib/utils"
import { conflict, notFound } from "./errors"

export function nextCode(existing: { code: string }[], prefix: string, start: number) {
  const nums = existing
    .map((e) => Number(e.code.split("-").pop()))
    .filter((n) => Number.isFinite(n))
  return `${prefix}-${Math.max(start, ...nums) + 1}`
}

export function stockData(db: Database, stockSiteId: string): SiteData {
  const data = db.data[stockSiteId]
  if (!data) throw notFound(`Stock source site "${stockSiteId}" not found`)
  return data
}

/**
 * ALL-OR-NOTHING material issue: check stock, decrement it and create the assignment together.
 *
 * Phase 1 validates EVERY line before anything is touched; if any item is short the function
 * throws and no row is changed. Phase 2 applies all writes. (The router additionally runs it on
 * a private copy of the DB and commits only on success.)
 *
 * In the Express + Postgres backend this function maps 1:1 to a single transaction:
 *   BEGIN;
 *     SELECT id, qty FROM inventory
 *       WHERE site_id = $stockSiteId AND id = ANY($itemIds) FOR UPDATE;   -- lock rows
 *     -- if any qty < requested  ->  ROLLBACK; respond 409 with the shortage list
 *     UPDATE inventory SET qty = qty - $n WHERE site_id = $stockSiteId AND id = $itemId;  -- per line
 *     INSERT INTO assignments (site_id, request_id, assignee_id, ...) VALUES (...);
 *     INSERT INTO assignment_lines (...) VALUES (...);
 *     UPDATE requests SET status = 'Assigned', assignment_id = $id WHERE site_id = $siteId AND id = $requestId;
 *   COMMIT;
 */
export function assignMaterialTransaction(
  db: Database,
  args: { siteId: string; stockSiteId: string; request: MaterialRequest; actor: User },
): Assignment {
  const { siteId, stockSiteId, request, actor } = args
  const store = stockData(db, stockSiteId)
  const destSiteId = request.originSiteId || siteId
  const destSite = db.data[destSiteId] || db.data[siteId]
  const dispatchSite = db.data[stockSiteId]
  const storeName = db.sites[stockSiteId]?.live.name ?? stockSiteId

  // Merge duplicate lines for the same item so the check is exact.
  const needed = new Map<string, number>()
  for (const l of request.lines) needed.set(l.itemId, (needed.get(l.itemId) ?? 0) + l.qty)

  // ---- Phase 1: validate everything, change nothing ----
  const shortages: string[] = []
  for (const [itemId, qty] of needed) {
    const item = store.inventory.find((i) => i.id === itemId)
    const name = request.lines.find((l) => l.itemId === itemId)?.itemName ?? itemId
    if (!item) shortages.push(`${name}: not stocked in ${storeName}`)
    else if (item.qty < qty) shortages.push(`${name}: need ${qty}, only ${item.qty} ${item.unit} available`)
  }
  if (shortages.length) {
    throw conflict(`Insufficient stock in ${storeName} — nothing was changed. ${shortages.join("; ")}`)
  }

  // ---- Phase 2: apply all writes together ----
  const now = new Date().toISOString()
  for (const [itemId, qty] of needed) {
    const item = store.inventory.find((i) => i.id === itemId)!
    item.qty -= qty
    item.updatedAt = now
  }

  if (!destSite.assignments) destSite.assignments = []
  const prefixSiteId = stockSiteId || siteId
  const assignment: Assignment = {
    id: uid("as"),
    code: nextCode(destSite.assignments, "ASN-" + siteCodePrefix(db, prefixSiteId), 500),
    requestId: request.id,
    requestCode: request.code,
    assigneeId: request.requestedBy,
    assigneeName: request.requestedByName,
    lines: request.lines.map((l) => ({ ...l })),
    stockSiteId,
    createdAt: now,
    createdBy: actor.name,
  }
  destSite.assignments.unshift(assignment)

  // Also record in dispatching site if different, so supplier warehouse has manifest
  if (dispatchSite && dispatchSite !== destSite) {
    if (!dispatchSite.assignments) dispatchSite.assignments = []
    if (!dispatchSite.assignments.some((a) => a.id === assignment.id)) {
      dispatchSite.assignments.unshift(assignment)
    }
  }

  request.status = "Assigned"
  request.assignmentId = assignment.id
  return assignment
}

export function siteCodePrefix(db: Database, siteId: string) {
  // "ds-003" -> "DS"; falls back to initials of the site name
  const fromId = siteId.split("-")[0]
  if (fromId && fromId.length <= 3) return fromId.toUpperCase()
  return (db.sites[siteId]?.live.name ?? siteId).slice(0, 2).toUpperCase()
}
