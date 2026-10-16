import { normalizeValues, validateValues } from "@/lib/fields"
import { roleAtLeast } from "@/lib/roles"
import { fieldsFor } from "@/lib/siteConfig"
import type {
  AnalyticsData,
  ConsumptionRecord,
  ExportDataset,
  ImportRow,
  InventoryItem,
  MaterialRequest,
  RepairJob,
  RepairStatus,
  ReturnRecord,
  Role,
  SiteMember,
} from "@/lib/types"
import { uid } from "@/lib/utils"
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../errors"
import { register, type Ctx } from "../router"
import { assignMaterialTransaction, nextCode, siteCodePrefix, stockData } from "../transactions"
import { assignmentView, byNewest, isLinkedInventory, stockSiteOf, weekBuckets } from "./helpers"
import { computeStats, publicUser } from "./hub"

// Site-scoped routes: /api/:siteId/<resource>. The router has already verified that the
// caller holds a role on :siteId, that the role is high enough and that the module is enabled.

const data = (ctx: Ctx) => ctx.db.data[ctx.siteId]
const isManager = (ctx: Ctx) => roleAtLeast(ctx.role, "Manager")
const BUILTIN_INV = ["name", "category", "unit", "qty", "unitPrice", "reorderLevel"]

function cleanInventory(ctx: Ctx, body: Record<string, unknown>) {
  const fields = fieldsFor(ctx.config, "inventory")
  const errors = validateValues(fields, body)
  const firstError = Object.values(errors)[0]
  if (firstError) throw badRequest(firstError)
  const values = normalizeValues(fields, body)
  if (!Number.isInteger(values.qty)) throw badRequest("Qty must be a whole number")
  return values
}

function assertOwnInventory(ctx: Ctx) {
  if (isLinkedInventory(ctx.config)) {
    const src = ctx.db.sites[ctx.config.workflow.stockSourceSiteId!]?.live.name
    throw conflict(`Inventory here is linked read-only from ${src}. Edit it in ${src}.`)
  }
}

function findRequest(ctx: Ctx) {
  // Check local site first
  let req = data(ctx).requests.find((r) => r.id === ctx.params.id)
  if (req) return req
  // Check cross-site requests targeted at or originating from this site
  for (const sData of Object.values(ctx.db.data)) {
    const found = (sData.requests ?? []).find((r) => r.id === ctx.params.id)
    if (found) return found
  }
  throw notFound("Request not found")
}

register(
  // ---------------------------------------------------------------- config & stats
  {
    method: "GET",
    path: "/api/:siteId/config",
    minRole: "Public",
    handler: (ctx) => ({ config: ctx.config, liveVersion: ctx.site.liveVersion, role: ctx.role, hasDraft: !!ctx.site.draft }),
  },
  {
    method: "GET",
    path: "/api/:siteId/stats",
    minRole: "Public",
    handler: (ctx) => computeStats(ctx.db, ctx.siteId),
  },

  // ---------------------------------------------------------------- inventory
  {
    method: "GET",
    path: "/api/:siteId/inventory",
    minRole: "Member",
    module: ["inventory", "request"],
    handler: (ctx) => {
      const sourceId = stockSiteOf(ctx.config)
      const source = ctx.db.sites[sourceId]
      return {
        items: [...stockData(ctx.db, sourceId).inventory].sort((a, b) => a.name.localeCompare(b.name)),
        linked: isLinkedInventory(ctx.config),
        sourceSiteId: sourceId,
        sourceName: source?.live.name ?? sourceId,
        fields: isLinkedInventory(ctx.config) && source ? fieldsFor(source.live, "inventory") : fieldsFor(ctx.config, "inventory"),
      }
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/inventory",
    minRole: "Manager",
    module: "inventory",
    handler: (ctx) => {
      assertOwnInventory(ctx)
      const values = cleanInventory(ctx, ctx.body)
      const inv = data(ctx).inventory
      if (inv.some((i) => i.name.toLowerCase() === String(values.name).toLowerCase()))
        throw conflict(`"${values.name}" already exists — edit the existing item instead`)
      const item = { ...values, id: uid("itm"), updatedAt: new Date().toISOString() } as InventoryItem
      inv.push(item)
      return item
    },
  },
  {
    method: "PUT",
    path: "/api/:siteId/inventory/:id",
    minRole: "Manager",
    module: "inventory",
    handler: (ctx) => {
      assertOwnInventory(ctx)
      const inv = data(ctx).inventory
      const item = inv.find((i) => i.id === ctx.params.id)
      if (!item) throw notFound("Item not found")
      const values = cleanInventory(ctx, { ...item, ...ctx.body })
      if (inv.some((i) => i.id !== item.id && i.name.toLowerCase() === String(values.name).toLowerCase()))
        throw conflict(`Another item is already called "${values.name}"`)
      Object.assign(item, values, { updatedAt: new Date().toISOString() })
      return item
    },
  },
  {
    method: "DELETE",
    path: "/api/:siteId/inventory/:id",
    minRole: "Admin",
    module: "inventory",
    handler: (ctx) => {
      assertOwnInventory(ctx)
      const d = data(ctx)
      const before = d.inventory.length
      d.inventory = d.inventory.filter((i) => i.id !== ctx.params.id)
      if (d.inventory.length === before) throw notFound("Item not found")
      return { ok: true }
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/inventory/import",
    minRole: "Admin",
    module: "reports",
    handler: (ctx) => {
      assertOwnInventory(ctx)
      const rows = (ctx.body.rows ?? []) as ImportRow[]
      if (!rows.length) throw badRequest("The file has no rows to import")
      const fields = fieldsFor(ctx.config, "inventory").filter((f) => BUILTIN_INV.includes(f.key))
      // Validate EVERY row first; a single bad row rejects the whole import (all-or-nothing).
      const problems: string[] = []
      rows.forEach((r, i) => {
        const errs = validateValues(fields, r as unknown as Record<string, unknown>)
        const msg = Object.values(errs)[0]
        if (msg) problems.push(`Row ${i + 2}: ${msg}`)
      })
      if (problems.length) throw unprocessable(`Import rejected — nothing was changed. ${problems.slice(0, 5).join("; ")}`)
      const inv = data(ctx).inventory
      let created = 0
      let updated = 0
      const now = new Date().toISOString()
      for (const r of rows) {
        const values = normalizeValues(fieldsFor(ctx.config, "inventory"), { ...r })
        const existing = inv.find((i) => i.name.toLowerCase() === String(r.name).trim().toLowerCase())
        if (existing) {
          Object.assign(existing, { ...values, name: existing.name, updatedAt: now })
          updated++
        } else {
          inv.push({ ...values, id: uid("itm"), updatedAt: now } as InventoryItem)
          created++
        }
      }
      return { created, updated }
    },
  },

  // ---------------------------------------------------------------- requests & approvals
  {
    method: "GET",
    path: "/api/:siteId/requests",
    minRole: "Member",
    module: "request",
    handler: (ctx) => {
      const siteId = ctx.siteId
      const d = data(ctx)
      const seen = new Set<string>()
      const list: MaterialRequest[] = []

      // 1. Local requests originated here
      for (const r of d.requests ?? []) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          list.push(r)
        }
      }

      // 2. If manager or admin, include incoming requests targeted at this site from other units
      if (isManager(ctx)) {
        for (const [sId, sData] of Object.entries(ctx.db.data)) {
          if (sId === siteId) continue
          for (const r of sData.requests ?? []) {
            const isTargeted = r.targetSiteId === siteId
            const isDefaultStockSource =
              !r.targetSiteId && r.type === "material" && ctx.db.sites[sId]?.live.workflow.stockSourceSiteId === siteId
            if (isTargeted || isDefaultStockSource) {
              if (!seen.has(r.id)) {
                seen.add(r.id)
                list.push(r)
              }
            }
          }
        }
      }

      const scope = ctx.query.scope
      const visible = isManager(ctx) && scope !== "mine" ? list : list.filter((r) => r.requestedBy === ctx.user!.id)
      return [...visible].sort(byNewest)
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/requests",
    minRole: "Member",
    module: "request",
    handler: (ctx) => {
      const { body, config } = ctx
      const wf = config.workflow
      const type = body.type === "repair" ? "repair" : "material"
      if (type === "material" && !wf.allowMaterialRequests) throw forbidden("Material requests are disabled on this site")
      if (type === "repair" && !wf.allowRepairRequests) throw forbidden("Repair jobs are disabled on this site")

      // repair jobs describe themselves — default the purpose from the meter id
      if (type === "repair" && !String(body.purpose ?? "").trim() && body.repair?.meterId)
        body.purpose = `Repair ${String(body.repair.meterId).trim().toUpperCase()}`
      const fields = fieldsFor(config, "request")
      const errs = validateValues(fields, body)
      const firstErr = Object.values(errs)[0]
      if (firstErr) throw badRequest(firstErr)
      const values = normalizeValues(fields, body)

      const d = data(ctx)
      const targetSiteId = type === "material" && wf.stockSourceSiteId ? wf.stockSourceSiteId : ctx.siteId
      const targetSiteName = ctx.db.sites[targetSiteId]?.live.name || "Stores"

      const req: MaterialRequest = {
        ...values,
        id: uid("rq"),
        code: nextCode(d.requests, `REQ-${siteCodePrefix(ctx.db, ctx.siteId)}`, 1000),
        type,
        lines: [],
        purpose: String(values.purpose ?? ""),
        requestedBy: ctx.user!.id,
        requestedByName: ctx.user!.name,
        createdAt: new Date().toISOString(),
        status: "Pending",
        originSiteId: ctx.siteId,
        originSiteName: ctx.config.name,
        targetSiteId,
        targetSiteName,
      }
      if (type === "material") {
        const rawLines = (body.lines ?? []) as { itemId: string; qty: number }[]
        if (!rawLines.length) throw badRequest("Add at least one item")
        const stock = stockData(ctx.db, stockSiteOf(config)).inventory
        req.lines = rawLines.map((l, i) => {
          const item = stock.find((s) => s.id === l.itemId)
          if (!item) throw badRequest(`Line ${i + 1}: choose an item`)
          const qty = Number(l.qty)
          if (!Number.isInteger(qty) || qty <= 0) throw badRequest(`Line ${i + 1}: quantity must be a positive whole number`)
          if (qty > wf.maxQtyPerLine) throw badRequest(`Line ${i + 1}: max ${wf.maxQtyPerLine} per line on this site`)
          return { itemId: item.id, itemName: item.name, unit: item.unit, qty }
        })
      } else {
        const r = body.repair ?? {}
        if (!String(r.meterId ?? "").trim()) throw badRequest("Meter ID is required")
        if (!String(r.fault ?? "").trim()) throw badRequest("Fault is required")
        req.repair = { meterId: String(r.meterId).trim().toUpperCase(), meterType: String(r.meterType || "Single Phase Smart Meter"), fault: String(r.fault) }
        if (!req.purpose) req.purpose = `Repair ${req.repair.meterId}`
      }

      d.requests.unshift(req)

      // Also deliver request into target supplier site's queue so supplier manager receives it immediately
      if (targetSiteId !== ctx.siteId && ctx.db.data[targetSiteId]) {
        if (!ctx.db.data[targetSiteId].requests) ctx.db.data[targetSiteId].requests = []
        if (!ctx.db.data[targetSiteId].requests.some((r) => r.id === req.id)) {
          ctx.db.data[targetSiteId].requests.unshift(req)
        }
      }

      return req
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/requests/:id/approve",
    minRole: "Manager",
    module: "approval",
    handler: (ctx) => {
      const req = findRequest(ctx)
      if (req.status !== "Pending") throw conflict(`${req.code} is already ${req.status}`)
      req.status = "Approved"
      req.decidedBy = ctx.user!.name
      req.decidedAt = new Date().toISOString()
      req.decisionComment = String(ctx.body.comment ?? "").trim() || undefined

      // The stock source site is the target site that supplies the goods
      const stockSiteId = req.targetSiteId || (isLinkedInventory(ctx.config) ? stockSiteOf(ctx.config) : ctx.siteId)
      const originSiteId = req.originSiteId || ctx.siteId

      let assignmentCode: string | undefined
      if (req.type === "material" && ctx.enabled.has("assignment") && ctx.config.workflow.autoAssignOnApproval) {
        // Throws (and whole approval is rolled back) if any line is short.
        const a = assignMaterialTransaction(ctx.db, {
          siteId: originSiteId,
          stockSiteId,
          request: req,
          actor: ctx.user!,
        })
        assignmentCode = a.code
      }
      let repairCode: string | undefined
      if (req.type === "repair" && ctx.enabled.has("pcb-repair") && req.repair) {
        const d = data(ctx)
        const job: RepairJob = {
          id: uid("rj"),
          code: nextCode(d.repairs, `RJ-${siteCodePrefix(ctx.db, ctx.siteId)}`, 300),
          meterId: req.repair.meterId,
          meterType: req.repair.meterType,
          fault: req.repair.fault,
          technician: "",
          partsUsed: "",
          status: "Received",
          receivedAt: req.decidedAt,
          updatedAt: req.decidedAt,
          requestId: req.id,
        }
        d.repairs.unshift(job)
        req.repairJobId = job.id
        repairCode = job.code
      }

      // Synchronize updated request state to all sites in db.data
      for (const sData of Object.values(ctx.db.data)) {
        for (const r of sData.requests ?? []) {
          if (r.id === req.id) {
            r.status = req.status
            r.decidedBy = req.decidedBy
            r.decidedAt = req.decidedAt
            r.decisionComment = req.decisionComment
            r.assignmentId = req.assignmentId
            r.repairJobId = req.repairJobId
          }
        }
      }

      return { request: req, assignmentCode, repairCode }
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/requests/:id/reject",
    minRole: "Manager",
    module: "approval",
    handler: (ctx) => {
      const req = findRequest(ctx)
      if (req.status !== "Pending") throw conflict(`${req.code} is already ${req.status}`)
      const comment = String(ctx.body.comment ?? "").trim()
      if (ctx.config.workflow.requireRejectComment && !comment) throw badRequest("A comment is required when rejecting")
      req.status = "Rejected"
      req.decidedBy = ctx.user!.name
      req.decidedAt = new Date().toISOString()
      req.decisionComment = comment || undefined

      // Synchronize updated request state to all sites in db.data
      for (const sData of Object.values(ctx.db.data)) {
        for (const r of sData.requests ?? []) {
          if (r.id === req.id) {
            r.status = req.status
            r.decidedBy = req.decidedBy
            r.decidedAt = req.decidedAt
            r.decisionComment = req.decisionComment
          }
        }
      }

      return req
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/requests/:id/assign",
    minRole: "Manager",
    module: "assignment",
    handler: (ctx) => {
      const req = findRequest(ctx)
      if (req.status !== "Approved") throw conflict(`${req.code} must be Approved before assigning (it is ${req.status})`)
      if (req.type !== "material") throw badRequest("Only material requests can be assigned")
      const stockSiteId = req.targetSiteId || (isLinkedInventory(ctx.config) ? stockSiteOf(ctx.config) : ctx.siteId)
      const originSiteId = req.originSiteId || ctx.siteId
      const a = assignMaterialTransaction(ctx.db, {
        siteId: originSiteId,
        stockSiteId,
        request: req,
        actor: ctx.user!,
      })

      for (const sData of Object.values(ctx.db.data)) {
        for (const r of sData.requests ?? []) {
          if (r.id === req.id) {
            r.status = req.status
            r.assignmentId = req.assignmentId
          }
        }
      }

      return a
    },
  },

  // ---------------------------------------------------------------- assignments & consumption
  {
    method: "GET",
    path: "/api/:siteId/assignments",
    minRole: "Member",
    module: "assignment",
    handler: (ctx) => {
      const d = data(ctx)
      const mine = !isManager(ctx) || ctx.query.scope === "mine"
      return d.assignments
        .filter((a) => !mine || a.assigneeId === ctx.user!.id)
        .sort(byNewest)
        .map((a) => assignmentView(d, a))
    },
  },
  {
    method: "GET",
    path: "/api/:siteId/consumption",
    minRole: "Member",
    module: "consumption",
    handler: (ctx) => {
      const d = data(ctx)
      const mineIds = new Set(d.assignments.filter((a) => a.assigneeId === ctx.user!.id).map((a) => a.id))
      return d.consumption.filter((c) => isManager(ctx) || mineIds.has(c.assignmentId)).sort(byNewest)
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/consumption",
    minRole: "Member",
    module: "consumption",
    handler: (ctx) => {
      const d = data(ctx)
      const a = d.assignments.find((x) => x.id === ctx.body.assignmentId)
      if (!a) throw notFound("Assignment not found")
      if (!isManager(ctx) && a.assigneeId !== ctx.user!.id) throw forbidden("You can only record usage for material issued to you")
      const line = assignmentView(d, a).lines.find((l) => l.itemId === ctx.body.itemId)
      if (!line) throw badRequest("Choose an item from this assignment")
      const qty = Number(ctx.body.qty)
      if (!Number.isInteger(qty) || qty <= 0) throw badRequest("Quantity used must be a positive whole number")
      if (qty > line.remaining) throw badRequest(`Only ${line.remaining} ${line.unit} remaining for ${line.itemName}`)
      const location = String(ctx.body.location ?? "").trim()
      if (!location) throw badRequest("Site / Location is required")
      const rec: ConsumptionRecord = {
        id: uid("cn"),
        assignmentId: a.id,
        itemId: line.itemId,
        itemName: line.itemName,
        qty,
        location,
        date: new Date().toISOString(),
        recordedBy: ctx.user!.name,
      }
      d.consumption.unshift(rec)
      return rec
    },
  },

  // ---------------------------------------------------------------- returns
  {
    method: "GET",
    path: "/api/:siteId/returns",
    minRole: "Member",
    module: "returns",
    handler: (ctx) => [...data(ctx).returns].sort(byNewest),
  },
  {
    method: "POST",
    path: "/api/:siteId/returns",
    minRole: "Member",
    module: "returns",
    handler: (ctx) => {
      const d = data(ctx)
      const stockSiteId = stockSiteOf(ctx.config)
      const store = stockData(ctx.db, stockSiteId)
      const now = new Date().toISOString()
      let rec: ReturnRecord
      if (ctx.body.source === "repair") {
        if (!ctx.enabled.has("pcb-repair")) throw forbidden("PCB Repair is not enabled on this site")
        const job = d.repairs.find((r) => r.id === ctx.body.refId)
        if (!job) throw notFound("Repair job not found")
        if (job.status !== "Fixed") throw conflict(`${job.code} is ${job.status} — only Fixed meters can be returned`)
        if (job.returned) throw conflict(`${job.code} was already returned to stock`)
        const item = store.inventory.find((i) => i.name.toLowerCase() === job.meterType.toLowerCase())
        if (!item) throw conflict(`"${job.meterType}" is not an item in ${ctx.db.sites[stockSiteId].live.name}`)
        item.qty += 1
        item.updatedAt = now
        job.returned = true
        job.updatedAt = now
        rec = { id: uid("rt"), source: "repair", refId: job.id, refCode: job.code, itemId: item.id, itemName: item.name, qty: 1, condition: "Repaired", stockSiteId, date: now, returnedBy: ctx.user!.name }
      } else {
        if (!ctx.enabled.has("assignment")) throw forbidden("Material Assignment is not enabled on this site")
        const a = d.assignments.find((x) => x.id === ctx.body.refId)
        if (!a) throw notFound("Assignment not found")
        if (!isManager(ctx) && a.assigneeId !== ctx.user!.id) throw forbidden("You can only return material issued to you")
        const line = assignmentView(d, a).lines.find((l) => l.itemId === ctx.body.itemId)
        if (!line) throw badRequest("Choose an item from this assignment")
        const qty = Number(ctx.body.qty)
        if (!Number.isInteger(qty) || qty <= 0) throw badRequest("Return quantity must be a positive whole number")
        if (qty > line.remaining) throw badRequest(`Only ${line.remaining} ${line.unit} unused for ${line.itemName}`)
        const item = store.inventory.find((i) => i.id === line.itemId)
        if (!item) throw conflict(`${line.itemName} no longer exists in stores`)
        item.qty += qty
        item.updatedAt = now
        rec = { id: uid("rt"), source: "assignment", refId: a.id, refCode: a.code, itemId: item.id, itemName: item.name, qty, condition: "Unused", stockSiteId, date: now, returnedBy: ctx.user!.name }
      }
      d.returns.unshift(rec)
      return { record: rec, stockSiteName: ctx.db.sites[stockSiteId].live.name }
    },
  },

  // ---------------------------------------------------------------- PCB repair
  {
    method: "GET",
    path: "/api/:siteId/repairs",
    minRole: "Member",
    module: "pcb-repair",
    handler: (ctx) => [...data(ctx).repairs].sort(byNewest),
  },
  {
    method: "POST",
    path: "/api/:siteId/repairs",
    minRole: "Member",
    module: "pcb-repair",
    handler: (ctx) => {
      const fields = fieldsFor(ctx.config, "pcb-repair")
      const firstErr = Object.values(validateValues(fields, ctx.body))[0]
      if (firstErr) throw badRequest(firstErr)
      const values = normalizeValues(fields, ctx.body)
      const d = data(ctx)
      const now = new Date().toISOString()
      const job = {
        ...values,
        id: uid("rj"),
        code: nextCode(d.repairs, `RJ-${siteCodePrefix(ctx.db, ctx.siteId)}`, 300),
        meterId: String(values.meterId).toUpperCase(),
        status: "Received",
        receivedAt: now,
        updatedAt: now,
      } as RepairJob
      d.repairs.unshift(job)
      return job
    },
  },
  {
    method: "PUT",
    path: "/api/:siteId/repairs/:id",
    minRole: "Member",
    module: "pcb-repair",
    handler: (ctx) => {
      const d = data(ctx)
      const job = d.repairs.find((r) => r.id === ctx.params.id)
      if (!job) throw notFound("Repair job not found")
      if (job.returned) throw conflict(`${job.code} was already returned to stock and is closed`)
      const STATUSES: RepairStatus[] = ["Received", "In Repair", "Fixed", "Scrapped"]
      if (ctx.body.status && !STATUSES.includes(ctx.body.status)) throw badRequest("Invalid status")
      const fields = fieldsFor(ctx.config, "pcb-repair")
      const merged = { ...job, ...ctx.body }
      const firstErr = Object.values(validateValues(fields, merged))[0]
      if (firstErr) throw badRequest(firstErr)
      Object.assign(job, normalizeValues(fields, merged), {
        status: ctx.body.status ?? job.status,
        updatedAt: new Date().toISOString(),
      })
      return job
    },
  },

  // ---------------------------------------------------------------- analytics
  {
    method: "GET",
    path: "/api/:siteId/analytics",
    minRole: "Member",
    module: "analytics",
    handler: (ctx): AnalyticsData => {
      const stockId = stockSiteOf(ctx.config)
      const inv = stockData(ctx.db, stockId).inventory
      const cats = new Map<string, { qty: number; value: number }>()
      for (const i of inv) {
        const c = cats.get(i.category) ?? { qty: 0, value: 0 }
        c.qty += i.qty
        c.value += i.qty * i.unitPrice
        cats.set(i.category, c)
      }
      const d = data(ctx)
      const buckets = weekBuckets(6)
      const inBucket = (iso: string, b: { start: number; end: number }) => {
        const t = Date.parse(iso)
        return t > b.start && t <= b.end
      }
      let timeline: AnalyticsData["timeline"]
      let statusSplit: AnalyticsData["statusSplit"]
      if (ctx.enabled.has("request") && d.requests.length) {
        timeline = {
          title: "Requests over time (weekly)",
          seriesA: "Raised",
          seriesB: "Approved",
          points: buckets.map((b) => ({
            label: b.label,
            a: d.requests.filter((r) => inBucket(r.createdAt, b)).length,
            b: d.requests.filter((r) => r.decidedAt && r.status !== "Rejected" && inBucket(r.decidedAt, b)).length,
          })),
        }
        const statuses = ["Pending", "Approved", "Assigned", "Rejected"] as const
        statusSplit = { title: "Request status split", data: statuses.map((s) => ({ name: s, value: d.requests.filter((r) => r.status === s).length })) }
      } else {
        // A store has no requests of its own: chart the issues/returns hitting its stock ledger.
        const issues = Object.values(ctx.db.data).flatMap((sd) => sd.assignments.filter((a) => a.stockSiteId === stockId))
        const rets = Object.values(ctx.db.data).flatMap((sd) => sd.returns.filter((r) => r.stockSiteId === stockId))
        timeline = {
          title: "Stock issues vs returns (weekly)",
          seriesA: "Issues",
          seriesB: "Returns",
          points: buckets.map((b) => ({
            label: b.label,
            a: issues.filter((a) => inBucket(a.createdAt, b)).length,
            b: rets.filter((r) => inBucket(r.date, b)).length,
          })),
        }
        statusSplit = {
          title: "Stock health split",
          data: [
            { name: "Healthy", value: inv.filter((i) => i.qty >= i.reorderLevel).length },
            { name: "Low stock", value: inv.filter((i) => i.qty > 0 && i.qty < i.reorderLevel).length },
            { name: "Out of stock", value: inv.filter((i) => i.qty <= 0).length },
          ],
        }
      }
      return {
        stockSourceName: ctx.db.sites[stockId]?.live.name ?? stockId,
        stockByCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.qty - a.qty),
        timeline,
        statusSplit,
      }
    },
  },

  // ---------------------------------------------------------------- reports (export)
  {
    method: "GET",
    path: "/api/:siteId/reports/export",
    minRole: "Manager",
    module: "reports",
    handler: (ctx): ExportDataset => {
      const d = data(ctx)
      const stock = stockData(ctx.db, stockSiteOf(ctx.config)).inventory
      switch (ctx.query.dataset ?? "inventory") {
        case "inventory": {
          const fields = fieldsFor(ctx.config, "inventory")
          return {
            id: "inventory",
            label: "Inventory",
            columns: [
              ...fields.map((f) => ({
                key: f.key,
                header: f.label,
                width: f.key === "name" ? 36 : 16,
                numFmt: f.key === "unitPrice" || f.key === "total" ? "₹#,##0.00" : undefined,
              })),
              { key: "status", header: "Stock Status", width: 14 },
            ],
            rows: stock.map((i) => ({ ...i, total: i.qty * i.unitPrice, ...normalizeValues(fields, i), status: i.qty < i.reorderLevel ? "LOW" : "OK" })),
          }
        }
        case "requests":
          if (!ctx.enabled.has("request")) throw badRequest("Requests are not enabled on this site")
          return {
            id: "requests",
            label: "Requests",
            columns: [
              { key: "code", header: "Request", width: 14 },
              { key: "createdAt", header: "Raised On", width: 20 },
              { key: "requestedByName", header: "Raised By", width: 18 },
              { key: "purpose", header: "Purpose", width: 40 },
              { key: "items", header: "Items", width: 50 },
              { key: "status", header: "Status", width: 12 },
              { key: "decidedBy", header: "Decided By", width: 16 },
              { key: "decisionComment", header: "Comment", width: 36 },
            ],
            rows: d.requests.map((r) => ({
              ...r,
              createdAt: new Date(r.createdAt).toLocaleString("en-IN"),
              items: r.type === "repair" ? `${r.repair?.meterId} — ${r.repair?.fault}` : r.lines.map((l) => `${l.itemName} × ${l.qty}`).join(", "),
            })),
          }
        case "assignments":
          if (!ctx.enabled.has("assignment")) throw badRequest("Material Assignment is not enabled on this site")
          return {
            id: "assignments",
            label: "Assignments",
            columns: [
              { key: "code", header: "Assignment", width: 14 },
              { key: "requestCode", header: "Request", width: 14 },
              { key: "assigneeName", header: "Issued To", width: 18 },
              { key: "itemName", header: "Item", width: 36 },
              { key: "qty", header: "Assigned", width: 10 },
              { key: "used", header: "Used", width: 10 },
              { key: "returned", header: "Returned", width: 10 },
              { key: "remaining", header: "Remaining", width: 10 },
            ],
            rows: d.assignments.flatMap((a) => assignmentView(d, a).lines.map((l) => ({ ...a, ...l }))),
          }
        case "repairs":
          if (!ctx.enabled.has("pcb-repair")) throw badRequest("PCB Repair is not enabled on this site")
          return {
            id: "repairs",
            label: "Repair Log",
            columns: [
              { key: "code", header: "Job", width: 12 },
              ...fieldsFor(ctx.config, "pcb-repair").map((f) => ({ key: f.key, header: f.label, width: 22 })),
              { key: "status", header: "Status", width: 12 },
            ],
            rows: d.repairs,
          }
        default:
          throw badRequest("Unknown dataset")
      }
    },
  },

  // ---------------------------------------------------------------- site team (User Management module)
  {
    method: "GET",
    path: "/api/:siteId/members",
    minRole: "Admin",
    module: "users",
    handler: (ctx): SiteMember[] => ctx.db.users.map((u) => ({ user: publicUser(u), role: u.roles[ctx.siteId] ?? null })),
  },
  {
    method: "PUT",
    path: "/api/:siteId/members/:userId",
    minRole: "Admin",
    module: "users",
    handler: (ctx) => {
      const target = ctx.db.users.find((u) => u.id === ctx.params.userId)
      if (!target) throw notFound("User not found")
      const role = (ctx.body.role ?? null) as Role | null
      if (target.id === ctx.user!.id && role !== "Admin") throw badRequest("You can't change your own Admin role here")
      if (role) target.roles[ctx.siteId] = role
      else delete target.roles[ctx.siteId]
      return { user: publicUser(target), role }
    },
  },
)
