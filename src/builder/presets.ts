import type { CanvasEdge, CanvasNode, ModuleId } from "@/lib/types"

export interface Preset {
  id: string
  name: string
  description: string
  nodes: { key: string; moduleId: ModuleId; x: number; y: number }[]
  edges: [string, string][]
}

export const PRESETS: Preset[] = [
  {
    id: "inventory-starter",
    name: "Inventory Starter",
    description: "Keep track of stock, with charts and Excel downloads.",
    nodes: [
      { key: "inv", moduleId: "inventory", x: 60, y: 160 },
      { key: "ana", moduleId: "analytics", x: 400, y: 60 },
      { key: "rep", moduleId: "reports", x: 400, y: 270 },
    ],
    edges: [
      ["inv", "ana"],
      ["inv", "rep"],
    ],
  },
  {
    id: "approval-chain",
    name: "Ask, Approve, Give Out",
    description: "Staff ask, a manager approves, stock is given out and use is written down.",
    nodes: [
      { key: "req", moduleId: "request", x: 30, y: 60 },
      { key: "apr", moduleId: "approval", x: 300, y: 60 },
      { key: "inv", moduleId: "inventory", x: 300, y: 280 },
      { key: "asg", moduleId: "assignment", x: 580, y: 160 },
      { key: "afe", moduleId: "assignment-frontend", x: 870, y: 50 },
      { key: "con", moduleId: "consumption", x: 870, y: 280 },
    ],
    edges: [
      ["req", "apr"],
      ["apr", "asg"],
      ["inv", "asg"],
      ["asg", "afe"],
      ["asg", "con"],
    ],
  },
  {
    id: "repair-shop",
    name: "PCB Repair Lab",
    description: "Send in faulty boards, approve them, repair them and put repaired ones back.",
    nodes: [
      { key: "req", moduleId: "request", x: 40, y: 150 },
      { key: "apr", moduleId: "approval", x: 320, y: 150 },
      { key: "pcb", moduleId: "pcb-repair", x: 600, y: 150 },
      { key: "ret", moduleId: "returns", x: 880, y: 150 },
    ],
    edges: [
      ["req", "apr"],
      ["apr", "pcb"],
      ["pcb", "ret"],
    ],
  },
]

export function instantiatePreset(p: Preset): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const stamp = Date.now().toString(36).slice(-4)
  const id = (k: string) => `n_${k}_${stamp}`
  return {
    nodes: p.nodes.map((n) => ({ id: id(n.key), moduleId: n.moduleId, x: n.x, y: n.y })),
    edges: p.edges.map(([s, t]) => ({ id: `e_${id(s)}_${id(t)}`, source: id(s), target: id(t) })),
  }
}
