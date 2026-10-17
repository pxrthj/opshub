// Privileged actions that the browser cannot do itself: creating logins, resetting passwords, changing or removing
// roles, and deleting stock. Every call is checked against the caller's own role first (their JWT is verified by
// Supabase, then we look up what they may administer); only then do we act with the server key.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } })
const ROLES = ["Public", "Member", "Manager", "Admin"]
const MIN_PASSWORD = 6 // Supabase Auth's minimum

/** International form (+919876543210). A plain 10-digit number is taken as an Indian mobile. Empty means "no phone". */
function normalizePhone(raw: unknown): string | null {
  const t = String(raw ?? "").replace(/[\s\-().]/g, "")
  if (!t) return null
  const withPlus = /^\d{10}$/.test(t) ? `+91${t}` : /^91\d{10}$/.test(t) ? `+${t}` : t
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) throw new HttpError(400, "Mobile number must look like +919876543210 (or a 10-digit Indian number)")
  return withPlus
}

async function assertPhoneFree(db: Db, phone: string, exceptUserId?: string) {
  const { data } = await db.from("profiles").select("id").eq("phone", phone).maybeSingle()
  if (data && data.id !== exceptUserId) throw new HttpError(409, `${phone} already belongs to someone else`)
}

type Roles = Record<string, string>
type Db = SupabaseClient

async function rolesOf(db: Db, userId: string): Promise<Roles> {
  const { data, error } = await db.from("site_members").select("site_id, role").eq("user_id", userId)
  if (error) throw new HttpError(500, error.message)
  return Object.fromEntries((data ?? []).map((m) => [m.site_id, m.role]))
}

async function publicUser(db: Db, userId: string) {
  const { data, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle()
  if (error || !data) throw new HttpError(404, "User not found")
  return { id: data.id, legacyId: data.legacy_id ?? undefined, email: data.email, phone: data.phone ?? undefined, name: data.name, title: data.title, roles: await rolesOf(db, userId) }
}

async function siteIds(db: Db): Promise<string[]> {
  const { data } = await db.from("sites").select("id")
  return (data ?? []).map((s) => s.id)
}

const adminSitesOf = (roles: Roles) => Object.entries(roles).filter(([, r]) => r === "Admin").map(([s]) => s)

/** An Admin may only change roles on offices where they are Admin themselves. */
async function sanitizeRoles(db: Db, input: unknown, allowed: string[], current: Roles): Promise<Roles> {
  const known = await siteIds(db)
  const next: Roles = { ...current }
  for (const [siteId, role] of Object.entries((input ?? {}) as Record<string, string | null>)) {
    if (!known.includes(siteId)) continue
    if ((current[siteId] ?? null) === (role ?? null)) continue
    if (!allowed.includes(siteId)) throw new HttpError(403, `You are not an Admin on ${siteId}`)
    if (role && !ROLES.includes(role)) throw new HttpError(400, `Unknown role ${role}`)
    if (role) next[siteId] = role
    else delete next[siteId]
  }
  return next
}

async function applyRoles(db: Db, userId: string, before: Roles, after: Roles) {
  for (const siteId of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[siteId] === after[siteId]) continue
    if (after[siteId]) {
      const { error } = await db.from("site_members").upsert({ site_id: siteId, user_id: userId, role: after[siteId] })
      if (error) throw new HttpError(500, error.message)
    } else {
      const { error } = await db.from("site_members").delete().eq("site_id", siteId).eq("user_id", userId)
      if (error) throw new HttpError(500, error.message)
    }
  }
}

function checkNewLogin(email: string, name: string, password: string) {
  if (!name) throw new HttpError(400, "Name is required")
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "A valid email is required")
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`)
}

async function createLogin(db: Db, email: string, name: string, title: string, password: string, phone: string | null = null): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, ...(phone ? { phone, phone_confirm: true } : {}) })
  if (error || !data.user) throw new HttpError(error?.status === 422 ? 409 : 400, error?.message ?? "Could not create the login")
  const { error: pErr } = await db.from("profiles").insert({ id: data.user.id, email, phone, name, title: title || "Staff" })
  if (pErr) {
    await db.auth.admin.deleteUser(data.user.id) // do not leave a login without a profile
    throw new HttpError(500, pErr.message)
  }
  return data.user.id
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  try {
    const url = Deno.env.get("SUPABASE_URL")!
    const authed = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
    const { data: who } = await authed.auth.getUser()
    if (!who.user) throw new HttpError(401, "Please sign in")
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })

    const callerId = who.user.id
    const callerRoles = await rolesOf(db, callerId)
    const allowed = adminSitesOf(callerRoles)
    const everySite = await siteIds(db)
    const isSuper = everySite.length > 0 && everySite.every((s) => allowed.includes(s))
    const body = await req.json().catch(() => ({}))
    const requireAnyAdmin = () => {
      if (!allowed.length) throw new HttpError(403, "Access denied: User Management needs the Admin role on at least one site")
    }
    const requireAdminOn = (siteId: string) => {
      if (!callerRoles[siteId]) throw new HttpError(403, "Access denied: you have no role on that office")
      if (callerRoles[siteId] !== "Admin") throw new HttpError(403, "Access denied: this action needs the Admin role on that office")
    }

    switch (body.action) {
      case "create-user": {
        requireAnyAdmin()
        const email = String(body.email ?? "").trim().toLowerCase()
        const name = String(body.name ?? "").trim()
        const password = String(body.password ?? "")
        checkNewLogin(email, name, password)
        const phone = normalizePhone(body.phone)
        if (phone) await assertPhoneFree(db, phone)
        const roles = await sanitizeRoles(db, body.roles, allowed, {})
        if (!isSuper && !allowed.some((s) => roles[s] != null)) throw new HttpError(400, "You must assign at least one role in your administered office")
        const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle()
        if (existing) throw new HttpError(409, `${email} already exists`)
        const id = await createLogin(db, email, name, String(body.title ?? "").trim(), password, phone)
        await applyRoles(db, id, {}, roles)
        return json(await publicUser(db, id))
      }

      case "update-user": {
        requireAnyAdmin()
        const id = String(body.id ?? "")
        const targetRoles = await rolesOf(db, id)
        await publicUser(db, id) // 404 if missing
        if (!isSuper && !allowed.some((s) => targetRoles[s] != null)) throw new HttpError(403, "You can only manage people belonging to your office")
        const patch: Record<string, string | null> = {}
        if (body.name !== undefined) {
          if (!String(body.name).trim()) throw new HttpError(400, "Name is required")
          patch.name = String(body.name).trim()
        }
        if (body.title !== undefined) patch.title = String(body.title).trim()
        if (body.phone !== undefined) {
          const phone = normalizePhone(body.phone)
          if (phone) await assertPhoneFree(db, phone, id)
          const { error } = await db.auth.admin.updateUserById(id, phone ? { phone, phone_confirm: true } : { phone: "" })
          if (error) throw new HttpError(400, error.message)
          patch.phone = phone
        }
        if (body.password) {
          if (String(body.password).length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`)
          const { error } = await db.auth.admin.updateUserById(id, { password: String(body.password) })
          if (error) throw new HttpError(400, error.message)
        }
        if (body.roles) {
          const next = await sanitizeRoles(db, body.roles, allowed, targetRoles)
          if (id === callerId) {
            for (const s of allowed) if (next[s] !== "Admin") throw new HttpError(400, "You can't remove your own Admin role (you'd lock yourself out)")
          }
          await applyRoles(db, id, targetRoles, next)
        }
        if (Object.keys(patch).length) {
          const { error } = await db.from("profiles").update(patch).eq("id", id)
          if (error) throw new HttpError(500, error.message)
        }
        return json(await publicUser(db, id))
      }

      case "add-member": {
        const siteId = String(body.siteId ?? "")
        requireAdminOn(siteId)
        const email = String(body.email ?? "").trim().toLowerCase()
        const name = String(body.name ?? "").trim()
        const role = String(body.role ?? "Member")
        if (!ROLES.includes(role)) throw new HttpError(400, `Unknown role ${role}`)
        let { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle()
        if (!existing) {
          checkNewLogin(email, name, String(body.password ?? ""))
          const phone = normalizePhone(body.phone)
          if (phone) await assertPhoneFree(db, phone)
          existing = { id: await createLogin(db, email, name, String(body.title ?? "").trim(), String(body.password), phone) }
        } else if (body.title) {
          await db.from("profiles").update({ title: String(body.title).trim() }).eq("id", existing.id)
        }
        const before = await rolesOf(db, existing.id)
        await applyRoles(db, existing.id, before, { ...before, [siteId]: role })
        return json({ user: await publicUser(db, existing.id), role })
      }

      case "set-member-role": {
        const siteId = String(body.siteId ?? "")
        requireAdminOn(siteId)
        const userId = String(body.userId ?? "")
        const role = body.role == null ? null : String(body.role)
        if (userId === callerId && role !== "Admin") throw new HttpError(400, "You can't change your own Admin role here")
        if (role && !ROLES.includes(role)) throw new HttpError(400, `Unknown role ${role}`)
        await publicUser(db, userId)
        const before = await rolesOf(db, userId)
        const after = { ...before }
        if (role) after[siteId] = role
        else delete after[siteId]
        await applyRoles(db, userId, before, after)
        return json({ user: await publicUser(db, userId), role })
      }

      case "inventory-delete": {
        const siteId = String(body.siteId ?? "")
        requireAdminOn(siteId)
        const { data: site } = await db.from("sites").select("live").eq("id", siteId).maybeSingle()
        if (!site?.live?.modules?.includes("inventory")) throw new HttpError(403, "Stock is not enabled on that office")
        const source = site.live.workflow?.stockSourceSiteId
        if (source && source !== siteId) throw new HttpError(409, "Inventory here is linked read-only from another office. Edit it there.")
        const { data: item } = await db.from("inventory_items").select("*").eq("site_id", siteId).eq("id", String(body.itemId ?? "")).maybeSingle()
        if (!item) throw new HttpError(404, "Item not found")
        const { data: me } = await db.from("profiles").select("name").eq("id", callerId).maybeSingle()
        const auditId = `aud_${crypto.randomUUID().slice(0, 8)}`
        const { error: aErr } = await db.from("product_audits").insert({
          id: auditId, site_id: siteId, item_id: item.id, item_name: item.name, category: item.category, unit: item.unit,
          field: "deleted", change_type: "delete", old_value: null, new_value: null, reason: "Item removed from inventory",
          actor_id: callerId, actor_name: me?.name ?? "Admin", actor_role: "Admin",
        })
        if (aErr) throw new HttpError(500, aErr.message)
        const { error } = await db.from("inventory_items").delete().eq("site_id", siteId).eq("id", item.id)
        if (error) {
          await db.from("product_audits").delete().eq("id", auditId) // no audit entry for a delete that did not happen
          throw new HttpError(500, error.message)
        }
        return json({ ok: true })
      }

      default:
        throw new HttpError(400, "Unknown action")
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, status: e.status }, e.status)
    return json({ error: e instanceof Error ? e.message : "Something went wrong", status: 500 }, 500)
  }
})
