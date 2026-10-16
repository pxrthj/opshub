import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { AlertTriangle, Cable, CheckCircle2, Zap } from "lucide-react"
import { Card } from "@/components/ui/card"
import type { ModuleId } from "@/lib/types"
import { cn } from "@/lib/utils"
import { getModuleDef, PORT_LABELS, requirementLabel } from "@/modules/definitions"

export type ModuleNodeData = {
  moduleId: ModuleId
  issues: string[]
  accent: string
  isWireSource?: boolean
  isWireTarget?: boolean
  wireMode?: boolean
  onStartWire?: (nodeId: string) => void
}
export type ModuleFlowNode = Node<ModuleNodeData, "module">

/** Custom React Flow node with wire terminals, wire mode glows, and quick wire trigger. */
export const ModuleNode = memo(function ModuleNode({ id, data, selected }: NodeProps<ModuleFlowNode>) {
  const def = getModuleDef(data.moduleId)
  const bad = data.issues.length > 0
  const isSource = !!data.isWireSource
  const isTarget = !!data.isWireTarget

  return (
    <Card
      className={cn(
        "group/node relative w-60 gap-0 py-0 shadow-sm transition-all duration-200",
        selected && "shadow-lg ring-2",
        bad ? "bg-red-50/80 ring-2 ring-red-500" : selected ? "ring-[var(--node-accent)]" : "",
        isSource && "ring-4 ring-amber-500 shadow-xl shadow-amber-200/60 scale-[1.02]",
        isTarget && "ring-4 ring-emerald-500 shadow-xl shadow-emerald-200/60 scale-[1.02] cursor-pointer",
      )}
      style={{ ["--node-accent" as string]: data.accent }}
    >
      {/* Wire Mode Status Badges */}
      {isSource && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-md animate-pulse whitespace-nowrap">
          <Zap className="size-3 fill-current" /> Wiring Source
        </div>
      )}
      {isTarget && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-md animate-bounce whitespace-nowrap">
          <Cable className="size-3" /> Click to Connect
        </div>
      )}

      {/* Input Handle (Terminal) */}
      {def.inputs.length > 0 && (
        <div className="group/pin absolute -left-2 top-1/2 -translate-y-1/2 z-10">
          <Handle
            type="target"
            position={Position.Left}
            className={cn(
              "!size-4 !border-2 !border-white !bg-slate-600 transition-all duration-150 !rounded-full shadow-md",
              "before:absolute before:-inset-3 before:content-[''] before:rounded-full",
              "hover:!scale-150 hover:!bg-sky-500 hover:!ring-4 hover:!ring-sky-300/60",
              isTarget && "!size-5 !bg-emerald-500 !ring-4 !ring-emerald-300 animate-pulse",
            )}
            title={`Terminal In: Accepts ${def.inputs.map((p) => PORT_LABELS[p]).join(", ")}`}
          />
        </div>
      )}

      <div className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-md text-white shadow-xs"
          style={{ background: bad ? "#dc2626" : data.accent }}
        >
          <def.icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-tight font-semibold text-slate-900">{def.name}</p>
          <p className="text-[11px] text-slate-500">{def.category}</p>
        </div>

        {/* Quick Wire Button on Node */}
        {def.outputs.length > 0 && !isSource && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              data.onStartWire?.(id)
            }}
            title="Start wire connection from this module"
            className="flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-xs hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-colors"
          >
            <Zap className="size-3 text-amber-500" />
            <span>Wire</span>
          </button>
        )}
      </div>

      <div className="space-y-1 px-3 py-2 text-[11px]">
        <div className="flex justify-between gap-2 text-slate-500">
          <span>in: {def.inputs.length ? def.inputs.map((p) => PORT_LABELS[p]).join(", ") : "—"}</span>
        </div>
        <div className="flex justify-between gap-2 text-slate-500">
          <span>out: {def.outputs.length ? def.outputs.map((p) => PORT_LABELS[p]).join(", ") : "—"}</span>
        </div>
        {bad ? (
          <div className="flex items-start gap-1 pt-0.5 font-medium text-red-700">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            <span>{data.issues[0]}</span>
          </div>
        ) : def.requires.length ? (
          <div className="flex items-center gap-1 pt-0.5 text-emerald-700">
            <CheckCircle2 className="size-3" /> needs {def.requires.map(requirementLabel).join(" + ")}
          </div>
        ) : null}
      </div>

      {/* Output Handle (Terminal) */}
      {def.outputs.length > 0 && (
        <div className="group/pin absolute -right-2 top-1/2 -translate-y-1/2 z-10">
          <Handle
            type="source"
            position={Position.Right}
            className={cn(
              "!size-4 !border-2 !border-white transition-all duration-150 !rounded-full shadow-md",
              "before:absolute before:-inset-3 before:content-[''] before:rounded-full",
              "hover:!scale-150 hover:!ring-4 hover:!ring-amber-300/60",
              isSource && "!size-5 !bg-amber-500 !ring-4 !ring-amber-300 animate-pulse",
            )}
            style={{ background: isSource ? "#f59e0b" : data.accent }}
            title={`Terminal Out: Provides ${def.outputs.map((p) => PORT_LABELS[p]).join(", ")}`}
          />
        </div>
      )}
    </Card>
  )
})
