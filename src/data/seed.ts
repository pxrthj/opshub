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
  ProductAuditRecord,
  RepairJob,
  ReturnRecord,
  SiteConfig,
  SiteData,
  SiteRecord,
  User,
} from "@/lib/types"

// Seed data for Electrolyte Solutions (Navi Mumbai): an ISO 9001 L3/L4 PCB repair and refurbishment company that
// repairs boards for OEM clients (fans, geysers, RO purifiers, mixers, LED video walls) and runs onsite field service.
// The office ids (cs-001, sc-002, ds-003) are kept from the first prototype because everything refers to them.

export const SITE_IDS = {
  central: "cs-001", // Component Stores
  service: "sc-002", // PCB Repair Lab
  distribution: "ds-003", // Field Service
} as const

const DAY = 86_400_000
function daysAgo(d: number, hour = 10) {
  const t = new Date(Date.now() - d * DAY)
  t.setHours(hour, (d * 17) % 60, 0, 0)
  return t.toISOString()
}

/** Every account uses this password so it is easy to remember in a demo. */
export const DEMO_PASSWORD = "demo123"

function person(id: string, email: string, name: string, title: string, roles: User["roles"]): User {
  return { id, email: `${email}@plexus.demo`, password: DEMO_PASSWORD, name, title, roles }
}

// Each office has one Admin, one Manager and one Member. User ids are kept stable because
// requests, assignments and cross-site routing refer to them.
export const SEED_USERS: User[] = [
  // Component Stores
  person("u_cs_admin", "stores.admin", "Anil Joshi", "Admin, Component Stores", { [SITE_IDS.central]: "Admin" }),
  person("u_store", "stores.manager", "Meena Kulkarni", "Stores In-charge", { [SITE_IDS.central]: "Manager" }),
  person("u_clerk", "stores.member", "Pooja Gaikwad", "Stores Assistant", { [SITE_IDS.central]: "Member" }),

  // Field Service
  person("u_ds_admin", "field.admin", "Priya Nair", "Admin, Field Service", { [SITE_IDS.distribution]: "Admin" }),
  person("u_engineer", "field.manager", "Rahul Patil", "Field Service Supervisor", { [SITE_IDS.distribution]: "Manager" }),
  person("u_lineman", "field.member", "Sunil Jadhav", "Field Service Technician, Navi Mumbai", { [SITE_IDS.distribution]: "Member" }),

  // PCB Repair Lab
  person("u_sc_admin", "lab.admin", "Kavita Rao", "Admin, PCB Repair Lab", { [SITE_IDS.service]: "Admin" }),
  person("u_service_mgr", "lab.manager", "Anjali Joshi", "Repair Lab Manager", { [SITE_IDS.service]: "Manager" }),
  person("u_vikas", "lab.member", "Vikas Shinde", "Senior PCB Repair Technician (L3/L4)", { [SITE_IDS.service]: "Member" }),

  // Special accounts
  person("u_admin", "admin", "Aarti Deshmukh", "Operations Head (all offices)", {
    [SITE_IDS.central]: "Admin",
    [SITE_IDS.service]: "Admin",
    [SITE_IDS.distribution]: "Admin",
  }),
  person("u_ganesh", "ganesh", "Ganesh More", "Lab & Field Technician (PCB Repair Lab + Field Service)", {
    [SITE_IDS.distribution]: "Member",
    [SITE_IDS.service]: "Member",
  }),
  person("u_suresh", "logistics", "Suresh Pawar", "Logistics & Dispatch (Component Stores + Field Service)", {
    [SITE_IDS.central]: "Member",
    [SITE_IDS.distribution]: "Member",
  }),
]

// ---------------------------------------------------------------- site configs

function node(id: string, moduleId: ModuleId, x: number, y: number): CanvasNode {
  return { id, moduleId, x, y }
}
function edge(source: string, target: string): CanvasEdge {
  return { id: `e_${source}_${target}`, source, target }
}

function baseConfig(partial: Pick<SiteConfig, "siteId" | "slug" | "name" | "description" | "workflow">): SiteConfig {
  return { ...partial, modules: [...CORE_MODULES], pages: [], roles: [], fields: {}, canvas: { nodes: [], edges: [] } }
}

const centralStores = buildConfigFromCanvas(
  baseConfig({
    siteId: SITE_IDS.central,
    slug: "component-stores",
    name: "Component Stores",
    description: "Holds ICs, capacitors, consumables and spare boards, and supplies the Repair Lab and Field Service.",
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
  [node("n_inv", "inventory", 80, 170), node("n_apr", "approval", 320, 170), node("n_ana", "analytics", 560, 60), node("n_rep", "reports", 560, 280), node("n_aud", "audit-log", 560, 480)],
  [edge("n_inv", "n_apr"), edge("n_inv", "n_ana"), edge("n_inv", "n_rep"), edge("n_inv", "n_aud")],
)

const serviceCentre = buildConfigFromCanvas(
  baseConfig({
    siteId: SITE_IDS.service,
    slug: "pcb-repair-lab",
    name: "PCB Repair Lab",
    description: "Repairs faulty client boards at component level and takes the parts it needs from Component Stores.",
    workflow: {
      stockSourceSiteId: SITE_IDS.central,
      autoAssignOnApproval: true,
      requireRejectComment: true,
      allowRepairRequests: true,
      allowMaterialRequests: true,
      maxQtyPerLine: 200,
      lowStockAlerts: false,
    },
  }),
  [
    node("n_req", "request", 40, 60),
    node("n_apr", "approval", 320, 60),
    node("n_pcb", "pcb-repair", 600, 60),
    node("n_ret", "returns", 880, 160),
    node("n_inv", "inventory", 320, 280),
    node("n_asg", "assignment", 600, 280),
    node("n_afe", "assignment-frontend", 880, 360),
    node("n_con", "consumption", 880, 480),
  ],
  [
    edge("n_req", "n_apr"),
    edge("n_apr", "n_pcb"),
    edge("n_pcb", "n_ret"),
    edge("n_apr", "n_asg"),
    edge("n_inv", "n_asg"),
    edge("n_asg", "n_afe"),
    edge("n_asg", "n_con"),
    edge("n_asg", "n_ret"),
  ],
)

const distribution = buildConfigFromCanvas(
  baseConfig({
    siteId: SITE_IDS.distribution,
    slug: "field-service",
    name: "Field Service",
    description: "Onsite technicians for fan, geyser and appliance service calls, installations and AMC visits.",
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
    node("n_ret", "returns", 870, 420),
    node("n_aud", "audit-log", 580, 400),
  ],
  [
    edge("n_req", "n_apr"),
    edge("n_apr", "n_asg"),
    edge("n_inv", "n_asg"),
    edge("n_asg", "n_afe"),
    edge("n_asg", "n_con"),
    edge("n_asg", "n_ret"),
    edge("n_inv", "n_aud"),
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
      { id: "ev_" + config.siteId + "_1", action: "publish", version: 1, fromVersion: 0, at: daysAgo(30, 9), author: "Aarti Deshmukh", note: "First version" },
    ],
    versions: [
      {
        version: 1,
        config,
        publishedAt: daysAgo(30, 9),
        author: "Aarti Deshmukh",
        summary: `First version with ${config.modules.filter((m) => !CORE_MODULES.includes(m)).length} features`,
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

// Product types the lab repairs. Component Stores also keeps refurbished spares of each, under the same name, so a
// repaired board can be returned to stock.
const BLDC = "BLDC Fan Controller PCB"
const GEYSER = "Geyser Control PCB"
const RO = "RO Purifier Controller PCB"
const MIXER = "Mixer Grinder Speed Control PCB"
const LED = "LED Video Wall Receiving Card"
const IOT = "Smart Appliance IoT Module"

const CENTRAL_INVENTORY: InventoryItem[] = [
  inv("itm_cap_elec", "Electrolytic Capacitor 470µF 35V", "Capacitors", "Nos", 3000, 6, 800),
  inv("itm_cap_x2", "X2 Safety Capacitor 0.47µF 275V", "Capacitors", "Nos", 650, 14, 400),
  inv("itm_mosfet", "MOSFET IRF540N", "Semiconductors", "Nos", 1200, 18, 300),
  inv("itm_bridge", "Bridge Rectifier KBP307", "Semiconductors", "Nos", 420, 12, 200),
  inv("itm_mcu", "Microcontroller STM32F030", "ICs", "Nos", 85, 95, 100),
  inv("itm_driver", "Gate Driver IC IR2101", "ICs", "Nos", 180, 65, 100),
  inv("itm_relay", "Relay 12V 16A", "Relays & Connectors", "Nos", 340, 48, 150),
  inv("itm_conn", "JST Connector Kit (2–6 pin)", "Relays & Connectors", "Sets", 22, 350, 30),
  inv("itm_solder", "Solder Wire Sn63/Pb37 0.6 mm", "Consumables", "Rolls", 40, 780, 15),
  inv("itm_flux", "No-Clean Flux Paste", "Consumables", "Packs", 18, 420, 10),
  inv("itm_coating", "Conformal Coating Spray", "Consumables", "Nos", 9, 650, 12),
  inv("itm_sp_bldc", BLDC, "Spare Boards", "Nos", 60, 850, 20),
  inv("itm_sp_geyser", GEYSER, "Spare Boards", "Nos", 35, 620, 15),
  inv("itm_sp_ro", RO, "Spare Boards", "Nos", 28, 1150, 10),
  inv("itm_sp_mixer", MIXER, "Spare Boards", "Nos", 24, 480, 10),
  inv("itm_sp_led", LED, "Spare Boards", "Nos", 12, 2800, 6),
  inv("itm_sp_iot", IOT, "Spare Boards", "Nos", 30, 1450, 10),
  inv("itm_fan_cap", "Ceiling Fan Capacitor 2.5µF 440V", "Field Spares", "Nos", 900, 22, 300),
  inv("itm_thermostat", "Geyser Thermostat (Auto-cut)", "Field Spares", "Nos", 140, 180, 60),
  inv("itm_element", "Geyser Heating Element 2 kW", "Field Spares", "Nos", 45, 450, 50),
]

const itemName = (id: string) => CENTRAL_INVENTORY.find((i) => i.id === id)!
const line = (itemId: string, qty: number) => {
  const i = itemName(itemId)
  return { itemId, itemName: i.name, unit: i.unit, qty }
}

const CENTRAL_REQUESTS: MaterialRequest[] = [
  {
    id: "rq_cs1",
    code: "REQ-CS-0001",
    type: "material",
    lines: [line("itm_sp_bldc", 40), line("itm_fan_cap", 500)],
    purpose: "Opening stock: refurbished BLDC spares from Bajaj RMA lot B-2209 and fan capacitors (PO-ES-4410)",
    priority: "Normal",
    requestedBy: "u_admin",
    requestedByName: "Meena Kulkarni",
    createdAt: daysAgo(28),
    status: "Assigned",
    decidedBy: "Aarti Deshmukh",
    decidedAt: daysAgo(27),
    decisionComment: "Incoming QC passed — accepted into Component Stores",
    assignmentId: "as_c1",
    originSiteId: SITE_IDS.central,
    originSiteName: "Component Stores",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Component Stores",
  },
  {
    id: "rq_cs2",
    code: "REQ-CS-0002",
    type: "material",
    lines: [line("itm_mcu", 4), line("itm_driver", 30)],
    purpose: "Urgent MCU and gate driver buffer for the LED wall and RO batches",
    priority: "Urgent",
    requestedBy: "u_admin",
    requestedByName: "Meena Kulkarni",
    createdAt: daysAgo(14),
    status: "Approved",
    decidedBy: "Aarti Deshmukh",
    decidedAt: daysAgo(13),
    decisionComment: "Approved as lab buffer stock",
    originSiteId: SITE_IDS.central,
    originSiteName: "Component Stores",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Component Stores",
  },
]

const DIST_REQUESTS: MaterialRequest[] = [
  {
    id: "rq_dc1",
    code: "REQ-DS-0101",
    type: "material",
    lines: [line("itm_sp_bldc", 30), line("itm_fan_cap", 300)],
    purpose: "Monthly van stock for Field Service technicians",
    priority: "Urgent",
    requestedBy: "u_engineer",
    requestedByName: "Rahul Patil",
    createdAt: daysAgo(25),
    status: "Assigned",
    decidedBy: "Meena Kulkarni",
    decidedAt: daysAgo(24),
    decisionComment: "Issued 30 BLDC boards and 300 fan capacitors to Field Service",
    assignmentId: "as_c1",
    originSiteId: SITE_IDS.distribution,
    originSiteName: "Field Service",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Component Stores",
  },
  {
    id: "rq_dc2",
    code: "REQ-DS-0102",
    type: "material",
    lines: [line("itm_sp_geyser", 10), line("itm_thermostat", 40)],
    purpose: "Geyser AMC season spares",
    priority: "Normal",
    requestedBy: "u_engineer",
    requestedByName: "Rahul Patil",
    createdAt: daysAgo(12),
    status: "Assigned",
    decidedBy: "Meena Kulkarni",
    decidedAt: daysAgo(11),
    assignmentId: "as_c2",
    originSiteId: SITE_IDS.distribution,
    originSiteName: "Field Service",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Component Stores",
  },
  {
    id: "rq_dc3",
    code: "REQ-DS-0103",
    type: "material",
    lines: [line("itm_element", 20), line("itm_thermostat", 20)],
    purpose: "Pre-winter geyser service stock",
    priority: "Normal",
    requestedBy: "u_engineer",
    requestedByName: "Rahul Patil",
    createdAt: daysAgo(2),
    status: "Pending",
    originSiteId: SITE_IDS.distribution,
    originSiteName: "Field Service",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Component Stores",
  },
  {
    id: "rq_d1",
    code: "REQ-DS-1001",
    type: "material",
    lines: [line("itm_sp_bldc", 12), line("itm_fan_cap", 60)],
    purpose: "Bajaj BLDC fan warranty calls — Vashi & Nerul",
    priority: "Urgent",
    requestedBy: "u_lineman",
    requestedByName: "Sunil Jadhav",
    createdAt: daysAgo(21),
    status: "Assigned",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(20),
    decisionComment: "Approved for this week's warranty calls",
    assignmentId: "as_d1",
  },
  {
    id: "rq_d2",
    code: "REQ-DS-1002",
    type: "material",
    lines: [line("itm_thermostat", 10), line("itm_element", 4)],
    purpose: "Geyser AMC visits — Kharghar housing society",
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
    lines: [line("itm_sp_ro", 15)],
    purpose: "Keep RO controller boards in the technician van",
    priority: "Low",
    requestedBy: "u_ganesh",
    requestedByName: "Ganesh More",
    createdAt: daysAgo(15),
    status: "Rejected",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(14),
    decisionComment: "Van stock limit is 5 boards — ask again with the service call numbers.",
  },
  {
    id: "rq_d4",
    code: "REQ-DS-1004",
    type: "material",
    lines: [line("itm_sp_mixer", 8), line("itm_fan_cap", 25)],
    purpose: "Anchor appliance service calls — Thane",
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
    lines: [line("itm_sp_iot", 6)],
    purpose: "Smart fan IoT module replacements — Panvel",
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
    lines: [line("itm_fan_cap", 150)],
    purpose: "Installation & demo drive for new fan dealers",
    priority: "Normal",
    requestedBy: "u_lineman",
    requestedByName: "Sunil Jadhav",
    createdAt: daysAgo(7),
    status: "Approved",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(6),
    decisionComment: "Approved — give out when the van is loaded",
  },
  {
    id: "rq_d7",
    code: "REQ-DS-1007",
    type: "material",
    lines: [line("itm_element", 30)],
    purpose: "Spare heating elements for the monsoon season",
    priority: "Low",
    requestedBy: "u_ganesh",
    requestedByName: "Ganesh More",
    createdAt: daysAgo(5),
    status: "Rejected",
    decidedBy: "Rahul Patil",
    decidedAt: daysAgo(4),
    decisionComment: "Quantity too high for one technician.",
  },
  {
    id: "rq_d8",
    code: "REQ-DS-1008",
    type: "material",
    lines: [line("itm_sp_geyser", 4)],
    purpose: "Geyser control board replacements — Airoli",
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
    lines: [line("itm_sp_ro", 3), line("itm_relay", 10)],
    purpose: "Kent RO purifier breakdown calls — Ghansoli",
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
    lines: [line("itm_fan_cap", 40), line("itm_conn", 2)],
    purpose: "Fan rewiring and connector replacement — CBD Belapur",
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
  cons("cn1", "as_d1", "itm_sp_bldc", 7, "Vashi Sector 17 — warranty call FS-2231", 18, "Sunil Jadhav"),
  cons("cn2", "as_d1", "itm_sp_bldc", 3, "Nerul Sector 21 — warranty call FS-2240", 14, "Sunil Jadhav"),
  cons("cn3", "as_d1", "itm_fan_cap", 38, "Vashi Sector 17 — warranty call FS-2231", 18, "Sunil Jadhav"),
  cons("cn4", "as_d2", "itm_thermostat", 8, "Kharghar Sector 12 society — AMC visit", 15, "Ganesh More"),
  cons("cn5", "as_d2", "itm_element", 3, "Kharghar Sector 12 society — AMC visit", 15, "Ganesh More"),
  cons("cn6", "as_d3", "itm_sp_mixer", 5, "Thane, Ghodbunder Road — service call FS-2288", 8, "Sunil Jadhav"),
  cons("cn7", "as_d3", "itm_fan_cap", 14, "Thane, Ghodbunder Road — service call FS-2288", 8, "Sunil Jadhav"),
  cons("cn8", "as_d4", "itm_sp_iot", 6, "New Panvel — smart fan installs", 7, "Ganesh More"),
]

const SERVICE_REQUESTS: MaterialRequest[] = [
  ...[
    ["rq_s1", "BJ-BLDC-2408841", BLDC, "MOSFET / driver failure", 24, "Fixed", "rj1"],
    ["rq_s2", "KT-RO-2409113", RO, "Firmware / communication fault", 20, "In Repair", "rj2"],
    ["rq_s3", "AN-GY-2404412", GEYSER, "Relay failure", 16, "Fixed", "rj3"],
    ["rq_s4", "XM-LED-2410554", LED, "Physical / water damage", 14, "Scrapped", "rj4"],
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
    repair: { meterId: "BJ-BLDC-2411902", meterType: BLDC, fault: "No power / dead board" },
    purpose: "Repair BJ-BLDC-2411902",
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
    repair: { meterId: "XM-LED-2400781", meterType: LED, fault: "IC / MCU failure" },
    purpose: "Repair XM-LED-2400781 (Xtreme Media escalation)",
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
    repair: { meterId: "AN-MX-2398220", meterType: MIXER, fault: "Burnt component" },
    purpose: "Repair AN-MX-2398220",
    priority: "Low",
    requestedBy: "u_vikas",
    requestedByName: "Vikas Shinde",
    createdAt: daysAgo(10),
    status: "Rejected",
    decidedBy: "Anjali Joshi",
    decidedAt: daysAgo(9),
    decisionComment: "Board is still under OEM warranty — send it back to Anchor.",
  },
  {
    id: "rq_sc1",
    code: "REQ-SC-3001",
    type: "material",
    lines: [line("itm_mosfet", 40), line("itm_cap_elec", 100)],
    purpose: "Components for this week's BLDC fan board batch",
    priority: "Normal",
    requestedBy: "u_vikas",
    requestedByName: "Vikas Shinde",
    createdAt: daysAgo(14),
    status: "Assigned",
    decidedBy: "Meena Kulkarni",
    decidedAt: daysAgo(13),
    decisionComment: "Issued from Component Stores",
    assignmentId: "as_sc1",
    originSiteId: SITE_IDS.service,
    originSiteName: "PCB Repair Lab",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Component Stores",
  },
  {
    id: "rq_sc2",
    code: "REQ-SC-3002",
    type: "material",
    lines: [line("itm_mcu", 10)],
    purpose: "MCUs for RO controller board repairs",
    priority: "Urgent",
    requestedBy: "u_vikas",
    requestedByName: "Vikas Shinde",
    createdAt: daysAgo(1),
    status: "Pending",
    originSiteId: SITE_IDS.service,
    originSiteName: "PCB Repair Lab",
    targetSiteId: SITE_IDS.central,
    targetSiteName: "Component Stores",
  },
]

const SERVICE_ASSIGNMENTS: Assignment[] = [
  {
    id: "as_sc1",
    code: "ASN-CS-601",
    requestId: "rq_sc1",
    requestCode: "REQ-SC-3001",
    assigneeId: "u_vikas",
    assigneeName: "Vikas Shinde",
    lines: [line("itm_mosfet", 40), line("itm_cap_elec", 100)],
    stockSiteId: SITE_IDS.central,
    createdAt: daysAgo(13),
    createdBy: "Meena Kulkarni",
  },
]

const SERVICE_CONSUMPTION: ConsumptionRecord[] = [
  cons("cn9", "as_sc1", "itm_mosfet", 18, "BLDC batch BJ-B2214 — bench 2", 11, "Vikas Shinde"),
  cons("cn10", "as_sc1", "itm_cap_elec", 36, "BLDC batch BJ-B2214 — bench 2", 11, "Vikas Shinde"),
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
  rj("rj1", "RJ-SC-301", "BJ-BLDC-2408841", BLDC, "MOSFET / driver failure", "Vikas Shinde", "MOSFET IRF540N ×2, gate driver IR2101", "Fixed", 23, 19, { requestId: "rq_s1", returned: true, partsCost: 101, labourHours: 1.5 }),
  rj("rj2", "RJ-SC-302", "KT-RO-2409113", RO, "Firmware / communication fault", "Vikas Shinde", "MCU STM32F030 (re-flashed)", "In Repair", 19, 3, { requestId: "rq_s2", partsCost: 95, labourHours: 2 }),
  rj("rj3", "RJ-SC-303", "AN-GY-2404412", GEYSER, "Relay failure", "Ganesh More", "Relay 12V 16A", "Fixed", 15, 6, { requestId: "rq_s3", partsCost: 48, labourHours: 1 }),
  rj("rj4", "RJ-SC-304", "XM-LED-2410554", LED, "Physical / water damage", "Vikas Shinde", "—", "Scrapped", 13, 12, { requestId: "rq_s4", labourHours: 0.5 }),
  rj("rj5", "RJ-SC-305", "BJ-BLDC-2405510", BLDC, "Burnt component", "Vikas Shinde", "Electrolytic capacitor 470µF ×2, bridge rectifier", "Fixed", 11, 4, { partsCost: 24, labourHours: 0.5 }),
  rj("rj6", "RJ-SC-306", "AN-MX-2407731", MIXER, "No power / dead board", "Vikas Shinde", "", "Received", 4, 4),
  rj("rj7", "RJ-SC-307", "XM-LED-2403007", LED, "IC / MCU failure", "Ganesh More", "BGA rework — FPGA re-balled", "In Repair", 6, 2, { partsCost: 350, labourHours: 3 }),
  rj("rj8", "RJ-SC-308", "KT-RO-2406688", RO, "Connector or trace damage", "", "", "Received", 1, 1),
]

const SERVICE_RETURNS: ReturnRecord[] = [
  {
    id: "rt_s1",
    source: "repair",
    refId: "rj1",
    refCode: "RJ-SC-301",
    itemId: "itm_sp_bldc",
    itemName: BLDC,
    qty: 1,
    condition: "Repaired",
    stockSiteId: SITE_IDS.central,
    date: daysAgo(18),
    returnedBy: "Vikas Shinde",
  },
]

export function emptySiteData(): SiteData {
  return { inventory: [], requests: [], assignments: [], consumption: [], returns: [], repairs: [], productAudits: [] }
}

/**
 * Gives every material request an asking office and a supplying office, and records the hand-off
 * between the two managers: the asker's own manager sends it on, then the supplier's manager decides.
 * Requests listed in `stayWithOwnManager` have not been sent on yet.
 */
function routeRequests(
  reqs: MaterialRequest[],
  from: { id: string; name: string; manager: string },
  to: { id: string; name: string; manager: string },
  stayWithOwnManager: string[] = [],
): MaterialRequest[] {
  return reqs.map((r) => {
    const c: MaterialRequest = JSON.parse(JSON.stringify(r))
    if (c.type !== "material") return c
    c.originSiteId ??= from.id
    c.originSiteName ??= from.name
    c.targetSiteId ??= to.id
    c.targetSiteName ??= to.name
    if (!stayWithOwnManager.includes(c.id)) {
      c.forwardedAt ??= new Date(new Date(c.createdAt).getTime() + 2 * 3600_000).toISOString()
      c.forwardedBy ??= from.manager
    }
    // The supplying office's manager is the one who decided, not the asker's own manager.
    if (c.status !== "Pending" && c.decidedBy === from.manager) c.decidedBy = to.manager
    return c
  })
}

const audit = (
  id: string,
  itemId: string,
  field: ProductAuditRecord["field"],
  changeType: ProductAuditRecord["changeType"],
  oldValue: number | null,
  newValue: number,
  reason: string,
  refCode: string | undefined,
  actor: { id: string; name: string; role: ProductAuditRecord["actorRole"] },
  timestamp: string,
): ProductAuditRecord => {
  const i = itemName(itemId)
  const diff = oldValue === null ? undefined : `${newValue - oldValue >= 0 ? "+" : ""}${newValue - oldValue}`
  return { id, itemId, itemName: i.name, category: i.category, unit: i.unit, field, changeType, oldValue, newValue, diff, reason, refCode, actorId: actor.id, actorName: actor.name, actorRole: actor.role, timestamp }
}
const MEENA = { id: "u_store", name: "Meena Kulkarni", role: "Manager" as const }
const AARTI = { id: "u_admin", name: "Aarti Deshmukh", role: "Admin" as const }
const ANJALI = { id: "u_service_mgr", name: "Anjali Joshi", role: "Manager" as const }

const CENTRAL_AUDITS: ProductAuditRecord[] = [
  audit("aud_01", "itm_cap_elec", "qty", "quantity", 2000, 3000, "Purchase received from Mouser Electronics (PO-ES-4421)", "PO-ES-4421", MEENA, daysAgo(2, 14)),
  audit("aud_02", "itm_mcu", "unitPrice", "price", 88, 95, "Supplier rate revision FY 2026-Q3", "RTE-2026-08", AARTI, daysAgo(5, 11)),
  audit("aud_03", "itm_coating", "reorderLevel", "threshold", 8, 12, "Higher coating use on LED video wall batches", "QC-NOTE-26", MEENA, daysAgo(9, 16)),
  audit("aud_04", "itm_sp_bldc", "qty", "return", 59, 60, "Repaired board returned to stock (RJ-SC-301)", "RJ-SC-301", ANJALI, daysAgo(18, 10)),
  audit("aud_05", "itm_fan_cap", "qty", "dispatch", 1200, 900, "Dispatched for REQ-DS-0101 (Monthly van stock for Field Service technicians)", "REQ-DS-0101", MEENA, daysAgo(20, 15)),
  audit("aud_06", "itm_conn", "created", "create", null, 30, "Initial catalogue entry for standard connector kits", undefined, AARTI, daysAgo(28, 9)),
]

export function createSeedDatabase(): Database {
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
  const central = { id: SITE_IDS.central, name: "Component Stores", manager: "Meena Kulkarni" }
  const fieldOffice = { id: SITE_IDS.distribution, name: "Field Service", manager: "Rahul Patil" }
  const labOffice = { id: SITE_IDS.service, name: "PCB Repair Lab", manager: "Anjali Joshi" }
  // rq_d8 and rq_d10 are still with Field Service's own manager, so the "send on" step can be tried.
  const fieldReqs = routeRequests(DIST_REQUESTS, fieldOffice, central, ["rq_d8", "rq_d10"])
  // rq_sc2 is still with the lab manager.
  const labReqs = routeRequests(SERVICE_REQUESTS, labOffice, central, ["rq_sc2"])
  // Component Stores sees every request that was sent on to it.
  const centralIncoming = [...fieldReqs, ...labReqs].filter((r) => r.forwardedAt)
  return {
    schema: 5,
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
        requests: clone([...CENTRAL_REQUESTS, ...centralIncoming]),
        productAudits: clone(CENTRAL_AUDITS),
      },
      [SITE_IDS.service]: {
        ...emptySiteData(),
        requests: clone(labReqs),
        repairs: clone(SERVICE_REPAIRS),
        returns: clone(SERVICE_RETURNS),
        assignments: clone(SERVICE_ASSIGNMENTS),
        consumption: clone(SERVICE_CONSUMPTION),
      },
      [SITE_IDS.distribution]: {
        ...emptySiteData(),
        requests: clone(fieldReqs),
        assignments: clone(DIST_ASSIGNMENTS),
        consumption: clone(DIST_CONSUMPTION),
      },
    },
  }
}
