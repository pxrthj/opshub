import { roleAtLeast } from "@/lib/roles"
import type { Database, ModuleId, Role, SiteConfig, SiteRecord, User } from "@/lib/types"
import { getModuleDef } from "@/modules/definitions"
import { clone } from "./db"
import { ApiError, forbidden, notFound, unauthorized } from "./errors"
import { invalidateSnapshot, loadSnapshot } from "./snapshot"

// A tiny Express-style router running in the browser. Reads run against a snapshot of what Supabase lets the
// signed-in person see; writes are routes that call the server (see routes/supabase.ts).

export type Method = "GET" | "POST" | "PUT" | "DELETE"

export interface Ctx {
  db: Database
  params: Record<string, string>
  query: Record<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
  user: User | null
  /** Only set for /api/:siteId/... routes */
  siteId: string
  role: Role
  site: SiteRecord
  /** Modules reachable for this caller (live; plus draft modules for Admins previewing). */
  enabled: Set<ModuleId>
  config: SiteConfig
}

export interface Route {
  method: Method
  path: string
  /** Default true. Login is the only public route. */
  auth?: boolean
  /** Site routes only: minimum role on that site. */
  minRole?: Role
  /** Site routes only: at least one of these modules must be enabled. */
  module?: ModuleId | ModuleId[]
  handler: (ctx: Ctx) => unknown | Promise<unknown>
}

const routes: Route[] = []

export function register(...defs: Route[]) {
  routes.push(...defs)
}

/** Routes that must win over any registered with `register`, whatever the import order. */
export function registerFirst(...defs: Route[]) {
  routes.unshift(...defs)
}

function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean)
  const a = path.split("/").filter(Boolean)
  if (p.length !== a.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(a[i])
    else if (p[i] !== a[i]) return null
  }
  return params
}

const EMPTY_DB: Database = { schema: 5, users: [], sites: {}, data: {} }

export async function dispatch<T>(method: Method, url: string, body?: unknown): Promise<T> {
  const [path, qs] = url.split("?")
  const query = Object.fromEntries(new URLSearchParams(qs ?? ""))

  let route: Route | undefined
  let params: Record<string, string> | null = null
  for (const r of routes) {
    if (r.method !== method) continue
    params = match(r.path, path)
    if (params) {
      route = r
      break
    }
  }
  if (!route || !params) throw notFound(`No route for ${method} ${path}`)

  let db = EMPTY_DB
  let userId: string | null = null
  if (route.auth !== false) {
    const snap = await loadSnapshot()
    if (!snap) throw unauthorized()
    db = snap.db
    userId = snap.userId
  }
  const ctx = buildContext(db, userId, route, params, query, body)
  const result = await route.handler(ctx)
  // Anything other than a read may have changed what is stored, so the next read starts fresh.
  if (method !== "GET") invalidateSnapshot()
  return clone(result ?? null) as T
}

function buildContext(
  db: Database,
  userId: string | null,
  route: Route,
  params: Record<string, string>,
  query: Record<string, string>,
  body: unknown,
): Ctx {
  const user = userId ? (db.users.find((u) => u.id === userId) ?? null) : null
  if (route.auth !== false && !user) throw unauthorized()

  const ctx = { db, params, query, body: body ?? {}, user } as Ctx

  if (route.path.startsWith("/api/:siteId")) {
    const siteId = params.siteId
    const site = db.sites[siteId]
    if (!site) throw notFound(`Site "${siteId}" does not exist`)
    // ---- site_id isolation: the caller must hold a role on THIS site ----
    const role = user!.roles[siteId]
    if (!role) throw forbidden(`Access denied: you have no role on ${site.live.name}`)
    if (route.minRole && !roleAtLeast(role, route.minRole))
      throw forbidden(`Access denied: this action needs the ${route.minRole} role on ${site.live.name} (you are ${role})`)

    const enabled = new Set<ModuleId>(site.live.modules)
    if (role === "Admin" && site.draft) site.draft.modules.forEach((m) => enabled.add(m))
    if (route.module) {
      const need = Array.isArray(route.module) ? route.module : [route.module]
      if (!need.some((m) => enabled.has(m)))
        throw forbidden(`${need.map((m) => getModuleDef(m).name).join(" / ")} is not enabled on ${site.live.name}`)
    }
    ctx.siteId = siteId
    ctx.site = site
    ctx.role = role
    ctx.enabled = enabled
    ctx.config = role === "Admin" && site.draft && query.preview === "1" ? site.draft : site.live
    if (!db.data[siteId]) db.data[siteId] = { inventory: [], requests: [], assignments: [], consumption: [], returns: [], repairs: [] }
  }
  return ctx
}

export { ApiError }
