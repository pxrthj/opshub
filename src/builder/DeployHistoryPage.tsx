import { useEffect, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import { ArrowLeft, ExternalLink, GitCommitVertical, History, Loader2, Rocket, RotateCcw, Workflow } from "lucide-react"
import { api, ApiError } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AccessDenied } from "@/components/AccessDenied"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { PageHeader } from "@/components/PageHeader"
import { ThemeScope } from "@/components/ThemeScope"
import { useHub } from "@/context/HubContext"
import { diffConfigs, summarizeDiff } from "@/lib/siteConfig"
import type { BuilderState, SiteVersion } from "@/lib/types"
import { errorMessage, toastError } from "@/lib/useAsync"
import { formatDateTime } from "@/lib/utils"
import { getModuleDef } from "@/modules/definitions"
import { NotFound } from "@/pages/NotFound"

export function DeployHistoryPage() {
  const { siteId = "" } = useParams()
  const { refreshSites, dataVersion } = useHub()
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; data: BuilderState } | { status: "error"; code: number; message: string }>({
    status: "loading",
  })
  const [target, setTarget] = useState<SiteVersion | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.raw.get<{ siteId: string }>(`/api/hub/resolve/${encodeURIComponent(siteId)}`)
        const data = await api.get<BuilderState>(r.siteId, "builder")
        if (!cancelled) setState({ status: "ok", data })
      } catch (e) {
        if (!cancelled) setState({ status: "error", code: e instanceof ApiError ? e.status : 500, message: errorMessage(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [siteId, dataVersion])

  if (state.status === "loading")
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 size-5 animate-spin" /> Loading history…
      </div>
    )
  if (state.status === "error")
    return state.code === 403 ? <AccessDenied message={`${state.message}. Deploy history is only available to Admins.`} /> : <NotFound message={state.message} />

  const data = state.data
  const live = data.live

  async function rollback() {
    try {
      const next = await api.post<BuilderState>(live.siteId, `builder/rollback/${target!.version}`)
      setState({ status: "ok", data: next })
      await refreshSites()
      toast.success(`v${target!.version} is live again`, {
        description: `${live.name} now runs the v${target!.version} config.`,
      })
    } catch (e) {
      toastError(e, "Rollback failed")
      throw e
    }
  }

  return (
    <ThemeScope theme={live.theme}>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
          <Link to={`/builder/${live.siteId}`}>
            <ArrowLeft /> Back to builder
          </Link>
        </Button>
        <PageHeader
          title={`Version history · ${live.name}`}
          icon={<History />}
          description={<>Each publish is saved as a version. Live now: <b>v{data.liveVersion}</b>.</>}
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to={`/s/${live.slug}`}>
                  <ExternalLink /> Open live site
                </Link>
              </Button>
              <Button asChild>
                <Link to={`/builder/${live.siteId}`}>
                  <Workflow /> Builder
                </Link>
              </Button>
            </>
          }
        />
        {data.draft && (
          <div className="mb-4 rounded-[var(--radius)] border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
            An unpublished draft exists (saved {data.draftSavedAt && formatDateTime(data.draftSavedAt)} by {data.draftSavedBy}).{" "}
            <Link to={`/preview/${live.slug}`} className="font-medium underline">
              Preview it
            </Link>
            . Rolling back discards it.
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="pl-4">Version</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Change summary</TableHead>
                  <TableHead>Modules</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.versions.map((v) => {
                  const isLive = v.version === data.liveVersion
                  return (
                    <TableRow key={v.version} className={isLive ? "bg-primary/5" : undefined}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold">v{v.version}</span>
                          {isLive && <Badge className="bg-emerald-600 text-white">Live</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(v.publishedAt)}</TableCell>
                      <TableCell className="text-sm">{v.author}</TableCell>
                      <TableCell className="max-w-xs text-sm whitespace-normal">{v.summary}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="flex flex-wrap gap-1">
                          {v.config.modules
                            .filter((m) => !getModuleDef(m).core)
                            .map((m) => (
                              <span key={m} className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium">
                                {getModuleDef(m).short}
                              </span>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell className="pr-3 text-right">
                        {!isLive && (
                          <Button size="sm" variant="outline" onClick={() => setTarget(v)}>
                            <RotateCcw /> Rollback
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l pl-5">
                {data.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute top-0.5 -left-[29px] flex size-5 items-center justify-center rounded-full bg-card ring-1 ring-border">
                      {e.action === "publish" ? <Rocket className="size-3 text-primary" /> : <RotateCcw className="size-3 text-amber-600" />}
                    </span>
                    <p className="text-sm font-medium">
                      {e.action === "publish" ? `Published v${e.version}` : `Rolled back to v${e.version}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.author} · {formatDateTime(e.at)}
                    </p>
                    <p className="mt-0.5 text-xs">{e.note}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-4 flex items-center gap-1 text-[11px] text-muted-foreground">
                <GitCommitVertical className="size-3" /> Versions are immutable snapshots of the full site config.
              </p>
            </CardContent>
          </Card>
        </div>
        <ConfirmDialog
          open={!!target}
          onOpenChange={(o) => !o && setTarget(null)}
          title={`Roll back ${live.name} to v${target?.version}?`}
          description={
            <div className="space-y-2">
              <p>v{target?.version} becomes live immediately for everyone on this unit. Data (stock, requests…) is not changed — only menus, pages, fields and theme.</p>
              {target && (
                <div className="rounded-md bg-muted px-3 py-2 text-xs text-foreground">
                  <b>Effect vs current live v{data.liveVersion}:</b> {summarizeDiff(diffConfigs(live, target.config))}
                </div>
              )}
            </div>
          }
          confirmLabel={`Make v${target?.version} live`}
          destructive
          onConfirm={rollback}
        />
      </main>
    </ThemeScope>
  )
}
