import { supabase } from "@/lib/supabase"
import type { Database, Role, SiteConfig, SiteData, SiteRecord, User } from "@/lib/types"
import { mapAssignment, mapAudit, mapConsumption, mapInventory, mapRepair, mapRequest, mapReturn } from "./mappers"

// The read routes were written against one in-memory Database. Instead of rewriting them, we build that same
// shape from Supabase. Row-level security means it only ever contains what the signed-in person may see:
// their own offices, the stock of the office they get stock from, and (for managers) requests sent to them.

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const TTL_MS = 1500
let cached: { at: number; userId: string; db: Promise<Database> } | null = null

export function invalidateSnapshot() {
  cached = null
}

export const emptySiteData = (): SiteData => ({
  inventory: [],
  requests: [],
  assignments: [],
  consumption: [],
  returns: [],
  repairs: [],
  productAudits: [],
})

/** Name-only placeholder for an office the person cannot open, so cross-office labels still read well. */
function stubSite(id: string, slug: string, name: string): SiteRecord {
  const live: SiteConfig = {
    siteId: id,
    slug,
    name,
    description: "",
    modules: [],
    pages: [],
    roles: [],
    fields: {},
    workflow: {
      stockSourceSiteId: null,
      autoAssignOnApproval: false,
      requireRejectComment: false,
      allowRepairRequests: false,
      allowMaterialRequests: false,
      maxQtyPerLine: 0,
      lowStockAlerts: false,
    },
    canvas: { nodes: [], edges: [] },
  }
  return { siteId: id, live, liveVersion: 0, draft: null, draftSavedAt: null, draftSavedBy: null, versions: [], events: [] }
}

async function select(table: string): Promise<Row[]> {
  const { data, error } = await supabase.from(table).select("*").limit(5000)
  if (error) throw new Error(`Could not load ${table}: ${error.message}`)
  return data ?? []
}

async function build(): Promise<Database> {
  const [directory, sites, versions, events, profiles, members, inventory, requests, assignments, consumption, returns, repairs, audits] =
    await Promise.all([
      supabase.rpc("api_site_directory").then((r: any) => (r.data ?? []) as { id: string; slug: string; name: string }[]),
      select("sites"),
      select("site_versions"),
      select("site_events"),
      select("profiles"),
      select("site_members"),
      select("inventory_items"),
      select("requests"),
      select("assignments"),
      select("consumption"),
      select("returns"),
      select("repairs"),
      select("product_audits"),
    ])

  const names: Record<string, string> = {}
  const siteMap: Record<string, SiteRecord> = {}
  const data: Record<string, SiteData> = {}
  for (const d of directory) {
    names[d.id] = d.name
    siteMap[d.id] = stubSite(d.id, d.slug, d.name)
    data[d.id] = emptySiteData()
  }
  for (const s of sites) {
    names[s.id] = s.name
    siteMap[s.id] = {
      siteId: s.id,
      live: s.live,
      liveVersion: s.live_version,
      draft: s.draft ?? null,
      draftSavedAt: s.draft_saved_at ? new Date(s.draft_saved_at).toISOString() : null,
      draftSavedBy: s.draft_saved_by ?? null,
      versions: versions
        .filter((v: Row) => v.site_id === s.id)
        .map((v: Row) => ({ version: v.version, config: v.config, publishedAt: new Date(v.published_at).toISOString(), author: v.author, summary: v.summary })),
      events: events
        .filter((e: Row) => e.site_id === s.id)
        .map((e: Row) => ({ id: e.id, action: e.action, version: e.version, fromVersion: e.from_version, at: new Date(e.at).toISOString(), author: e.author, note: e.note })),
    }
    data[s.id] ??= emptySiteData()
  }
  const bucket = (id: string) => (data[id] ??= emptySiteData())

  for (const r of inventory) bucket(r.site_id).inventory.push(mapInventory(r))

  // Every office holds a copy of the requests it asked for; the supplying office gets a copy once it is sent on.
  for (const r of requests) {
    const req = mapRequest(r, names)
    bucket(r.site_id).requests.push(req)
    if (r.target_site_id && r.target_site_id !== r.site_id && r.forwarded_at) bucket(r.target_site_id).requests.push(req)
  }
  // An assignment shows on the office that holds the manifest and on the office whose stock was issued.
  for (const r of assignments) {
    const a = mapAssignment(r)
    bucket(r.site_id).assignments.push(a)
    if (r.stock_site_id !== r.site_id) bucket(r.stock_site_id).assignments.push(a)
  }
  for (const r of consumption) bucket(r.site_id).consumption.push(mapConsumption(r))
  for (const r of returns) bucket(r.site_id).returns.push(mapReturn(r))
  for (const r of repairs) bucket(r.site_id).repairs.push(mapRepair(r))
  for (const r of audits) (bucket(r.site_id).productAudits ??= []).push(mapAudit(r))
  for (const d of Object.values(data)) {
    d.requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    d.productAudits?.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }

  const rolesByUser = new Map<string, Record<string, Role>>()
  for (const m of members) rolesByUser.set(m.user_id, { ...(rolesByUser.get(m.user_id) ?? {}), [m.site_id]: m.role })
  const users: User[] = profiles.map((p: Row) => ({
    id: p.id,
    legacyId: p.legacy_id ?? undefined,
    email: p.email,
    name: p.name,
    title: p.title,
    password: "",
    roles: rolesByUser.get(p.id) ?? {},
  }))

  return { schema: 5, users, sites: siteMap, data }
}

/** Everything the signed-in person can see, or null when nobody is signed in. Cached for a moment and shared. */
export async function loadSnapshot(): Promise<{ db: Database; userId: string } | null> {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) {
    cached = null
    return null
  }
  if (!cached || cached.userId !== userId || Date.now() - cached.at > TTL_MS) {
    const db = build()
    cached = { at: Date.now(), userId, db }
    db.catch(() => {
      if (cached?.db === db) cached = null
    })
  }
  return { db: await cached.db, userId }
}
