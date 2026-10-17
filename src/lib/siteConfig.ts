import {
  CORE_MODULES,
  MODULE_DEFINITIONS,
  getModuleDef,
  requirementLabel,
  requirementSatisfied,
  PORT_LABELS,
} from "@/modules/definitions"
import type { CanvasEdge, CanvasNode, FieldDef, ModuleId, Role, SiteConfig, SitePage } from "./types"
import { ROLES } from "./roles"

// Pure helpers that turn a builder canvas into a SiteConfig and validate it.
// Used by both the builder UI and the mock API (publish re-validates server-side).

const PAGE_ORDER: ModuleId[] = [
  "shell",
  "inventory",
  "stock-dashboard",
  "request",
  "approval",
  "assignment",
  "assignment-frontend",
  "consumption",
  "returns",
  "pcb-repair",
  "analytics",
  "reports",
  "audit-log",
  "users",
]

export function derivePages(modules: ModuleId[]): SitePage[] {
  const enabled = new Set<ModuleId>([...CORE_MODULES, ...modules])
  return PAGE_ORDER.filter((id) => enabled.has(id))
    .map((id) => getModuleDef(id))
    .filter((def) => def.page)
    .map((def) => ({
      id: def.id,
      moduleId: def.id,
      path: def.page!.path,
      label: def.page!.label,
      minRole: def.page!.minRole,
    }))
}

export function rolesUsed(pages: SitePage[]): Role[] {
  return ROLES.filter((r) => pages.some((p) => p.minRole === r) || r === "Admin")
}

/** Ensure every enabled module has a field list (fills defaults for new modules, keeps edits for existing). */
export function ensureFields(fields: SiteConfig["fields"], modules: ModuleId[]): SiteConfig["fields"] {
  const out: SiteConfig["fields"] = { ...fields }
  for (const id of modules) {
    const def = getModuleDef(id)
    if (def.defaultFields.length && !out[id]) out[id] = def.defaultFields.map((f) => ({ ...f }))
  }
  return out
}

export function modulesFromCanvas(nodes: CanvasNode[]): ModuleId[] {
  const ids = new Set<ModuleId>(nodes.map((n) => n.moduleId))
  return MODULE_DEFINITIONS.filter((m) => !m.core && ids.has(m.id)).map((m) => m.id)
}

/** The canvas is the source of truth: modules + pages are derived from its nodes. */
export function buildConfigFromCanvas(base: SiteConfig, nodes: CanvasNode[], edges: CanvasEdge[]): SiteConfig {
  const modules = [...CORE_MODULES, ...modulesFromCanvas(nodes)]
  const pages = derivePages(modules)
  return {
    ...base,
    modules,
    pages,
    roles: rolesUsed(pages),
    fields: ensureFields(base.fields, modules),
    canvas: { nodes: nodes.map((n) => ({ ...n })), edges: edges.map((e) => ({ ...e })) },
  }
}

export interface CanvasIssue {
  nodeId: string
  message: string
}

function ancestors(nodeId: string, nodes: CanvasNode[], edges: CanvasEdge[]): Set<ModuleId> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const result = new Set<ModuleId>()
  const stack = [nodeId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const e of edges) {
      if (e.target === cur && !seen.has(e.source)) {
        seen.add(e.source)
        const n = byId.get(e.source)
        if (n) {
          result.add(n.moduleId)
          stack.push(n.id)
        }
      }
    }
  }
  return result
}

/** Every module's requirements must be present AND connected upstream of it. */
export function validateCanvas(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasIssue[] {
  const issues: CanvasIssue[] = []
  const present = new Set(nodes.map((n) => n.moduleId))
  for (const node of nodes) {
    const def = getModuleDef(node.moduleId)
    const up = ancestors(node.id, nodes, edges)
    for (const req of def.requires) {
      if (!requirementSatisfied(req, present)) {
        issues.push({ nodeId: node.id, message: `Add ${requirementLabel(req)} to the board first.` })
      } else if (!requirementSatisfied(req, up)) {
        issues.push({ nodeId: node.id, message: `Link it after ${requirementLabel(req)}.` })
      }
    }
  }
  return issues
}

function createsCycle(source: string, target: string, edges: CanvasEdge[]) {
  // adding source->target creates a cycle if source is reachable from target
  const stack = [target]
  const seen = new Set<string>()
  while (stack.length) {
    const cur = stack.pop()!
    if (cur === source) return true
    if (seen.has(cur)) continue
    seen.add(cur)
    for (const e of edges) if (e.source === cur) stack.push(e.target)
  }
  return false
}

/** Typed connection check. Returns an explanation if the edge is invalid, otherwise null. */
export function connectionError(
  sourceModule: ModuleId,
  targetModule: ModuleId,
  sourceId: string,
  targetId: string,
  edges: CanvasEdge[],
): string | null {
  const s = getModuleDef(sourceModule)
  const t = getModuleDef(targetModule)
  if (sourceId === targetId) return "A feature cannot be linked to itself."
  if (edges.some((e) => e.source === sourceId && e.target === targetId)) return "These are already linked."
  if (t.inputs.length === 0) return `${t.name} comes first, so nothing can be linked into it.`
  if (s.outputs.length === 0) return `${s.name} comes last, so it cannot be linked onward.`
  const shared = s.outputs.filter((o) => t.inputs.includes(o))
  if (shared.length === 0) {
    const needs = t.requires.length ? t.requires.map(requirementLabel).join(" or ") : t.inputs.map((i) => PORT_LABELS[i]).join(" / ")
    return `${t.name} cannot follow ${s.name} directly. It needs ${needs} first.`
  }
  if (createsCycle(sourceId, targetId, edges)) return "This would make the steps go round in a circle."
  return null
}

export interface ConfigDiff {
  added: ModuleId[]
  removed: ModuleId[]
  fieldsChanged: ModuleId[]
  workflowChanged: boolean
  nameChanged: boolean
}

export function diffConfigs(a: SiteConfig, b: SiteConfig): ConfigDiff {
  const added = b.modules.filter((m) => !a.modules.includes(m))
  const removed = a.modules.filter((m) => !b.modules.includes(m))
  const fieldsChanged = (Object.keys(b.fields) as ModuleId[]).filter(
    (k) => a.fields[k] && JSON.stringify(a.fields[k]) !== JSON.stringify(b.fields[k]),
  )
  return {
    added,
    removed,
    fieldsChanged,
    workflowChanged: JSON.stringify(a.workflow) !== JSON.stringify(b.workflow),
    nameChanged: a.name !== b.name,
  }
}

export function summarizeDiff(d: ConfigDiff): string {
  const parts: string[] = []
  if (d.added.length) parts.push(`Added ${d.added.map((m) => getModuleDef(m).name).join(", ")}`)
  if (d.removed.length) parts.push(`Removed ${d.removed.map((m) => getModuleDef(m).name).join(", ")}`)
  if (d.fieldsChanged.length) parts.push(`Changed the form fields of ${d.fieldsChanged.map((m) => getModuleDef(m).short).join(", ")}`)
  if (d.workflowChanged) parts.push("Options changed")
  if (d.nameChanged) parts.push("Office renamed")
  return parts.join("; ") || "Nothing changed"
}

export function fieldsFor(config: SiteConfig, moduleId: ModuleId): FieldDef[] {
  return config.fields[moduleId] ?? getModuleDef(moduleId).defaultFields
}

export function hasModule(config: SiteConfig, moduleId: ModuleId) {
  return config.modules.includes(moduleId)
}
