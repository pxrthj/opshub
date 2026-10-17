// Turns the TypeScript sample data in src/data/seed.ts into one JSON payload that the
// Supabase function `reset_demo_data()` loads. Run:  npx tsx scripts/export-seed.ts > seed.json
import { createSeedDatabase } from "../src/data/seed"
import type { MaterialRequest } from "../src/lib/types"

const db = createSeedDatabase()
const KNOWN_REQ = new Set([
  "id", "code", "type", "lines", "repair", "purpose", "priority", "requestedBy", "requestedByName", "createdAt", "status",
  "decisionComment", "decidedBy", "decidedAt", "assignmentId", "repairJobId", "originSiteId", "originSiteName",
  "targetSiteId", "targetSiteName", "forwardedAt", "forwardedBy", "forwardNote", "caseId",
])
const KNOWN_INV = new Set(["id", "name", "category", "unit", "qty", "unitPrice", "reorderLevel", "updatedAt"])
const KNOWN_REP = new Set(["id", "code", "meterId", "meterType", "fault", "technician", "partsUsed", "status", "receivedAt", "updatedAt", "requestId", "returned"])

const extras = (o: Record<string, unknown>, known: Set<string>) =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => !known.has(k) && v !== undefined))

const payload = {
  generatedAt: new Date().toISOString(),
  users: db.users.map((u) => ({ legacyId: u.id, email: u.email, name: u.name, title: u.title, roles: u.roles })),
  sites: Object.values(db.sites).map((s) => ({
    id: s.siteId,
    slug: s.live.slug,
    name: s.live.name,
    config: s.live,
    versions: s.versions.map((v) => ({ version: v.version, publishedAt: v.publishedAt, author: v.author, summary: v.summary })),
    events: s.events,
  })),
  inventory: [] as unknown[],
  requests: [] as unknown[],
  assignments: [] as unknown[],
  consumption: [] as unknown[],
  returns: [] as unknown[],
  repairs: [] as unknown[],
  audits: [] as unknown[],
  // Repair cases keep the sample people's ids (u_vikas, ...); the loader turns them into real user ids.
  cases: (db.cases ?? []).map((c) => ({ ...c })),
}

for (const [siteId, d] of Object.entries(db.data)) {
  for (const i of d.inventory) payload.inventory.push({ siteId, id: i.id, name: i.name, category: i.category, unit: i.unit, qty: i.qty, unitPrice: i.unitPrice, reorderLevel: i.reorderLevel, updatedAt: i.updatedAt, custom: extras(i, KNOWN_INV) })
  for (const r of d.requests as MaterialRequest[]) {
    if ((r.originSiteId ?? siteId) !== siteId) continue // every office holds a copy; keep the asker's one
    payload.requests.push({
      siteId, id: r.id, code: r.code, type: r.type, targetSiteId: r.targetSiteId ?? null, lines: r.lines, repair: r.repair ?? null,
      purpose: r.purpose, priority: r.priority ?? "Normal", requestedBy: r.requestedBy, requestedByName: r.requestedByName,
      createdAt: r.createdAt, status: r.status, decisionComment: r.decisionComment ?? null, decidedBy: r.decidedBy ?? null,
      decidedAt: r.decidedAt ?? null, assignmentId: r.assignmentId ?? null, repairJobId: r.repairJobId ?? null,
      forwardedAt: r.forwardedAt ?? null, forwardedBy: r.forwardedBy ?? null, forwardNote: r.forwardNote ?? null, caseId: r.caseId ?? null,
      custom: extras(r, KNOWN_REQ),
    })
  }
  for (const a of d.assignments) payload.assignments.push({ siteId, ...a })
  for (const c of d.consumption) payload.consumption.push({ siteId, ...c })
  for (const r of d.returns) payload.returns.push({ siteId, ...r })
  for (const r of d.repairs) payload.repairs.push({ siteId, id: r.id, code: r.code, meterId: r.meterId, meterType: r.meterType, fault: r.fault, technician: r.technician, partsUsed: r.partsUsed, status: r.status, receivedAt: r.receivedAt, updatedAt: r.updatedAt, requestId: r.requestId ?? null, returned: !!r.returned, custom: extras(r, KNOWN_REP) })
  for (const a of d.productAudits ?? []) payload.audits.push({ siteId, ...a })
}

// Item ids repeat between offices in the prototype (Distribution's stock mirrors Central's). In Postgres an item id
// is unique, so Distribution's items get a "ds_" prefix and everything that points at them follows.
const DS = "ds-003"
const dsId = (id: string) => `ds_${id}`
for (const i of payload.inventory as { siteId: string; id: string }[]) if (i.siteId === DS) i.id = dsId(i.id)
const stockOf = new Map<string, string>() // request / assignment id -> office whose stock it points at
for (const r of payload.requests as { id: string; siteId: string; targetSiteId: string | null; lines: { itemId: string }[] }[]) {
  const stock = r.targetSiteId ?? r.siteId
  stockOf.set(r.id, stock)
  if (stock === DS) r.lines = r.lines.map((l) => ({ ...l, itemId: dsId(l.itemId) }))
}
const asgStock = new Map<string, string>()
for (const a of payload.assignments as { id: string; stockSiteId: string; lines: { itemId: string }[] }[]) {
  asgStock.set(a.id, a.stockSiteId)
  if (a.stockSiteId === DS) a.lines = a.lines.map((l) => ({ ...l, itemId: dsId(l.itemId) }))
}
for (const c of payload.consumption as { assignmentId: string; itemId: string }[]) if (asgStock.get(c.assignmentId) === DS) c.itemId = dsId(c.itemId)
for (const r of payload.returns as { stockSiteId: string; itemId: string }[]) if (r.stockSiteId === DS) r.itemId = dsId(r.itemId)
for (const a of payload.audits as { siteId: string; itemId: string }[]) if (a.siteId === DS) a.itemId = dsId(a.itemId)

process.stdout.write(JSON.stringify(payload))
