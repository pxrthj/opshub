import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Boxes,
  CheckCheck,
  ClipboardList,
  CircuitBoard,
  FileSpreadsheet,
  HardHat,
  LayoutDashboard,
  PackageCheck,
  ShieldCheck,
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

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: "auth",
    name: "Authentication & RBAC",
    short: "Auth",
    description: "Login, sessions and per-site role checks (Public, Member, Manager, Admin) enforced in UI and API.",
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
    name: "User Management",
    short: "Users",
    description: "Manage who can access the site and with what role.",
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
    name: "Dashboard Shell / Nav / Forms",
    short: "Shell",
    description: "Themed layout, sidebar built from enabled modules, KPI dashboard and the generic form renderer.",
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
    name: "Inventory",
    short: "Inventory",
    description: "Stock register with categories, quantities, prices, calculated totals and low-stock alerts.",
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
    name: "Request",
    short: "Request",
    description: "Members raise material requests (items + qty) or repair jobs and track their status.",
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
    name: "Approval",
    short: "Approval",
    description: "Managers approve or reject pending requests with a comment.",
    icon: CheckCheck,
    category: "Workflow",
    core: false,
    requires: ["request"],
    inputs: ["request"],
    outputs: ["approved"],
    defaultFields: [],
    settings: ["requireRejectComment"],
    page: { path: "approvals", label: "Approve requests", minRole: "Manager" },
  },
  {
    id: "assignment",
    name: "Material Assignment",
    short: "Assignment",
    description: "On approval, atomically checks stock, decrements it and creates the assignment (all-or-nothing).",
    icon: PackageCheck,
    category: "Workflow",
    core: false,
    requires: ["approval", "inventory"],
    inputs: ["approved", "stock"],
    outputs: ["assignment"],
    defaultFields: [],
    settings: ["autoAssignOnApproval"],
  },
  {
    id: "assignment-frontend",
    name: "Assignment Frontend",
    short: "My Materials",
    description: "Field-team view of the material handed to them.",
    icon: HardHat,
    category: "Field",
    core: false,
    requires: ["assignment"],
    inputs: ["assignment"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "my-materials", label: "My material", minRole: "Member" },
  },
  {
    id: "pcb-repair",
    name: "PCB Repair",
    short: "PCB Repair",
    description: "Repair log for faulty smart meters: Received → In Repair → Fixed / Scrapped.",
    icon: CircuitBoard,
    category: "Service",
    core: false,
    requires: ["approval"],
    inputs: ["approved"],
    outputs: ["repair"],
    defaultFields: REPAIR_FIELDS,
    settings: [],
    page: { path: "repairs", label: "Meter repairs", minRole: "Member" },
  },
  {
    id: "analytics",
    name: "Analytics Dashboard",
    short: "Analytics",
    description: "Charts for stock by category, requests over time and status split — per site only.",
    icon: BarChart3,
    category: "Insights",
    core: false,
    requires: ["inventory"],
    inputs: ["stock"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "analytics", label: "Charts", minRole: "Member" },
  },
  {
    id: "reports",
    name: "Reports with Excel",
    short: "Reports",
    description: "Excel export (Manager+) and Excel import of inventory with preview (Admin).",
    icon: FileSpreadsheet,
    category: "Insights",
    core: false,
    requires: ["inventory"],
    inputs: ["stock"],
    outputs: [],
    defaultFields: [],
    settings: [],
    page: { path: "reports", label: "Excel reports", minRole: "Member" },
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
  approved: "Approved requests",
  assignment: "Assignments",
  repair: "Repair jobs",
}

export const SETTING_LABELS: Record<keyof WorkflowSettings, { label: string; help: string }> = {
  stockSourceSiteId: { label: "Stock source", help: "Which unit's store is checked and decremented." },
  lowStockAlerts: { label: "Low-stock alerts", help: "Show badges when qty < reorder level." },
  allowMaterialRequests: { label: "Allow material requests", help: "Members can request items + qty." },
  allowRepairRequests: { label: "Allow repair jobs", help: "Members can raise a meter repair job." },
  maxQtyPerLine: { label: "Max qty per line", help: "Upper limit for a single request line." },
  requireRejectComment: { label: "Comment required on reject", help: "Managers must explain rejections." },
  autoAssignOnApproval: { label: "Assign on approval", help: "Run the stock transaction as soon as a request is approved." },
}
