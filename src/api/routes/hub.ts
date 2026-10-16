import { SEED_USERS } from "@/data/seed"
import { ROLES } from "@/lib/roles"
import type {
  Database,
  GoodsMovementStats,
  GoodsMovementTrail,
  MovementStage,
  PublicUser,
  Role,
  SiteStats,
  SiteSummary,
  SupplyChainFlow,
  SupplyChainTier,
  User,
} from "@/lib/types"
import { uid } from "@/lib/utils"
import { resetDb } from "../db"
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../errors"
import { register, type Ctx } from "../router"

import { writeSession } from "../session"
import { stockSiteOf } from "./helpers"

export function publicUser(u: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pw, ...rest } = u
  return rest
}

export function computeStats(db: Database, siteId: string): SiteStats {
  const data = db.data[siteId]
  const cfg = db.sites[siteId]?.live
  if (!data || !cfg) {
    return {
      siteId,
      pendingRequests: 0,
      lowStock: 0,
      totalItems: 0,
      stockValue: 0,
      assignments: 0,
      openRepairs: 0,
      fixedRepairs: 0,
      consumptionUnits: 0,
      returnsCount: 0,
    }
  }
  const stockId = stockSiteOf(cfg)
  const hasInv = cfg.modules.includes("inventory")
  const inv = hasInv ? (db.data[stockId]?.inventory ?? []) : []
  const requests = data.requests ?? []
  const incomingPending = Object.entries(db.data).flatMap(([sId, sData]) => {
    if (sId === siteId) return []
    return (sData.requests ?? []).filter(
      (r) =>
        r.status === "Pending" &&
        (r.targetSiteId === siteId || (!r.targetSiteId && r.type === "material" && db.sites[sId]?.live.workflow.stockSourceSiteId === siteId)),
    )
  })
  const allPendingIds = new Set([
    ...requests.filter((r) => r.status === "Pending").map((r) => r.id),
    ...incomingPending.map((r) => r.id),
  ])
  const assignments = data.assignments ?? []
  const repairs = data.repairs ?? []
  const consumption = data.consumption ?? []
  const returns = data.returns ?? []

  return {
    siteId,
    pendingRequests: allPendingIds.size,
    lowStock: inv.filter((i) => i.qty < i.reorderLevel).length,
    totalItems: inv.length,
    stockValue: inv.reduce((s, i) => s + i.qty * i.unitPrice, 0),
    assignments: assignments.length,
    openRepairs: repairs.filter((r) => r.status === "Received" || r.status === "In Repair").length,
    fixedRepairs: repairs.filter((r) => r.status === "Fixed").length,
    consumptionUnits: consumption.reduce((s, c) => s + c.qty, 0),
    returnsCount: returns.length,
  }
}

function adminSites(user: User) {
  return Object.entries(user.roles)
    .filter(([, r]) => r === "Admin")
    .map(([s]) => s)
}

function requireAnyAdmin(ctx: Ctx) {
  if (!adminSites(ctx.user!).length) throw forbidden("Access denied: User Management needs the Admin role on at least one site")
}

register(
  // ---------------------------------------------------------------- auth
  {
    method: "POST",
    path: "/api/auth/login",
    auth: false,
    handler: ({ db, body }) => {
      const email = String(body.email ?? "").trim().toLowerCase()
      const password = String(body.password ?? "")
      let user = db.users.find((u) => u.email.toLowerCase() === email)

      // Fallback: if user is in SEED_USERS but not in db.users (e.g. stale localStorage)
      if (!user) {
        const seedMatch = SEED_USERS.find((u) => u.email.toLowerCase() === email)
        if (seedMatch) {
          db.users.push(seedMatch)
          user = seedMatch
        }
      }

      if (!user || user.password !== password) throw unauthorized("Invalid email or password")
      writeSession({ userId: user.id, at: new Date().toISOString() })
      return publicUser(user)
    },
  },
  {
    method: "POST",
    path: "/api/auth/logout",
    auth: false,
    handler: () => {
      writeSession(null)
      return { ok: true }
    },
  },
  {
    method: "GET",
    path: "/api/auth/me",
    handler: ({ user }) => publicUser(user!),
  },

  // ---------------------------------------------------------------- hub
  {
    method: "GET",
    path: "/api/hub/sites",
    handler: ({ db, user }): SiteSummary[] =>
      Object.values(db.sites)
        .filter((s) => user!.roles[s.siteId])
        .map((s) => ({ config: s.live, role: user!.roles[s.siteId], liveVersion: s.liveVersion, stats: computeStats(db, s.siteId) })),
  },
  {
    // Resolve a URL slug (or id) to a site. Any signed-in user may ask whether a site exists;
    // access to its config/data is still checked by the /api/:siteId routes.
    method: "GET",
    path: "/api/hub/resolve/:key",
    handler: ({ db, params, user }) => {
      const site = Object.values(db.sites).find((s) => s.live.slug === params.key || s.siteId === params.key)
      if (!site) throw notFound(`No unit called "${params.key}"`)
      return { siteId: site.siteId, slug: site.live.slug, name: site.live.name, role: user!.roles[site.siteId] ?? null }
    },
  },
  {
    method: "POST",
    path: "/api/hub/reset",
    handler: ({ user }) => {
      resetDb()
      // keep the caller signed in if they still exist in the seed
      writeSession({ userId: user!.id, at: new Date().toISOString() })
      return { ok: true }
    },
  },
  {
    method: "GET",
    path: "/api/hub/users",
    handler: (ctx) => {
      requireAnyAdmin(ctx)
      return ctx.db.users.map(publicUser)
    },
  },
  {
    method: "POST",
    path: "/api/hub/users",
    handler: (ctx) => {
      requireAnyAdmin(ctx)
      const { db, body, user } = ctx
      const email = String(body.email ?? "").trim().toLowerCase()
      const name = String(body.name ?? "").trim()
      if (!name) throw badRequest("Name is required")
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest("A valid email is required")
      if (String(body.password ?? "").length < 4) throw badRequest("Password must be at least 4 characters")
      if (db.users.some((u) => u.email.toLowerCase() === email)) throw conflict(`${email} already exists`)
      const roles = sanitizeRoles(body.roles, adminSites(user!), {}, db)
      const created: User = {
        id: uid("u"),
        email,
        name,
        title: String(body.title ?? "").trim() || "Staff",
        password: String(body.password),
        roles,
      }
      db.users.push(created)
      return publicUser(created)
    },
  },
  {
    method: "PUT",
    path: "/api/hub/users/:id",
    handler: (ctx) => {
      requireAnyAdmin(ctx)
      const { db, body, user, params } = ctx
      const target = db.users.find((u) => u.id === params.id)
      if (!target) throw notFound("User not found")
      if (body.name !== undefined) {
        if (!String(body.name).trim()) throw badRequest("Name is required")
        target.name = String(body.name).trim()
      }
      if (body.title !== undefined) target.title = String(body.title).trim()
      if (body.password) {
        if (String(body.password).length < 4) throw badRequest("Password must be at least 4 characters")
        target.password = String(body.password)
      }
      if (body.roles) {
        const next = sanitizeRoles(body.roles, adminSites(user!), target.roles, db)
        if (target.id === user!.id) {
          for (const s of adminSites(user!)) {
            if (next[s] !== "Admin") throw badRequest("You can't remove your own Admin role (you'd lock yourself out)")
          }
        }
        target.roles = next
      }
      return publicUser(target)
    },
  },

  // ---------------------------------------------------------------- goods movement & audit
  {
    method: "GET",
    path: "/api/hub/goods-movement",
    handler: (ctx) => {
      requireAnyAdmin(ctx)
      const { db } = ctx
      const trails: GoodsMovementTrail[] = []
      const seenRequestIds = new Set<string>()

      for (const [siteId, record] of Object.entries(db.sites)) {
        const config = record.live
        const sData = db.data[siteId]
        if (!sData) continue

        const requests = sData.requests ?? []
        const assignments = sData.assignments ?? []
        const consumptions = sData.consumption ?? []
        const returnsList = sData.returns ?? []
        const repairsList = sData.repairs ?? []

        for (const req of requests) {
          if (seenRequestIds.has(req.id)) continue
          seenRequestIds.add(req.id)

          const originSiteId = req.originSiteId || siteId
          const originConfig = db.sites[originSiteId]?.live || config

          const assignment = assignments.find((a) => a.requestId === req.id || a.id === req.assignmentId) ||
            Object.values(db.data).flatMap((d) => d.assignments ?? []).find((a) => a.requestId === req.id || a.id === req.assignmentId)
          const consumption = assignment ? consumptions.filter((c) => c.assignmentId === assignment.id) : []
          const returns = returnsList.filter(
            (r) => (assignment && r.refId === assignment.id) || (req.repairJobId && r.refId === req.repairJobId),
          )
          const repairJob = req.repairJobId ? repairsList.find((r) => r.id === req.repairJobId) : undefined

          const totalQtyRequested = req.lines?.reduce((s, l) => s + (Number(l.qty) || 0), 0) ?? 0
          const totalConsumed = consumption.reduce((s, c) => s + (Number(c.qty) || 0), 0)
          const totalReturned = returns.reduce((s, r) => s + (Number(r.qty) || 0), 0)

          let stage: MovementStage = "Awaiting Approval"
          if (req.type === "repair") {
            if (repairJob?.returned || totalReturned > 0) stage = "Returned / Restocked"
            else if (repairJob?.status === "Fixed") stage = "Approved & Dispatched"
            else if (repairJob?.status === "In Repair" || repairJob?.status === "Received") stage = "In Field"
            else if (req.status === "Rejected") stage = "Request Rejected"
            else if (req.status === "Pending") stage = "Awaiting Approval"
            else stage = "Approved & Dispatched"
          } else {
            if (req.status === "Pending") stage = "Awaiting Approval"
            else if (req.status === "Rejected") stage = "Request Rejected"
            else if (totalReturned > 0) stage = "Returned / Restocked"
            else if (totalConsumed >= totalQtyRequested && totalQtyRequested > 0) stage = "Fully Consumed"
            else if (totalConsumed > 0) stage = "In Field"
            else if (req.status === "Assigned" || assignment) stage = "Approved & Dispatched"
            else stage = "Approved & Dispatched"
          }

          // Determine the Supply Chain Tier and Flow
          // Tier 1: Central Stores (cs-001) - Master Inventory (Top of chain)
          // Tier 2: Distribution Centre (ds-003) - Regional Mid-tier
          // Tier 3: Service Centre (sc-002) - Service & Repair (Bottom of chain)
          let sourceTier: SupplyChainTier = "Tier 1: Central Store"
          let destinationTier: SupplyChainTier = "Tier 2: Distribution Centre"
          let supplyChainFlow: SupplyChainFlow = "Tier 1 ➔ Tier 2"
          let sourceSiteId = req.targetSiteId || assignment?.stockSiteId || stockSiteOf(originConfig)
          let sourceSiteName = db.sites[sourceSiteId]?.live.name || "Central Stores"
          const destinationSiteId = originSiteId
          const destinationSiteName = originConfig.name

          if (originSiteId === "sc-002" || originConfig.slug === "service-centre") {
            // Service Centre is at the bottom of the supply chain (Tier 3), requesting products from Distribution (Tier 2)
            sourceTier = "Tier 2: Distribution Centre"
            destinationTier = "Tier 3: Service Centre"
            supplyChainFlow = "Tier 2 ➔ Tier 3"
            sourceSiteId = "ds-003"
            sourceSiteName = db.sites["ds-003"]?.live.name || "Distribution"
          } else if (originSiteId === "ds-003" || originConfig.slug === "distribution") {
            if (req.requestedBy === "u_lineman" || req.requestedBy === "u_ganesh") {
              sourceTier = "Tier 2: Distribution Centre"
              destinationTier = "Tier 2: Distribution Centre"
              supplyChainFlow = "Internal / Field"
              sourceSiteId = "ds-003"
              sourceSiteName = "Distribution Regional Store"
            } else {
              sourceTier = "Tier 1: Central Store"
              destinationTier = "Tier 2: Distribution Centre"
              supplyChainFlow = "Tier 1 ➔ Tier 2"
              sourceSiteId = "cs-001"
              sourceSiteName = db.sites["cs-001"]?.live.name || "Central Stores"
            }
          }

          trails.push({
            id: req.id,
            code: req.code,
            type: req.type,
            siteId: originSiteId,
            siteName: originConfig.name,
            siteSlug: originConfig.slug,
            siteColor: originConfig.theme.primary,
            sourceSiteId,
            sourceSiteName,
            sourceTier,
            destinationSiteId,
            destinationSiteName,
            destinationTier,
            supplyChainFlow,
            requestedBy: req.requestedBy,
            requestedByName: req.requestedByName,
            requestedAt: req.createdAt,
            purpose: req.purpose,
            priority: (req.priority as "Normal" | "Urgent" | "Low") || "Normal",
            status: req.status,
            stage,
            decidedBy: req.decidedBy,
            decidedAt: req.decidedAt,
            decisionComment: req.decisionComment,
            items: (req.lines ?? []).map((l) => ({
              itemId: l.itemId,
              itemName: l.itemName,
              unit: l.unit,
              qty: l.qty,
            })),
            totalQtyRequested,
            assignment: assignment
              ? {
                  id: assignment.id,
                  code: assignment.code,
                  dispatchedAt: assignment.createdAt,
                  dispatchedBy: assignment.createdBy,
                  sourceWarehouseId: sourceSiteId,
                  sourceWarehouseName: sourceSiteName,
                  assigneeName: assignment.assigneeName,
                  lines: assignment.lines,
                }
              : undefined,
            consumption,
            totalConsumed,
            returns,
            totalReturned,
            repair: req.repair
              ? {
                  meterId: req.repair.meterId,
                  meterType: req.repair.meterType,
                  fault: req.repair.fault,
                  status: repairJob?.status,
                  jobCode: repairJob?.code,
                  technician: repairJob?.technician,
                  returned: repairJob?.returned,
                }
              : undefined,
          })
        }
      }

      // Sort newest first
      trails.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())

      const stats: GoodsMovementStats = {
        totalTracked: trails.length,
        pendingApprovals: trails.filter((t) => t.status === "Pending").length,
        activeDispatches: trails.filter((t) => t.stage === "Approved & Dispatched" || t.stage === "In Field").length,
        completedMovements: trails.filter((t) => t.stage === "Fully Consumed" || t.stage === "Returned / Restocked").length,
        totalUnitsRequested: trails.reduce((s, t) => s + t.totalQtyRequested, 0),
        totalUnitsDispatched: trails.reduce(
          (s, t) => s + (t.assignment ? t.assignment.lines.reduce((sub, l) => sub + l.qty, 0) : 0),
          0,
        ),
        totalUnitsConsumed: trails.reduce((s, t) => s + t.totalConsumed, 0),
        totalUnitsReturned: trails.reduce((s, t) => s + t.totalReturned, 0),
        tier1To2Count: trails.filter((t) => t.supplyChainFlow === "Tier 1 ➔ Tier 2").length,
        tier2To3Count: trails.filter((t) => t.supplyChainFlow === "Tier 2 ➔ Tier 3").length,
      }

      return { trails, stats }
    },
  },
)

/** Admins may only change roles on sites where they are Admin themselves (site isolation). */
function sanitizeRoles(input: unknown, allowedSites: string[], current: Record<string, Role>, db: Database) {
  const next: Record<string, Role> = { ...current }
  const incoming = (input ?? {}) as Record<string, Role | null>
  for (const [siteId, role] of Object.entries(incoming)) {
    if (!db.sites[siteId]) continue
    const changed = (current[siteId] ?? null) !== (role ?? null)
    if (!changed) continue
    if (!allowedSites.includes(siteId)) throw forbidden(`You are not an Admin on ${db.sites[siteId].live.name}`)
    if (role && !ROLES.includes(role)) throw badRequest(`Unknown role ${role}`)
    if (role) next[siteId] = role
    else delete next[siteId]
  }
  return next
}

