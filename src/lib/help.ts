import type { ModuleId, Role } from "./types"

// Plain-language help shown at the top of every page: what the page is for,
// and what the person looking at it is allowed to do here.

export interface PageHelpText {
  what: string
  can?: Partial<Record<Role, string>>
}

export const MODULE_HELP: Partial<Record<ModuleId, PageHelpText>> = {
  shell: {
    what: "A quick summary of this office: what is waiting, what is running low and what is being worked on. Click any number to jump to it.",
    can: {
      Public: "look at this summary only.",
      Member: "use the menu on the left to ask for material or record your work.",
      Manager: "see everything waiting for you and act on it.",
      Admin: "do everything, and change this office in the Builder.",
    },
  },
  inventory: {
    what: "The list of everything on the shelves and how many are left. A red “Low stock” tag means it is time to reorder.",
    can: {
      Member: "look up what is in stock.",
      Manager: "add new items and update counts.",
      Admin: "add, update and delete items.",
    },
  },
  request: {
    what: "Where people ask for material (or a meter repair). Every request waits until a supervisor says yes or no.",
    can: {
      Member: "ask for something and follow your requests: Waiting → Approved / Rejected → Handed over.",
      Manager: "see everyone's requests here; approve them on “Approve requests”.",
    },
  },
  approval: {
    what: "Requests waiting for a supervisor. Saying yes hands the material over automatically — but only if the warehouse has enough of every item. If not, nothing changes.",
    can: { Manager: "approve or reject. Rejecting needs a short reason the requester will see." },
  },
  assignment: {
    what: "A record of who was handed what, and how much of it they have used, given back or still have.",
    can: { Manager: "check balances and hand over requests that were approved earlier." },
  },
  "assignment-frontend": {
    what: "The material that was handed to you. Tell the system how much you used, and give back what you did not need.",
    can: { Member: "record usage and return spare material." },
  },
  consumption: {
    what: "A diary of material actually used on site, and how much each person still has.",
    can: { Member: "record what you used.", Manager: "see everyone's usage." },
  },
  returns: {
    what: "Give back unused material, or send repaired meters back to the warehouse. The warehouse count goes up straight away.",
    can: { Member: "return material that was handed to you, or meters you fixed." },
  },
  "pcb-repair": {
    what: "The repair bench. Each broken meter moves Received → Being repaired → Fixed (or Scrapped). Fixed meters can then go back to the warehouse.",
    can: { Member: "log a broken meter and update its repair status." },
  },
  analytics: {
    what: "Charts of this office's numbers: stock by type, activity over the last weeks, and a status count.",
    can: { Member: "look at the charts. Click “Table” on a chart to see the exact numbers." },
  },
  reports: {
    what: "Download this office's data as an Excel file, or update stock by uploading a spreadsheet.",
    can: {
      Member: "see what reports exist (downloading needs a supervisor).",
      Manager: "download Excel files.",
      Admin: "download Excel files and upload a spreadsheet to update stock.",
    },
  },
  users: {
    what: "Who works in this office and what each person is allowed to do here.",
    can: { Admin: "give people access, change their level, or remove them." },
  },
}

export const HUB_HELP = {
  home: "This is the front door. Each card is one office (a “unit”) you can work in. Click “Open …” to go inside. The coloured label on each card shows your level there.",
  users: "Everyone who can log in, and their level in each office. Levels: Member (does the work), Manager (approves), Admin (controls everything).",
  modules: "The building blocks an office can be made from. Each block adds one page or feature. Admins combine them in the Builder.",
  builderIndex: "Pick an office to change. The Builder is where an Admin decides which pages and features that office has.",
  builder:
    "The planning board for this office. Each box is a feature. Drag new boxes in from the left, connect them left-to-right, then Preview and Publish. Red means a box is missing something it needs.",
  history: "Every time this office was published, it was saved as a version. If a change goes wrong, roll back to an older version with one click.",
}

const RANK: Role[] = ["Public", "Member", "Manager", "Admin"]

/** The most relevant “you can …” line for this role (falls back to the nearest lower role). */
export function canDoFor(help: PageHelpText, role: Role): string | undefined {
  if (!help.can) return undefined
  for (let i = RANK.indexOf(role); i >= 0; i--) {
    const line = help.can[RANK[i]]
    if (line) return line
  }
  return undefined
}
