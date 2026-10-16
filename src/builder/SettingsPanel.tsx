import { AlertTriangle, CheckCircle2, Palette, Settings2, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { CanvasIssue } from "@/lib/siteConfig"
import { mix, THEME_SWATCHES } from "@/lib/theme"
import type { CanvasNode, FieldDef, SiteConfig, SiteSummary, WorkflowSettings } from "@/lib/types"
import { getModuleDef, PORT_LABELS, requirementLabel, SETTING_LABELS } from "@/modules/definitions"
import { FieldEditor } from "./FieldEditor"

const OWN = "__own__"

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-500 uppercase">
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
        <Label className="cursor-pointer items-start justify-between gap-3 leading-normal">
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{meta.label}</span>
            <span className="block text-xs font-normal text-muted-foreground">{meta.help}</span>
          </span>
          <Switch checked={value} onCheckedChange={(v) => set(v)} />
        </Label>
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
          <p className="text-xs text-slate-500">{meta.help}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-sm">{meta.label}</Label>
          <Input type="number" min={1} value={String(value)} onChange={(e) => set(Math.max(1, Number(e.target.value) || 1))} />
          <p className="text-xs text-slate-500">{meta.help}</p>
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
}: {
  config: SiteConfig
  setConfig: (c: SiteConfig) => void
  node: CanvasNode | null
  issues: CanvasIssue[]
  sites: SiteSummary[]
  onRemoveNode: (id: string) => void
  onClose: () => void
}) {
  if (node) {
    const def = getModuleDef(node.moduleId)
    const nodeIssues = issues.filter((i) => i.nodeId === node.id)
    const fields: FieldDef[] = config.fields[node.moduleId] ?? def.defaultFields
    const hasFields = def.defaultFields.length > 0 || !!config.fields[node.moduleId]
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
        <p className="text-xs text-muted-foreground">Address: /s/{config.slug}</p>
      </Section>
      <Section title="Theme" icon={<Palette className="size-3.5" />}>
        <div className="space-y-2">
          <Label>Main colour</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={THEME_SWATCHES.includes(t.primary.toLowerCase()) ? t.primary.toLowerCase() : ""}
            onValueChange={(v) => v && setTheme({ primary: v })}
            className="flex-wrap"
          >
            {THEME_SWATCHES.map((c) => (
              <ToggleGroupItem key={c} value={c} aria-label={`Use colour ${c}`}>
                <span className="size-4 rounded-full" style={{ background: c }} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Input
            aria-label="Colour code"
            defaultValue={t.primary}
            key={t.primary}
            onBlur={(e) => /^#[0-9a-fA-F]{6}$/.test(e.target.value.trim()) && setTheme({ primary: e.target.value.trim().toLowerCase() })}
            placeholder="#1e40af"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Sidebar style</Label>
          <ToggleGroup type="single" variant="outline" size="sm" value={t.sidebar} onValueChange={(v) => v && setTheme({ sidebar: v as SiteConfig["theme"]["sidebar"] })} className="w-full">
            {(["solid", "tinted", "light"] as const).map((st) => (
              <ToggleGroupItem key={st} value={st} className="flex-1 capitalize">
                {st}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-1.5">
          <Label>Corner roundness</Label>
          <Slider min={0} max={1.2} step={0.05} value={[t.radius]} onValueChange={([v]) => setTheme({ radius: v })} />
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
              <div className="h-5 w-14 rounded text-xs leading-5 font-semibold text-white" style={{ background: t.primary, borderRadius: `${t.radius * 0.6}rem`, textAlign: "center" }}>
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
