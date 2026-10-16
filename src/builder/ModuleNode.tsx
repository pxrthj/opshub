import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import type { ModuleId } from "@/lib/types"
import { cn } from "@/lib/utils"
import { getModuleDef, PORT_LABELS, requirementLabel } from "@/modules/definitions"

export type ModuleNodeData = { moduleId: ModuleId; issues: string[]; accent: string }
export type ModuleFlowNode = Node<ModuleNodeData, "module">

/** Custom React Flow node: shadcn Card + icon + small typed input/output handles. */
export const ModuleNode = memo(function ModuleNode({ data, selected }: NodeProps<ModuleFlowNode>) {
  const def = getModuleDef(data.moduleId)
  const bad = data.issues.length > 0
  return (
    <Card
      className={cn(
        "w-56 gap-0 py-0 shadow-sm transition-shadow",
        selected && "shadow-lg ring-2",
        bad ? "bg-red-50 ring-2 ring-red-500" : selected ? "ring-[var(--node-accent)]" : "",
      )}
      style={{ ["--node-accent" as string]: data.accent }}
    >
      {def.inputs.length > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-3 !border-2 !border-white !bg-slate-500"
          title={`Accepts: ${def.inputs.map((p) => PORT_LABELS[p]).join(", ")}`}
        />
      )}
      <div className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md text-white" style={{ background: bad ? "#dc2626" : data.accent }}>
          <def.icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm leading-tight font-semibold text-slate-900">{def.name}</p>
          <p className="text-xs text-slate-500">{def.category}</p>
        </div>
      </div>
      <div className="space-y-1 px-3 py-2 text-xs">
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
      {def.outputs.length > 0 && (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-3 !border-2 !border-white"
          style={{ background: data.accent }}
          title={`Provides: ${def.outputs.map((p) => PORT_LABELS[p]).join(", ")}`}
        />
      )}
    </Card>
  )
})
