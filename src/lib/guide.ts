import { SEED_REQUEST_IDS, SITE_IDS } from "@/data/seed"
import type { Database, MaterialRequest } from "./types"

// The built-in demo guide: one batch of smart meters followed through all three offices.
// Each step knows who should do it, where, and how to tell from the data that it is done.

export interface GuidePerson {
  id: string
  name: string
  job: string
  email: string
  password: string
  color: string
}

export const PEOPLE = {
  aarti: { id: "u_admin", name: "Aarti", job: "Admin, head office", email: "admin@opshub.demo", password: "admin123", color: "bg-indigo-600" },
  meena: { id: "u_store", name: "Meena", job: "Warehouse manager", email: "storekeeper@opshub.demo", password: "store123", color: "bg-blue-800" },
  sunil: { id: "u_lineman", name: "Sunil", job: "Lineman (field worker)", email: "lineman@opshub.demo", password: "line123", color: "bg-green-600" },
  rahul: { id: "u_engineer", name: "Rahul", job: "Engineer (supervisor)", email: "engineer@opshub.demo", password: "eng123", color: "bg-orange-500" },
  vikas: { id: "u_vikas", name: "Vikas", job: "Meter technician", email: "vikas@opshub.demo", password: "demo123", color: "bg-amber-600" },
} satisfies Record<string, GuidePerson>

export interface GuideContext {
  db: Database
  visited: Record<string, boolean>
}

export interface GuideStep {
  id: string
  who: GuidePerson
  title: string
  /** Each line is one instruction; **text** is shown bold. */
  doThis: string[]
  /** Where "Take me there" goes. */
  path: string
  /** For steps that are just "go and look": done once the person opens this path. */
  visitPath?: string
  done: (ctx: GuideContext) => boolean
}

const DS = SITE_IDS.distribution
const SC = SITE_IDS.service

/** The meter request Sunil made during the demo (prefers one that was handed over). */
export function demoMeterRequest(db: Database): MaterialRequest | undefined {
  const mine = (db.data[DS]?.requests ?? []).filter(
    (r) => !SEED_REQUEST_IDS.has(r.id) && r.type === "material" && r.lines.some((l) => l.itemId === "itm_sp_meter"),
  )
  return mine.find((r) => r.status === "Assigned") ?? mine[0]
}

/** The repair request Vikas made during the demo (prefers one that was approved). */
export function demoRepairRequest(db: Database): MaterialRequest | undefined {
  const mine = (db.data[SC]?.requests ?? []).filter((r) => !SEED_REQUEST_IDS.has(r.id) && r.type === "repair")
  return mine.find((r) => r.repairJobId) ?? mine[0]
}

export function meterStock(db: Database) {
  return db.data[SITE_IDS.central]?.inventory.find((i) => i.id === "itm_sp_meter")?.qty
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    id: "returns-on",
    who: PEOPLE.aarti,
    title: "Switch on “Returns” for the Field Office",
    doThis: [
      "Drag **Return Management** from the list on the left onto the board.",
      "Drag from the dot on the **right of “Material Assignment”** to the dot on the **left of “Return Management”**.",
      "Click **Publish** (top right), then **Publish** again.",
    ],
    path: `/builder/${DS}`,
    done: ({ db }) => db.sites[DS]?.live.modules.includes("returns") ?? false,
  },
  {
    id: "check-stock",
    who: PEOPLE.meena,
    title: "Check the warehouse stock",
    doThis: ["Find **Single Phase Smart Meter** — there are **500**.", "Red “Low stock” tags show what needs reordering."],
    path: "/s/central-stores/inventory",
    visitPath: "/s/central-stores/inventory",
    done: ({ visited }) => !!visited["check-stock"],
  },
  {
    id: "ask",
    who: PEOPLE.sunil,
    title: "Ask for 20 meters",
    doThis: [
      "Click **New request**.",
      "Choose **Single Phase Smart Meter** and type **20**.",
      "Write a purpose like **Wagholi**, then click **Submit request**.",
    ],
    path: "/s/distribution/requests",
    done: ({ db }) => !!demoMeterRequest(db),
  },
  {
    id: "approve",
    who: PEOPLE.rahul,
    title: "Approve Sunil's request",
    doThis: [
      "Find Sunil's request for 20 meters.",
      "Click **Approve & hand over**, then confirm.",
      "The warehouse count drops from 500 to 480.",
    ],
    path: "/s/distribution/approvals",
    done: ({ db }) => demoMeterRequest(db)?.status === "Assigned",
  },
  {
    id: "use",
    who: PEOPLE.sunil,
    title: "Record the 15 meters he fitted",
    doThis: ["On the meter line, click **Record usage**.", "Type **15** and a place like **Wagholi Ward 4**, then save."],
    path: "/s/distribution/my-materials",
    done: ({ db }) => {
      const a = demoMeterRequest(db)?.assignmentId
      return !!a && (db.data[DS]?.consumption ?? []).some((c) => c.assignmentId === a)
    },
  },
  {
    id: "return",
    who: PEOPLE.sunil,
    title: "Give back the 5 spare meters",
    doThis: ["On the same line, click **Return unused**.", "Type **5**, then click **Return to stock**."],
    path: "/s/distribution/my-materials",
    done: ({ db }) => {
      const a = demoMeterRequest(db)?.assignmentId
      return !!a && (db.data[DS]?.returns ?? []).some((r) => r.source === "assignment" && r.refId === a)
    },
  },
  {
    id: "report-broken",
    who: PEOPLE.vikas,
    title: "Report a broken meter",
    doThis: [
      "Click **New request**.",
      "Meter ID **SM-PN-300001**, fault **Display blank**.",
      "Click **Submit request**.",
    ],
    path: "/s/service-centre/requests",
    done: ({ db }) => !!demoRepairRequest(db),
  },
  {
    id: "approve-repair",
    who: PEOPLE.rahul,
    title: "Approve the repair",
    doThis: ["Click **Approve** on Vikas's request, then confirm.", "This opens a repair job for the meter."],
    path: "/s/service-centre/approvals",
    done: ({ db }) => !!demoRepairRequest(db)?.repairJobId,
  },
  {
    id: "fix",
    who: PEOPLE.vikas,
    title: "Fix the meter and send it back",
    doThis: [
      "On **Meter repairs**, click ✏️ next to **SM-PN-300001**, set status to **Fixed**, then **Save**.",
      "Open **Returns** in the menu and click **Return to stock**.",
    ],
    path: "/s/service-centre/repairs",
    done: ({ db }) => {
      const id = demoRepairRequest(db)?.repairJobId
      return !!id && !!db.data[SC]?.repairs.find((j) => j.id === id)?.returned
    },
  },
  {
    id: "final-check",
    who: PEOPLE.aarti,
    title: "See the final count",
    doThis: ["**Single Phase Smart Meter** should now read **486**:", "500 − 20 handed out + 5 returned + 1 repaired."],
    path: "/s/central-stores/inventory",
    visitPath: "/s/central-stores/inventory",
    done: ({ visited }) => !!visited["final-check"],
  },
]
