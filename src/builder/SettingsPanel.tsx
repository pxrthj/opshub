import { AlertTriangle, CheckCircle2, Settings2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { CanvasIssue } from "@/lib/siteConfig"
import type { CanvasEdge, CanvasNode, FieldDef, SiteConfig, SiteSummary, WorkflowSettings } from "@/lib/types"
import { getModuleDef, PORT_LABELS, requirementLabel, SETTING_LABELS } from "@/modules/definitions"
import { FieldEditor } from "./FieldEditor"

const OWN = "__own__"

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-1.5 text-sm font-medium">
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
    <div className="rounded-lg border bg-card p-2.5">
      {typeof value === "boolean" ? (
        <Label className="cursor-pointer items-start justify-between gap-3 leading-normal">
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{meta.label}</span>
            <span className="block text-xs font-normal text-muted-foreground">{meta.help}</span>
          </span>
          <Switch checked={value} onCheckedChange={(v) => set(v)} />
        </Label>
      ) : k === "upstreamSiteId" ? (
        <div className="space-y-1.5">
          <Label className="text-sm">{meta.label}</Label>
          <Select value={(value as string | null | undefined) ?? OWN} onValueChange={(v) => set(v === OWN || v === config.siteId ? null : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OWN}>Nobody (give out from own store only)</SelectItem>
              {sites
                .filter((s) => s.config.siteId !== config.siteId)
                .map((s) => (
                  <SelectItem key={s.config.siteId} value={s.config.siteId}>
                    Ask {s.config.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{meta.help}</p>
        </div>
      ) : k === "stockSourceSiteId" ? (
        <div className="space-y-1.5">
          <Label className="text-sm">{meta.label}</Label>
          <Select value={(value as string | null) ?? OWN} onValueChange={(v) => set(v === OWN || v === config.siteId ? null : v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OWN}>This office's own store</SelectItem>
              {sites
                .filter((s) => s.config.siteId !== config.siteId)
                .map((s) => (
                  <SelectItem key={s.config.siteId} value={s.config.siteId}>
                    Take from {s.config.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{meta.help}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-sm">{meta.label}</Label>
          <Input type="number" min={1} value={String(value)} onChange={(e) => set(Math.max(1, Number(e.target.value) || 1))} />
          <p className="text-xs text-muted-foreground">{meta.help}</p>
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
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <def.icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">{def.name}</p>
            <p className="text-xs text-muted-foreground">{def.description}</p>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
        <Section title="Connections">
          <dl className="grid grid-cols-[84px_1fr] gap-1 text-xs">
            <dt className="text-muted-foreground">Needs first</dt>
            <dd>{def.requires.length ? def.requires.map(requirementLabel).join(" + ") : "Nothing"}</dd>
            <dt className="text-muted-foreground">Receives</dt>
            <dd>{def.inputs.map((p) => PORT_LABELS[p]).join(", ") || "Nothing"}</dd>
            <dt className="text-muted-foreground">Passes on</dt>
            <dd>{def.outputs.map((p) => PORT_LABELS[p]).join(", ") || "Nothing"}</dd>
            <dt className="text-muted-foreground">Menu item</dt>
            <dd>{def.page ? `${def.page.label} (${def.page.minRole} and above)` : "None"}</dd>
          </dl>

          {(incomingEdges.length > 0 || outgoingEdges.length > 0) && (
            <div className="space-y-1.5 rounded-lg border bg-card p-2">
              <p className="text-xs font-medium">Linked to</p>
              {[...incomingEdges.map((e) => ({ e, other: nodeMap.get(e.source), label: "From" })), ...outgoingEdges.map((e) => ({ e, other: nodeMap.get(e.target), label: "To" }))].map(({ e, other, label }) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded bg-muted px-2 py-1 text-xs">
                  <span className="truncate">
                    {label} {other ? getModuleDef(other.moduleId).name : "another feature"}
                  </span>
                  {onDisconnectEdge && (
                    <Button type="button" variant="ghost" size="xs" className="text-destructive" onClick={() => onDisconnectEdge(e.id)}>
                      Unlink
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {def.outputs.length > 0 && availableTargets.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Link this to another feature</Label>
              <Select value="" onValueChange={(tgtId) => tgtId && onConnectNodes?.(node.id, tgtId)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a feature…" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map((tgt) => {
                    const already = outgoingEdges.some((e) => e.target === tgt.id)
                    return (
                      <SelectItem key={tgt.id} value={tgt.id} disabled={already}>
                        {getModuleDef(tgt.moduleId).name}
                        {already ? " (already linked)" : ""}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {nodeIssues.length ? (
            <div className="space-y-1 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
              {nodeIssues.map((i) => (
                <p key={i.message} className="flex gap-1.5">
                  <AlertTriangle className="mt-px size-3.5 shrink-0" />
                  {i.message}
                </p>
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-emerald-700">
              <CheckCircle2 className="size-3.5" /> Everything this needs is linked
            </p>
          )}
        </Section>
        {def.settings.length > 0 && (
          <Section title="Options" icon={<Settings2 className="size-4" />}>
            {def.settings.map((k) => (
              <WorkflowControl key={k} k={k} config={config} setConfig={setConfig} sites={sites} />
            ))}
          </Section>
        )}
        {hasFields && (
          <Section title={`Form fields (${fields.length})`}>
            <FieldEditor fields={fields} onChange={(next) => setConfig({ ...config, fields: { ...config.fields, [node.moduleId]: next } })} />
          </Section>
        )}
        <Separator />
        <Button variant="destructive" className="w-full" onClick={() => onRemoveNode(node.id)}>
          <Trash2 /> Remove from this office
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-4">
      <div>
        <p className="font-semibold text-foreground">Office settings</p>
        <p className="text-xs text-muted-foreground">Click a box on the board to change it.</p>
      </div>
      <Section title="Name">
        <div className="space-y-1.5">
          <Label>Office name</Label>
          <Input value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea rows={2} value={config.description} onChange={(e) => setConfig({ ...config, description: e.target.value })} />
        </div>
        <p className="text-xs text-muted-foreground">Web address: /s/{config.slug}</p>
      </Section>
      <Section title="Ready to publish?">
        {issues.length === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="size-3.5" /> Yes, everything is in place.
          </p>
        ) : (
          <div className="space-y-1 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
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
