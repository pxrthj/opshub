import { useState } from "react"
import { Link } from "react-router-dom"
import { ClipboardList, Gauge, HardHat, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription } from "@/components/ui/card"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { CardsSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import type { AssignmentView } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { formatDate } from "@/lib/utils"
import { AssignmentActionDialog, ProgressLine } from "./shared"

/** Assignment Frontend: the field-team view of material issued to the signed-in user. */
export function MyMaterialsPage() {
  const { config, siteApi, changeTick, notifyChange, basePath } = useSite()
  const { data, loading, reload } = useAsync(() => siteApi.get<AssignmentView[]>("assignments", { scope: "mine" }), [changeTick])
  const [dialog, setDialog] = useState<{ mode: "usage" | "return"; assignmentId: string; itemId?: string } | null>(null)
  const hasUsage = config.modules.includes("consumption")
  const hasReturns = config.modules.includes("returns")

  const totals = (data ?? []).flatMap((a) => a.lines).reduce(
    (acc, l) => ({ assigned: acc.assigned + l.qty, used: acc.used + l.used, remaining: acc.remaining + l.remaining }),
    { assigned: 0, used: 0, remaining: 0 },
  )

  return (
    <div>
      <PageHeader
        title="My items"
        icon={<HardHat />}
        description="What you were given, and how much is left."
        actions={
          config.modules.includes("request") && (
            <Button variant="outline" asChild>
              <Link to={`${basePath}/requests`}>
                <ClipboardList /> Request more
              </Link>
            </Button>
          )
        }
      />
      {data && data.length > 0 && (
        <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-lg">
          {[
            ["Issued", totals.assigned],
            ["Used", totals.used],
            ["With me", totals.remaining],
          ].map(([k, v]) => (
            <Card key={k} size="sm" className="gap-1 px-3">
              <CardDescription className="text-xs">{k}</CardDescription>
              <p className="text-xl font-semibold tabular-nums">{Number(v).toLocaleString("en-IN")}</p>
            </Card>
          ))}
        </div>
      )}
      {loading && !data ? (
        <CardsSkeleton count={3} />
      ) : !data?.length ? (
        <EmptyState icon={HardHat} title="Nothing yet" description="Your items show up here once a manager approves your request." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((a) => (
            <Card key={a.id} className="gap-3 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{a.code}</p>
                  <p className="text-xs text-muted-foreground">
                    For {a.requestCode} · issued {formatDate(a.createdAt)} by {a.createdBy}
                  </p>
                </div>
                {a.lines.every((l) => l.remaining === 0) ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Closed</span>
                ) : (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Open</span>
                )}
              </div>
              <div className="space-y-3">
                {a.lines.map((l) => (
                  <div key={l.itemId}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{l.itemName}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        used {l.used} · returned {l.returned} · <b className="text-primary">{l.remaining} left</b> of {l.qty} {l.unit}
                      </span>
                    </div>
                    <ProgressLine assigned={l.qty} used={l.used} returned={l.returned} />
                    {l.remaining > 0 && (hasUsage || hasReturns) && (
                      <div className="mt-1.5 flex gap-1.5">
                        {hasUsage && (
                          <Button size="xs" variant="outline" onClick={() => setDialog({ mode: "usage", assignmentId: a.id, itemId: l.itemId })}>
                            <Gauge /> Write down use
                          </Button>
                        )}
                        {hasReturns && (
                          <Button size="xs" variant="outline" onClick={() => setDialog({ mode: "return", assignmentId: a.id, itemId: l.itemId })}>
                            <Undo2 /> Give back
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
      <AssignmentActionDialog
        mode={dialog?.mode ?? "usage"}
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        assignments={data ?? []}
        initial={dialog ?? undefined}
        onDone={() => {
          reload()
          notifyChange()
        }}
      />
    </div>
  )
}
