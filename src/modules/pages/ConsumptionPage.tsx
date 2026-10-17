import { useState } from "react"
import { Gauge, Info, Plus } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import { roleAtLeast } from "@/lib/roles"
import type { AssignmentView, ConsumptionRecord } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { formatDateTime } from "@/lib/utils"
import { AssignmentActionDialog, ProgressLine } from "./shared"

export function ConsumptionPage() {
  const { role, siteApi, changeTick, notifyChange } = useSite()
  const isAdmin = role === "Admin"
  const isManager = roleAtLeast(role, "Manager")
  const { data: records, loading, reload } = useAsync(() => siteApi.get<ConsumptionRecord[]>("consumption"), [changeTick])
  const { data: assignments, reload: reloadA } = useAsync(() => siteApi.get<AssignmentView[]>("assignments"), [changeTick])
  const [open, setOpen] = useState(false)
  const code = (id: string) => assignments?.find((a) => a.id === id)?.code ?? "—"
  const lines = (assignments ?? []).flatMap((a) => a.lines.map((l) => ({ a, l })))

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Material usage (Oversight)" : "What was used"}
        icon={<Gauge />}
        description={
          isAdmin
            ? "Site Admin oversight: Monitoring material consumption and field deployments in read-only mode."
            : "What has been used, where, and what is left."
        }
        actions={
          !isAdmin && (
            <Button onClick={() => setOpen(true)} disabled={!lines.some((x) => x.l.remaining > 0)}>
              <Plus /> Write down use
            </Button>
          )
        }
      />
      {isAdmin && (
        <Alert className="mb-4 border-primary/20 bg-primary/5">
          <Info className="text-primary" />
          <AlertDescription>
            <span className="font-semibold text-foreground">Site Admin Oversight:</span> Tracking equipment consumption across jobs and sites in read-only mode. Field staff record usage as work progresses.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">Usage log {isManager ? "" : "(mine)"}</CardTitle>
          </CardHeader>
          {loading && !records ? (
            <div className="p-4">
              <TableSkeleton rows={4} cols={4} />
            </div>
          ) : !records?.length ? (
            <div className="p-4">
              <EmptyState icon={Gauge} title="Nothing written down yet" description="Write down how much you used." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Given out as</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead>Where</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="pl-4 text-xs text-muted-foreground">{formatDateTime(r.date)}</TableCell>
                    <TableCell className="text-xs">{code(r.assignmentId)}</TableCell>
                    <TableCell>{r.itemName}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{r.qty}</TableCell>
                    <TableCell className="text-muted-foreground">{r.location}</TableCell>
                    <TableCell className="text-muted-foreground">{r.recordedBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-3">
            <CardTitle className="text-base">What is left</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 py-4">
            {lines.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing has been given out.</p>}
            {lines.map(({ a, l }) => (
              <div key={a.id + l.itemId}>
                <div className="mb-1 flex justify-between gap-2 text-sm">
                  <span>
                    <span className="text-xs text-muted-foreground">{a.code}</span> {l.itemName}
                    {isManager && <span className="text-xs text-muted-foreground"> · {a.assigneeName}</span>}
                  </span>
                  <span className="text-xs whitespace-nowrap tabular-nums">
                    {l.used}/{l.qty} used · <b className="text-primary">{l.remaining} left</b>
                  </span>
                </div>
                <ProgressLine assigned={l.qty} used={l.used} returned={l.returned} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <AssignmentActionDialog
        mode="usage"
        open={open}
        onOpenChange={setOpen}
        assignments={assignments ?? []}
        onDone={() => {
          reload()
          reloadA()
          notifyChange()
        }}
      />
    </div>
  )
}
