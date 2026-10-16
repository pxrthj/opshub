import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react"
import { toast } from "sonner"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Eye,
  GripVertical,
  History,
  Loader2,
  Lock,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Undo2,
} from "lucide-react"
import { api, ApiError } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AccessDenied } from "@/components/AccessDenied"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ThemeScope } from "@/components/ThemeScope"
import { useHub } from "@/context/HubContext"
import { buildConfigFromCanvas, connectionError, diffConfigs, summarizeDiff, validateCanvas } from "@/lib/siteConfig"
import type { BuilderState, CanvasEdge, CanvasNode, ModuleId, SiteConfig } from "@/lib/types"
import { errorMessage, toastError } from "@/lib/useAsync"
import { cn, formatDateTime } from "@/lib/utils"
import { MODULE_DEFINITIONS, getModuleDef, requirementLabel } from "@/modules/definitions"
import { NotFound } from "@/pages/NotFound"
import { fieldListErrors } from "./FieldEditor"
import { ModuleNode, type ModuleFlowNode } from "./ModuleNode"
import { PRESETS, instantiatePreset } from "./presets"
import { SettingsPanel } from "./SettingsPanel"

const NODE_TYPES = { module: ModuleNode }
const DND_TYPE = "application/opshub-module"

function toFlowNodes(nodes: CanvasNode[], accent: string): ModuleFlowNode[] {
  return nodes.map((n) => ({ id: n.id, type: "module", position: { x: n.x, y: n.y }, data: { moduleId: n.moduleId, issues: [], accent } }))
}
function toFlowEdges(edges: CanvasEdge[]): Edge[] {
  return edges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
}

/** /builder/:siteId — loads the builder state and guards Admin access. */
export function BuilderPage() {
  const { siteId = "" } = useParams()
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; data: BuilderState } | { status: "error"; code: number; message: string }>({
    status: "loading",
  })
  const { dataVersion } = useHub()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.raw.get<{ siteId: string }>(`/api/hub/resolve/${encodeURIComponent(siteId)}`)
        const data = await api.get<BuilderState>(r.siteId, "builder")
        if (!cancelled) setState({ status: "ok", data })
      } catch (e) {
        if (!cancelled) setState({ status: "error", code: e instanceof ApiError ? e.status : 500, message: errorMessage(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [siteId, dataVersion])

  if (state.status === "loading")
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 size-5 animate-spin" /> Loading builder…
      </div>
    )
  if (state.status === "error")
    return state.code === 403 ? (
      <AccessDenied message={`${state.message}. The builder is only available to Admins of this unit.`} />
    ) : (
      <NotFound message={state.message} />
    )
  return (
    <ReactFlowProvider>
      <BuilderWorkspace key={state.data.live.siteId + state.data.liveVersion} initial={state.data} />
    </ReactFlowProvider>
  )
}

function BuilderWorkspace({ initial }: { initial: BuilderState }) {
  const navigate = useNavigate()
  const { sites, bumpData, refreshSites } = useHub()
  const { screenToFlowPosition, deleteElements, fitView } = useReactFlow()
  const [builder, setBuilder] = useState(initial)
  const base = initial.draft ?? initial.live
  const [config, setConfig] = useState<SiteConfig>(base)
  const accent = config.theme.primary
  const [nodes, setNodes, onNodesChange] = useNodesState<ModuleFlowNode>(toFlowNodes(base.canvas.nodes, accent))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toFlowEdges(base.canvas.edges))
  const [busy, setBusy] = useState<null | "save" | "preview" | "publish" | "discard">(null)
  const [presetToApply, setPresetToApply] = useState<(typeof PRESETS)[number] | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [note, setNote] = useState("")
  const wrapper = useRef<HTMLDivElement>(null)

  const canvasNodes: CanvasNode[] = useMemo(
    () => nodes.map((n) => ({ id: n.id, moduleId: n.data.moduleId, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
    [nodes],
  )
  const canvasEdges: CanvasEdge[] = useMemo(() => edges.map((e) => ({ id: e.id, source: e.source, target: e.target })), [edges])
  const issues = useMemo(() => validateCanvas(canvasNodes, canvasEdges), [canvasNodes, canvasEdges])
  // The canvas is the source of truth: modules/pages are derived from the nodes.
  const built = useMemo(() => buildConfigFromCanvas(config, canvasNodes, canvasEdges), [config, canvasNodes, canvasEdges])
  const fieldErrors = useMemo(
    () => built.modules.flatMap((m) => fieldListErrors(built.fields[m] ?? []).map((e) => `${getModuleDef(m).short}: ${e}`)),
    [built],
  )
  const fingerprint = (c: SiteConfig) => JSON.stringify({ ...c, canvas: { nodes: c.canvas.nodes, edges: [...c.canvas.edges].sort((a, b) => a.id.localeCompare(b.id)) } })
  const [savedPrint, setSavedPrint] = useState(() => fingerprint(buildConfigFromCanvas(base, base.canvas.nodes, base.canvas.edges)))
  const dirty = fingerprint(built) !== savedPrint
  const onCanvas = useMemo(() => new Set(canvasNodes.map((n) => n.moduleId)), [canvasNodes])
  const selected = nodes.find((n) => n.selected)
  const selectedCanvasNode = selected ? (canvasNodes.find((n) => n.id === selected.id) ?? null) : null

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, accent, issues: issues.filter((i) => i.nodeId === n.id).map((i) => i.message) },
      })),
    [nodes, issues, accent],
  )
  const displayEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        animated: true,
        style: { stroke: e.selected ? "#0f172a" : accent, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: accent },
      })),
    [edges, accent],
  )

  // ------------------------------------------------------------ canvas interactions
  const onConnect = useCallback(
    (c: Connection) => {
      const s = nodes.find((n) => n.id === c.source)
      const t = nodes.find((n) => n.id === c.target)
      if (!s || !t) return
      const err = connectionError(s.data.moduleId, t.data.moduleId, s.id, t.id, canvasEdges)
      if (err) {
        toast.error("Connection not allowed", { description: err })
        return
      }
      setEdges((eds) => addEdge({ ...c, id: `e_${c.source}_${c.target}` }, eds))
      toast.success(`Connected ${getModuleDef(s.data.moduleId).short} → ${getModuleDef(t.data.moduleId).short}`)
    },
    [nodes, canvasEdges, setEdges],
  )

  const addModule = useCallback(
    (moduleId: ModuleId, position?: { x: number; y: number }) => {
      const def = getModuleDef(moduleId)
      if (nodes.some((n) => n.data.moduleId === moduleId)) {
        toast.error(`${def.name} is already on the canvas`, { description: "Each module can be used once per site." })
        return
      }
      const pos = position ?? { x: 80 + (nodes.length % 4) * 70, y: 380 + (nodes.length % 3) * 40 }
      const id = `n_${moduleId}_${Date.now().toString(36).slice(-5)}`
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "module", position: pos, data: { moduleId, issues: [], accent }, selected: true }])
      const missing = def.requires.filter((r) => !(Array.isArray(r) ? r.some((x) => onCanvas.has(x)) : onCanvas.has(r)))
      toast.info(`Added ${def.name}`, {
        description: missing.length ? `Now connect it after ${missing.map(requirementLabel).join(" and ")}.` : def.requires.length ? `Connect it after ${def.requires.map(requirementLabel).join(" and ")}.` : "Drag from its right handle to connect it.",
      })
    },
    [nodes, setNodes, accent, onCanvas],
  )

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const moduleId = e.dataTransfer.getData(DND_TYPE) as ModuleId
    if (!moduleId) return
    addModule(moduleId, screenToFlowPosition({ x: e.clientX - 100, y: e.clientY - 40 }))
  }

  function applyPreset(p: (typeof PRESETS)[number]) {
    const inst = instantiatePreset(p)
    setNodes(toFlowNodes(inst.nodes, accent))
    setEdges(toFlowEdges(inst.edges))
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50)
    toast.success(`Preset “${p.name}” applied`, { description: `${inst.nodes.length} connected modules placed on the canvas.` })
  }

  // ------------------------------------------------------------ validation / persistence
  function ensureValid(action: string) {
    if (issues.length) {
      const first = issues[0]
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === first.nodeId })))
      toast.error(`Can't ${action} — requirements missing`, {
        description: issues.map((i) => i.message).join(" "),
        duration: 7000,
      })
      return false
    }
    if (fieldErrors.length) {
      toast.error(`Can't ${action} — fix the field settings`, { description: fieldErrors.slice(0, 3).join(" · ") })
      return false
    }
    if (!built.name.trim()) {
      toast.error(`Can't ${action} — site name is required`)
      return false
    }
    return true
  }

  async function saveDraft(silent = false) {
    if (!ensureValid("save")) return false
    setBusy(silent ? "preview" : "save")
    try {
      const next = await api.put<BuilderState>(built.siteId, "builder/draft", { config: built })
      setBuilder(next)
      setSavedPrint(fingerprint(built))
      if (!silent) toast.success("Draft saved", { description: "Not live yet — Preview it or Publish when ready." })
      return true
    } catch (e) {
      toastError(e, "Couldn't save draft")
      return false
    } finally {
      setBusy(null)
    }
  }

  async function preview() {
    if (dirty || !builder.draft) {
      const ok = await saveDraft(true)
      if (!ok) return
    }
    navigate(`/preview/${built.slug}`)
  }

  async function publish() {
    setBusy("publish")
    try {
      const res = await api.post<BuilderState & { published: number; summary: string }>(built.siteId, "builder/publish", { config: built, note })
      setBuilder(res)
      setSavedPrint(fingerprint(built))
      setNote("")
      await refreshSites()
      toast.success(`Published v${res.published} — live now`, {
        description: res.summary,
        action: { label: "Open site", onClick: () => navigate(`/s/${built.slug}`) },
        duration: 8000,
      })
    } catch (e) {
      toastError(e, "Publish failed")
      throw e
    } finally {
      setBusy(null)
    }
  }

  async function discardDraft() {
    try {
      const next = await api.del<BuilderState>(built.siteId, "builder/draft")
      setBuilder(next)
      setConfig(next.live)
      setNodes(toFlowNodes(next.live.canvas.nodes, next.live.theme.primary))
      setEdges(toFlowEdges(next.live.canvas.edges))
      setSavedPrint(fingerprint(buildConfigFromCanvas(next.live, next.live.canvas.nodes, next.live.canvas.edges)))
      toast.success(`Draft discarded — back to live v${next.liveVersion}`)
      bumpData()
    } catch (e) {
      toastError(e)
      throw e
    }
  }

  const diff = diffConfigs(builder.live, built)
  const diffSummary = summarizeDiff(diff)
  const paletteGroups = ["Stores", "Workflow", "Field", "Service", "Insights"] as const

  return (
    <ThemeScope theme={config.theme}>
      <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
        {/* ------------------------------------------------ toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2">
          <Button variant="ghost" size="icon-sm" asChild aria-label="Back to builder list">
            <Link to="/builder">
              <ArrowLeft />
            </Link>
          </Button>
          <span className="size-3 rounded-full" style={{ background: accent }} />
          <div className="mr-2">
            <p className="text-sm leading-tight font-semibold">Builder · {config.name || "Untitled"}</p>
            <p className="text-[11px] text-slate-500">
              Live v{builder.liveVersion}
              {builder.draftSavedAt && ` · draft saved ${formatDateTime(builder.draftSavedAt)} by ${builder.draftSavedBy}`}
            </p>
          </div>
          {dirty ? (
            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
              Unsaved changes
            </Badge>
          ) : builder.draft ? (
            <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-700">
              Draft saved
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
              Matches live
            </Badge>
          )}
          {issues.length > 0 && <Badge variant="destructive">{issues.length} issue{issues.length > 1 ? "s" : ""}</Badge>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Sparkles /> Presets <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Place connected modules in one click</DropdownMenuLabel>
                {PRESETS.map((p) => (
                  <DropdownMenuItem key={p.id} className="flex-col items-start gap-0.5 py-2" onClick={() => (nodes.length ? setPresetToApply(p) : applyPreset(p))}>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{p.description}</span>
                  </DropdownMenuItem>
                ))}
                {(builder.draft || dirty) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDiscardOpen(true)}>
                      <Undo2 /> Discard draft & reset to live
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/builder/${built.siteId}/history`}>
                <History /> History
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => saveDraft()} disabled={!!busy}>
              {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save Draft
            </Button>
            <Button variant="outline" size="sm" onClick={preview} disabled={!!busy}>
              {busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />} Preview
            </Button>
            <Button size="sm" onClick={() => ensureValid("publish") && setPublishOpen(true)} disabled={!!busy}>
              {busy === "publish" ? <Loader2 className="animate-spin" /> : <Rocket />} Publish
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ------------------------------------------------ palette */}
          <aside className="relative w-64 shrink-0 overflow-y-auto border-r bg-slate-50/80 p-3">
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Blocks</p>
            <p className="mb-3 text-xs text-slate-500">Drag a block onto the board, then connect it.</p>
            <div className="mb-4 rounded-lg border bg-white p-2">
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <Lock className="size-3" /> Always included
              </p>
              {MODULE_DEFINITIONS.filter((m) => m.core).map((m) => (
                <div key={m.id} className="flex items-center gap-2 py-1 text-xs text-slate-600">
                  <m.icon className="size-3.5" /> {m.name}
                </div>
              ))}
            </div>
            {paletteGroups.map((g) => (
              <div key={g} className="mb-3">
                <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{g}</p>
                <div className="space-y-1.5">
                  {MODULE_DEFINITIONS.filter((m) => m.category === g).map((m) => {
                    const used = onCanvas.has(m.id)
                    return (
                      <div
                        key={m.id}
                        draggable={!used}
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DND_TYPE, m.id)
                          e.dataTransfer.effectAllowed = "move"
                        }}
                        className={cn(
                          "group flex items-center gap-2 rounded-lg border bg-white px-2 py-2 text-sm shadow-xs transition",
                          used ? "cursor-default opacity-55" : "cursor-grab hover:border-slate-400 hover:shadow-sm active:cursor-grabbing",
                        )}
                        title={m.description}
                      >
                        <GripVertical className="size-3.5 shrink-0 text-slate-300" />
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ background: used ? "#e2e8f0" : `${accent}18`, color: used ? "#64748b" : accent }}>
                          <m.icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] leading-tight font-medium">{m.name}</p>
                          <p className="truncate text-[10.5px] text-slate-500">{m.requires.length ? `needs ${m.requires.map(requirementLabel).join(" + ")}` : "no requirements"}</p>
                        </div>
                        {used ? (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                        ) : (
                          <Button size="icon-xs" variant="ghost" className="opacity-0 group-hover:opacity-100" onClick={() => addModule(m.id)} aria-label={`Add ${m.name}`}>
                            <Plus />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </aside>

          {/* ------------------------------------------------ canvas */}
          <div ref={wrapper} className="relative min-w-0 flex-1" onDragOver={(e) => (e.preventDefault(), (e.dataTransfer.dropEffect = "move"))} onDrop={onDrop}>
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              deleteKeyCode={["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.25 }}
              minZoom={0.3}
              maxZoom={1.6}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="#cbd5e1" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor={(n) => ((n.data as { issues?: string[] }).issues?.length ? "#dc2626" : accent)} className="!rounded-lg !border" />
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-xl border border-dashed bg-white/80 px-6 py-5 text-center backdrop-blur">
                  <p className="font-medium text-slate-800">Empty board</p>
                  <p className="mt-1 text-sm text-slate-500">Drag blocks in from the left, or pick a preset.</p>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute top-3 left-3 rounded-md bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-500 shadow-sm ring-1 ring-slate-200">
              Select a block and press <kbd className="rounded bg-slate-100 px-1">Del</kbd> to remove it
            </div>
          </div>

          {/* ------------------------------------------------ settings */}
          <aside className="relative w-80 shrink-0 overflow-y-auto border-l bg-slate-50/80">
            <SettingsPanel
              config={config}
              setConfig={setConfig}
              node={selectedCanvasNode}
              issues={issues}
              sites={sites}
              onRemoveNode={(id) => deleteElements({ nodes: [{ id }] })}
              onClose={() => setNodes((ns) => ns.map((n) => ({ ...n, selected: false })))}
            />
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={!!presetToApply}
        onOpenChange={(o) => !o && setPresetToApply(null)}
        title={`Replace canvas with “${presetToApply?.name}”?`}
        description="The current modules and connections on the canvas will be replaced. Nothing is live until you Publish."
        confirmLabel="Apply preset"
        onConfirm={() => applyPreset(presetToApply!)}
      />
      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard draft?"
        description={`The canvas resets to live v${builder.liveVersion}. Unpublished changes are lost.`}
        confirmLabel="Discard draft"
        destructive
        onConfirm={discardDraft}
      />
      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={`Publish ${config.name} as v${Math.max(...builder.versions.map((v) => v.version)) + 1}?`}
        description={
          <div className="space-y-2">
            <p>Everyone on {config.name} will see this version immediately. You can roll back from Deploy History.</p>
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-foreground">
              <b>Changes vs live v{builder.liveVersion}:</b> {diffSummary}
            </div>
          </div>
        }
        confirmLabel="Publish"
        onConfirm={publish}
      >
        <div className="space-y-1.5">
          <Label>Change note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={diffSummary} />
        </div>
      </ConfirmDialog>
    </ThemeScope>
  )
}
