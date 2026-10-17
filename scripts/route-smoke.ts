// Smoke test for the Supabase data layer without a network: feeds rows (built from the sample payload, the way the
// SQL loader builds them) through a stubbed client, then runs the real read routes as different people.
// Usage: npx tsx scripts/route-smoke.ts seed.json
import { readFileSync } from "node:fs"
import { supabase } from "../src/lib/supabase"
import { api } from "../src/api"

const p = JSON.parse(readFileSync(process.argv[2], "utf8"))
const uuid = (legacy: string) => `00000000-0000-0000-0000-${Buffer.from(legacy).toString("hex").padEnd(12, "0").slice(0, 12)}`
const ts = (s: string | null) => s
const rows: Record<string, any[]> = {
  sites: p.sites.map((s: any) => ({ id: s.id, slug: s.slug, name: s.name, live: s.config, live_version: 1, draft: null, draft_saved_at: null, draft_saved_by: null })),
  site_versions: p.sites.flatMap((s: any) => s.versions.map((v: any) => ({ site_id: s.id, version: v.version, config: s.config, published_at: v.publishedAt, author: v.author, summary: v.summary }))),
  site_events: p.sites.flatMap((s: any) => s.events.map((e: any) => ({ id: e.id, site_id: s.id, action: e.action, version: e.version, from_version: e.fromVersion, at: e.at, author: e.author, note: e.note }))),
  profiles: p.users.map((u: any) => ({ id: uuid(u.legacyId), legacy_id: u.legacyId, email: u.email, name: u.name, title: u.title })),
  site_members: p.users.flatMap((u: any) => Object.entries(u.roles).map(([site_id, role]) => ({ site_id, user_id: uuid(u.legacyId), role }))),
  inventory_items: p.inventory.map((i: any) => ({ id: i.id, site_id: i.siteId, name: i.name, category: i.category, unit: i.unit, qty: i.qty, unit_price: i.unitPrice, reorder_level: i.reorderLevel, custom: i.custom, updated_at: i.updatedAt })),
  requests: p.requests.map((r: any) => ({ id: r.id, code: r.code, type: r.type, site_id: r.siteId, target_site_id: r.targetSiteId, lines: r.lines, repair: r.repair, purpose: r.purpose, priority: r.priority, requested_by: uuid(r.requestedBy), requested_by_name: r.requestedByName, created_at: r.createdAt, status: r.status, decision_comment: r.decisionComment, decided_by: r.decidedBy, decided_at: ts(r.decidedAt), assignment_id: r.assignmentId, repair_job_id: r.repairJobId, forwarded_at: r.forwardedAt, forwarded_by: r.forwardedBy, forward_note: r.forwardNote, custom: r.custom })),
  assignments: p.assignments.map((a: any) => ({ id: a.id, code: a.code, site_id: a.siteId, stock_site_id: a.stockSiteId, request_id: a.requestId, request_code: a.requestCode, assignee_id: uuid(a.assigneeId), assignee_name: a.assigneeName, lines: a.lines, created_at: a.createdAt, created_by: a.createdBy })),
  consumption: p.consumption.map((c: any) => ({ id: c.id, site_id: c.siteId, assignment_id: c.assignmentId, item_id: c.itemId, item_name: c.itemName, qty: c.qty, location: c.location, date: c.date, recorded_by: c.recordedBy })),
  returns: p.returns.map((r: any) => ({ id: r.id, site_id: r.siteId, source: r.source, ref_id: r.refId, ref_code: r.refCode, item_id: r.itemId, item_name: r.itemName, qty: r.qty, condition: r.condition, stock_site_id: r.stockSiteId, date: r.date, returned_by: r.returnedBy })),
  repairs: p.repairs.map((r: any) => ({ id: r.id, site_id: r.siteId, code: r.code, meter_id: r.meterId, meter_type: r.meterType, fault: r.fault, technician: r.technician, parts_used: r.partsUsed, status: r.status, received_at: r.receivedAt, updated_at: r.updatedAt, request_id: r.requestId, returned: r.returned, custom: r.custom })),
  product_audits: p.audits.map((a: any) => ({ id: a.id, site_id: a.siteId, item_id: a.itemId, item_name: a.itemName, category: a.category, unit: a.unit, field: a.field, change_type: a.changeType, old_value: a.oldValue, new_value: a.newValue, diff: a.diff, reason: a.reason, ref_code: a.refCode, actor_id: uuid(a.actorId), actor_name: a.actorName, actor_role: a.actorRole, at: a.timestamp })),
}
const centralRequests = p.requests.filter((r: any) => r.siteId === "cs-001" || (r.targetSiteId === "cs-001" && r.forwardedAt)).length
const directory = p.sites.map((s: any) => ({ id: s.id, slug: s.slug, name: s.name }))

let me = uuid("u_admin")
;(supabase.auth as any).getSession = async () => ({ data: { session: { user: { id: me } } } })
;(supabase as any).from = (t: string) => ({ select: () => ({ limit: async () => ({ data: rows[t], error: null }), eq: () => ({ maybeSingle: async () => ({ data: rows[t][0], error: null }) }) }) })
;(supabase as any).rpc = async (fn: string) => ({ data: fn === "api_site_directory" ? directory : null, error: null })

const as = (legacy: string) => { me = uuid(legacy) }
let failures = 0
async function checkDenied(label: string, fn: () => Promise<unknown>, status: number) {
  try {
    await fn()
    failures++
    console.log(`FAIL ${label}: was allowed`)
  } catch (e: any) {
    if (e.status === status) console.log(`ok   ${label} (${status})`)
    else { failures++; console.log(`FAIL ${label}: expected ${status}, got ${e.status} ${e.message}`) }
  }
}
async function check(label: string, fn: () => Promise<unknown>, expect?: (v: any) => boolean | string) {
  try {
    const v = await fn()
    const verdict = expect ? expect(v) : true
    if (verdict !== true) { failures++; console.log(`FAIL ${label}: ${verdict}`) } else console.log(`ok   ${label}`)
  } catch (e: any) { failures++; console.log(`FAIL ${label}: ${e.status ?? ""} ${e.message}`) }
}

as("u_admin")
await check("hub sites (admin sees 3, with stats)", () => api.raw.get<any[]>("/api/hub/sites"), (v) => v.length === 3 && v.every((s) => s.stats) || `got ${v.length}`)
await check("goods movement (admin)", () => api.raw.get<any>("/api/hub/goods-movement"), (v) => v.trails.length === p.requests.length || `trails ${v.trails.length} expected ${p.requests.length}`)
await check("notifications (admin)", () => api.raw.get<any[]>("/api/hub/notifications"))
await check("users list (super admin sees 12)", () => api.raw.get<any[]>("/api/hub/users"), (v) => v.length === 12 || `got ${v.length}`)
await check("central inventory", () => api.get<any>("cs-001", "inventory"), (v) => v.items.length === 16 && !v.linked || `items ${v.items.length}`)
await check("central audit log", () => api.get<any>("cs-001", "audit-log"), (v) => v.audits.length === 6 || `audits ${v.audits.length}`)
await check("central requests (forwarded-in from Distribution)", () => api.get<any[]>("cs-001", "requests"), (v) => v.length === centralRequests || `got ${v.length} expected ${centralRequests}`)
await check("central analytics", () => api.get<any>("cs-001", "analytics"))
await check("central export", () => api.get<any>("cs-001", "reports/export", { query: { dataset: "inventory" } }))
await check("builder state (admin)", () => api.get<any>("sc-002", "builder"), (v) => v.versions.length === 1 && v.events.length === 1 || "versions/events")

as("u_lineman")
await check("member: hub sites = Distribution only", () => api.raw.get<any[]>("/api/hub/sites"), (v) => v.length === 1 && v[0].config.slug === "distribution" || `got ${v.length}`)
await check("member: inventory is Central's list, linked", () => api.get<any>("ds-003", "inventory"), (v) => v.linked && v.sourceName === "Central Stores" || JSON.stringify([v.linked, v.sourceName]))
await check("member: my requests (5)", () => api.get<any[]>("ds-003", "requests"), (v) => v.length === 13 ? "sees all" : v.length >= 5 || `got ${v.length}`)
await checkDenied("member: other office is forbidden", () => api.get<any>("cs-001", "inventory"), 403)
await checkDenied("member: hub users forbidden", () => api.raw.get<any>("/api/hub/users"), 403)

as("u_service_mgr")
await check("service mgr: stock names of other office resolve", () => api.get<any>("sc-002", "inventory"), (v) => v.sourceName === "Distribution" || `sourceName=${v.sourceName}`)
await check("service mgr: requests incl. cross-office labels", () => api.get<any[]>("sc-002", "requests"), (v) => v.some((r) => r.targetSiteName === "Distribution") || "no targetSiteName")
await check("service mgr: repairs", () => api.get<any[]>("sc-002", "repairs"), (v) => v.length === 8 && v.find((r) => r.id === "rj1").partsCost === 420 || "custom fields lost")

as("u_engineer")
await check("dist mgr: site admin dashboard", () => api.get<any>("ds-003", "dashboard/admin"))
await check("dist mgr: assignments", () => api.get<any[]>("ds-003", "assignments"))

for (const [who, site] of [["u_admin", "cs-001"], ["u_admin", "ds-003"], ["u_admin", "sc-002"], ["u_cs_admin", "cs-001"], ["u_ds_admin", "ds-003"], ["u_sc_admin", "sc-002"]] as const) {
  as(who)
  await check(`site admin dashboard: ${who} @ ${site}`, () => api.get<any>(site, "dashboard/admin", { query: { range: "30d" } }), (v) => v.kpis && v.stockByCategory ? true : "missing kpis/stock")
}

console.log(failures ? `\n${failures} FAILED` : "\nall passed")
process.exit(failures ? 1 : 0)
