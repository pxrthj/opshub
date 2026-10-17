import { normalizeValues, validateValues } from "@/lib/fields"
import { diffConfigs, fieldsFor, summarizeDiff } from "@/lib/siteConfig"
import { supabase } from "@/lib/supabase"
import type { BuilderState, FieldDef, ImportRow, ModuleId, PublicUser, RepairStatus, Role } from "@/lib/types"
import { badRequest, conflict, forbidden, notFound, unauthorized, unprocessable } from "../errors"
import { mapAssignment, mapCase, mapConsumption, mapInventory, mapRepair, mapRequest, mapReturn } from "../mappers"
import { adminOp, rpc } from "../rpc"
import { registerFirst, type Ctx } from "../router"
import { invalidateSnapshot, loadSnapshot } from "../snapshot"
import { validateIncoming } from "./builder"

// Everything that signs people in or changes data. These routes take priority (registerFirst) over the old
// in-browser handlers in routes/site.ts, routes/hub.ts and routes/builder.ts, which are no longer reached.
// Validation that needs the office's form setup (field lists) happens here for friendly messages; the rules that
// matter (who may do it, stock levels, all-or-nothing issue) are enforced again by the database functions.

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const CASE_MODULES: ModuleId[] = ["cases", "case-desk", "case-work"]
const namesOf = (ctx: Ctx) => Object.fromEntries(Object.values(ctx.db.sites).map((s) => [s.siteId, s.live.name]))
const withoutCalculated = (fields: FieldDef[], values: Record<string, unknown>) => {
  const calc = new Set(fields.filter((f) => f.type === "calculated").map((f) => f.key))
  return Object.fromEntries(Object.entries(values).filter(([k]) => !calc.has(k)))
}
const BUILTIN_INV = ["name", "category", "unit", "qty", "unitPrice", "reorderLevel"]

/** The signed-in person, with their role in each office. */
export async function fetchPublicUser(userId: string): Promise<PublicUser> {
  const [profile, members] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("site_members").select("site_id, role").eq("user_id", userId),
  ])
  if (profile.error || !profile.data) throw unauthorized("This login has no profile. Ask an admin to add you.")
  const roles: Record<string, Role> = {}
  for (const m of members.data ?? []) roles[m.site_id] = m.role
  const p = profile.data
  return { id: p.id, legacyId: p.legacy_id ?? undefined, email: p.email, name: p.name, title: p.title, roles }
}

function cleanInventory(ctx: Ctx, body: Record<string, unknown>) {
  const fields = fieldsFor(ctx.config, "inventory")
  const firstError = Object.values(validateValues(fields, body))[0]
  if (firstError) throw badRequest(firstError)
  const values = normalizeValues(fields, body)
  if (!Number.isInteger(values.qty)) throw badRequest("Qty must be a whole number")
  return withoutCalculated(fields, values)
}

function builderState(ctx: Ctx, site: NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>["db"]["sites"][string]): BuilderState {
  void ctx
  return {
    live: site.live,
    liveVersion: site.liveVersion,
    draft: site.draft,
    draftSavedAt: site.draftSavedAt,
    draftSavedBy: site.draftSavedBy,
    versions: [...site.versions].sort((a, b) => b.version - a.version),
    events: [...site.events].sort((a, b) => b.at.localeCompare(a.at)),
  }
}

async function freshBuilderState(ctx: Ctx) {
  invalidateSnapshot()
  const snap = await loadSnapshot()
  const site = snap?.db.sites[ctx.siteId]
  if (!site) throw notFound(`Site "${ctx.siteId}" does not exist`)
  return builderState(ctx, site)
}

registerFirst(
  // ---------------------------------------------------------------- sign in (Supabase Auth, email + password)
  {
    method: "POST",
    path: "/api/auth/login",
    auth: false,
    handler: async ({ body }) => {
      // The sample people were first published under @opshub.demo; both spellings reach the same account.
      // Offices were renamed (Distribution → Field Service, Service Centre → PCB Repair Lab); old sample logins still work.
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase()
        .replace("@opshub.demo", "@plexus.demo")
        .replace(/^dist\.(admin|manager|member)@plexus\.demo$/, "field.$1@plexus.demo")
        .replace(/^service\.(admin|manager|member)@plexus\.demo$/, "lab.$1@plexus.demo")
      const password = String(body.password ?? "")
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) throw unauthorized("Invalid email or password")
      invalidateSnapshot()
      return fetchPublicUser(data.user.id)
    },
  },
  {
    method: "POST",
    path: "/api/auth/logout",
    auth: false,
    handler: async () => {
      await supabase.auth.signOut()
      invalidateSnapshot()
      return { ok: true }
    },
  },
  {
    method: "GET",
    path: "/api/auth/me",
    auth: false, // only needs the session, so it does not load the whole snapshot
    handler: async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw unauthorized()
      return fetchPublicUser(data.session.user.id)
    },
  },

  {
    // The signed-in person edits their own name and title; a new password needs the current one.
    method: "PUT",
    path: "/api/auth/me",
    auth: false,
    handler: async ({ body }) => {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      if (!session) throw unauthorized()
      const newPassword = String(body.newPassword ?? "")
      if (newPassword) {
        if (newPassword.length < 6) throw badRequest("Password must be at least 6 characters")
        const check = await supabase.auth.signInWithPassword({ email: session.user.email ?? "", password: String(body.currentPassword ?? "") })
        if (check.error) throw badRequest("Your current password is not right")
      }
      await rpc("api_profile_update", { p_name: String(body.name ?? ""), p_title: String(body.title ?? "") })
      if (newPassword) {
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) throw badRequest(error.message)
      }
      return fetchPublicUser(session.user.id)
    },
  },

  // ---------------------------------------------------------------- hub: people and sample data
  {
    // Puts the sample data back. Only someone who is Admin of every office may do this: it resets everyone's data.
    method: "POST",
    path: "/api/hub/reset",
    handler: async () => rpc("api_reset_demo"),
  },
  {
    method: "POST",
    path: "/api/hub/users",
    handler: async ({ body }) => adminOp<PublicUser>("create-user", body),
  },
  {
    method: "PUT",
    path: "/api/hub/users/:id",
    handler: async ({ body, params }) => adminOp<PublicUser>("update-user", { ...body, id: params.id }),
  },

  // ---------------------------------------------------------------- stock
  {
    method: "POST",
    path: "/api/:siteId/inventory",
    minRole: "Manager",
    module: "inventory",
    handler: async (ctx) => {
      const values = cleanInventory(ctx, ctx.body)
      return mapInventory(await rpc<Row>("api_inventory_create", { p_site: ctx.siteId, p_values: values }))
    },
  },
  {
    method: "PUT",
    path: "/api/:siteId/inventory/:id",
    minRole: "Manager",
    module: "inventory",
    handler: async (ctx) => {
      const item = ctx.db.data[ctx.siteId].inventory.find((i) => i.id === ctx.params.id)
      if (!item) throw notFound("Item not found")
      const values = cleanInventory(ctx, { ...item, ...ctx.body })
      const row = await rpc<Row>("api_inventory_update", {
        p_site: ctx.siteId,
        p_id: ctx.params.id,
        p_values: values,
        p_reason: String(ctx.body.reason ?? ""),
      })
      return mapInventory(row)
    },
  },
  {
    method: "DELETE",
    path: "/api/:siteId/inventory/:id",
    minRole: "Admin",
    module: "inventory",
    handler: async (ctx) => adminOp("inventory-delete", { siteId: ctx.siteId, itemId: ctx.params.id }),
  },
  {
    method: "POST",
    path: "/api/:siteId/inventory/import",
    minRole: "Admin",
    module: "reports",
    handler: async (ctx) => {
      const rows = (ctx.body.rows ?? []) as ImportRow[]
      if (!rows.length) throw badRequest("The file has no rows to import")
      const all = fieldsFor(ctx.config, "inventory")
      const checked = all.filter((f) => BUILTIN_INV.includes(f.key))
      // Check every row first; one bad row rejects the whole file.
      const problems: string[] = []
      rows.forEach((r, i) => {
        const msg = Object.values(validateValues(checked, r as unknown as Record<string, unknown>))[0]
        if (msg) problems.push(`Row ${i + 2}: ${msg}`)
      })
      if (problems.length) throw unprocessable(`Import rejected — nothing was changed. ${problems.slice(0, 5).join("; ")}`)
      const values = rows.map((r) => withoutCalculated(all, normalizeValues(all, { ...r })))
      return rpc("api_inventory_import", { p_site: ctx.siteId, p_rows: values })
    },
  },

  // ---------------------------------------------------------------- requests
  {
    method: "POST",
    path: "/api/:siteId/requests",
    minRole: "Member",
    module: "request",
    handler: async (ctx) => {
      const { body, config } = ctx
      const type = body.type === "repair" ? "repair" : "material"
      if (type === "material" && !config.workflow.allowMaterialRequests) throw forbidden("Material requests are disabled on this site")
      if (type === "repair" && !config.workflow.allowRepairRequests) throw forbidden("Repair jobs are disabled on this site")
      if (type === "repair" && !String(body.purpose ?? "").trim() && body.repair?.meterId)
        body.purpose = `Repair ${String(body.repair.meterId).trim().toUpperCase()}`
      const fields = fieldsFor(config, "request")
      const firstErr = Object.values(validateValues(fields, body))[0]
      if (firstErr) throw badRequest(firstErr)
      const values = withoutCalculated(fields, normalizeValues(fields, body))
      const row = await rpc<Row>("api_request_create", {
        p_site: ctx.siteId,
        p_body: { ...values, type, lines: body.lines ?? [], repair: body.repair ?? null, caseId: body.caseId ?? null },
      })
      return mapRequest(row, namesOf(ctx))
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/requests/:id/approve",
    minRole: "Manager",
    module: "approval",
    handler: async (ctx) => {
      const res = await rpc<{ request: Row; assignmentCode?: string; repairCode?: string }>("api_request_approve", {
        p_site: ctx.siteId,
        p_id: ctx.params.id,
        p_comment: String(ctx.body.comment ?? ""),
      })
      return { request: mapRequest(res.request, namesOf(ctx)), assignmentCode: res.assignmentCode, repairCode: res.repairCode }
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/requests/:id/reject",
    minRole: "Manager",
    module: "approval",
    handler: async (ctx) =>
      mapRequest(await rpc<Row>("api_request_reject", { p_site: ctx.siteId, p_id: ctx.params.id, p_comment: String(ctx.body.comment ?? "") }), namesOf(ctx)),
  },
  {
    // The asker's own manager hands the request to the manager of the office that holds the stock.
    method: "POST",
    path: "/api/:siteId/requests/:id/forward",
    minRole: "Manager",
    module: "approval",
    handler: async (ctx) =>
      mapRequest(await rpc<Row>("api_request_forward", { p_site: ctx.siteId, p_id: ctx.params.id, p_note: String(ctx.body.note ?? "") }), namesOf(ctx)),
  },
  {
    method: "POST",
    path: "/api/:siteId/requests/:id/assign",
    minRole: "Manager",
    module: "assignment",
    handler: async (ctx) => mapAssignment(await rpc<Row>("api_request_assign", { p_site: ctx.siteId, p_id: ctx.params.id })),
  },

  // ---------------------------------------------------------------- using and giving back stock
  {
    method: "POST",
    path: "/api/:siteId/consumption",
    minRole: "Member",
    module: "consumption",
    handler: async (ctx) => mapConsumption(await rpc<Row>("api_consumption_create", { p_site: ctx.siteId, p_body: ctx.body })),
  },
  {
    method: "POST",
    path: "/api/:siteId/returns",
    minRole: "Member",
    module: "returns",
    handler: async (ctx) => {
      const res = await rpc<{ record: Row; stockSiteName: string }>("api_return_create", { p_site: ctx.siteId, p_body: ctx.body })
      return { record: mapReturn(res.record), stockSiteName: res.stockSiteName }
    },
  },

  // ---------------------------------------------------------------- PCB repairs
  {
    method: "POST",
    path: "/api/:siteId/repairs",
    minRole: "Member",
    module: "pcb-repair",
    handler: async (ctx) => {
      const fields = fieldsFor(ctx.config, "pcb-repair")
      const firstErr = Object.values(validateValues(fields, ctx.body))[0]
      if (firstErr) throw badRequest(firstErr)
      const values = withoutCalculated(fields, normalizeValues(fields, ctx.body))
      return mapRepair(await rpc<Row>("api_repair_create", { p_site: ctx.siteId, p_values: values }))
    },
  },
  {
    method: "PUT",
    path: "/api/:siteId/repairs/:id",
    minRole: "Member",
    module: "pcb-repair",
    handler: async (ctx) => {
      const job = ctx.db.data[ctx.siteId].repairs.find((r) => r.id === ctx.params.id)
      if (!job) throw notFound("Repair job not found")
      if (job.returned) throw conflict(`${job.code} was already returned to stock and is closed`)
      const STATUSES: RepairStatus[] = ["Received", "In Repair", "Fixed", "Scrapped"]
      if (ctx.body.status && !STATUSES.includes(ctx.body.status)) throw badRequest("Invalid status")
      const fields = fieldsFor(ctx.config, "pcb-repair")
      const merged = { ...job, ...ctx.body }
      const firstErr = Object.values(validateValues(fields, merged))[0]
      if (firstErr) throw badRequest(firstErr)
      const values = withoutCalculated(fields, normalizeValues(fields, merged))
      return mapRepair(
        await rpc<Row>("api_repair_update", { p_site: ctx.siteId, p_id: ctx.params.id, p_values: values, p_status: ctx.body.status ?? null }),
      )
    },
  },

  // ---------------------------------------------------------------- people in an office
  {
    method: "POST",
    path: "/api/:siteId/members",
    minRole: "Admin",
    module: "users",
    handler: async (ctx) => adminOp("add-member", { ...ctx.body, siteId: ctx.siteId }),
  },
  {
    method: "PUT",
    path: "/api/:siteId/members/:userId",
    minRole: "Admin",
    module: "users",
    handler: async (ctx) => adminOp("set-member-role", { siteId: ctx.siteId, userId: ctx.params.userId, role: ctx.body.role ?? null }),
  },

  {
    // The office a manager can send their own team's request on to when this office's store is short.
    method: "GET",
    path: "/api/:siteId/upstream",
    minRole: "Manager",
    handler: async (ctx) => {
      const id = ctx.config.workflow.upstreamSiteId
      return id && id !== ctx.siteId ? { id, name: ctx.db.sites[id]?.live.name ?? id } : null
    },
  },

  // ---------------------------------------------------------------- repair cases (client → hub → onsite / in-house teams)
  {
    method: "GET",
    path: "/api/:siteId/cases",
    minRole: "Member",
    module: CASE_MODULES,
    handler: async (ctx) => {
      const s = ctx.siteId
      const [cases, offices] = await Promise.all([
        supabase
          .from("service_cases")
          .select("*")
          .or(`client_site_id.eq.${s},hub_site_id.eq.${s},field_site_id.eq.${s},lab_site_id.eq.${s}`)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.rpc("api_case_offices"),
      ])
      if (cases.error) throw badRequest(`Could not load cases: ${cases.error.message}`)
      const ids = (cases.data ?? []).map((c: Row) => c.id)
      // Parts asked for these cases, as far as this person may see them (row-level security decides).
      const parts = ids.length ? await supabase.from("requests").select("*").in("case_id", ids) : { data: [] as Row[] }
      const names = namesOf(ctx)
      return {
        cases: (cases.data ?? []).map((c: Row) => mapCase(c, names)),
        requests: (parts.data ?? []).map((r: Row) => mapRequest(r, names)),
        offices: (offices.data ?? []) as { id: string; name: string; ownStock: boolean }[],
      }
    },
  },
  {
    method: "GET",
    path: "/api/:siteId/cases/people",
    minRole: "Manager",
    module: "case-work",
    handler: async (ctx) => {
      const { data, error } = await supabase.rpc("api_case_people", { p_site: ctx.siteId })
      if (error) throw badRequest(error.message)
      return data ?? []
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/cases",
    minRole: "Member",
    module: "cases",
    handler: async (ctx) => mapCase(await rpc<Row>("api_case_create", { p_site: ctx.siteId, p_body: ctx.body }), namesOf(ctx)),
  },
  {
    method: "POST",
    path: "/api/:siteId/cases/:id/:action",
    minRole: "Member",
    module: CASE_MODULES,
    handler: async (ctx) => {
      const { id, action } = ctx.params
      const note = String(ctx.body.note ?? "")
      const base = { p_site: ctx.siteId, p_id: id }
      const call: Record<string, () => Promise<Row>> = {
        route: () => rpc("api_case_route", { ...base, p_field: ctx.body.fieldSiteId ?? null, p_lab: ctx.body.labSiteId ?? null, p_note: note }),
        reject: () => rpc("api_case_reject", { ...base, p_note: note }),
        close: () => rpc("api_case_close", { ...base, p_note: note }),
        reopen: () => rpc("api_case_reopen", { ...base, p_note: note }),
        assign: () => rpc("api_case_assign", { ...base, p_user: ctx.body.userId ?? null }),
        log: () => rpc("api_case_log", { ...base, p_kind: String(ctx.body.kind ?? "note"), p_note: note }),
        complete: () => rpc("api_case_complete", { ...base, p_note: note }),
      }
      if (!call[action]) throw notFound(`Unknown case action "${action}"`)
      return mapCase(await call[action](), namesOf(ctx))
    },
  },

  // ---------------------------------------------------------------- builder: draft, make live, go back
  {
    method: "PUT",
    path: "/api/:siteId/builder/draft",
    minRole: "Admin",
    handler: async (ctx) => {
      const cfg = validateIncoming(ctx, ctx.body.config)
      await rpc("api_draft_save", { p_site: ctx.siteId, p_config: cfg })
      return freshBuilderState(ctx)
    },
  },
  {
    method: "DELETE",
    path: "/api/:siteId/builder/draft",
    minRole: "Admin",
    handler: async (ctx) => {
      await rpc("api_draft_discard", { p_site: ctx.siteId })
      return freshBuilderState(ctx)
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/builder/publish",
    minRole: "Admin",
    handler: async (ctx) => {
      const incoming = ctx.body.config ?? ctx.site.draft
      if (!incoming) throw conflict("There is nothing to make live yet. Save your changes first.")
      const cfg = validateIncoming(ctx, incoming)
      const summary = String(ctx.body.note ?? "").trim() || summarizeDiff(diffConfigs(ctx.site.live, cfg))
      const res = await rpc<{ published: number; summary: string }>("api_publish", { p_site: ctx.siteId, p_config: cfg, p_summary: summary })
      return { ...(await freshBuilderState(ctx)), published: res.published, summary: res.summary }
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/builder/rollback/:version",
    minRole: "Admin",
    handler: async (ctx) => {
      const site = ctx.site
      const v = Number(ctx.params.version)
      const target = site.versions.find((x) => x.version === v)
      if (!target) throw notFound(`Version v${v} not found`)
      if (site.liveVersion === v) throw conflict(`v${v} is already live`)
      const note = `Rolled back v${site.liveVersion} → v${v}. ${summarizeDiff(diffConfigs(site.live, target.config))}`
      await rpc("api_rollback", { p_site: ctx.siteId, p_version: v, p_note: note })
      return freshBuilderState(ctx)
    },
  },
)
