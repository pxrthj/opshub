import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Boxes,
  CheckCheck,
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
  { key: "qty", label: "Qty", type: "number", required: true, builtin: true, showInTable: true, min: 0 },
  { key: "unitPrice", label: "Unit Price (₹)", type: "number", required: true, builtin: true, showInTable: true, min: 0 },
  { key: "total", label: "Total (₹)", type: "calculated", formula: "qty * unitPrice", builtin: true, showInTable: true },
  { key: "reorderLevel", label: "Reorder Level", type: "number", required: true, builtin: true, min: 0 },
]

const REQUEST_FIELDS: FieldDef[] = [
  { key: "purpose", label: "Purpose / Work order", type: "text", required: true, builtin: true, showInTable: true },
  { key: "priority", label: "Priority", type: "select", options: ["Low", "Normal", "Urgent"], showInTable: true },
  { key: "neededBy", label: "Needed by", type: "date" },
]

const REPAIR_FIELDS: FieldDef[] = [
  { key: "meterId", label: "Meter ID", type: "text", required: true, builtin: true, showInTable: true },
  {
    key: "meterType",
    label: "Meter Type",
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
  { key: "technician", label: "Technician", type: "text", builtin: true, showInTable: true },
  { key: "partsUsed", label: "Parts Used", type: "text", builtin: true },
  { key: "partsCost", label: "Parts Cost (₹)", type: "number", min: 0 },
  { key: "labourHours", label: "Labour Hours", type: "number", min: 0 },
]

const CONSUMPTION_FIELDS: FieldDef[] = [
  { key: "location", label: "Site / Location", type: "text", required: true, builtin: true, showInTable: true },
]

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: "auth",
    name: "Login & Security",
    short: "Login",
    description: "User login and role permissions.",
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
    name: "Team & Roles",
    short: "Team",
    description: "Manage team members and their roles.",
    icon: Users,
    category: "Core",
    core: true,
    requires: [],
    inputs: [],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "team", label: "Team", minRole: "Admin" },
  },
  {
    id: "shell",
    name: "Overview & Layout",
    short: "Overview",
    description: "Main layout, navigation menu and dashboard.",
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
    description: "Catalog stock, track item counts, and set reorder alerts.",
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
    id: "request",
    name: "Material Requests",
    short: "Requests",
    description: "Submit requests for materials or meter repairs.",
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
    description: "Managers review, approve, or reject requests.",
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
    name: "Material Handout",
    short: "Handout",
    description: "Issue approved items and automatically deduct stock.",
    icon: PackageCheck,
    category: "Workflow",
    core: false,
    requires: ["approval", "inventory"],
    inputs: ["approved", "stock"],
    outputs: ["assignment"],
    defaultFields: [],
    settings: ["autoAssignOnApproval"],
    page: { path: "assignments", label: "Handout", minRole: "Manager" },
  },
  {
    id: "assignment-frontend",
    name: "My Materials",
    short: "My Items",
    description: "Field staff view and track their assigned items.",
    icon: HardHat,
    category: "Field",
    core: false,
    requires: ["assignment"],
    inputs: ["assignment"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "my-materials", label: "My Materials", minRole: "Member" },
  },
  {
    id: "consumption",
    name: "Material Usage",
    short: "Usage",
    description: "Log items used on ground assets and track balances.",
    icon: Gauge,
    category: "Field",
    core: false,
    requires: ["assignment"],
    inputs: ["assignment"],
    outputs: ["usage"],
    defaultFields: CONSUMPTION_FIELDS,
    settings: [],
    page: { path: "consumption", label: "Usage Log", minRole: "Member" },
  },
  {
    id: "returns",
    name: "Stock Returns",
    short: "Returns",
    description: "Return unused items or fixed meters back to stock.",
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
    description: "Track smart meter repairs on the workbench.",
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
    name: "Analytics & Charts",
    short: "Analytics",
    description: "Visual charts for stock levels and request trends.",
    icon: BarChart3,
    category: "Insights",
    core: false,
    requires: ["inventory"],
    inputs: ["stock", "usage"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "analytics", label: "Analytics", minRole: "Member" },
  },
  {
    id: "reports",
    name: "Excel Reports",
    short: "Reports",
    description: "Export and import stock sheets in Excel format.",
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
  assignment: "Dispatched",
  usage: "Usage",
  repair: "Repairs",
  "stock-return": "Returns",
}

export const SETTING_LABELS: Record<keyof WorkflowSettings, { label: string; help: string }> = {
  stockSourceSiteId: { label: "Supply warehouse", help: "Warehouse that supplies stock to this unit." },
  lowStockAlerts: { label: "Low-stock warnings", help: "Show warnings when items drop below reorder levels." },
  allowMaterialRequests: { label: "Allow material requests", help: "Let staff submit requests for materials." },
  allowRepairRequests: { label: "Allow meter repairs", help: "Let staff submit meters for workbench repair." },
  maxQtyPerLine: { label: "Item limit per request", help: "Maximum quantity allowed per request line." },
  requireRejectComment: { label: "Require reason on reject", help: "Managers must explain why a request was rejected." },
  autoAssignOnApproval: { label: "Auto-handout on approval", help: "Instantly issue items and deduct stock when approved." },
}
