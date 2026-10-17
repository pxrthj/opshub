import { Fragment, useMemo, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { PackageCheck, Search, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import type { AssignmentView, MaterialRequest } from "@/lib/types"
import { errorMessage, useAsync } from "@/lib/useAsync"
import { formatDateTime } from "@/lib/utils"
import { ProgressLine } from "./shared"
import { requestSummary } from "@/lib/format"

export function AssignmentsPage() {
  const { config, siteApi, changeTick, notifyChange } = useSite()
  const { data, loading, reload } = useAsync(() => siteApi.get<AssignmentView[]>("assignments"), [changeTick])
  const { data: requests, reload: reloadReq } = useAsync(
    () => (config.modules.includes("request") ? siteApi.get<MaterialRequest[]>("requests") : Promise.resolve([])),
    [changeTick],
  )
  const [q, setQ] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const awaiting = (requests ?? []).filter((r) => r.status === "Approved" && r.type === "material")
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (data ?? []).filter((a) => !t || [a.code, a.assigneeName, a.requestCode, ...a.lines.map((l) => l.itemName)].join(" ").toLowerCase().includes(t))
  }, [data, q])

  async function assign(r: MaterialRequest) {
    setBusyId(r.id)
    try {
      const a = await siteApi.post<AssignmentView>(`requests/${r.id}/assign`)
      toast.success(`Items given to ${a.assigneeName}`, { description: "Stock went down at the same time." })
      setErrors((e) => ({ ...e, [r.id]: "" }))
      reload()
      reloadReq()
      notifyChange()
    } catch (e) {
      const msg = errorMessage(e)
      setErrors((x) => ({ ...x, [r.id]: msg }))
      toast.error(`We couldn't give out ${r.code}`, { description: msg })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <PageHeader title="Given out" icon={<PackageCheck />} description="Who was given what, and how much is left." />

      {awaiting.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Approved — awaiting assignment ({awaiting.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {awaiting.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
                <span className="text-xs font-semibold">{r.code}</span>
                <span className="min-w-0 flex-1 text-sm">
                  {requestSummary(r)} <span className="text-muted-foreground">· {r.requestedByName}</span>
                </span>
                {errors[r.id] && <span className="w-full text-xs text-red-600 sm:order-last">{errors[r.id]}</span>}
                <Button size="sm" onClick={() => assign(r)} disabled={busyId === r.id}>
                  {busyId === r.id ? <Spinner /> : <Send />} Assign now
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="bg-card pl-9" placeholder="Search by name or item" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{list.length} assignments</span>
      </div>

      {loading && !data ? (
        <TableSkeleton />
      ) : list.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nothing given out yet" description="Items show up here once a request is approved." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Number</TableHead>
                <TableHead>Given to</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Given</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Given back</TableHead>
                <TableHead className="text-right">Left</TableHead>
                <TableHead className="w-40">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((a) => (
                <Fragment key={a.id}>
                  {a.lines.map((l, i) => (
                    <TableRow key={a.id + l.itemId} className={i > 0 ? "border-t-0" : undefined}>
                      {i === 0 && (
                        <>
                          <TableCell rowSpan={a.lines.length} className="pl-4 align-top">
                            <div className="text-xs font-semibold">{a.code}</div>
                            <div className="text-xs text-muted-foreground">
                              {a.requestCode} · {formatDateTime(a.createdAt)}
                            </div>
                            <div className="text-xs text-muted-foreground">by {a.createdBy}</div>
                          </TableCell>
                          <TableCell rowSpan={a.lines.length} className="align-top font-medium">
                            {a.assigneeName}
                          </TableCell>
                        </>
                      )}
                      <TableCell>{l.itemName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.qty} <span className="text-xs text-muted-foreground">{l.unit}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.used}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.returned}</TableCell>
                      <TableCell className="text-right font-semibold text-primary tabular-nums">{l.remaining}</TableCell>
                      <TableCell>
                        <ProgressLine assigned={l.qty} used={l.used} returned={l.returned} />
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
