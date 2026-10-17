import { useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { CircuitBoard, Plus, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { StatusBadge } from "@/components/StatusBadge"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import type { AssignmentView, RepairJob, ReturnRecord } from "@/lib/types"
import { toastError, useAsync } from "@/lib/useAsync"
import { formatDateTime } from "@/lib/utils"
import { AssignmentActionDialog } from "./shared"

export function ReturnsPage() {
  const { config, siteApi, changeTick, notifyChange } = useSite()
  const hasAssign = config.modules.includes("assignment")
  const hasRepair = config.modules.includes("pcb-repair")
  const { data: returns, loading, reload } = useAsync(() => siteApi.get<ReturnRecord[]>("returns"), [changeTick])
  const { data: assignments } = useAsync(() => (hasAssign ? siteApi.get<AssignmentView[]>("assignments") : Promise.resolve([])), [changeTick])
  const { data: repairs } = useAsync(() => (hasRepair ? siteApi.get<RepairJob[]>("repairs") : Promise.resolve([])), [changeTick])
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const readyRepairs = (repairs ?? []).filter((r) => r.status === "Fixed" && !r.returned)

  async function returnRepair(job: RepairJob) {
    setBusyId(job.id)
    try {
      const res = await siteApi.post<{ stockSiteName: string }>("returns", { source: "repair", refId: job.id })
      toast.success(`${job.meterId} returned to stock`, { description: `${job.meterType} stock in ${res.stockSiteName} went up by 1.` })
      reload()
      notifyChange()
    } catch (e) {
      toastError(e, "We couldn't put it back. Please try again.")
    } finally {
      setBusyId(null)
    }
  }

  const done = () => {
    reload()
    notifyChange()
  }

  return (
    <div>
      <PageHeader
        title="Giving back"
        icon={<Undo2 />}
        description="Put unused or fixed items back into stock."
        actions={
          hasAssign && (
            <Button onClick={() => setOpen(true)}>
              <Plus /> Give back unused items
            </Button>
          )
        }
      />

      {hasRepair && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CircuitBoard className="size-4 text-primary" /> Repaired meters ready to return ({readyRepairs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {readyRepairs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fixed meters are waiting. Mark a repair as Fixed on the repairs page first.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {readyRepairs.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{r.meterId}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.code} · {r.meterType} · fixed by {r.technician || "—"}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => returnRepair(r)} disabled={busyId === r.id}>
                      {busyId === r.id ? <Spinner /> : <Undo2 />} Put back in stock
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {loading && !returns ? (
        <TableSkeleton />
      ) : !returns?.length ? (
        <EmptyState icon={Undo2} title="Nothing given back yet" description="Items you put back will show up here." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">How many</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead>Given back by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 text-xs text-muted-foreground">{formatDateTime(r.date)}</TableCell>
                  <TableCell>
                    <span className="text-xs">{r.refCode}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{r.source === "repair" ? "Repair job" : "Assignment"}</span>
                  </TableCell>
                  <TableCell>{r.itemName}</TableCell>
                  <TableCell className="text-right font-medium text-emerald-700 tabular-nums">+{r.qty}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.condition} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.returnedBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      {hasAssign && <AssignmentActionDialog mode="return" open={open} onOpenChange={setOpen} assignments={assignments ?? []} onDone={done} />}
    </div>
  )
}
