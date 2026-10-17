import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Boxes,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  CircuitBoard,
  FileSpreadsheet,
  Gauge,
  HardHat,
  LayoutDashboard,
  PackageCheck,
  ShieldCheck,
  Undo2,
  Users,
} from "lucide-react"
import type { FieldDef, ModuleId, PortType, Role, WorkflowSettings } from "@/lib/types"

/**
 * Pure module metadata (no React page components) so the mock API and the
 * builder can import it without circular dependencies. registry.ts joins
 * these definitions with their page components.
 */

export type ModuleCategory = "Core" | "Stores" | "Workflow" | "Field" | "Service" | "Insights"

/** A requirement is a module id, or an array meaning "any one of these". */
export type Requirement = ModuleId | ModuleId[]

export interface ModulePageDef {
  path: string
  label: string
  minRole: Role
}

export interface ModuleDefinition {
  id: ModuleId
  name: string
  short: string
  description: string
  icon: LucideIcon
  category: ModuleCategory
  core: boolean
  requires: Requirement[]
  inputs: PortType[]
  outputs: PortType[]
  defaultFields: FieldDef[]
  /** Workflow options this module exposes in the builder settings panel. */
  settings: (keyof WorkflowSettings)[]
  page?: ModulePageDef
}

const INVENTORY_FIELDS: FieldDef[] = [
  { key: "name", label: "Item", type: "text", required: true, builtin: true, showInTable: true },
  {
    key: "category",
    label: "Category",
    type: "select",
    required: true,
    builtin: true,
    showInTable: true,
    options: ["Meters", "Cables & Wires", "Transformers", "Line Hardware", "Protection", "Earthing", "Spares"],
  },
  { key: "unit", label: "Unit", type: "select", required: true, builtin: true, options: ["Nos", "Metres", "Sets", "Kg"] },
  { key: "qty", label: "Quantity", type: "number", required: true, builtin: true, showInTable: true, min: 0 },
  { key: "unitPrice", label: "Price each (₹)", type: "number", required: true, builtin: true, showInTable: true, min: 0 },
  { key: "total", label: "Total (₹)", type: "calculated", formula: "qty * unitPrice", builtin: true, showInTable: true },
  { key: "reorderLevel", label: "Warn me when below", type: "number", required: true, builtin: true, min: 0 },
]

const REQUEST_FIELDS: FieldDef[] = [
  { key: "purpose", label: "What is it for?", type: "text", required: true, builtin: true, showInTable: true },
  { key: "priority", label: "How urgent?", type: "select", options: ["Low", "Normal", "Urgent"], showInTable: true },
  { key: "neededBy", label: "Needed by (date)", type: "date" },
]

const REPAIR_FIELDS: FieldDef[] = [
  { key: "meterId", label: "Meter number", type: "text", required: true, builtin: true, showInTable: true },
  {
    key: "meterType",
    label: "Type of meter",
    type: "select",
    required: true,
    builtin: true,
    showInTable: true,
    options: ["Single Phase Smart Meter", "Three Phase Smart Meter", "CT Operated Meter"],
  },
  {
    key: "fault",
    label: "Fault",
    type: "select",
    required: true,
    builtin: true,
    showInTable: true,
    options: ["Display blank", "No communication (RF/GPRS)", "Relay stuck", "Tamper alarm", "Burnt PCB", "Battery failure", "Wrong reading"],
  },
  { key: "technician", label: "Repaired by", type: "text", builtin: true, showInTable: true },
  { key: "partsUsed", label: "Parts used", type: "text", builtin: true },
  { key: "partsCost", label: "Parts Cost (₹)", type: "number", min: 0 },
  { key: "labourHours", label: "Hours worked", type: "number", min: 0 },
]

const CONSUMPTION_FIELDS: FieldDef[] = [
  { key: "location", label: "Where was it used?", type: "text", required: true, builtin: true, showInTable: true },
]

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: "auth",
    name: "Login & Security",
    short: "Login",
    description: "Lets people sign in and decides what each person can do.",
    icon: ShieldCheck,
    category: "Core",
    core: true,
    requires: [],
    inputs: [],
    outputs: [],
    defaultFields: [],
    settings: [],
  },
  {
    id: "users",
    name: "People & Access",
    short: "Team",
    description: "Add people and choose what each person can do.",
    icon: Users,
    category: "Core",
    core: true,
    requires: [],
    inputs: [],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "team", label: "People", minRole: "Admin" },
  },
  {
    id: "shell",
    name: "Overview",
    short: "Overview",
    description: "The home page and the menu on the left.",
    icon: LayoutDashboard,
    category: "Core",
    core: true,
    requires: [],
    inputs: [],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "", label: "Overview", minRole: "Public" },
  },
  {
    id: "inventory",
    name: "Stock Inventory",
    short: "Stock",
    description: "Keep a list of what is in stock and warn when something runs low.",
    icon: Boxes,
    category: "Stores",
    core: false,
    requires: [],
    inputs: [],
    outputs: ["stock"],
    defaultFields: INVENTORY_FIELDS,
    settings: ["stockSourceSiteId", "lowStockAlerts"],
    page: { path: "inventory", label: "Stock", minRole: "Member" },
  },
  {
    id: "stock-dashboard",
    name: "Stock Dashboard",
    short: "Stock KPI",
    description: "Visual stock health, out-of-stock escalation center, category valuation, and replenishment tracking.",
    icon: Boxes,
    category: "Stores",
    core: false,
    requires: ["inventory"],
    inputs: ["stock"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "stock-dashboard", label: "Stock Dashboard", minRole: "Manager" },
  },
  {
    id: "request",
    name: "Material Requests",
    short: "Requests",
    description: "Staff ask for materials or send in a meter to be repaired.",
    icon: ClipboardList,
    category: "Workflow",
    core: false,
    requires: [],
    inputs: [],
    outputs: ["request"],
    defaultFields: REQUEST_FIELDS,
    settings: ["allowMaterialRequests", "allowRepairRequests", "maxQtyPerLine"],
    page: { path: "requests", label: "Requests", minRole: "Member" },
  },
  {
    id: "approval",
    name: "Request Approvals",
    short: "Approvals",
    description: "Managers say yes or no to each request.",
    icon: CheckCheck,
    category: "Workflow",
    core: false,
    requires: ["request"],
    inputs: ["request"],
    outputs: ["approved"],
    defaultFields: [],
    settings: ["requireRejectComment"],
    page: { path: "approvals", label: "Approvals", minRole: "Manager" },
  },
  {
    id: "assignment",
    name: "Giving Out Stock",
    short: "Give out",
    description: "Hand over approved items. Stock goes down by itself.",
    icon: PackageCheck,
    category: "Workflow",
    core: false,
    requires: ["approval", "inventory"],
    inputs: ["approved", "stock"],
    outputs: ["assignment"],
    defaultFields: [],
    settings: ["autoAssignOnApproval"],
    page: { path: "assignments", label: "Give out", minRole: "Manager" },
  },
  {
    id: "assignment-frontend",
    name: "My Items",
    short: "My Items",
    description: "Staff see what they were given and how much is left.",
    icon: HardHat,
    category: "Field",
    core: false,
    requires: ["assignment"],
    inputs: ["assignment"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "my-materials", label: "My items", minRole: "Member" },
  },
  {
    id: "consumption",
    name: "Material Usage",
    short: "Usage",
    description: "Write down what was used and where.",
    icon: Gauge,
    category: "Field",
    core: false,
    requires: ["assignment"],
    inputs: ["assignment"],
    outputs: ["usage"],
    defaultFields: CONSUMPTION_FIELDS,
    settings: [],
    page: { path: "consumption", label: "What was used", minRole: "Member" },
  },
  {
    id: "returns",
    name: "Stock Returns",
    short: "Returns",
    description: "Put unused items or fixed meters back into stock.",
    icon: Undo2,
    category: "Field",
    core: false,
    requires: [["assignment", "pcb-repair"]],
    inputs: ["assignment", "repair"],
    outputs: ["stock-return"],
    defaultFields: [],
    settings: [],
    page: { path: "returns", label: "Returns", minRole: "Member" },
  },
  {
    id: "pcb-repair",
    name: "Meter Repair",
    short: "Repairs",
    description: "Follow each meter from received to fixed.",
    icon: CircuitBoard,
    category: "Service",
    core: false,
    requires: ["approval"],
    inputs: ["approved"],
    outputs: ["repair"],
    defaultFields: REPAIR_FIELDS,
    settings: [],
    page: { path: "repairs", label: "Meter Repairs", minRole: "Member" },
  },
  {
    id: "analytics",
    name: "Charts",
    short: "Charts",
    description: "See stock levels and requests as simple charts.",
    icon: BarChart3,
    category: "Insights",
    core: false,
    requires: ["inventory"],
    inputs: ["stock", "usage"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "analytics", label: "Charts", minRole: "Member" },
  },
  {
    id: "reports",
    name: "Excel Reports",
    short: "Reports",
    description: "Download stock to Excel, or load a stock sheet from Excel.",
    icon: FileSpreadsheet,
    category: "Insights",
    core: false,
    requires: ["inventory"],
    inputs: ["stock"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "reports", label: "Excel Reports", minRole: "Member" },
  },
  {
    id: "audit-log",
    name: "Product Audit Log",
    short: "Audit Log",
    description: "Immutable change history for every inventory item — qty, price, threshold, create and delete events.",
    icon: ClipboardCheck,
    category: "Insights",
    core: false,
    requires: ["inventory"],
    inputs: ["stock"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "audit-log", label: "Audit log", minRole: "Manager" },
  },
]

export const CORE_MODULES: ModuleId[] = MODULE_DEFINITIONS.filter((m) => m.core).map((m) => m.id)

export function getModuleDef(id: ModuleId): ModuleDefinition {
  const def = MODULE_DEFINITIONS.find((m) => m.id === id)
  if (!def) throw new Error(`Unknown module ${id}`)
  return def
}

export function moduleName(id: ModuleId) {
  return getModuleDef(id).name
}

export function requirementLabel(req: Requirement): string {
  return Array.isArray(req) ? req.map(moduleName).join(" or ") : moduleName(req)
}

export function requirementSatisfied(req: Requirement, present: Set<ModuleId>): boolean {
  return Array.isArray(req) ? req.some((r) => present.has(r)) : present.has(req)
}

export const PORT_LABELS: Record<PortType, string> = {
  stock: "Stock",
  request: "Requests",
  approved: "Approvals",
  assignment: "Given out",
  usage: "Used",
  repair: "Repairs",
  "stock-return": "Given back",
}

export const SETTING_LABELS: Record<keyof WorkflowSettings, { label: string; help: string }> = {
  stockSourceSiteId: { label: "Take stock from", help: "The store this office takes its stock from." },
  lowStockAlerts: { label: "Warn when stock is low", help: "Show a warning when an item drops below its warning level." },
  allowMaterialRequests: { label: "Allow asking for materials", help: "Staff can ask for materials." },
  allowRepairRequests: { label: "Allow sending meters for repair", help: "Staff can send in a meter to be repaired." },
  maxQtyPerLine: { label: "Most items per request", help: "The most anyone can ask for of one item." },
  requireRejectComment: { label: "Ask for a reason when saying no", help: "Managers must explain why they turned a request down." },
  autoAssignOnApproval: { label: "Give out as soon as approved", help: "Items are handed over and stock goes down the moment a manager says yes." },
}
