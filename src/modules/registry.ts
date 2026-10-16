import type { ComponentType } from "react"
import type { ModuleId } from "@/lib/types"
import { MODULE_DEFINITIONS, type ModuleDefinition } from "./definitions"
import { DashboardPage } from "./pages/DashboardPage"
import { InventoryPage } from "./pages/InventoryPage"
import { RequestsPage } from "./pages/RequestsPage"
import { ApprovalsPage } from "./pages/ApprovalsPage"
import { AssignmentsPage } from "./pages/AssignmentsPage"
import { MyMaterialsPage } from "./pages/MyMaterialsPage"
import { ConsumptionPage } from "./pages/ConsumptionPage"
import { ReturnsPage } from "./pages/ReturnsPage"
import { RepairsPage } from "./pages/RepairsPage"
import { AnalyticsPage } from "./pages/AnalyticsPage"
import { ReportsPage } from "./pages/ReportsPage"
import { TeamPage } from "./pages/TeamPage"

/**
 * THE MODULE REGISTRY.
 * Each module = { id, name, description, icon, category, requires[], inputs[], outputs[],
 * defaultFields[], page + page component }. The renderer looks pages up here by moduleId,
 * so enabling a module in a site's config is all it takes for its menu item + page to appear.
 */
export const PAGE_COMPONENTS: Partial<Record<ModuleId, ComponentType>> = {
  shell: DashboardPage,
  users: TeamPage,
  inventory: InventoryPage,
  request: RequestsPage,
  approval: ApprovalsPage,
  assignment: AssignmentsPage,
  "assignment-frontend": MyMaterialsPage,
  consumption: ConsumptionPage,
  returns: ReturnsPage,
  "pcb-repair": RepairsPage,
  analytics: AnalyticsPage,
  reports: ReportsPage,
}

export interface RegisteredModule extends ModuleDefinition {
  component?: ComponentType
}

export const MODULE_REGISTRY: RegisteredModule[] = MODULE_DEFINITIONS.map((def) => ({
  ...def,
  component: PAGE_COMPONENTS[def.id],
}))

export function getModule(id: ModuleId): RegisteredModule {
  const m = MODULE_REGISTRY.find((x) => x.id === id)
  if (!m) throw new Error(`Module ${id} is not registered`)
  return m
}
