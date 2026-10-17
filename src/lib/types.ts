// Shared domain types for OpsHub. Everything a site *is* lives in SiteConfig.

export type Role = "Public" | "Member" | "Manager" | "Admin"

export type ModuleId =
  | "auth"
  | "users"
  | "shell"
  | "inventory"
  | "request"
  | "approval"
  | "assignment"
  | "assignment-frontend"
  | "consumption"
  | "returns"
  | "pcb-repair"
  | "analytics"
  | "reports"
  | "audit-log"

/** Typed ports used by the builder to validate connections. */
export type PortType = "stock" | "request" | "approved" | "assignment" | "usage" | "repair" | "stock-return"

export type FieldType = "text" | "number" | "select" | "date" | "calculated"

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  required?: boolean
  options?: string[]
  /** For calculated fields: e.g. "qty * unitPrice". Parsed safely, never eval'd. */
  formula?: string
  /** Built-in fields can be relabelled but not removed. */
  builtin?: boolean
  showInTable?: boolean
  min?: number
}

export interface SitePage {
  id: string
  moduleId: ModuleId
  path: string
  label: string
  minRole: Role
}

export interface CanvasNode {
  id: string
  moduleId: ModuleId
  x: number
  y: number
}

export interface CanvasEdge {
  id: string
  source: string
  target: string
}

export interface WorkflowSettings {
  /** Site whose inventory is used for stock checks / returns. null = this site. */
  stockSourceSiteId: string | null
  autoAssignOnApproval: boolean
  requireRejectComment: boolean
  allowRepairRequests: boolean
  allowMaterialRequests: boolean
  maxQtyPerLine: number
  lowStockAlerts: boolean
}

export interface SiteConfig {
  siteId: string
  slug: string
  name: string
  description: string
  modules: ModuleId[]
  pages: SitePage[]
  roles: Role[]
  fields: Partial<Record<ModuleId, FieldDef[]>>
  workflow: WorkflowSettings
  canvas: { nodes: CanvasNode[]; edges: CanvasEdge[] }
}

export interface SiteVersion {
  version: number
  config: SiteConfig
  publishedAt: string
  author: string
  summary: string
}

export interface DeployEvent {
  id: string
  action: "publish" | "rollback"
  version: number
  fromVersion: number
  at: string
  author: string
  note: string
}

export interface SiteRecord {
  siteId: string
  live: SiteConfig
  liveVersion: number
  draft: SiteConfig | null
  draftSavedAt: string | null
  draftSavedBy: string | null
  versions: SiteVersion[]
  events: DeployEvent[]
}

export interface User {
  id: string
  /** The id the sample data used before logins moved to Supabase (u_store, ...). Only set for sample people. */
  legacyId?: string
  email: string
  name: string
  password: string // mock only — a real backend would store a bcrypt hash
  title: string
  roles: Record<string, Role> // siteId -> role
}

export type PublicUser = Omit<User, "password">

// ---------- Site data ----------

export interface InventoryItem {
  id: string
  name: string
  category: string
  unit: string
  qty: number
  unitPrice: number
  reorderLevel: number
  updatedAt: string
  [custom: string]: unknown
}

export type RequestStatus = "Pending" | "Approved" | "Rejected" | "Assigned"

export interface RequestLine {
  itemId: string
  itemName: string
  unit: string
  qty: number
}

export interface MaterialRequest {
  id: string
  code: string
  type: "material" | "repair"
  lines: RequestLine[]
  repair?: { meterId: string; meterType: string; fault: string }
  purpose: string
  requestedBy: string
  requestedByName: string
  createdAt: string
  status: RequestStatus
  decisionComment?: string
  decidedBy?: string
  decidedAt?: string
  assignmentId?: string
  repairJobId?: string
  originSiteId?: string
  originSiteName?: string
  targetSiteId?: string
  targetSiteName?: string
  /** Set when the requester's own manager sent the request on to the supplying office. */
  forwardedAt?: string
  forwardedBy?: string
  forwardNote?: string
  [custom: string]: unknown
}

export interface AssignmentLine {
  itemId: string
  itemName: string
  unit: string
  qty: number
}

export interface Assignment {
  id: string
  code: string
  requestId: string
  requestCode: string
  assigneeId: string
  assigneeName: string
  lines: AssignmentLine[]
  stockSiteId: string
  createdAt: string
  createdBy: string
}

export interface ConsumptionRecord {
  id: string
  assignmentId: string
  itemId: string
  itemName: string
  qty: number
  location: string
  date: string
  recordedBy: string
}

export interface ReturnRecord {
  id: string
  source: "assignment" | "repair"
  refId: string
  refCode: string
  itemId: string
  itemName: string
  qty: number
  condition: "Unused" | "Repaired"
  stockSiteId: string
  date: string
  returnedBy: string
}

export type RepairStatus = "Received" | "In Repair" | "Fixed" | "Scrapped"

export interface RepairJob {
  id: string
  code: string
  meterId: string
  meterType: string
  fault: string
  technician: string
  partsUsed: string
  status: RepairStatus
  receivedAt: string
  updatedAt: string
  requestId?: string
  returned?: boolean
  [custom: string]: unknown
}

export type AuditChangeType = "price" | "quantity" | "threshold" | "create" | "dispatch" | "return" | "delete"

export interface ProductAuditRecord {
  id: string
  itemId: string
  itemName: string
  category: string
  unit: string
  field: "unitPrice" | "qty" | "reorderLevel" | "created" | "deleted" | "multiple"
  changeType: AuditChangeType
  oldValue: string | number | null
  newValue: string | number | null
  diff?: string
  reason: string
  refCode?: string
  actorId: string
  actorName: string
  actorRole: string
  timestamp: string
}

export interface SiteData {
  inventory: InventoryItem[]
  requests: MaterialRequest[]
  assignments: Assignment[]
  consumption: ConsumptionRecord[]
  returns: ReturnRecord[]
  repairs: RepairJob[]
  productAudits?: ProductAuditRecord[]
}

export interface Database {
  schema: number
  users: User[]
  sites: Record<string, SiteRecord>
  data: Record<string, SiteData>
}

export interface SiteStats {
  siteId: string
  pendingRequests: number
  lowStock: number
  totalItems: number
  stockValue: number
  assignments: number
  openRepairs: number
  fixedRepairs: number
  consumptionUnits: number
  returnsCount: number
}

export interface SiteSummary {
  config: SiteConfig
  role: Role
  liveVersion: number
  stats: SiteStats
}

// ---------- API view models ----------

export interface AssignmentLineView extends AssignmentLine {
  used: number
  returned: number
  remaining: number
}

export interface AssignmentView extends Omit<Assignment, "lines"> {
  lines: AssignmentLineView[]
}

export interface AnalyticsData {
  stockSourceName: string
  stockByCategory: { category: string; qty: number; value: number }[]
  timeline: { title: string; seriesA: string; seriesB: string; points: { label: string; a: number; b: number }[] }
  statusSplit: { title: string; data: { name: string; value: number }[] }
}

export interface ExportColumn {
  key: string
  header: string
  width?: number
  numFmt?: string
}

export interface ExportDataset {
  id: string
  label: string
  columns: ExportColumn[]
  rows: Record<string, unknown>[]
}

export interface ImportRow {
  name: string
  category: string
  unit: string
  qty: number
  unitPrice: number
  reorderLevel: number
}

export interface SiteMember {
  user: PublicUser
  role: Role | null
}

export interface BuilderState {
  live: SiteConfig
  liveVersion: number
  draft: SiteConfig | null
  draftSavedAt: string | null
  draftSavedBy: string | null
  versions: SiteVersion[]
  events: DeployEvent[]
}

export type NotificationPriority = "urgent" | "medium" | "low"
export type NotificationCategory = "approval" | "request" | "inventory" | "repair" | "assignment" | "system"

export interface AppNotification {
  id: string
  priority: NotificationPriority
  category: NotificationCategory
  title: string
  message: string
  siteId?: string
  siteName: string
  siteSlug?: string
  timestamp: string
  timeAgo: string
  link: string
}

export type MovementStage =
  | "Awaiting Approval"
  | "Request Rejected"
  | "Approved & Dispatched"
  | "In Field"
  | "Fully Consumed"
  | "Returned / Restocked"

export type SupplyChainTier =
  | "Tier 1: Central Store"
  | "Tier 2: Distribution Centre"
  | "Tier 3: Service Centre"

export type SupplyChainFlow = "Tier 1 ➔ Tier 2" | "Tier 2 ➔ Tier 3" | "Internal / Field"

export interface GoodsMovementTrail {
  id: string
  code: string
  type: "material" | "repair"
  siteId: string
  siteName: string
  siteSlug: string
  sourceSiteId: string
  sourceSiteName: string
  sourceTier: SupplyChainTier
  destinationSiteId: string
  destinationSiteName: string
  destinationTier: SupplyChainTier
  supplyChainFlow: SupplyChainFlow
  requestedBy: string
  requestedByName: string
  requestedAt: string
  purpose: string
  priority: "Normal" | "Urgent" | "Low"
  status: "Pending" | "Approved" | "Rejected" | "Assigned"
  stage: MovementStage
  decidedBy?: string
  decidedAt?: string
  decisionComment?: string
  forwardedAt?: string
  forwardedBy?: string
  forwardNote?: string
  items: Array<{
    itemId: string
    itemName: string
    unit: string
    qty: number
  }>
  totalQtyRequested: number
  assignment?: {
    id: string
    code: string
    dispatchedAt: string
    dispatchedBy: string
    sourceWarehouseId: string
    sourceWarehouseName: string
    assigneeName: string
    lines: AssignmentLine[]
  }
  consumption: ConsumptionRecord[]
  totalConsumed: number
  returns: ReturnRecord[]
  totalReturned: number
  repair?: {
    meterId: string
    meterType: string
    fault: string
    status?: RepairStatus
    jobCode?: string
    technician?: string
    returned?: boolean
  }
}

export interface GoodsMovementStats {
  totalTracked: number
  pendingApprovals: number
  activeDispatches: number
  completedMovements: number
  totalUnitsRequested: number
  totalUnitsDispatched: number
  totalUnitsConsumed: number
  totalUnitsReturned: number
  tier1To2Count: number
  tier2To3Count: number
  bottlenecksCount?: number
  avgFulfillmentHours?: number
}

// ---------- Site Admin Dashboard Types ----------

export interface DashboardNeedsAttentionItem {
  id: string
  type: "approval" | "low_stock" | "overdue" | "stuck_repair"
  title: string
  subtitle: string
  actionLabel: string
  actionPath: string
  severity: "urgent" | "warning"
}

export interface DashboardActivityItem {
  id: string
  timestamp: string
  timeAgo: string
  actor: string
  action: string
  target: string
  type: "request" | "approval" | "assignment" | "consumption" | "return" | "repair"
  link?: string
}

export interface DashboardTimelinePoint {
  label: string
  date: string
  pending: number
  approved: number
  assigned: number
  rejected: number
  total: number
}

export interface DashboardCategoryStock {
  category: string
  qty: number
  value: number
  reorderLevelTotal: number
  itemCount: number
  lowStockCount: number
}

export interface DashboardTopRequestedItem {
  itemId: string
  name: string
  category: string
  unit: string
  requestCount: number
  totalQty: number
}

export interface DashboardLeadTimes {
  avgApprovalHours: number
  avgDispatchHours: number
  approvalSparkline: { label: string; hours: number }[]
  dispatchSparkline: { label: string; hours: number }[]
}

export interface SiteAdminDashboardKpis {
  totalStockItems: number
  totalUnitsOnHand: number
  totalStockValue: number
  lowStockCount: number
  waitingRequestsCount: number
  periodRequests: {
    total: number
    approved: number
    rejected: number
    assigned: number
    pending: number
  }
  periodItemsIssued: number
  openRepairsCount: number
}

export interface SiteAdminDashboardData {
  range: "today" | "7d" | "30d" | "all" | "custom"
  startDate: string
  endDate: string
  kpis: SiteAdminDashboardKpis
  requestsTimeline: DashboardTimelinePoint[]
  stockByCategory: DashboardCategoryStock[]
  topRequestedItems: DashboardTopRequestedItem[]
  statusBreakdown: { name: string; value: number }[]
  leadTimes: DashboardLeadTimes
  repairStages?: { stage: string; count: number }[]
  needsAttention: DashboardNeedsAttentionItem[]
  activityFeed: DashboardActivityItem[]
}

export interface SupplyChainSiteMetrics {
  siteId: string
  siteName: string
  siteSlug: string
  tier: number
  stockSourceSiteId: string | null
  stockSourceName: string | null
  totalRequests: number
  pendingRequests: number
  approvedRequests: number
  rejectedRequests: number
  fulfilmentRate: number
  avgTurnaroundHours: number
  lowStockCount: number
  totalInventoryItems: number
  unitsDispatched: number
  unitsReceived: number
  unitsConsumed: number
  unitsReturned: number
}

export interface SupplyChainBottleneck {
  siteId: string
  siteName: string
  stage: MovementStage
  avgWaitHours: number
  stuckRequestsCount: number
  oldestOpenRequest?: {
    id: string
    code: string
    requestedAt: string
    requestedByName: string
    waitDays: number
  }
}

export interface SupplyChainHierarchyEdge {
  id: string
  sourceSiteId: string
  sourceSiteName: string
  targetSiteId: string
  targetSiteName: string
  volumeUnits: number
  requestsCount: number
  pendingCount: number
}

export interface SupplyChainData {
  trails: GoodsMovementTrail[]
  stats: GoodsMovementStats
  siteMetrics: SupplyChainSiteMetrics[]
  bottlenecks: SupplyChainBottleneck[]
  edges: SupplyChainHierarchyEdge[]
}

