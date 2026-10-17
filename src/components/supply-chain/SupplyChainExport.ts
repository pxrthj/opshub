import type { SupplyChainData } from "@/lib/types"
import { formatDateTime } from "@/lib/utils"

async function loadExcel() {
  const mod = await import("exceljs")
  return mod.default
}

function download(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function argb(hex: string) {
  return "FF" + hex.replace("#", "").toUpperCase()
}

export async function exportSupplyChainExcel(
  data: SupplyChainData,
  opts: { author: string }
) {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = `OpsHub Central Supply Chain — ${opts.author}`
  wb.created = new Date()

  const headerColor = "#0f172a"

  // ── Sheet 1: Executive Overview & Site Comparison ──
  const ws1 = wb.addWorksheet("Site Comparison", { views: [{ state: "frozen", ySplit: 1 }] })
  ws1.columns = [
    { header: "Office / Site", key: "name", width: 26 },
    { header: "Tier", key: "tier", width: 12 },
    { header: "Supplying Office", key: "supplier", width: 26 },
    { header: "Total Requests", key: "totalRequests", width: 16 },
    { header: "Pending", key: "pending", width: 12 },
    { header: "Fulfilment Rate (%)", key: "fulfilment", width: 20 },
    { header: "Avg Turnaround (hrs)", key: "turnaround", width: 22 },
    { header: "Low Stock Items", key: "lowStock", width: 16 },
    { header: "Total Items", key: "totalItems", width: 14 },
    { header: "Units Dispatched", key: "dispatched", width: 18 },
    { header: "Units Received", key: "received", width: 16 },
    { header: "Units Consumed", key: "consumed", width: 16 },
  ]
  for (const m of data.siteMetrics) {
    ws1.addRow({
      name: m.siteName,
      tier: `Tier ${m.tier}`,
      supplier: m.stockSourceName ?? "Top of Chain (Master)",
      totalRequests: m.totalRequests,
      pending: m.pendingRequests,
      fulfilment: `${m.fulfilmentRate}%`,
      turnaround: m.avgTurnaroundHours,
      lowStock: m.lowStockCount,
      totalItems: m.totalInventoryItems,
      dispatched: m.unitsDispatched,
      received: m.unitsReceived,
      consumed: m.unitsConsumed,
    })
  }

  // ── Sheet 2: Network Corridors & Volumes ──
  const ws2 = wb.addWorksheet("Network Corridors", { views: [{ state: "frozen", ySplit: 1 }] })
  ws2.columns = [
    { header: "Source Office (Supplier)", key: "source", width: 28 },
    { header: "Destination Office (Consumer)", key: "target", width: 28 },
    { header: "Requests Count", key: "requests", width: 18 },
    { header: "Volume (Units)", key: "volume", width: 18 },
    { header: "Pending Requests", key: "pending", width: 18 },
  ]
  for (const e of data.edges) {
    ws2.addRow({
      source: e.sourceSiteName,
      target: e.targetSiteName,
      requests: e.requestsCount,
      volume: e.volumeUnits,
      pending: e.pendingCount,
    })
  }

  // ── Sheet 3: Complete Request Pipeline & Trails ──
  const ws3 = wb.addWorksheet("Request Trails", { views: [{ state: "frozen", ySplit: 1 }] })
  ws3.columns = [
    { header: "Request Code", key: "code", width: 16 },
    { header: "Type", key: "type", width: 12 },
    { header: "Office", key: "site", width: 24 },
    { header: "Supplying Office", key: "sourceSite", width: 24 },
    { header: "Supply Flow", key: "flow", width: 18 },
    { header: "Asked By", key: "requester", width: 20 },
    { header: "Requested Date", key: "requestedAt", width: 22 },
    { header: "Current Stage", key: "stage", width: 24 },
    { header: "Status", key: "status", width: 14 },
    { header: "Items Requested", key: "items", width: 44 },
    { header: "Units Requested", key: "qtyReq", width: 16 },
    { header: "Forwarded At", key: "forwardedAt", width: 22 },
    { header: "Forwarded By", key: "forwardedBy", width: 20 },
    { header: "Decided By", key: "decidedBy", width: 20 },
    { header: "Decided At", key: "decidedAt", width: 22 },
    { header: "Dispatched To", key: "assignee", width: 20 },
    { header: "Dispatched Date", key: "dispatchedAt", width: 22 },
    { header: "Units Consumed", key: "consumed", width: 16 },
    { header: "Units Returned", key: "returned", width: 16 },
  ]
  for (const t of data.trails) {
    const itemsStr =
      t.type === "material"
        ? t.items.map((i) => `${i.qty} ${i.unit} ${i.itemName}`).join("; ")
        : `${t.repair?.meterId ?? "Repair"} (${t.repair?.fault ?? ""})`
    ws3.addRow({
      code: t.code,
      type: t.type,
      site: t.siteName,
      sourceSite: t.sourceSiteName,
      flow: t.supplyChainFlow,
      requester: t.requestedByName,
      requestedAt: formatDateTime(t.requestedAt),
      stage: t.stage,
      status: t.status,
      items: itemsStr,
      qtyReq: t.totalQtyRequested,
      forwardedAt: t.forwardedAt ? formatDateTime(t.forwardedAt) : "—",
      forwardedBy: t.forwardedBy ?? "—",
      decidedBy: t.decidedBy ?? "—",
      decidedAt: t.decidedAt ? formatDateTime(t.decidedAt) : "—",
      assignee: t.assignment?.assigneeName ?? "—",
      dispatchedAt: t.assignment ? formatDateTime(t.assignment.dispatchedAt) : "—",
      consumed: t.totalConsumed,
      returned: t.totalReturned,
    })
  }

  // ── Sheet 4: Bottlenecks & Delays ──
  const ws4 = wb.addWorksheet("Bottlenecks & Delays", { views: [{ state: "frozen", ySplit: 1 }] })
  ws4.columns = [
    { header: "Office", key: "site", width: 26 },
    { header: "Stage", key: "stage", width: 24 },
    { header: "Avg Wait (Hours)", key: "avgWait", width: 18 },
    { header: "Stuck Requests (>3d)", key: "stuck", width: 20 },
    { header: "Oldest Open Request", key: "oldestCode", width: 20 },
    { header: "Oldest Wait Days", key: "oldestDays", width: 18 },
    { header: "Oldest Asked By", key: "oldestRequester", width: 22 },
  ]
  for (const b of data.bottlenecks) {
    ws4.addRow({
      site: b.siteName,
      stage: b.stage,
      avgWait: b.avgWaitHours,
      stuck: b.stuckRequestsCount,
      oldestCode: b.oldestOpenRequest?.code ?? "None",
      oldestDays: b.oldestOpenRequest ? `${b.oldestOpenRequest.waitDays} days` : "—",
      oldestRequester: b.oldestOpenRequest?.requestedByName ?? "—",
    })
  }

  // Apply styling across all worksheets
  for (const ws of [ws1, ws2, ws3, ws4]) {
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(headerColor) } }
    headerRow.height = 24
    headerRow.alignment = { vertical: "middle" }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }
  }

  const buf = await wb.xlsx.writeBuffer()
  download(buf as ArrayBuffer, `Supply_Chain_Tracker_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
