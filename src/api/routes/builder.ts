import { validateFormula } from "@/lib/formula"
import { numericFieldKeys } from "@/lib/fields"
import { buildConfigFromCanvas, diffConfigs, summarizeDiff, validateCanvas } from "@/lib/siteConfig"
import type { BuilderState, ModuleId, SiteConfig } from "@/lib/types"
import { uid } from "@/lib/utils"
import { MODULE_DEFINITIONS } from "@/modules/definitions"
import { badRequest, conflict, notFound, unprocessable } from "../errors"
import { register, type Ctx } from "../router"

// Builder / deploy routes. Admin-only on the target site.

function state(ctx: Ctx): BuilderState {
  const s = ctx.site
  return {
    live: s.live,
    liveVersion: s.liveVersion,
    draft: s.draft,
    draftSavedAt: s.draftSavedAt,
    draftSavedBy: s.draftSavedBy,
    versions: [...s.versions].sort((a, b) => b.version - a.version),
    events: [...s.events].sort((a, b) => b.at.localeCompare(a.at)),
  }
}

/** Server-side re-validation of a config coming from the builder. Returns the normalised config. */
function validateIncoming(ctx: Ctx, incoming: SiteConfig): SiteConfig {
  if (!incoming || !incoming.canvas) throw badRequest("Missing config")
  const known = new Set<ModuleId>(MODULE_DEFINITIONS.map((m) => m.id))
  const nodes = incoming.canvas.nodes.filter((n) => known.has(n.moduleId))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = incoming.canvas.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  const dupes = nodes.map((n) => n.moduleId).filter((m, i, arr) => arr.indexOf(m) !== i)
  if (dupes.length) throw unprocessable(`Each module can only be used once (${dupes.join(", ")})`)

  const issues = validateCanvas(nodes, edges)
  if (issues.length) throw unprocessable(`Fix the workflow first: ${issues.map((i) => i.message).join(" ")}`)

  const name = String(incoming.name ?? "").trim()
  if (!name) throw badRequest("Site name is required")
  const base: SiteConfig = {
    ...incoming,
    siteId: ctx.siteId, // never trust the body for identity
    slug: ctx.site.live.slug, // slugs are immutable (URLs)
    name,
  }
  const cfg = buildConfigFromCanvas(base, nodes, edges)
  for (const [mod, fields] of Object.entries(cfg.fields)) {
    const keys = new Set<string>()
    for (const f of fields ?? []) {
      if (!f.key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.key)) throw unprocessable(`Field "${f.label}" in ${mod} has an invalid key`)
      if (keys.has(f.key)) throw unprocessable(`Duplicate field key "${f.key}" in ${mod}`)
      keys.add(f.key)
      if (f.type === "calculated") {
        const err = validateFormula(f.formula ?? "", numericFieldKeys(fields ?? [], f.key))
        if (err) throw unprocessable(`Formula for "${f.label}": ${err}`)
      }
      if (f.type === "select" && !(f.options ?? []).length) throw unprocessable(`Select field "${f.label}" needs at least one option`)
    }
  }
  const src = cfg.workflow.stockSourceSiteId
  if (src && !ctx.db.sites[src]) throw unprocessable("Stock source site does not exist")
  return cfg
}

register(
  {
    method: "GET",
    path: "/api/:siteId/builder",
    minRole: "Admin",
    handler: state,
  },
  {
    method: "PUT",
    path: "/api/:siteId/builder/draft",
    minRole: "Admin",
    handler: (ctx) => {
      const cfg = validateIncoming(ctx, ctx.body.config)
      ctx.site.draft = cfg
      ctx.site.draftSavedAt = new Date().toISOString()
      ctx.site.draftSavedBy = ctx.user!.name
      return state(ctx)
    },
  },
  {
    method: "DELETE",
    path: "/api/:siteId/builder/draft",
    minRole: "Admin",
    handler: (ctx) => {
      ctx.site.draft = null
      ctx.site.draftSavedAt = null
      ctx.site.draftSavedBy = null
      return state(ctx)
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/builder/publish",
    minRole: "Admin",
    handler: (ctx) => {
      const incoming = ctx.body.config ?? ctx.site.draft
      if (!incoming) throw conflict("Nothing to publish — save a draft first")
      const cfg = validateIncoming(ctx, incoming)
      const site = ctx.site
      const diff = diffConfigs(site.live, cfg)
      const version = Math.max(...site.versions.map((v) => v.version)) + 1
      const summary = String(ctx.body.note ?? "").trim() || summarizeDiff(diff)
      const now = new Date().toISOString()
      site.versions.push({ version, config: cfg, publishedAt: now, author: ctx.user!.name, summary })
      site.events.push({ id: uid("ev"), action: "publish", version, fromVersion: site.liveVersion, at: now, author: ctx.user!.name, note: summary })
      site.live = cfg
      site.liveVersion = version
      site.draft = null
      site.draftSavedAt = null
      site.draftSavedBy = null
      return { ...state(ctx), published: version, summary }
    },
  },
  {
    method: "POST",
    path: "/api/:siteId/builder/rollback/:version",
    minRole: "Admin",
    handler: (ctx) => {
      const site = ctx.site
      const v = Number(ctx.params.version)
      const target = site.versions.find((x) => x.version === v)
      if (!target) throw notFound(`Version v${v} not found`)
      if (site.liveVersion === v) throw conflict(`v${v} is already live`)
      const diff = summarizeDiff(diffConfigs(site.live, target.config))
      site.events.push({
        id: uid("ev"),
        action: "rollback",
        version: v,
        fromVersion: site.liveVersion,
        at: new Date().toISOString(),
        author: ctx.user!.name,
        note: `Rolled back v${site.liveVersion} → v${v}. ${diff}`,
      })
      site.live = target.config
      site.liveVersion = v
      // a draft built on top of the old live version would be confusing — discard it
      site.draft = null
      site.draftSavedAt = null
      site.draftSavedBy = null
      return state(ctx)
    },
  },
)
