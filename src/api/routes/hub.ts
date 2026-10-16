import { ROLES, roleAtLeast } from "@/lib/roles"
import type { AppNotification, Database, NotificationPriority, PublicUser, Role, SiteStats, SiteSummary, User } from "@/lib/types"
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
  const cfg = db.sites[siteId].live
  const stockId = stockSiteOf(cfg)
  const hasInv = cfg.modules.includes("inventory")
  const inv = hasInv ? (db.data[stockId]?.inventory ?? []) : []
  return {
    siteId,
    pendingRequests: data.requests.filter((r) => r.status === "Pending").length,
    lowStock: inv.filter((i) => i.qty < i.reorderLevel).length,
    totalItems: inv.length,
    stockValue: inv.reduce((s, i) => s + i.qty * i.unitPrice, 0),
    assignments: data.assignments.length,
    openRepairs: data.repairs.filter((r) => r.status === "Received" || r.status === "In Repair").length,
    fixedRepairs: data.repairs.filter((r) => r.status === "Fixed").length,
    consumptionUnits: data.consumption.reduce((s, c) => s + c.qty, 0),
    returnsCount: data.returns.length,
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
      const altEmail = email.includes("@plexus.demo")
        ? email.replace("@plexus.demo", "@opshub.demo")
        : email.replace("@opshub.demo", "@plexus.demo")
      const user = db.users.find((u) => {
        const ue = u.email.toLowerCase()
        return ue === email || ue === altEmail
      })
      // Mock login: plain comparison. The real backend compares a bcrypt hash and sets an HTTP-only cookie.
      if (!user || user.password !== body.password) throw unauthorized("Invalid email or password")
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
                title: `Bench Assignment: Meter ${rep.meterId}`,
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
            const pending = data.requests.filter((r) => r.status === "Pending")
            for (const req of pending) {
              notifications.push({
                id: `pend-${req.id}`,
                priority: "urgent",
                category: "approval",
                title: `Approval Needed: ${req.code}`,
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
                title: `Repair Inflow: Meter ${rep.meterId}`,
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

