import type {
  Assignment,
  ConsumptionRecord,
  InventoryItem,
  MaterialRequest,
  ProductAuditRecord,
  RepairJob,
  ReturnRecord,
  ServiceCase,
} from "@/lib/types"

// Database rows (snake_case, as returned by Supabase) <-> the shapes the pages already use (camelCase).

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : undefined)
const keep = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T

export function mapInventory(r: Row): InventoryItem {
  return {
    ...(r.custom ?? {}),
    id: r.id,
    name: r.name,
    category: r.category,
    unit: r.unit,
    qty: Number(r.qty),
    unitPrice: Number(r.unit_price),
    reorderLevel: Number(r.reorder_level),
    updatedAt: iso(r.updated_at)!,
  }
}

export function mapRequest(r: Row, names: Record<string, string> = {}): MaterialRequest {
  return {
    ...(r.custom ?? {}),
    id: r.id,
    code: r.code,
    type: r.type,
    lines: r.lines ?? [],
    ...keep({ repair: r.repair }),
    purpose: r.purpose,
    priority: r.priority,
    requestedBy: r.requested_by,
    requestedByName: r.requested_by_name,
    createdAt: iso(r.created_at)!,
    status: r.status,
    ...keep({
      decisionComment: r.decision_comment,
      decidedBy: r.decided_by,
      decidedAt: iso(r.decided_at),
      assignmentId: r.assignment_id,
      repairJobId: r.repair_job_id,
      originSiteId: r.site_id,
      originSiteName: names[r.site_id],
      targetSiteId: r.target_site_id,
      targetSiteName: r.target_site_id ? names[r.target_site_id] : undefined,
      forwardedAt: iso(r.forwarded_at),
      forwardedBy: r.forwarded_by,
      forwardNote: r.forward_note,
      caseId: r.case_id,
    }),
  }
}

export function mapCase(r: Row, names: Record<string, string> = {}): ServiceCase {
  return {
    id: r.id,
    code: r.code,
    clientSiteId: r.client_site_id,
    clientName: r.client_name,
    hubSiteId: r.hub_site_id,
    title: r.title,
    description: r.description ?? "",
    items: r.items ?? [],
    location: r.location ?? "",
    priority: r.priority ?? "Normal",
    status: r.status,
    events: (r.events ?? []).map((e: Row) => ({ ...e, at: iso(e.at)! })),
    createdByName: r.created_by_name,
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    ...keep({
      fieldSiteId: r.field_site_id,
      fieldSiteName: r.field_site_id ? names[r.field_site_id] : undefined,
      fieldStatus: r.field_status,
      fieldAssigneeId: r.field_assignee_id,
      fieldAssigneeName: r.field_assignee_name,
      labSiteId: r.lab_site_id,
      labSiteName: r.lab_site_id ? names[r.lab_site_id] : undefined,
      labStatus: r.lab_status,
      labAssigneeId: r.lab_assignee_id,
      labAssigneeName: r.lab_assignee_name,
      createdBy: r.created_by,
      closedAt: iso(r.closed_at),
    }),
  }
}

export function mapAssignment(r: Row): Assignment {
  return {
    id: r.id,
    code: r.code,
    requestId: r.request_id,
    requestCode: r.request_code,
    assigneeId: r.assignee_id,
    assigneeName: r.assignee_name,
    lines: r.lines ?? [],
    stockSiteId: r.stock_site_id,
    createdAt: iso(r.created_at)!,
    createdBy: r.created_by,
  }
}

export function mapConsumption(r: Row): ConsumptionRecord {
  return {
    id: r.id,
    assignmentId: r.assignment_id,
    itemId: r.item_id,
    itemName: r.item_name,
    qty: Number(r.qty),
    location: r.location,
    date: iso(r.date)!,
    recordedBy: r.recorded_by,
  }
}

export function mapReturn(r: Row): ReturnRecord {
  return {
    id: r.id,
    source: r.source,
    refId: r.ref_id,
    refCode: r.ref_code,
    itemId: r.item_id,
    itemName: r.item_name,
    qty: Number(r.qty),
    condition: r.condition,
    stockSiteId: r.stock_site_id,
    date: iso(r.date)!,
    returnedBy: r.returned_by,
  }
}

export function mapRepair(r: Row): RepairJob {
  return {
    ...(r.custom ?? {}),
    id: r.id,
    code: r.code,
    meterId: r.meter_id,
    meterType: r.meter_type,
    fault: r.fault,
    technician: r.technician,
    partsUsed: r.parts_used,
    status: r.status,
    receivedAt: iso(r.received_at)!,
    updatedAt: iso(r.updated_at)!,
    ...keep({ requestId: r.request_id }),
    returned: !!r.returned,
  }
}

export function mapAudit(r: Row): ProductAuditRecord {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name,
    category: r.category,
    unit: r.unit,
    field: r.field,
    changeType: r.change_type,
    oldValue: r.old_value ?? null,
    newValue: r.new_value ?? null,
    ...keep({ diff: r.diff, refCode: r.ref_code }),
    reason: r.reason ?? "",
    actorId: r.actor_id ?? "",
    actorName: r.actor_name,
    actorRole: r.actor_role,
    timestamp: iso(r.at)!,
  }
}
