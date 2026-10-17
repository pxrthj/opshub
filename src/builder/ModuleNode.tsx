import { memo } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import type { ModuleId } from "@/lib/types"
import { cn } from "@/lib/utils"
import { getModuleDef, PORT_LABELS } from "@/modules/definitions"

export type ModuleNodeData = {
  moduleId: ModuleId
  issues: string[]
  accent: string
}
export type ModuleFlowNode = Node<ModuleNodeData, "module">

const HANDLE = "!size-3.5 !border-2 !border-background before:absolute before:-inset-3 before:content-['']"

/** One box on the board: what it is, what it needs and gives, and whether it is ready. */
export const ModuleNode = memo(function ModuleNode({ data, selected }: NodeProps<ModuleFlowNode>) {
  const def = getModuleDef(data.moduleId)
  const bad = data.issues.length > 0

  return (
    <Card
      className={cn("relative w-56 gap-0 py-0 shadow-sm", selected && "ring-2 ring-primary", bad && "ring-2 ring-destructive")}
      style={{ ["--node-accent" as string]: data.accent }}
    >
      {def.inputs.length > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(HANDLE, "!bg-muted-foreground")}
          title={`Receives: ${def.inputs.map((p) => PORT_LABELS[p]).join(", ")}`}
        />
      )}

      <div className="flex items-center gap-2.5 border-b px-3 py-2.5">
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-md text-white", bad && "!bg-destructive")} style={{ background: data.accent }}>
          <def.icon className="size-4" />
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{def.name}</p>
      </div>

      <div className="space-y-1 px-3 py-2 text-xs text-muted-foreground">
        <p>Receives: {def.inputs.length ? def.inputs.map((p) => PORT_LABELS[p]).join(", ") : "nothing"}</p>
        <p>Passes on: {def.outputs.length ? def.outputs.map((p) => PORT_LABELS[p]).join(", ") : "nothing"}</p>
        {bad ? (
          <p className="flex items-start gap-1 pt-0.5 font-medium text-destructive">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            <span>{data.issues[0]}</span>
          </p>
        ) : (
          <p className="flex items-center gap-1 pt-0.5 font-medium text-emerald-700">
            <CheckCircle2 className="size-3" /> Ready
          </p>
        )}
      </div>

      {def.outputs.length > 0 && (
        <Handle
          type="source"
          position={Position.Right}
          className={HANDLE}
          style={{ background: data.accent }}
          title={`Passes on: ${def.outputs.map((p) => PORT_LABELS[p]).join(", ")}`}
        />
      )}
    </Card>
  )
})
