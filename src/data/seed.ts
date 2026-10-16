import { CORE_MODULES } from "@/modules/definitions"
import { buildConfigFromCanvas } from "@/lib/siteConfig"
import type {
  Assignment,
  CanvasEdge,
  CanvasNode,
  ConsumptionRecord,
  Database,
  InventoryItem,
  MaterialRequest,
  ModuleId,
  RepairJob,
  ReturnRecord,
  SiteConfig,
  SiteData,
  SiteRecord,
  User,
} from "@/lib/types"

// Seed data for "MahaPower Utility (Demo)" — a fictional state electricity utility.

export const SITE_IDS = {
  central: "cs-001",
  service: "sc-002",
  distribution: "ds-003",
} as const

const DAY = 86_400_000
function daysAgo(d: number, hour = 10) {
  const t = new Date(Date.now() - d * DAY)
  t.setHours(hour, (d * 17) % 60, 0, 0)
  return t.toISOString()
}

export const SEED_USERS: User[] = [
  // 1 Administrator (across all sites)
  {
    id: "u_admin",
    email: "admin@plexus.demo",
    password: "admin123",
    name: "Aarti Deshmukh",
    title: "Platform Administrator",
    roles: { [SITE_IDS.central]: "Admin", [SITE_IDS.service]: "Admin", [SITE_IDS.distribution]: "Admin" },
  },

  // Central Stores (Tier 1): 1 Manager + 1 Member
  {
    id: "u_store",
    email: "storekeeper@opshub.demo",
    password: "store123",
    name: "Meena Kulkarni",
    title: "Central Storekeeper",
    roles: { [SITE_IDS.central]: "Manager" },
  },
  {
    id: "u_clerk",
    email: "clerk@opshub.demo",
    password: "clerk123",
    name: "Pooja Gaikwad",
    title: "Store Inventory Clerk",
    roles: { [SITE_IDS.central]: "Member" },
  },

  // Distribution (Tier 2): 1 Manager + 1 Member
  {
    id: "u_engineer",
    email: "engineer@plexus.demo",
    password: "eng123",
    name: "Rahul Patil",
    title: "Distribution Section Engineer",
    roles: { [SITE_IDS.distribution]: "Manager" },
  },
  {
    id: "u_lineman",
    email: "lineman@plexus.demo",
    password: "line123",
    name: "Sunil Jadhav",
    title: "Lineman, Pune Rural",
    roles: { [SITE_IDS.distribution]: "Member" },
  },

  // Service Centre (Tier 3): 1 Manager + 1 Member
  {
    id: "u_service_mgr",
    email: "service_manager@opshub.demo",
    password: "scman123",
    name: "Anjali Joshi",
    title: "Service Centre Manager",
    roles: { [SITE_IDS.service]: "Manager" },
  },
  {
    id: "u_vikas",
    email: "technician@opshub.demo",
    password: "tech123",
    name: "Vikas Shinde",
    title: "Senior Meter Technician",
    roles: { [SITE_IDS.service]: "Member" },
  },

  // Cross-Site Members (2 people who are members of multiple sites)
  {
    id: "u_ganesh",
    email: "ganesh@plexus.demo",
    password: "demo123",
    name: "Ganesh More",
    title: "Multi-Site Field & Meter Support",
    roles: { [SITE_IDS.distribution]: "Member", [SITE_IDS.service]: "Member" },
  },
  {
    id: "u_suresh",
    email: "logistics@opshub.demo",
    password: "demo123",
    name: "Suresh Pawar",
    title: "Inter-Office Logistics Assistant",
    roles: { [SITE_IDS.central]: "Member", [SITE_IDS.distribution]: "Member" },
  },
]

// ---------------------------------------------------------------- site configs

function node(id: string, moduleId: ModuleId, x: number, y: number): CanvasNode {
  return { id, moduleId, x, y }
}
function edge(source: string, target: string): CanvasEdge {
  return { id: `e_${source}_${target}`, source, target }
}

function baseConfig(partial: Pick<SiteConfig, "siteId" | "slug" | "name" | "description" | "theme" | "workflow">): SiteConfig {
  return { ...partial, modules: [...CORE_MODULES], pages: [], roles: [], fields: {}, canvas: { nodes: [], edges: [] } }
}

const centralStores = buildConfigFromCanvas(
  baseConfig({
    siteId: SITE_IDS.central,
    slug: "central-stores",
    name: "Central Stores",
    description: "Top tier of the supply chain. Holds master inventory for meters, cables, transformers and supplies Distribution Centres.",
    theme: { primary: "#1e40af", accent: "#dbeafe", background: "#f4f7fd", radius: 0.4, sidebar: "solid" },
    workflow: {
      stockSourceSiteId: null,
      autoAssignOnApproval: true,
      requireRejectComment: true,
      allowRepairRequests: false,
      allowMaterialRequests: false,
      maxQtyPerLine: 1000,
      lowStockAlerts: true,
    },
  }),
  [node("n_inv", "inventory", 80, 170), node("n_apr", "approval", 320, 170), node("n_ana", "analytics", 560, 60), node("n_rep", "reports", 560, 280)],
  [edge("n_inv", "n_apr"), edge("n_inv", "n_ana"), edge("n_inv", "n_rep")],
)

const serviceCentre = buildConfigFromCanvas(
  baseConfig({
    siteId: SITE_IDS.service,
    slug: "service-centre",
    name: "Service Centre",
    description: "Bottom tier of the supply chain. Requests products only from Distribution Centres and repairs faulty smart meters.",
    theme: { primary: "#ea580c", accent: "#ffedd5", background: "#fffaf5", radius: 0.9, sidebar: "light" },
    workflow: {
      stockSourceSiteId: SITE_IDS.distribution,
      autoAssignOnApproval: true,
      requireRejectComment: true,
      allowRepairRequests: true,
      allowMaterialRequests: true,
      maxQtyPerLine: 50,
      lowStockAlerts: false,
    },
  }),
  [
    node("n_req", "request", 40, 150),
    node("n_apr", "approval", 320, 150),
    node("n_pcb", "pcb-repair", 600, 150),
    node("n_ret", "returns", 880, 150),
  ],
  [edge("n_req", "n_apr"), edge("n_apr", "n_pcb"), edge("n_pcb", "n_ret")],
)

const distribution = buildConfigFromCanvas(
  baseConfig({
    siteId: SITE_IDS.distribution,
    slug: "distribution",
    name: "Distribution",
    description: "Mid-tier of the supply chain. Requests products from Central Stores and fulfills product requests from Service Centres and field teams.",
    theme: { primary: "#15803d", accent: "#dcfce7", background: "#f5fbf6", radius: 0.65, sidebar: "tinted" },
    workflow: {
      stockSourceSiteId: SITE_IDS.central,
      autoAssignOnApproval: true,
      requireRejectComment: true,
      allowRepairRequests: false,
      allowMaterialRequests: true,
      maxQtyPerLine: 1000,
      lowStockAlerts: true,
    },
  }),
  [
    node("n_req", "request", 30, 60),
    node("n_apr", "approval", 300, 60),
    node("n_inv", "inventory", 300, 280),
    node("n_asg", "assignment", 580, 160),
    node("n_afe", "assignment-frontend", 870, 50),
    node("n_con", "consumption", 870, 280),
  ],
  [
    edge("n_req", "n_apr"),
    edge("n_apr", "n_asg"),
    edge("n_inv", "n_asg"),
    edge("n_asg", "n_afe"),
    edge("n_asg", "n_con"),
  ],
)

function siteRecord(config: SiteConfig): SiteRecord {
  return {
    siteId: config.siteId,
    live: config,
    liveVersion: 1,
    draft: null,
    draftSavedAt: null,
    draftSavedBy: null,
    events: [
      { id: "ev_" + config.siteId + "_1", action: "publish", version: 1, fromVersion: 0, at: daysAgo(30, 9), author: "Aarti Deshmukh", note: "Initial publish" },
    ],
    versions: [
      {
        version: 1,
        config,
        publishedAt: daysAgo(30, 9),
        author: "Aarti Deshmukh",
        summary: `Initial setup: ${config.modules.filter((m) => !CORE_MODULES.includes(m)).length} modules`,
      },
    ],
  }
}

// ---------------------------------------------------------------- data

const inv = (
  id: string,
  name: string,
  category: string,
  unit: string,
  qty: number,
  unitPrice: number,
  reorderLevel: number,
): InventoryItem => ({ id, name, category, unit, qty, unitPrice, reorderLevel, updatedAt: daysAgo(3) })

const CENTRAL_INVENTORY: InventoryItem[] = [
  inv("itm_sp_meter", "Single Phase Smart Meter", "Meters", "Nos", 500, 2400, 100),
  inv("itm_tp_meter", "Three Phase Smart Meter", "Meters", "Nos", 120, 6800, 50),
  inv("itm_ct_meter", "CT Operated Meter", "Meters", "Nos", 18, 9500, 25),
  inv("itm_meter_box", "Meter Box (SMC) Single Phase", "Meters", "Nos", 410, 380, 150),
  inv("itm_lt4", "LT Cable 4 sq mm (Al, armoured)", "Cables & Wires", "Metres", 3200, 68, 1000),
  inv("itm_lt16", "LT Cable 16 sq mm (Al, armoured)", "Cables & Wires", "Metres", 650, 185, 800),
  inv("itm_service_wire", "Service Wire 2C x 10 sq mm", "Cables & Wires", "Metres", 4500, 42, 1500),
  inv("itm_dt100", "Distribution Transformer 100 kVA", "Transformers", "Nos", 6, 285000, 4),
  inv("itm_dt63", "Distribution Transformer 63 kVA", "Transformers", "Nos", 2, 198000, 3),
  inv("itm_pin_ins", "Pin Insulator 11 kV", "Line Hardware", "Nos", 840, 145, 300),
  inv("itm_disc_ins", "Disc Insulator 11 kV", "Line Hardware", "Nos", 260, 320, 300),
  inv("itm_stay", "Stay Set Complete", "Line Hardware", "Sets", 140, 980, 60),
  inv("itm_mcb32", "MCB 32A Double Pole", "Protection", "Nos", 380, 310, 150),
  inv("itm_do_fuse", "DO Fuse Set 11 kV", "Protection", "Sets", 45, 3200, 20),
  inv("itm_earth_rod", "Earthing Rod GI 3 m", "Earthing", "Nos", 95, 650, 120),
  inv("itm_lugs", "Lugs & Connectors Kit", "Spares", "Sets", 30, 450, 40),
]

export const DISTRIBUTION_INVENTORY: InventoryItem[] = [
  inv("itm_sp_meter", "Single Phase Smart Meter", "Meters", "Nos", 150, 2400, 30),
  inv("itm_tp_meter", "Three Phase Smart Meter", "Meters", "Nos", 35, 6800, 15),
  inv("itm_meter_box", "Meter Box (SMC) Single Phase", "Meters", "Nos", 90, 380, 25),
  inv("itm_service_wire", "Service Wire 2C x 10 sq mm", "Cables & Wires", "Metres", 1500, 42, 400),
  inv("itm_pin_ins", "Pin Insulator 11 kV", "Line Hardware", "Nos", 220, 145, 50),
  inv("itm_stay", "Stay Set Complete", "Line Hardware", "Sets", 40, 980, 15),
  inv("itm_mcb32", "MCB 32A Double Pole", "Protection", "Nos", 85, 310, 20),
  inv("itm_earth_rod", "Earthing Rod GI 3 m", "Earthing", "Nos", 35, 650, 20),
  inv("itm_lugs", "Lugs & Connectors Kit", "Spares", "Sets", 18, 450, 10),
]

const itemName = (id: string) => CENTRAL_INVENTORY.find((i) => i.id === id)!
const line = (itemId: string, qty: number) => {
  const i = itemName(itemId)
  return { itemId, itemName: i.name, unit: i.unit, qty }
}

const DIST_REQUESTS: MaterialRequest[] = [
  {
    id: "rq_dc1",
    code: "REQ-DS-0101",
    type: "material",
    lines: [line("itm_sp_meter", 100), line("itm_service_wire", 1000)],
    purpose: "Bulk inventory replenishment from Central Stores",
    priority: "Urgent",
    requestedBy: "u_engineer",
    requestedByName: "Rahul Patil",
    createdAt: daysAgo(25),
    status: "Assigned",
    decidedBy: "Meena Kulkarni",
    decidedAt: daysAgo(24),
    decisionComment: "Dispatched 100 Smart Meters and 1000m cable to Distribution warehouse",
    assignmentId: "as_c1",
    originSiteId: SITE_IDS.distribution,
    originSiteName: "Distribution",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Central Stores",
  },
  {
    id: "rq_dc2",
    code: "REQ-DS-0102",
    type: "material",
    lines: [line("itm_tp_meter", 20), line("itm_meter_box", 50)],
    purpose: "Commercial feeder hardware replenishment from Central Stores",
    priority: "Normal",
    requestedBy: "u_engineer",
    requestedByName: "Rahul Patil",
    createdAt: daysAgo(12),
    status: "Assigned",
    decidedBy: "Meena Kulkarni",
    decidedAt: daysAgo(11),
    assignmentId: "as_c2",
    originSiteId: SITE_IDS.distribution,
    originSiteName: "Distribution",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Central Stores",
  },
  {
    id: "rq_dc3",
    code: "REQ-DS-0103",
    type: "material",
    lines: [line("itm_pin_ins", 80), line("itm_disc_ins", 40)],
    purpose: "Pre-monsoon insulator buffer stock request to Central Stores",
    priority: "Normal",
    requestedBy: "u_engineer",
    requestedByName: "Rahul Patil",
    createdAt: daysAgo(2),
    status: "Pending",
    originSiteId: SITE_IDS.distribution,
    originSiteName: "Distribution",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Central Stores",
  },
  {
    id: "rq_d1",
    code: "REQ-DS-1001",
    type: "material",
    lines: [line("itm_sp_meter", 40), line("itm_service_wire", 600)],
    purpose: "Smart meter replacement drive — Saswad feeder",
    priority: "Urgent",
    requestedBy: "u_lineman",
    requestedByName: "Sunil Jadhav",
    createdAt: daysAgo(21),
    status: "Assigned",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(20),
    decisionComment: "Approved for phase 1",
    assignmentId: "as_d1",
  },
  {
    id: "rq_d2",
    code: "REQ-DS-1002",
    type: "material",
    lines: [line("itm_pin_ins", 60), line("itm_stay", 8)],
    purpose: "11 kV line strengthening, Jejuri",
    priority: "Normal",
    requestedBy: "u_ganesh",
    requestedByName: "Ganesh More",
    createdAt: daysAgo(18),
    status: "Assigned",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(17),
    assignmentId: "as_d2",
  },
  {
    id: "rq_d3",
    code: "REQ-DS-1003",
    type: "material",
    lines: [line("itm_dt100", 4)],
    purpose: "New DTC for housing colony",
    priority: "Low",
    requestedBy: "u_ganesh",
    requestedByName: "Ganesh More",
    createdAt: daysAgo(15),
    status: "Rejected",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(14),
    decisionComment: "Only 1 DTC sanctioned this quarter — resubmit with sanction letter.",
  },
  {
    id: "rq_d4",
    code: "REQ-DS-1004",
    type: "material",
    lines: [line("itm_mcb32", 25), line("itm_meter_box", 25)],
    purpose: "New service connections — Hadapsar",
    priority: "Normal",
    requestedBy: "u_lineman",
    requestedByName: "Sunil Jadhav",
    createdAt: daysAgo(12),
    status: "Assigned",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(11),
    assignmentId: "as_d3",
  },
  {
    id: "rq_d5",
    code: "REQ-DS-1005",
    type: "material",
    lines: [line("itm_earth_rod", 12)],
    purpose: "Earthing rectification at DTC-114",
    priority: "Urgent",
    requestedBy: "u_ganesh",
    requestedByName: "Ganesh More",
    createdAt: daysAgo(9),
    status: "Assigned",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(9),
    assignmentId: "as_d4",
  },
  {
    id: "rq_d6",
    code: "REQ-DS-1006",
    type: "material",
    lines: [line("itm_lt4", 300)],
    purpose: "Street-light feeder extension",
    priority: "Normal",
    requestedBy: "u_lineman",
    requestedByName: "Sunil Jadhav",
    createdAt: daysAgo(7),
    status: "Approved",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(6),
    decisionComment: "Approved — assign when crew is ready",
  },
  {
    id: "rq_d7",
    code: "REQ-DS-1007",
    type: "material",
    lines: [line("itm_do_fuse", 30)],
    purpose: "Monsoon preparedness stock",
    priority: "Low",
    requestedBy: "u_ganesh",
    requestedByName: "Ganesh More",
    createdAt: daysAgo(5),
    status: "Rejected",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(4),
    decisionComment: "Quantity too high for one section.",
  },
  {
    id: "rq_d8",
    code: "REQ-DS-1008",
    type: "material",
    lines: [line("itm_tp_meter", 10)],
    purpose: "Commercial consumers — 3φ meter replacement",
    priority: "Normal",
    requestedBy: "u_lineman",
    requestedByName: "Sunil Jadhav",
    createdAt: daysAgo(3),
    status: "Pending",
  },
  {
    id: "rq_d9",
    code: "REQ-DS-1009",
    type: "material",
    lines: [line("itm_disc_ins", 24), line("itm_pin_ins", 40)],
    purpose: "Insulator replacement after flashover",
    priority: "Urgent",
    requestedBy: "u_ganesh",
    requestedByName: "Ganesh More",
    createdAt: daysAgo(2),
    status: "Pending",
  },
  {
    id: "rq_d10",
    code: "REQ-DS-1010",
    type: "material",
    lines: [line("itm_service_wire", 250), line("itm_lugs", 5)],
    purpose: "Service line re-wiring, Uruli",
    priority: "Normal",
    requestedBy: "u_lineman",
    requestedByName: "Sunil Jadhav",
    createdAt: daysAgo(1),
    status: "Pending",
  },
]

const asg = (
  id: string,
  code: string,
  req: MaterialRequest,
  createdDaysAgo: number,
): Assignment => ({
  id,
  code,
  requestId: req.id,
  requestCode: req.code,
  assigneeId: req.requestedBy,
  assigneeName: req.requestedByName,
  lines: req.lines.map((l) => ({ ...l })),
  stockSiteId: SITE_IDS.central,
  createdAt: daysAgo(createdDaysAgo),
  createdBy: "Rahul Patil",
})

const CENTRAL_ASSIGNMENTS: Assignment[] = [
  asg("as_c1", "ASN-CS-401", DIST_REQUESTS.find((r) => r.id === "rq_dc1")!, 24),
  asg("as_c2", "ASN-CS-402", DIST_REQUESTS.find((r) => r.id === "rq_dc2")!, 11),
]

const DIST_ASSIGNMENTS: Assignment[] = [
  asg("as_d1", "ASN-DS-501", DIST_REQUESTS.find((r) => r.id === "rq_d1")!, 20),
  asg("as_d2", "ASN-DS-502", DIST_REQUESTS.find((r) => r.id === "rq_d2")!, 17),
  asg("as_d3", "ASN-DS-503", DIST_REQUESTS.find((r) => r.id === "rq_d4")!, 11),
  asg("as_d4", "ASN-DS-504", DIST_REQUESTS.find((r) => r.id === "rq_d5")!, 9),
]

const cons = (
  id: string,
  assignmentId: string,
  itemId: string,
  qty: number,
  location: string,
  d: number,
  by: string,
): ConsumptionRecord => ({ id, assignmentId, itemId, itemName: itemName(itemId).name, qty, location, date: daysAgo(d), recordedBy: by })

const DIST_CONSUMPTION: ConsumptionRecord[] = [
  cons("cn1", "as_d1", "itm_sp_meter", 22, "Saswad – Ward 3", 18, "Sunil Jadhav"),
  cons("cn2", "as_d1", "itm_sp_meter", 11, "Saswad – Ward 5", 14, "Sunil Jadhav"),
  cons("cn3", "as_d1", "itm_service_wire", 380, "Saswad – Ward 3", 18, "Sunil Jadhav"),
  cons("cn4", "as_d2", "itm_pin_ins", 48, "Jejuri 11 kV feeder", 15, "Ganesh More"),
  cons("cn5", "as_d2", "itm_stay", 6, "Jejuri 11 kV feeder", 15, "Ganesh More"),
  cons("cn6", "as_d3", "itm_mcb32", 14, "Hadapsar – Sector 2", 8, "Sunil Jadhav"),
  cons("cn7", "as_d3", "itm_meter_box", 14, "Hadapsar – Sector 2", 8, "Sunil Jadhav"),
  cons("cn8", "as_d4", "itm_earth_rod", 12, "DTC-114", 7, "Ganesh More"),
]

const SERVICE_REQUESTS: MaterialRequest[] = [
  ...[
    ["rq_s1", "SM-PN-208841", "Single Phase Smart Meter", "Display blank", 24, "Fixed", "rj1"],
    ["rq_s2", "SM-PN-209113", "Single Phase Smart Meter", "No communication (RF/GPRS)", 20, "In Repair", "rj2"],
    ["rq_s3", "TP-PN-044120", "Three Phase Smart Meter", "Relay stuck", 16, "Fixed", "rj3"],
    ["rq_s4", "SM-PN-210554", "Single Phase Smart Meter", "Burnt PCB", 14, "Scrapped", "rj4"],
  ].map(
    ([id, meterId, meterType, fault, d, , rj]) =>
      ({
        id: id as string,
        code: `REQ-SC-${2000 + Number((id as string).slice(4))}`,
        type: "repair",
        lines: [],
        repair: { meterId: meterId as string, meterType: meterType as string, fault: fault as string },
        purpose: `Repair ${meterId}`,
        priority: "Normal",
        requestedBy: "u_vikas",
        requestedByName: "Vikas Shinde",
        createdAt: daysAgo(d as number),
        status: "Approved",
        decidedBy: "Anjali Joshi",
        decidedAt: daysAgo((d as number) - 1),
        repairJobId: rj as string,
      }) as MaterialRequest,
  ),
  {
    id: "rq_s5",
    code: "REQ-SC-2005",
    type: "repair",
    lines: [],
    repair: { meterId: "SM-PN-211902", meterType: "Single Phase Smart Meter", fault: "Tamper alarm" },
    purpose: "Repair SM-PN-211902",
    priority: "Urgent",
    requestedBy: "u_vikas",
    requestedByName: "Vikas Shinde",
    createdAt: daysAgo(2),
    status: "Pending",
  },
  {
    id: "rq_s6",
    code: "REQ-SC-2006",
    type: "repair",
    lines: [],
    repair: { meterId: "CT-PN-000781", meterType: "CT Operated Meter", fault: "Wrong reading" },
    purpose: "Repair CT-PN-000781 (HT consumer complaint)",
    priority: "Normal",
    requestedBy: "u_vikas",
    requestedByName: "Vikas Shinde",
    createdAt: daysAgo(1),
    status: "Pending",
  },
  {
    id: "rq_s7",
    code: "REQ-SC-2007",
    type: "repair",
    lines: [],
    repair: { meterId: "SM-PN-198220", meterType: "Single Phase Smart Meter", fault: "Display blank" },
    purpose: "Repair SM-PN-198220",
    priority: "Low",
    requestedBy: "u_vikas",
    requestedByName: "Vikas Shinde",
    createdAt: daysAgo(10),
    status: "Rejected",
    decidedBy: "Anjali Joshi",
    decidedAt: daysAgo(9),
    decisionComment: "Meter under OEM warranty — send back to vendor.",
  },
  {
    id: "rq_sc1",
    code: "REQ-SC-3001",
    type: "material",
    lines: [line("itm_sp_meter", 5), line("itm_meter_box", 10)],
    purpose: "Replacement meters & enclosures requested from Distribution",
    priority: "Normal",
    requestedBy: "u_vikas",
    requestedByName: "Vikas Shinde",
    createdAt: daysAgo(14),
    status: "Assigned",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(13),
    decisionComment: "Issued from Distribution regional store",
    assignmentId: "as_sc1",
    originSiteId: SITE_IDS.service,
    originSiteName: "Service Centre",
    targetSiteId: SITE_IDS.distribution,
    targetSiteName: "Distribution",
  },
  {
    id: "rq_sc2",
    code: "REQ-SC-3002",
    type: "material",
    lines: [line("itm_tp_meter", 2)],
    purpose: "Testing & replacement stock requested from Distribution",
    priority: "Urgent",
    requestedBy: "u_vikas",
    requestedByName: "Vikas Shinde",
    createdAt: daysAgo(1),
    status: "Pending",
    originSiteId: SITE_IDS.service,
    originSiteName: "Service Centre",
    targetSiteId: SITE_IDS.distribution,
    targetSiteName: "Distribution",
  },
]

const SERVICE_ASSIGNMENTS: Assignment[] = [
  {
    id: "as_sc1",
    code: "ASN-DS-601",
    requestId: "rq_sc1",
    requestCode: "REQ-SC-3001",
    assigneeId: "u_vikas",
    assigneeName: "Vikas Shinde",
    lines: [line("itm_sp_meter", 5), line("itm_meter_box", 10)],
    stockSiteId: SITE_IDS.distribution,
    createdAt: daysAgo(13),
    createdBy: "Rahul Patil",
  },
]

const rj = (
  id: string,
  code: string,
  meterId: string,
  meterType: string,
  fault: string,
  technician: string,
  partsUsed: string,
  status: RepairJob["status"],
  received: number,
  updated: number,
  extra: Partial<RepairJob> = {},
): RepairJob => ({
  id,
  code,
  meterId,
  meterType,
  fault,
  technician,
  partsUsed,
  status,
  receivedAt: daysAgo(received),
  updatedAt: daysAgo(updated),
  ...extra,
})

const SERVICE_REPAIRS: RepairJob[] = [
  rj("rj1", "RJ-SC-301", "SM-PN-208841", "Single Phase Smart Meter", "Display blank", "Vikas Shinde", "LCD module, ribbon cable", "Fixed", 23, 19, { requestId: "rq_s1", returned: true, partsCost: 420, labourHours: 1.5 }),
  rj("rj2", "RJ-SC-302", "SM-PN-209113", "Single Phase Smart Meter", "No communication (RF/GPRS)", "Vikas Shinde", "RF module", "In Repair", 19, 3, { requestId: "rq_s2", partsCost: 650, labourHours: 2 }),
  rj("rj3", "RJ-SC-303", "TP-PN-044120", "Three Phase Smart Meter", "Relay stuck", "Rahul Patil", "Latching relay", "Fixed", 15, 6, { requestId: "rq_s3", partsCost: 890, labourHours: 2.5 }),
  rj("rj4", "RJ-SC-304", "SM-PN-210554", "Single Phase Smart Meter", "Burnt PCB", "Vikas Shinde", "—", "Scrapped", 13, 12, { requestId: "rq_s4", labourHours: 0.5 }),
  rj("rj5", "RJ-SC-305", "SM-PN-205510", "Single Phase Smart Meter", "Battery failure", "Vikas Shinde", "RTC battery", "Fixed", 11, 4, { partsCost: 120, labourHours: 0.5 }),
  rj("rj6", "RJ-SC-306", "SM-PN-207731", "Single Phase Smart Meter", "Tamper alarm", "Vikas Shinde", "", "Received", 4, 4),
  rj("rj7", "RJ-SC-307", "TP-PN-043007", "Three Phase Smart Meter", "No communication (RF/GPRS)", "Rahul Patil", "GPRS modem", "In Repair", 6, 2, { partsCost: 1100, labourHours: 1 }),
  rj("rj8", "RJ-SC-308", "SM-PN-206688", "Single Phase Smart Meter", "Wrong reading", "", "", "Received", 1, 1),
]

const SERVICE_RETURNS: ReturnRecord[] = [
  {
    id: "rt_s1",
    source: "repair",
    refId: "rj1",
    refCode: "RJ-SC-301",
    itemId: "itm_sp_meter",
    itemName: "Single Phase Smart Meter",
    qty: 1,
    condition: "Repaired",
    stockSiteId: SITE_IDS.central,
    date: daysAgo(18),
    returnedBy: "Vikas Shinde",
  },
]

export function emptySiteData(): SiteData {
  return { inventory: [], requests: [], assignments: [], consumption: [], returns: [], repairs: [] }
}

export function createSeedDatabase(): Database {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
  const centralReqs = [DIST_REQUESTS[0], DIST_REQUESTS[1], DIST_REQUESTS[2]]
  const distIncoming = [
    SERVICE_REQUESTS.find((r) => r.id === "rq_sc1")!,
    SERVICE_REQUESTS.find((r) => r.id === "rq_sc2")!,
  ]
  return {
    schema: 4,
    users: clone(SEED_USERS),
    sites: {
      [SITE_IDS.central]: siteRecord(clone(centralStores)),
      [SITE_IDS.service]: siteRecord(clone(serviceCentre)),
      [SITE_IDS.distribution]: siteRecord(clone(distribution)),
    },
    data: {
      [SITE_IDS.central]: {
        ...emptySiteData(),
        inventory: clone(CENTRAL_INVENTORY),
        assignments: clone(CENTRAL_ASSIGNMENTS),
        requests: clone(centralReqs),
      },
      [SITE_IDS.service]: {
        ...emptySiteData(),
        requests: clone(SERVICE_REQUESTS),
        repairs: clone(SERVICE_REPAIRS),
        returns: clone(SERVICE_RETURNS),
        assignments: clone(SERVICE_ASSIGNMENTS),
      },
      [SITE_IDS.distribution]: {
        ...emptySiteData(),
        inventory: clone(DISTRIBUTION_INVENTORY),
        requests: clone([...DIST_REQUESTS, ...distIncoming]),
        assignments: clone(DIST_ASSIGNMENTS),
        consumption: clone(DIST_CONSUMPTION),
      },
    },
  }
}

