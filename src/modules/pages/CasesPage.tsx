import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Briefcase,
  CheckCircle2,
  ClipboardList,
  Download,
  Eye,
  Hammer,
  Inbox,
  MapPin,
  MessageSquare,
  Package,
  Plus,
  RotateCcw,
  Route,
  Search,
  Stethoscope,
  Trash2,
  UserCheck,
  X,
  type LucideIcon,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useSite } from "@/context/SiteContext"
import { exportWorkbook } from "@/lib/excel"
import { requestSummary } from "@/lib/format"
import { roleAtLeast } from "@/lib/roles"
import type { CaseEvent, ExportDataset, InventoryItem, MaterialRequest, ServiceCase } from "@/lib/types"
import { errorMessage, toastError, useAsync } from "@/lib/useAsync"
import { formatDateTime } from "@/lib/utils"

// One screen, three seats at the table:
//   client — raises a repair case and follows it;
//   hub    — routes each case onsite (Distribution) and/or in-house (Service Centre), then closes it;
//   work   — the onsite or in-house team: assign a technician, log visits / diagnosis, ask for parts, report it done.

type Mode = "client" | "hub" | "work"
type Track = "field" | "lab"
interface Office {
  id: string
  name: string
  ownStock: boolean
}
interface CasesData {
  cases: ServiceCase[]
  requests: MaterialRequest[]
  offices: Office[]
}
interface Person {
  id: string
  name: string
  title: string
  role: string
}

export function ClientCasesPage() {
  return <CasesBoard mode="client" />
}
export function CaseDeskPage() {
  return <CasesBoard mode="hub" />
}
export function CaseWorkPage() {
  return <CasesBoard mode="work" />
}

const STEP: Record<string, { label: string; icon: LucideIcon }> = {
  submitted: { label: "Case raised", icon: Briefcase },
  routed: { label: "Routed", icon: Route },
  rejected: { label: "Turned down", icon: X },
  assigned: { label: "Technician assigned", icon: UserCheck },
  visit: { label: "Site visit", icon: MapPin },
  diagnosis: { label: "Diagnosis", icon: Stethoscope },
  note: { label: "Note", icon: MessageSquare },
  "parts-requested": { label: "Parts asked for", icon: Package },
  "parts-forwarded": { label: "Parts request sent on", icon: Package },
  "parts-approved": { label: "Parts approved", icon: Package },
  "parts-issued": { label: "Parts issued", icon: Package },
  "parts-rejected": { label: "Parts turned down", icon: Package },
  "work-done": { label: "Work done", icon: CheckCircle2 },
  closed: { label: "Closed", icon: CheckCircle2 },
  reopened: { label: "Sent back for more work", icon: RotateCcw },
}
const stepLabel = (kind: string) => STEP[kind]?.label ?? kind

const isOpen = (c: ServiceCase) => c.status !== "Closed" && c.status !== "Rejected"

/** A team's part of a case, in everyday words (the badge colours follow the case statuses). */
function TrackBadge({ status, className }: { status?: string; className?: string }) {
  const s = status ?? "Open"
  return s === "Done" ? (
    <StatusBadge status="Done" label="Done" className={className} />
  ) : s === "Assigned" ? (
    <StatusBadge status="In Progress" label="Working on it" className={className} />
  ) : (
    <StatusBadge status="Open" label="Not assigned" className={className} />
  )
}
const itemsText = (c: ServiceCase) => c.items.map((i) => `${i.qty} × ${i.name}`).join(", ")

function trackOf(c: ServiceCase, siteId: string): Track | null {
  if (c.fieldSiteId === siteId) return "field"
  if (c.labSiteId === siteId) return "lab"
  return null
}
function trackInfo(c: ServiceCase, t: Track) {
  return t === "field"
    ? { office: c.fieldSiteName, status: c.fieldStatus, assigneeId: c.fieldAssigneeId, assignee: c.fieldAssigneeName, label: "Onsite" }
    : { office: c.labSiteName, status: c.labStatus, assigneeId: c.labAssigneeId, assignee: c.labAssigneeName, label: "In-house" }
}

function TrackChips({ c }: { c: ServiceCase }) {
  const tracks = (["field", "lab"] as const).filter((t) => (t === "field" ? c.fieldSiteId : c.labSiteId))
  if (!tracks.length) return <span className="text-xs text-muted-foreground">Not routed yet</span>
  return (
    <div className="flex flex-col gap-1">
      {tracks.map((t) => {
        const i = trackInfo(c, t)
        return (
          <span key={t} className="text-xs">
            <span className="font-medium">{i.label}:</span> {i.office}
            {i.assignee ? ` · ${i.assignee}` : ""} <TrackBadge status={i.status} className="ml-1 px-1.5 py-0 text-[10px]" />
          </span>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- Excel: every case, every step, every part

function caseWorkbook(cases: ServiceCase[], requests: MaterialRequest[]): ExportDataset[] {
  const count = (c: ServiceCase, kind: string) => c.events.filter((e) => e.kind === kind).length
  return [
    {
      id: "cases",
      label: "Cases",
      columns: [
        { key: "code", header: "Case", width: 12 },
        { key: "client", header: "Client", width: 22 },
        { key: "title", header: "What to repair", width: 36 },
        { key: "items", header: "Components / units", width: 40 },
        { key: "location", header: "Location", width: 26 },
        { key: "priority", header: "Priority", width: 10 },
        { key: "status", header: "Status", width: 12 },
        { key: "fieldOffice", header: "Onsite office", width: 16 },
        { key: "fieldTech", header: "Onsite technician", width: 18 },
        { key: "fieldStatus", header: "Onsite status", width: 12 },
        { key: "labOffice", header: "In-house office", width: 16 },
        { key: "labTech", header: "In-house technician", width: 18 },
        { key: "labStatus", header: "In-house status", width: 12 },
        { key: "visits", header: "Site visits", width: 10 },
        { key: "parts", header: "Parts requests", width: 12 },
        { key: "raisedBy", header: "Raised by", width: 18 },
        { key: "raisedOn", header: "Raised on", width: 18 },
        { key: "updated", header: "Last update", width: 18 },
        { key: "closedOn", header: "Closed on", width: 18 },
      ],
      rows: cases.map((c) => ({
        code: c.code,
        client: c.clientName,
        title: c.title,
        items: itemsText(c),
        location: c.location,
        priority: c.priority,
        status: c.status,
        fieldOffice: c.fieldSiteName ?? "",
        fieldTech: c.fieldAssigneeName ?? "",
        fieldStatus: c.fieldStatus ?? "",
        labOffice: c.labSiteName ?? "",
        labTech: c.labAssigneeName ?? "",
        labStatus: c.labStatus ?? "",
        visits: count(c, "visit"),
        parts: count(c, "parts-requested"),
        raisedBy: c.createdByName,
        raisedOn: formatDateTime(c.createdAt),
        updated: formatDateTime(c.updatedAt),
        closedOn: c.closedAt ? formatDateTime(c.closedAt) : "",
      })),
    },
    {
      id: "history",
      label: "Case history",
      columns: [
        { key: "code", header: "Case", width: 12 },
        { key: "at", header: "When", width: 18 },
        { key: "office", header: "Office", width: 20 },
        { key: "actor", header: "By", width: 18 },
        { key: "step", header: "Step", width: 22 },
        { key: "note", header: "Details", width: 60 },
      ],
      rows: cases.flatMap((c) =>
        c.events.map((e) => ({ code: c.code, at: formatDateTime(e.at), office: e.siteName, actor: e.actor, step: stepLabel(e.kind), note: e.note })),
      ),
    },
    {
      id: "parts",
      label: "Parts for cases",
      columns: [
        { key: "case", header: "Case", width: 12 },
        { key: "code", header: "Request", width: 14 },
        { key: "office", header: "Asked by office", width: 18 },
        { key: "by", header: "Asked by", width: 18 },
        { key: "items", header: "Parts", width: 44 },
        { key: "supplier", header: "Supplied from", width: 18 },
        { key: "status", header: "Status", width: 12 },
        { key: "asked", header: "Asked on", width: 18 },
        { key: "decidedBy", header: "Decided by", width: 18 },
        { key: "decided", header: "Decided on", width: 18 },
      ],
      rows: requests.map((r) => ({
        case: cases.find((c) => c.id === r.caseId)?.code ?? "",
        code: r.code,
        office: r.originSiteName ?? "",
        by: r.requestedByName,
        items: requestSummary(r),
        supplier: r.targetSiteName ?? r.originSiteName ?? "",
        status: r.status,
        asked: formatDateTime(r.createdAt),
        decidedBy: r.decidedBy ?? "",
        decided: r.decidedAt ? formatDateTime(r.decidedAt) : "",
      })),
    },
  ]
}

// ---------------------------------------------------------------- the board

function CasesBoard({ mode }: { mode: Mode }) {
  const { config, role, siteApi, changeTick, notifyChange } = useSite()
  const { user } = useAuth()
  const isAdmin = role === "Admin"
  const isManager = roleAtLeast(role, "Manager") && !isAdmin
  const { data, loading, reload } = useAsync(() => siteApi.get<CasesData>("cases"), [changeTick])
  const [tab, setTab] = useState<"open" | "done">("open")
  const [q, setQ] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)

  const cases = useMemo(() => data?.cases ?? [], [data])
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return cases
      .filter((c) => (tab === "open" ? isOpen(c) : !isOpen(c)))
      .filter((c) => !t || [c.code, c.title, c.clientName, itemsText(c), c.location].join(" ").toLowerCase().includes(t))
  }, [cases, tab, q])
  const selected = cases.find((c) => c.id === selectedId) ?? null
  // What this office has to pick up: new and finished cases at the hub, unassigned ones at a team.
  const waitingOnMe = cases.filter((c) => {
    if (mode === "hub") return c.status === "Submitted" || c.status === "Repaired"
    const t = mode === "work" ? trackOf(c, config.siteId) : null
    return !!t && isOpen(c) && trackInfo(c, t).status === "Open"
  }).length

  async function download() {
    setExporting(true)
    try {
      const sets = caseWorkbook(cases, data?.requests ?? [])
      await exportWorkbook(sets, {
        filename: `${config.slug}-repair-cases-${new Date().toISOString().slice(0, 10)}.xlsx`,
        siteName: config.name,
        author: user?.name ?? "Plexus",
        color: "#171717",
      })
      toast.success("Excel file downloaded", { description: sets.map((s) => `${s.label} (${s.rows.length})`).join(", ") })
    } catch (e) {
      toastError(e, "We couldn't make the Excel file.")
    } finally {
      setExporting(false)
    }
  }

  const title = mode === "client" ? "Repair cases" : mode === "hub" ? "Case desk" : "Cases"
  const description =
    mode === "client"
      ? "Ask for components or units to be repaired, and follow each case until it is closed."
      : mode === "hub"
        ? "Every client case comes here first. Send it onsite, in-house or both, and close it when the work is reported done."
        : "Cases the Central Hub sent to this office. Assign a technician, log the work, ask for parts, and report it done."

  return (
    <div>
      <PageHeader
        title={title}
        icon={mode === "client" ? <Briefcase /> : mode === "hub" ? <Inbox /> : <Hammer />}
        description={description}
        actions={
          <>
            <Button variant="outline" onClick={download} disabled={exporting || !cases.length}>
              {exporting ? <Spinner /> : <Download />} Excel
            </Button>
            {mode === "client" && !isAdmin && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> New repair case
              </Button>
            )}
          </>
        }
      />
      {isAdmin && (
        <Alert className="mb-4 border-primary/20 bg-primary/5">
          <Eye className="text-primary" />
          <AlertDescription>Admins can follow every case here. Managers and their teams do the work.</AlertDescription>
        </Alert>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="open">Open ({cases.filter(isOpen).length})</TabsTrigger>
            <TabsTrigger value="done">Closed ({cases.filter((c) => !isOpen(c)).length})</TabsTrigger>
          </TabsList>
        </Tabs>
        {waitingOnMe > 0 && !isAdmin && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            {waitingOnMe} {waitingOnMe === 1 ? "needs" : "need"} you
          </span>
        )}
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="bg-card pl-9" placeholder="Search cases" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {loading && !data ? (
        <TableSkeleton />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={tab === "open" ? "No open cases" : "No closed cases yet"}
          description={mode === "client" && tab === "open" ? "Raise a repair case to get started." : undefined}
        />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Case</TableHead>
                {mode !== "client" && <TableHead className="hidden md:table-cell">Client</TableHead>}
                <TableHead>What to repair</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Teams</TableHead>
                <TableHead className="hidden sm:table-cell">Last update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelectedId(c.id)}>
                  <TableCell className="pl-4 text-xs font-semibold">{c.code}</TableCell>
                  {mode !== "client" && <TableCell className="hidden md:table-cell">{c.clientName}</TableCell>}
                  <TableCell className="max-w-sm min-w-40 whitespace-normal">
                    <span className="font-medium">{c.title}</span>
                    <span className="block text-xs text-muted-foreground">{itemsText(c)}</span>
                    {mode !== "client" && <span className="block text-xs text-muted-foreground md:hidden">{c.clientName}</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <StatusBadge status={c.status} />
                      {c.priority === "Urgent" && <StatusBadge status="Urgent" />}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <TrackChips c={c} />
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{formatDateTime(c.updatedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
          {selected && (
            <CaseDetail
              key={selected.id}
              c={selected}
              mode={mode}
              isManager={isManager}
              isAdmin={isAdmin}
              userId={user?.id}
              parts={(data?.requests ?? []).filter((r) => r.caseId === selected.id)}
              offices={data?.offices ?? []}
              onChanged={() => {
                reload()
                notifyChange()
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {creating && (
        <NewCaseDialog
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false)
            reload()
            notifyChange()
            setSelectedId(c.id)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- one case

type Dialogs =
  | { kind: "note"; action: "log" | "reject" | "close" | "reopen" | "complete"; logKind?: "visit" | "diagnosis" | "note" }
  | { kind: "route" }
  | { kind: "assign" }
  | { kind: "parts" }

const NOTE_DIALOG: Record<string, { title: string; label: string; confirm: string; required: boolean; placeholder: string }> = {
  "log:visit": { title: "Log a site visit", label: "What happened on site", confirm: "Save visit", required: true, placeholder: "For example: replaced 4 controller boards, 2 more units need parts" },
  "log:diagnosis": { title: "Write the diagnosis", label: "What is wrong and what is needed", confirm: "Save diagnosis", required: true, placeholder: "For example: MOSFET and gate driver failed on 12 boards" },
  "log:note": { title: "Add a note", label: "Note", confirm: "Add note", required: true, placeholder: "Anything others on this case should know" },
  reject: { title: "Turn this case down", label: "Reason", confirm: "Turn it down", required: true, placeholder: "For example: units are still under the maker's warranty" },
  close: { title: "Close this case", label: "Closing note (optional)", confirm: "Close case", required: false, placeholder: "For example: client confirmed all units working" },
  reopen: { title: "Send it back for more work", label: "What still needs doing", confirm: "Send back", required: true, placeholder: "For example: client reports 3 units still failing" },
  complete: { title: "Report the work done", label: "What was done", confirm: "Report done", required: true, placeholder: "For example: 38 of 40 boards repaired and tested, 2 scrapped" },
}

function CaseDetail({
  c,
  mode,
  isManager,
  isAdmin,
  userId,
  parts,
  offices,
  onChanged,
}: {
  c: ServiceCase
  mode: Mode
  isManager: boolean
  isAdmin: boolean
  userId?: string
  parts: MaterialRequest[]
  offices: Office[]
  onChanged: () => void
}) {
  const { config, siteApi } = useSite()
  const [dialog, setDialog] = useState<Dialogs | null>(null)
  const open = isOpen(c)
  const track = mode === "work" ? trackOf(c, config.siteId) : null
  const mine = track ? trackInfo(c, track) : null
  const iAmAssignee = !!mine?.assigneeId && mine.assigneeId === userId
  const canWork = !!mine && open && mine.status === "Assigned" && (isManager || iAmAssignee)

  async function act(action: string, body: Record<string, unknown>, done: string) {
    try {
      await siteApi.post(`cases/${c.id}/${action}`, body)
      toast.success(done)
      setDialog(null)
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const buttons: React.ReactNode[] = []
  if (!isAdmin && open) {
    if (mode === "hub" && isManager && c.status === "Submitted") {
      buttons.push(
        <Button key="route" onClick={() => setDialog({ kind: "route" })}>
          <Route /> Route case
        </Button>,
        <Button key="reject" variant="outline" className="text-destructive" onClick={() => setDialog({ kind: "note", action: "reject" })}>
          <X /> Turn down
        </Button>,
      )
    }
    if (mode === "hub" && isManager && c.status === "Repaired") {
      buttons.push(
        <Button key="close" onClick={() => setDialog({ kind: "note", action: "close" })}>
          <CheckCircle2 /> Close case
        </Button>,
        <Button key="reopen" variant="outline" onClick={() => setDialog({ kind: "note", action: "reopen" })}>
          <RotateCcw /> Send back
        </Button>,
      )
    }
    if (mode === "work" && mine && isManager && mine.status !== "Done") {
      buttons.push(
        <Button key="assign" variant={mine.status === "Open" ? "default" : "outline"} onClick={() => setDialog({ kind: "assign" })}>
          <UserCheck /> {mine.assignee ? "Change technician" : "Assign technician"}
        </Button>,
      )
    }
    if (canWork) {
      if (track === "field")
        buttons.push(
          <Button key="visit" variant="outline" onClick={() => setDialog({ kind: "note", action: "log", logKind: "visit" })}>
            <MapPin /> Log visit
          </Button>,
        )
      buttons.push(
        <Button key="diag" variant="outline" onClick={() => setDialog({ kind: "note", action: "log", logKind: "diagnosis" })}>
          <Stethoscope /> Diagnosis
        </Button>,
        <Button key="parts" variant="outline" onClick={() => setDialog({ kind: "parts" })}>
          <Package /> Ask for parts
        </Button>,
        <Button key="done" onClick={() => setDialog({ kind: "note", action: "complete" })}>
          <CheckCircle2 /> Report work done
        </Button>,
      )
    }
    buttons.push(
      <Button key="note" variant="ghost" onClick={() => setDialog({ kind: "note", action: "log", logKind: "note" })}>
        <MessageSquare /> Add note
      </Button>,
    )
  }

  const noteKey = dialog?.kind === "note" ? (dialog.action === "log" ? `log:${dialog.logKind}` : dialog.action) : null
  const events = [...c.events].reverse()

  return (
    <div className="space-y-5 px-4 pb-6">
      <SheetHeader className="px-0">
        <SheetTitle className="flex flex-wrap items-center gap-2">
          {c.code} <StatusBadge status={c.status} />
          {c.priority === "Urgent" && <StatusBadge status="Urgent" />}
        </SheetTitle>
        <SheetDescription>{c.title}</SheetDescription>
      </SheetHeader>

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Client" value={c.clientName} />
        <Info label="Raised by" value={`${c.createdByName} · ${formatDateTime(c.createdAt)}`} />
        {c.location && <Info label="Location" value={c.location} />}
        {c.closedAt && <Info label={c.status === "Rejected" ? "Turned down" : "Closed"} value={formatDateTime(c.closedAt)} />}
        {c.description && <Info label="Details" value={c.description} wide />}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Components / units to repair</p>
        <ul className="space-y-1 rounded-lg border p-3 text-sm">
          {c.items.map((i, n) => (
            <li key={n} className="flex justify-between gap-3">
              <span>{i.name}</span>
              <span className="font-medium tabular-nums">{i.qty}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Teams</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["field", "lab"] as const).map((t) => {
            const i = trackInfo(c, t)
            return (
              <div key={t} className="rounded-lg border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{i.label} work</p>
                {i.office ? (
                  <>
                    <p className="font-medium">{i.office}</p>
                    <p className="text-xs">
                      {i.assignee ? `Technician: ${i.assignee}` : "No technician yet"} <TrackBadge status={i.status} className="ml-1" />
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">Not needed{c.status === "Submitted" ? " (yet)" : ""}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {buttons.length > 0 && <div className="flex flex-wrap gap-2">{buttons}</div>}
      {mode === "work" && mine && open && mine.status === "Assigned" && !canWork && (
        <p className="text-xs text-muted-foreground">Only {mine.assignee} or a manager can log work on this case.</p>
      )}

      {(mode !== "client" || parts.length > 0) && (
        <div>
          <p className="mb-1.5 text-sm font-medium">Parts for this case</p>
          {parts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No parts asked for yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-3">Request</TableHead>
                    <TableHead>Parts</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="pl-3 text-xs font-semibold">{r.code}</TableCell>
                      <TableCell className="max-w-56 text-xs whitespace-normal">{requestSummary(r)}</TableCell>
                      <TableCell className="text-xs">{r.targetSiteName ?? r.originSiteName}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <ClipboardList className="size-4" /> History
        </p>
        <ol className="space-y-3 border-l pl-4">
          {events.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ol>
      </div>

      {dialog?.kind === "note" && noteKey && (
        <NoteDialog
          {...NOTE_DIALOG[noteKey]}
          onClose={() => setDialog(null)}
          onSubmit={(note) =>
            dialog.action === "log"
              ? act("log", { kind: dialog.logKind, note }, `${stepLabel(dialog.logKind!)} saved`)
              : act(dialog.action, { note }, NOTE_DIALOG[noteKey].confirm.replace(/^./, (x) => x.toUpperCase()) + " — done")
          }
        />
      )}
      {dialog?.kind === "route" && (
        <RouteDialog
          c={c}
          offices={offices}
          onClose={() => setDialog(null)}
          onSubmit={(fieldSiteId, labSiteId, note) => act("route", { fieldSiteId, labSiteId, note }, `${c.code} was routed`)}
        />
      )}
      {dialog?.kind === "assign" && (
        <AssignDialog
          current={mine?.assigneeId}
          onClose={() => setDialog(null)}
          onSubmit={(userId) => act("assign", { userId }, "Technician assigned")}
        />
      )}
      {dialog?.kind === "parts" && (
        <PartsDialog
          c={c}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="whitespace-pre-line">{value}</p>
    </div>
  )
}

function EventRow({ e }: { e: CaseEvent }) {
  const Icon = STEP[e.kind]?.icon ?? MessageSquare
  return (
    <li className="relative">
      <span className="absolute top-0.5 -left-[25px] flex size-4 items-center justify-center rounded-full border bg-background">
        <Icon className="size-2.5" />
      </span>
      <p className="text-sm">
        <span className="font-medium">{stepLabel(e.kind)}</span>
        <span className="text-muted-foreground"> · {e.actor} ({e.siteName})</span>
      </p>
      {e.note && <p className="text-sm whitespace-pre-line text-muted-foreground">{e.note}</p>}
      <p className="text-xs text-muted-foreground">{formatDateTime(e.at)}</p>
    </li>
  )
}

// ---------------------------------------------------------------- dialogs

function NoteDialog({
  title,
  label,
  confirm,
  required,
  placeholder,
  onClose,
  onSubmit,
}: {
  title: string
  label: string
  confirm: string
  required: boolean
  placeholder: string
  onClose: () => void
  onSubmit: (note: string) => Promise<void>
}) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>
            {label} {required && <span className="text-destructive">*</span>}
          </Label>
          <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || (required && !note.trim())}
            onClick={async () => {
              setBusy(true)
              await onSubmit(note.trim())
              setBusy(false)
            }}
          >
            {busy && <Spinner />} {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const NONE = "__none__"

function RouteDialog({
  c,
  offices,
  onClose,
  onSubmit,
}: {
  c: ServiceCase
  offices: Office[]
  onClose: () => void
  onSubmit: (fieldSiteId: string | null, labSiteId: string | null, note: string) => Promise<void>
}) {
  // Onsite work goes to an office without its own store (Distribution); in-house work to one with a store (Service Centre).
  const [field, setField] = useState(offices.find((o) => !o.ownStock)?.id ?? NONE)
  const [lab, setLab] = useState(offices.find((o) => o.ownStock)?.id ?? NONE)
  const [useField, setUseField] = useState(true)
  const [useLab, setUseLab] = useState(true)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const fieldId = useField && field !== NONE ? field : null
  const labId = useLab && lab !== NONE ? lab : null
  const pick = (value: string, set: (v: string) => void) => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose an office" />
      </SelectTrigger>
      <SelectContent>
        {offices.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Route {c.code}</DialogTitle>
          <DialogDescription>Send it to the team that does onsite work, the team that repairs in-house, or both.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="cursor-pointer">
              <Checkbox checked={useField} onCheckedChange={(v) => setUseField(!!v)} /> Onsite work (visit the client)
            </Label>
            {useField && pick(field, setField)}
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <Label className="cursor-pointer">
              <Checkbox checked={useLab} onCheckedChange={(v) => setUseLab(!!v)} /> In-house repair (bring units to the lab)
            </Label>
            {useLab && pick(lab, setLab)}
          </div>
          <div className="space-y-1.5">
            <Label>Message for the teams (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: client line stopped, please visit tomorrow" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || (!fieldId && !labId)}
            onClick={async () => {
              setBusy(true)
              await onSubmit(fieldId, labId, note.trim())
              setBusy(false)
            }}
          >
            {busy && <Spinner />} <Route /> Route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignDialog({ current, onClose, onSubmit }: { current?: string; onClose: () => void; onSubmit: (userId: string) => Promise<void> }) {
  const { siteApi } = useSite()
  const { data: people, loading } = useAsync(() => siteApi.get<Person[]>("cases/people"), [])
  const [pick, setPick] = useState(current ?? "")
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a technician</DialogTitle>
          <DialogDescription>They will analyse the job, ask for parts and log the work.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <Spinner />
        ) : (
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {(people ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !pick}
            onClick={async () => {
              setBusy(true)
              await onSubmit(pick)
              setBusy(false)
            }}
          >
            {busy && <Spinner />} Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PartsDialog({ c, onClose, onDone }: { c: ServiceCase; onClose: () => void; onDone: () => void }) {
  const { siteApi, notifyChange } = useSite()
  const { data: inv, loading } = useAsync(() => siteApi.get<{ items: InventoryItem[]; sourceName: string }>("inventory"), [])
  const [lines, setLines] = useState<{ itemId: string; qty: string }[]>([{ itemId: "", qty: "" }])
  const [purpose, setPurpose] = useState(`Parts for ${c.code}`)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const items = inv?.items ?? []

  async function submit() {
    setError(null)
    const clean = lines.filter((l) => l.itemId)
    if (!clean.length) return setError("Choose at least one part.")
    if (clean.some((l) => !/^\d+$/.test(l.qty) || Number(l.qty) <= 0)) return setError("Quantities must be whole numbers above 0.")
    setBusy(true)
    try {
      const r = await siteApi.post<MaterialRequest>("requests", {
        type: "material",
        lines: clean.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })),
        purpose: purpose.trim() || `Parts for ${c.code}`,
        priority: c.priority === "Urgent" ? "Urgent" : "Normal",
        caseId: c.id,
      })
      toast.success(`${r.code} sent to your manager`, { description: `Linked to ${c.code}.` })
      notifyChange()
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask for parts for {c.code}</DialogTitle>
          <DialogDescription>
            The request goes to your manager first{inv ? `, from ${inv.sourceName}'s stock` : ""}. It shows up in this case's history.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <Spinner />
        ) : (
          <div className="space-y-3">
            {lines.map((l, i) => {
              const item = items.find((x) => x.id === l.itemId)
              return (
                <div key={i} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    {i === 0 && <Label>Part</Label>}
                    <Select value={l.itemId} onValueChange={(v) => setLines(lines.map((x, n) => (n === i ? { ...x, itemId: v } : x)))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Choose a part" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((it) => (
                          <SelectItem key={it.id} value={it.id}>
                            {it.name} ({it.qty} {it.unit} in stock)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    {i === 0 && <Label>Qty</Label>}
                    <Input
                      inputMode="numeric"
                      value={l.qty}
                      placeholder={item?.unit ?? ""}
                      onChange={(e) => setLines(lines.map((x, n) => (n === i ? { ...x, qty: e.target.value } : x)))}
                    />
                  </div>
                  <Button variant="ghost" size="icon" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, n) => n !== i))} aria-label="Remove line">
                    <Trash2 />
                  </Button>
                </div>
              )
            })}
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, { itemId: "", qty: "" }])}>
              <Plus /> Add part
            </Button>
            <div className="space-y-1.5">
              <Label>What is it for?</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || loading} onClick={submit}>
            {busy && <Spinner />} Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewCaseDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: ServiceCase) => void }) {
  const { siteApi } = useSite()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [priority, setPriority] = useState("Normal")
  const [items, setItems] = useState<{ name: string; qty: string }[]>([{ name: "", qty: "" }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    const clean = items.filter((i) => i.name.trim() || i.qty)
    if (!title.trim()) return setError("Say what needs repairing.")
    if (!clean.length) return setError("Add at least one component or unit.")
    if (clean.some((i) => !i.name.trim() || !/^\d+$/.test(i.qty) || Number(i.qty) <= 0)) return setError("Every line needs a name and a quantity above 0.")
    setBusy(true)
    try {
      const c = await siteApi.post<ServiceCase>("cases", {
        title,
        description,
        location,
        priority,
        items: clean.map((i) => ({ name: i.name.trim(), qty: Number(i.qty) })),
      })
      toast.success(`${c.code} was raised`, { description: "The Central Hub will route it to the right team." })
      onCreated(c)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New repair case</DialogTitle>
          <DialogDescription>Tell us what needs repairing. The Central Hub sends it to the onsite team, the repair lab, or both.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <Label>What needs repairing? *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example: ECU boards failing on the assembly line" />
          </div>
          <div className="space-y-2">
            <Label>Components / units *</Label>
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="flex-1"
                  value={it.name}
                  placeholder="Component or unit"
                  onChange={(e) => setItems(items.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))}
                />
                <Input
                  className="w-24"
                  inputMode="numeric"
                  value={it.qty}
                  placeholder="Qty"
                  onChange={(e) => setItems(items.map((x, n) => (n === i ? { ...x, qty: e.target.value } : x)))}
                />
                <Button variant="ghost" size="icon" disabled={items.length === 1} onClick={() => setItems(items.filter((_, n) => n !== i))} aria-label="Remove line">
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setItems([...items, { name: "", qty: "" }])}>
              <Plus /> Add line
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Details</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Symptoms, model numbers, anything that helps" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Where are the units?</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Plant / address for onsite work" />
            </div>
            <div className="space-y-1.5">
              <Label>How urgent?</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Low", "Normal", "Urgent"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy && <Spinner />} Raise case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
