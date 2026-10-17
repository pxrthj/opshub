import { managerAction, needsMyManager } from "@/lib/requestFlow"
import { ROLES, roleAtLeast } from "@/lib/roles"
import type {
  AppNotification,
  Database,
  GoodsMovementStats,
  GoodsMovementTrail,
  MovementStage,
  NotificationPriority,
  PublicUser,
  Role,
  SiteConfig,
  SiteStats,
  SiteSummary,
  SupplyChainBottleneck,
  SupplyChainData,
  SupplyChainFlow,
  SupplyChainHierarchyEdge,
  SupplyChainSiteMetrics,
  SupplyChainTier,
  User,
} from "@/lib/types"
import { uid } from "@/lib/utils"
import { badRequest, conflict, forbidden, notFound } from "../errors"
import { register, type Ctx } from "../router"

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
  // Only requests that need a manager of THIS office right now (not ones waiting on another office).
  const waitingForMe = requests.filter((r) => needsMyManager(r, siteId))
  const assignments = data.assignments ?? []
  const repairs = data.repairs ?? []
  const consumption = data.consumption ?? []
  const returns = data.returns ?? []

  return {
    siteId,
    pendingRequests: waitingForMe.length,
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

/** A client company's office: it raises repair cases and runs nothing else operational. */
const isClientOffice = (cfg: SiteConfig) => cfg.modules.includes("cases") && !cfg.modules.includes("inventory")

function computeSiteTier(siteId: string, sites: Record<string, { live: { workflow?: { stockSourceSiteId?: string | null } } }>): number {
  let tier = 1
  let currentId: string | null = siteId
  const visited = new Set<string>()
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    const srcId: string | null | undefined = sites[currentId]?.live?.workflow?.stockSourceSiteId
    if (srcId && srcId !== currentId && sites[srcId]) {
      tier++
      currentId = srcId
    } else {
      break
    }
  }
  return tier
}

register(
  // ---------------------------------------------------------------- auth
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
        // Own offices first (in id order: Central Hub, Service Centre, Distribution), client companies after.
        .sort((a, b) => Number(isClientOffice(a.live)) - Number(isClientOffice(b.live)) || a.siteId.localeCompare(b.siteId))
        .map((s) => ({ config: s.live, role: user!.roles[s.siteId], liveVersion: s.liveVersion, stats: computeStats(db, s.siteId) })),
  },
  {
    method: "GET",
    path: "/api/hub/notifications",
    handler: ({ db, user }): AppNotification[] => {
      if (!user) return []
      const notifications: AppNotification[] = []
      const userRoles = user.roles
      const isAnyAdmin = Object.values(userRoles).includes("Admin")

      function formatTimeAgo(isoDate: string): string {
        const diff = Date.now() - new Date(isoDate).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return "Just now"
        if (mins < 60) return `${mins}m ago`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `${hours}h ago`
        const days = Math.floor(hours / 24)
        if (days === 1) return "Yesterday"
        return `${days}d ago`
      }

      for (const [siteId, siteRecord] of Object.entries(db.sites)) {
        const role = userRoles[siteId]
        if (!role && !isAnyAdmin) continue

        const cfg = siteRecord.live
        const data = db.data[siteId]
        if (!data) continue

        const effectiveRole = role ?? (isAnyAdmin ? "Admin" : null)
        if (!effectiveRole) continue

        const has = (m: string) => cfg.modules.includes(m as never)

        // 1. MEMBER NOTIFICATIONS
        if (data.requests) {
          for (const req of data.requests) {
            if (req.requestedBy === user.id) {
              if (req.status === "Approved" || req.status === "Assigned") {
                notifications.push({
                  id: `req-app-${req.id}-${req.status}`,
                  priority: "medium",
                  category: "approval",
                  title: `Request ${req.code} Approved`,
                  message: `Your request for ${req.lines?.map((l) => `${l.qty}x ${l.itemName}`).join(", ") || req.purpose} was approved.`,
                  siteId,
                  siteName: cfg.name,
                  siteSlug: cfg.slug,
                  timestamp: req.decidedAt || req.createdAt,
                  timeAgo: formatTimeAgo(req.decidedAt || req.createdAt),
                  link: `/s/${cfg.slug}/requests`,
                })
              } else if (req.status === "Rejected") {
                notifications.push({
                  id: `req-rej-${req.id}`,
                  priority: "urgent",
                  category: "request",
                  title: `Request ${req.code} Rejected`,
                  message: req.decisionComment ? `Reason: "${req.decisionComment}"` : "Your request was declined.",
                  siteId,
                  siteName: cfg.name,
                  siteSlug: cfg.slug,
                  timestamp: req.decidedAt || req.createdAt,
                  timeAgo: formatTimeAgo(req.decidedAt || req.createdAt),
                  link: `/s/${cfg.slug}/requests`,
                })
              }
            }
          }
        }

        if (data.assignments) {
          for (const asn of data.assignments) {
            if (asn.assigneeId === user.id) {
              notifications.push({
                id: `asn-${asn.id}`,
                priority: "medium",
                category: "assignment",
                title: `Materials Issued: ${asn.code}`,
                message: `${asn.lines.map((l) => `${l.qty}x ${l.itemName}`).join(", ")} ready for field work.`,
                siteId,
                siteName: cfg.name,
                siteSlug: cfg.slug,
                timestamp: asn.createdAt,
                timeAgo: formatTimeAgo(asn.createdAt),
                link: `/s/${cfg.slug}/my-materials`,
              })
            }
          }
        }

        if (data.repairs && has("pcb-repair") && roleAtLeast(effectiveRole, "Member")) {
          for (const rep of data.repairs) {
            if (rep.technician === user.name && rep.status !== "Fixed" && rep.status !== "Scrapped") {
              notifications.push({
                id: `rep-${rep.id}`,
                priority: "medium",
                category: "repair",
                title: `Bench Assignment: Board ${rep.meterId}`,
                message: `Fault: ${rep.fault} (Current status: ${rep.status}).`,
                siteId,
                siteName: cfg.name,
                siteSlug: cfg.slug,
                timestamp: rep.updatedAt || rep.receivedAt,
                timeAgo: formatTimeAgo(rep.updatedAt || rep.receivedAt),
                link: `/s/${cfg.slug}/repairs`,
              })
            }
          }
        }

        // 2. MANAGER NOTIFICATIONS
        if (roleAtLeast(effectiveRole, "Manager")) {
          if (data.requests && has("approval")) {
            const pending = data.requests.filter((r) => needsMyManager(r, siteId))
            for (const req of pending) {
              const sendOn = managerAction(req, siteId) === "send-on"
              const isAdmin = effectiveRole === "Admin"
              notifications.push({
                id: `pend-${req.id}`,
                priority: "urgent",
                category: "approval",
                title: isAdmin
                  ? `Flow monitor: ${req.code} pending`
                  : sendOn
                    ? `Please send on: ${req.code}`
                    : `Please decide: ${req.code}`,
                message: `${req.requestedByName} requested ${req.lines.map((l) => `${l.qty}x ${l.itemName}`).join(", ") || req.purpose}.`,
                siteId,
                siteName: cfg.name,
                siteSlug: cfg.slug,
                timestamp: req.createdAt,
                timeAgo: formatTimeAgo(req.createdAt),
                link: `/s/${cfg.slug}/approvals`,
              })
            }
          }

          const stockId = stockSiteOf(cfg)
          const inv = db.data[stockId]?.inventory ?? []
          if (has("inventory") && !cfg.workflow.stockSourceSiteId && inv.length > 0) {
            for (const item of inv) {
              if (item.qty <= 0) {
                notifications.push({
                  id: `stockout-${item.id}`,
                  priority: "urgent",
                  category: "inventory",
                  title: `Critical Out of Stock: ${item.name}`,
                  message: `0 ${item.unit} remaining (Reorder threshold is ${item.reorderLevel}).`,
                  siteId,
                  siteName: cfg.name,
                  siteSlug: cfg.slug,
                  timestamp: item.updatedAt || new Date().toISOString(),
                  timeAgo: formatTimeAgo(item.updatedAt || new Date().toISOString()),
                  link: `/s/${cfg.slug}/inventory`,
                })
              } else if (item.qty < item.reorderLevel) {
                notifications.push({
                  id: `lowstock-${item.id}`,
                  priority: "urgent",
                  category: "inventory",
                  title: `Low Stock Alert: ${item.name}`,
                  message: `${item.qty} ${item.unit} left (Reorder threshold: ${item.reorderLevel}).`,
                  siteId,
                  siteName: cfg.name,
                  siteSlug: cfg.slug,
                  timestamp: item.updatedAt || new Date().toISOString(),
                  timeAgo: formatTimeAgo(item.updatedAt || new Date().toISOString()),
                  link: `/s/${cfg.slug}/inventory`,
                })
              }
            }
          }

          if (data.repairs && has("pcb-repair")) {
            const received = data.repairs.filter((r) => r.status === "Received")
            for (const rep of received) {
              notifications.push({
                id: `rep-mgr-${rep.id}`,
                priority: "medium",
                category: "repair",
                title: `Repair Inflow: Board ${rep.meterId}`,
                message: `Fault reported: ${rep.fault}. Awaiting technician.`,
                siteId,
                siteName: cfg.name,
                siteSlug: cfg.slug,
                timestamp: rep.receivedAt,
                timeAgo: formatTimeAgo(rep.receivedAt),
                link: `/s/${cfg.slug}/repairs`,
              })
            }
          }
        }

        // 3. ADMIN NOTIFICATIONS
        if (roleAtLeast(effectiveRole, "Admin")) {
          if (siteRecord.draft) {
            notifications.push({
              id: `draft-${siteId}`,
              priority: "medium",
              category: "system",
              title: `Unpublished Draft in ${cfg.name}`,
              message: `Draft changes saved by ${siteRecord.draftSavedBy ?? "Admin"} are pending publish.`,
              siteId,
              siteName: cfg.name,
              siteSlug: cfg.slug,
              timestamp: siteRecord.draftSavedAt || new Date().toISOString(),
              timeAgo: formatTimeAgo(siteRecord.draftSavedAt || new Date().toISOString()),
              link: `/builder/${siteId}`,
            })
          }
        }
      }

      // Sort: urgent first, then medium, then low; then newest first
      const priorityWeight: Record<NotificationPriority, number> = { urgent: 0, medium: 1, low: 2 }
      notifications.sort((a, b) => {
        if (priorityWeight[a.priority] !== priorityWeight[b.priority]) {
          return priorityWeight[a.priority] - priorityWeight[b.priority]
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      })

      return notifications
    },
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
    method: "GET",
    path: "/api/hub/users",
    handler: (ctx) => {
      requireAnyAdmin(ctx)
      const allowed = adminSites(ctx.user!)
      const allSites = Object.keys(ctx.db.sites)
      const isSuper = allSites.length > 0 && allSites.every((s) => allowed.includes(s))
      if (isSuper) {
        return ctx.db.users.map(publicUser)
      }
      // Scoped site admin: only see people of their respective site(s)
      const filtered = ctx.db.users.filter((u) => allowed.some((s) => u.roles[s] != null))
      return filtered.map((u) => {
        const pub = publicUser(u)
        const scopedRoles: Record<string, Role> = {}
        for (const s of allowed) {
          if (pub.roles[s]) scopedRoles[s] = pub.roles[s]
        }
        return { ...pub, roles: scopedRoles }
      })
    },
  },
  {
    method: "POST",
    path: "/api/hub/users",
    handler: (ctx) => {
      requireAnyAdmin(ctx)
      const { db, body, user } = ctx
      const allowed = adminSites(user!)
      const allSites = Object.keys(db.sites)
      const isSuper = allSites.length > 0 && allSites.every((s) => allowed.includes(s))
      const email = String(body.email ?? "").trim().toLowerCase()
      const name = String(body.name ?? "").trim()
      if (!name) throw badRequest("Name is required")
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw badRequest("A valid email is required")
      if (String(body.password ?? "").length < 4) throw badRequest("Password must be at least 4 characters")
      if (db.users.some((u) => u.email.toLowerCase() === email)) throw conflict(`${email} already exists`)
      const roles = sanitizeRoles(body.roles, allowed, {}, db)
      if (!isSuper && !allowed.some((s) => roles[s] != null)) {
        throw badRequest("You must assign at least one role in your administered office")
      }
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
      const allowed = adminSites(user!)
      const allSites = Object.keys(db.sites)
      const isSuper = allSites.length > 0 && allSites.every((s) => allowed.includes(s))
      const target = db.users.find((u) => u.id === params.id)
      if (!target) throw notFound("User not found")
      if (!isSuper && !allowed.some((s) => target.roles[s] != null)) {
        throw forbidden("You can only manage people belonging to your office")
      }
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
        const next = sanitizeRoles(body.roles, allowed, target.roles, db)
        if (target.id === user!.id) {
          for (const s of allowed) {
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

          // Determine the Supply Chain Tier and Flow dynamically from workflow.stockSourceSiteId
          let sourceSiteId = req.targetSiteId || assignment?.stockSiteId || originConfig.workflow?.stockSourceSiteId || originSiteId
          let sourceSiteName = db.sites[sourceSiteId]?.live.name || originConfig.name

          // If origin is not the source and source is not set, fallback to stockSiteOf
          if (!sourceSiteId || sourceSiteId === originSiteId) {
            const fallbackSiteId = stockSiteOf(originConfig)
            if (fallbackSiteId && fallbackSiteId !== originSiteId && db.sites[fallbackSiteId]) {
              sourceSiteId = fallbackSiteId
              sourceSiteName = db.sites[fallbackSiteId].live.name
            }
          }

          const srcTierNum = computeSiteTier(sourceSiteId, db.sites)
          const destTierNum = computeSiteTier(originSiteId, db.sites)

          const sourceTier: SupplyChainTier = (
            srcTierNum === 1 ? "Tier 1: Component Stores" : srcTierNum === 2 ? "Tier 2: Lab & Field Office" : "Tier 3: Sub-office"
          ) as SupplyChainTier
          const destinationTier: SupplyChainTier = (
            destTierNum === 1 ? "Tier 1: Component Stores" : destTierNum === 2 ? "Tier 2: Lab & Field Office" : "Tier 3: Sub-office"
          ) as SupplyChainTier

          let supplyChainFlow: SupplyChainFlow = "Tier 1 ➔ Tier 2"
          if (sourceSiteId === originSiteId) {
            supplyChainFlow = "Internal / Field"
          } else if (srcTierNum >= 2 && destTierNum >= 3) {
            supplyChainFlow = "Tier 2 ➔ Tier 3"
          } else {
            supplyChainFlow = "Tier 1 ➔ Tier 2"
          }

          trails.push({
            id: req.id,
            code: req.code,
            type: req.type,
            siteId: originSiteId,
            siteName: originConfig.name,
            siteSlug: originConfig.slug,
            sourceSiteId,
            sourceSiteName,
            sourceTier,
            destinationSiteId: originSiteId,
            destinationSiteName: originConfig.name,
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
            forwardedAt: req.forwardedAt,
            forwardedBy: req.forwardedBy,
            forwardNote: req.forwardNote,
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

      // Compute bottleneck count (pending > 24 hours) and avg lead time
      const oneDayAgo = Date.now() - 24 * 3600 * 1000
      const bottlenecksCount = trails.filter(
        (t) => t.status === "Pending" && new Date(t.requestedAt).getTime() < oneDayAgo,
      ).length

      const fulfillmentHours = trails
        .filter((t) => t.assignment?.dispatchedAt && t.requestedAt)
        .map((t) => Math.max(0.5, (new Date(t.assignment!.dispatchedAt).getTime() - new Date(t.requestedAt).getTime()) / 3600000))

      const avgFulfillmentHours = fulfillmentHours.length
        ? Number((fulfillmentHours.reduce((a, b) => a + b, 0) / fulfillmentHours.length).toFixed(1))
        : 3.5

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
        bottlenecksCount,
        avgFulfillmentHours,
      }

      // ── Per-site Comparison Metrics ──────────────────────────────────────────
      const siteMetrics: SupplyChainSiteMetrics[] = Object.entries(db.sites).map(([sId, rec]) => {
        const cfg = rec.live
        const siteOutgoing = trails.filter((t) => t.siteId === sId)
        const siteSupplied = trails.filter((t) => t.sourceSiteId === sId)
        // Operational requests handled or initiated by this office
        const siteReqs = Array.from(new Set([...siteOutgoing, ...siteSupplied]))

        const approved = siteReqs.filter((t) => t.status === "Approved" || t.status === "Assigned")
        const pending = siteReqs.filter((t) => t.status === "Pending")
        const rejected = siteReqs.filter((t) => t.status === "Rejected")
        const fulfilmentRate = siteReqs.length > 0 ? Math.round((approved.length / siteReqs.length) * 100) : 100

        const turnaroundTimes = siteReqs
          .filter((t) => t.decidedAt || t.assignment?.dispatchedAt)
          .map((t) => {
            const start = new Date(t.requestedAt).getTime()
            const end = new Date(t.assignment?.dispatchedAt || t.decidedAt!).getTime()
            return Math.max(0, (end - start) / (1000 * 60 * 60))
          })
        const avgTurnaroundHours =
          turnaroundTimes.length > 0
            ? Math.round((turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length) * 10) / 10
            : 0

        const sInventory = db.data[sId]?.inventory ?? []
        const lowStockCount = sInventory.filter((item) => item.qty <= (item.reorderLevel ?? 0)).length
        const totalInventoryItems = sInventory.length

        const unitsDispatched = trails
          .filter((t) => t.sourceSiteId === sId && t.assignment)
          .reduce((sum, t) => sum + (t.assignment ? t.assignment.lines.reduce((lSum, l) => lSum + l.qty, 0) : 0), 0)

        const unitsReceived = siteOutgoing
          .filter((t) => t.assignment)
          .reduce((sum, t) => sum + (t.assignment ? t.assignment.lines.reduce((lSum, l) => lSum + l.qty, 0) : 0), 0)

        const unitsConsumed = siteOutgoing.reduce((sum, t) => sum + t.totalConsumed, 0)
        const unitsReturned = siteOutgoing.reduce((sum, t) => sum + t.totalReturned, 0)

        return {
          siteId: sId,
          siteName: cfg.name,
          siteSlug: cfg.slug,
          tier: computeSiteTier(sId, db.sites),
          stockSourceSiteId: cfg.workflow?.stockSourceSiteId ?? null,
          stockSourceName: cfg.workflow?.stockSourceSiteId ? db.sites[cfg.workflow.stockSourceSiteId]?.live.name ?? null : null,
          totalRequests: siteReqs.length,
          pendingRequests: pending.length,
          approvedRequests: approved.length,
          rejectedRequests: rejected.length,
          fulfilmentRate,
          avgTurnaroundHours,
          lowStockCount,
          totalInventoryItems,
          unitsDispatched,
          unitsReceived,
          unitsConsumed,
          unitsReturned,
        }
      })

      // ── Bottleneck Highlights ───────────────────────────────────────────────
      const now = Date.now()
      const stuckThresholdMs = 3 * 24 * 60 * 60 * 1000

      const bottlenecks: SupplyChainBottleneck[] = Object.entries(db.sites).map(([sId, rec]) => {
        const cfg = rec.live
        const siteReqs = trails.filter((t) => t.siteId === sId)
        const pendingReqs = siteReqs.filter((t) => t.status === "Pending")
        const stuckReqs = pendingReqs.filter((t) => now - new Date(t.requestedAt).getTime() > stuckThresholdMs)

        const oldest =
          pendingReqs.length > 0
            ? [...pendingReqs].sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())[0]
            : undefined

        const waitHours = pendingReqs.map((t) => Math.max(0, (now - new Date(t.requestedAt).getTime()) / (1000 * 60 * 60)))
        const avgWaitHours = waitHours.length > 0 ? Math.round((waitHours.reduce((a, b) => a + b, 0) / waitHours.length) * 10) / 10 : 0

        return {
          siteId: sId,
          siteName: cfg.name,
          stage: "Awaiting Approval" as MovementStage,
          avgWaitHours,
          stuckRequestsCount: stuckReqs.length,
          oldestOpenRequest: oldest
            ? {
                id: oldest.id,
                code: oldest.code,
                requestedAt: oldest.requestedAt,
                requestedByName: oldest.requestedByName,
                waitDays: Math.round(((now - new Date(oldest.requestedAt).getTime()) / (1000 * 60 * 60 * 24)) * 10) / 10,
              }
            : undefined,
        }
      })

      // ── Network Hierarchy Edges (stockSourceSiteId + flows) ─────────────────
      const edgesMap = new Map<string, SupplyChainHierarchyEdge>()

      for (const [targetSiteId, rec] of Object.entries(db.sites)) {
        const sourceSiteId = rec.live?.workflow?.stockSourceSiteId
        if (sourceSiteId && db.sites[sourceSiteId]) {
          const edgeKey = `${sourceSiteId}->${targetSiteId}`
          edgesMap.set(edgeKey, {
            id: edgeKey,
            sourceSiteId,
            sourceSiteName: db.sites[sourceSiteId].live.name,
            targetSiteId,
            targetSiteName: rec.live.name,
            volumeUnits: 0,
            requestsCount: 0,
            pendingCount: 0,
          })
        }
      }

      for (const t of trails) {
        if (t.sourceSiteId && t.siteId && t.sourceSiteId !== t.siteId) {
          const edgeKey = `${t.sourceSiteId}->${t.siteId}`
          let edge = edgesMap.get(edgeKey)
          if (!edge) {
            edge = {
              id: edgeKey,
              sourceSiteId: t.sourceSiteId,
              sourceSiteName: t.sourceSiteName,
              targetSiteId: t.siteId,
              targetSiteName: t.siteName,
              volumeUnits: 0,
              requestsCount: 0,
              pendingCount: 0,
            }
            edgesMap.set(edgeKey, edge)
          }
          edge.requestsCount += 1
          const units = t.assignment ? t.assignment.lines.reduce((acc, l) => acc + l.qty, 0) : t.totalQtyRequested
          edge.volumeUnits += units
          if (t.status === "Pending") edge.pendingCount += 1
        }
      }

      const edges = Array.from(edgesMap.values())

      const result: SupplyChainData = { trails, stats, siteMetrics, bottlenecks, edges }
      return result
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

