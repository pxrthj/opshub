import { AlertTriangle, CheckCircle2, Palette, Settings2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { CanvasIssue } from "@/lib/siteConfig"
import { mix, THEME_SWATCHES } from "@/lib/theme"
import type { CanvasEdge, CanvasNode, FieldDef, SiteConfig, SiteSummary, WorkflowSettings } from "@/lib/types"
import { cn } from "@/lib/utils"
import { getModuleDef, PORT_LABELS, requirementLabel, SETTING_LABELS } from "@/modules/definitions"
import { FieldEditor } from "./FieldEditor"

const OWN = "__own__"

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
        {icon}
        {title}
      </p>
      {children}
    </div>
  )
}

function WorkflowControl({
  k,
  config,
  setConfig,
  sites,
}: {
  k: keyof WorkflowSettings
  config: SiteConfig
  setConfig: (c: SiteConfig) => void
  sites: SiteSummary[]
}) {
  const meta = SETTING_LABELS[k]
  const set = (v: WorkflowSettings[typeof k]) => setConfig({ ...config, workflow: { ...config.workflow, [k]: v } })
  const value = config.workflow[k]
  return (
    <div className="rounded-lg border bg-white p-2.5">
      {typeof value === "boolean" ? (
        <label className="flex cursor-pointer items-start justify-between gap-3">
          <span>
            <span className="block text-sm font-medium text-slate-800">{meta.label}</span>
            <span className="block text-[11px] text-slate-500">{meta.help}</span>
          </span>
          <Switch checked={value} onCheckedChange={(v) => set(v)} />
        </label>
      ) : k === "stockSourceSiteId" ? (
        <div className="space-y-1.5">
          <Label className="text-sm">{meta.label}</Label>
          <Select value={(value as string | null) ?? OWN} onValueChange={(v) => set(v === OWN || v === config.siteId ? null : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OWN}>This unit's own store</SelectItem>
              {sites
                .filter((s) => s.config.siteId !== config.siteId)
                .map((s) => (
                  <SelectItem key={s.config.siteId} value={s.config.siteId}>
                    Linked: {s.config.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-slate-500">{meta.help}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-sm">{meta.label}</Label>
          <Input type="number" min={1} value={String(value)} onChange={(e) => set(Math.max(1, Number(e.target.value) || 1))} />
          <p className="text-[11px] text-slate-500">{meta.help}</p>
        </div>
      )}
    </div>
  )
}

export function SettingsPanel({
  config,
  setConfig,
  node,
  issues,
  sites,
  onRemoveNode,
  onClose,
  canvasNodes = [],
  canvasEdges = [],
  onConnectNodes,
  onDisconnectEdge,
  onStartWire,
}: {
  config: SiteConfig
  setConfig: (c: SiteConfig) => void
  node: CanvasNode | null
  issues: CanvasIssue[]
  sites: SiteSummary[]
  onRemoveNode: (id: string) => void
  onClose: () => void
  canvasNodes?: CanvasNode[]
  canvasEdges?: CanvasEdge[]
  onConnectNodes?: (sourceId: string, targetId: string) => void
  onDisconnectEdge?: (edgeId: string) => void
  onStartWire?: (sourceId: string) => void
}) {
  if (node) {
    const def = getModuleDef(node.moduleId)
    const nodeIssues = issues.filter((i) => i.nodeId === node.id)
    const fields: FieldDef[] = config.fields[node.moduleId] ?? def.defaultFields
    const hasFields = def.defaultFields.length > 0 || !!config.fields[node.moduleId]

    // Wires connected to this node
    const incomingEdges = canvasEdges.filter((e) => e.target === node.id)
    const outgoingEdges = canvasEdges.filter((e) => e.source === node.id)
    const nodeMap = new Map(canvasNodes.map((n) => [n.id, n]))

    // Candidate nodes to connect to
    const availableTargets = canvasNodes.filter((n) => n.id !== node.id && getModuleDef(n.moduleId).inputs.length > 0)

    return (
      <div className="space-y-5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: config.theme.primary }}>
            <def.icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{def.name}</p>
            <p className="text-xs text-slate-500">{def.description}</p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close module settings">
            <X />
          </Button>
        </div>
        <Section title="Connections">
          <dl className="grid grid-cols-[70px_1fr] gap-1 text-xs">
            <dt className="text-slate-500">Requires</dt>
            <dd>{def.requires.length ? def.requires.map(requirementLabel).join(" + ") : "Nothing — starting module"}</dd>
            <dt className="text-slate-500">Inputs</dt>
            <dd>{def.inputs.map((p) => PORT_LABELS[p]).join(", ") || "—"}</dd>
            <dt className="text-slate-500">Outputs</dt>
            <dd>{def.outputs.map((p) => PORT_LABELS[p]).join(", ") || "—"}</dd>
            <dt className="text-slate-500">Page</dt>
            <dd>{def.page ? `${def.page.label} (/${def.page.path}) · ${def.page.minRole}+` : "No page"}</dd>
          </dl>

          {/* Connected Wires */}
          {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
            <div className="mt-2 space-y-1.5 rounded-lg border bg-white p-2">
              <p className="text-[11px] font-semibold text-slate-600">Active Wires</p>
              {incomingEdges.map((e) => {
                const src = nodeMap.get(e.source)
                const srcDef = src ? getModuleDef(src.moduleId) : null
                return (
                  <div key={e.id} className="flex items-center justify-between gap-1 text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded">
                    <span className="truncate">⬅ {srcDef?.name ?? "Source"}</span>
                    {onDisconnectEdge && (
                      <button
                        type="button"
                        onClick={() => onDisconnectEdge(e.id)}
                        className="text-red-500 hover:text-red-700 text-[10px] font-medium px-1 rounded hover:bg-red-50"
                        title="Disconnect wire"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                )
              })}
              {outgoingEdges.map((e) => {
                const tgt = nodeMap.get(e.target)
                const tgtDef = tgt ? getModuleDef(tgt.moduleId) : null
                return (
                  <div key={e.id} className="flex items-center justify-between gap-1 text-xs text-slate-700 bg-slate-50 px-2 py-1 rounded">
                    <span className="truncate">➔ {tgtDef?.name ?? "Target"}</span>
                    {onDisconnectEdge && (
                      <button
                        type="button"
                        onClick={() => onDisconnectEdge(e.id)}
                        className="text-red-500 hover:text-red-700 text-[10px] font-medium px-1 rounded hover:bg-red-50"
                        title="Disconnect wire"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Quick Connect / Wire Dropdown */}
          {def.outputs.length > 0 && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-sky-100 bg-sky-50/60 p-2.5">
              <p className="text-[11px] font-semibold text-sky-900 flex items-center justify-between">
                <span>Quick Wire to Block</span>
                {onStartWire && (
                  <button
                    type="button"
                    onClick={() => onStartWire(node.id)}
                    className="text-[10px] font-medium text-amber-700 hover:underline flex items-center gap-0.5"
                  >
                    ⚡ Wire Mode
                  </button>
                )}
              </p>
              {availableTargets.length === 0 ? (
                <p className="text-[11px] text-slate-500">No other blocks with input ports on the board.</p>
              ) : (
                <div className="space-y-1">
                  <Select
                    value=""
                    onValueChange={(tgtId) => {
                      if (tgtId && onConnectNodes) {
                        onConnectNodes(node.id, tgtId)
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 bg-white text-xs">
                      <SelectValue placeholder="Choose block to wire..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTargets.map((tgt) => {
                        const tDef = getModuleDef(tgt.moduleId)
                        const alreadyConnected = outgoingEdges.some((e) => e.target === tgt.id)
                        return (
                          <SelectItem key={tgt.id} value={tgt.id} disabled={alreadyConnected}>
                            {tDef.name} {alreadyConnected ? "(Already connected)" : ""}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-500">Pick a module to wire directly without mouse dragging.</p>
                </div>
              )}
            </div>
          )}

          {nodeIssues.length ? (
            <div className="space-y-1 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 ring-1 ring-red-200">
              {nodeIssues.map((i) => (
                <p key={i.message} className="flex gap-1.5">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {i.message}
                </p>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="size-3.5" /> All requirements connected
            </p>
          )}
        </Section>
        {def.settings.length > 0 && (
          <Section title="Workflow options" icon={<Settings2 className="size-3.5" />}>
            {def.settings.map((k) => (
              <WorkflowControl key={k} k={k} config={config} setConfig={setConfig} sites={sites} />
            ))}
          </Section>
        )}
        {hasFields && (
          <Section title={`Fields (${fields.length})`}>
            <FieldEditor fields={fields} onChange={(next) => setConfig({ ...config, fields: { ...config.fields, [node.moduleId]: next } })} />
          </Section>
        )}
        <Separator />
        <Button variant="destructive" className="w-full" onClick={() => onRemoveNode(node.id)}>
          <Trash2 /> Remove from board
        </Button>
      </div>
    )
  }

  const t = config.theme
  const setTheme = (patch: Partial<SiteConfig["theme"]>) => {
    const next = { ...t, ...patch }
    if (patch.primary) {
      next.accent = mix("#ffffff", patch.primary, 0.14)
      next.background = mix("#ffffff", patch.primary, 0.035)
    }
    setConfig({ ...config, theme: next })
  }
  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="font-semibold text-slate-900">Office settings</p>
        <p className="text-xs text-slate-500">Click a block on the board to change it.</p>
      </div>
      <Section title="Identity">
        <div className="space-y-1.5">
          <Label>Office name</Label>
          <Input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={config.description} onChange={(e) => setConfig({ ...config, description: e.target.value })} />
        </div>
        <p className="text-[11px] text-slate-500">
          URL: <code className="rounded bg-slate-100 px-1">/s/{config.slug}</code> (fixed)
        </p>
      </Section>
      <Section title="Theme" icon={<Palette className="size-3.5" />}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={t.primary}
            onChange={(e) => setTheme({ primary: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-md border bg-white p-0.5"
            aria-label="Primary colour"
          />
          <Input className="font-mono" value={t.primary} onChange={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value) && setTheme({ primary: e.target.value })} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {THEME_SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => setTheme({ primary: c })}
              className={cn("size-6 rounded-full ring-offset-2 transition", t.primary.toLowerCase() === c && "ring-2 ring-slate-900")}
              style={{ background: c }}
              aria-label={`Use colour ${c}`}
            />
          ))}
        </div>
        <div className="space-y-1.5">
          <Label>Sidebar style</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {(["solid", "tinted", "light"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setTheme({ sidebar: s })}
                className={cn("rounded-md border px-2 py-1.5 text-xs font-medium capitalize", t.sidebar === s ? "border-slate-900 bg-slate-900 text-white" : "bg-white hover:bg-slate-50")}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Corner radius · {t.radius.toFixed(2)}rem</Label>
          <input type="range" min={0} max={1.2} step={0.05} value={t.radius} onChange={(e) => setTheme({ radius: Number(e.target.value) })} className="w-full accent-slate-900" />
        </div>
        <div className="overflow-hidden rounded-lg border" style={{ borderRadius: `${t.radius}rem` }}>
          <div className="flex h-24">
            <div
              className="w-16 space-y-1 p-1.5"
              style={{ background: t.sidebar === "solid" ? mix(t.primary, "#000000", 0.25) : t.sidebar === "tinted" ? mix("#ffffff", t.primary, 0.08) : "#fff" }}
            >
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-2.5 rounded" style={{ background: i === 0 ? (t.sidebar === "light" ? t.accent : t.primary) : t.sidebar === "solid" ? "#ffffff33" : "#00000012" }} />
              ))}
            </div>
            <div className="flex-1 space-y-1.5 p-2" style={{ background: t.background }}>
              <div className="h-2 w-16 rounded bg-slate-300" />
              <div className="h-8 rounded border bg-white" style={{ borderRadius: `${t.radius * 0.8}rem` }} />
              <div className="h-5 w-14 rounded text-[9px] leading-5 font-semibold text-white" style={{ background: t.primary, borderRadius: `${t.radius * 0.6}rem`, textAlign: "center" }}>
                Button
              </div>
            </div>
          </div>
        </div>
      </Section>
      <Section title="Validation">
        {issues.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="size-3.5" /> Ready to publish.
          </p>
        ) : (
          <div className="space-y-1 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 ring-1 ring-red-200">
            {issues.map((i) => (
              <p key={i.nodeId + i.message} className="flex gap-1.5">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                {i.message}
              </p>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
