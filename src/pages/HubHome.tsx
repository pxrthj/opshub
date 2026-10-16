import { Link, useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CircuitBoard,
  ClipboardList,
  IndianRupee,
  PackageCheck,
  Workflow,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { PageHelp } from "@/components/PageHelp"
import { HUB_HELP } from "@/lib/help"
import { StatCard } from "@/components/StatCard"
import { CardsSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import { mix } from "@/lib/theme"
import type { SiteSummary } from "@/lib/types"
import { formatINR } from "@/lib/utils"
import { getModuleDef } from "@/modules/definitions"

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

function SiteCard({ s }: { s: SiteSummary }) {
  const navigate = useNavigate()
  const { config, stats, role } = s
  const p = config.theme.primary
  const mods = config.modules.filter((m) => !getModuleDef(m).core)
  const has = (m: string) => config.modules.includes(m as never)
  const tiles = [
    has("request") && { label: "Pending requests", value: stats.pendingRequests, warn: stats.pendingRequests > 0 },
    has("inventory") && { label: config.workflow.stockSourceSiteId ? "Low stock (linked)" : "Low-stock items", value: stats.lowStock, warn: stats.lowStock > 0 },
    has("inventory") && !config.workflow.stockSourceSiteId && { label: "Stock value", value: formatINR(stats.stockValue), warn: false },
    has("assignment") && { label: "Assignments", value: stats.assignments, warn: false },
    has("pcb-repair") && { label: "Open repairs", value: stats.openRepairs, warn: stats.openRepairs > 0 },
    has("consumption") && { label: "Units consumed", value: stats.consumptionUnits.toLocaleString("en-IN"), warn: false },
  ].filter(Boolean) as { label: string; value: string | number; warn: boolean }[]

  return (
    <Card className="group gap-0 overflow-hidden py-0 transition-shadow hover:shadow-lg">
      <div className="relative h-24 p-4 text-white" style={{ background: `linear-gradient(135deg, ${p}, ${mix(p, "#000000", 0.35)})` }}>
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:14px_14px]" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold">{config.name}</p>
            <p className="font-mono text-xs opacity-80">/s/{config.slug}</p>
          </div>
          <div className="flex gap-1.5">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium backdrop-blur">v{s.liveVersion}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold" style={{ color: p }}>
              {role}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-sm text-slate-600">{config.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {mods.map((m) => {
            const def = getModuleDef(m)
            return (
              <Tooltip key={m}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium" style={{ background: mix("#ffffff", p, 0.1), color: mix(p, "#000000", 0.2) }}>
                    <def.icon className="size-3" /> {def.short}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{def.name}</TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {tiles.slice(0, 4).map((t) => (
            <div key={t.label} className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2">
              <p className="text-[11px] tracking-wide text-slate-500 uppercase">{t.label}</p>
              <p className={t.warn ? "text-lg font-semibold text-amber-600" : "text-lg font-semibold text-slate-900"}>{t.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-auto flex gap-2 pt-5">
          <Button className="flex-1 text-white" style={{ background: p }} onClick={() => navigate(`/s/${config.slug}`)}>
            Open {config.name} <ArrowRight />
          </Button>
          {role === "Admin" && (
            <Button variant="outline" onClick={() => navigate(`/builder/${config.siteId}`)}>
              <Workflow /> Builder
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

export function HubHome() {
  const { user } = useAuth()
  const { sites, loading } = useHub()
  const adminSites = sites.filter((s) => s.role === "Admin")

  // Combined summary: count stock only for sites that own their inventory (no double counting of linked stock).
  const own = adminSites.filter((s) => s.config.modules.includes("inventory") && !s.config.workflow.stockSourceSiteId)
  const totals = {
    pending: adminSites.reduce((a, s) => a + s.stats.pendingRequests, 0),
    low: own.reduce((a, s) => a + s.stats.lowStock, 0),
    value: own.reduce((a, s) => a + s.stats.stockValue, 0),
    assignments: adminSites.reduce((a, s) => a + s.stats.assignments, 0),
    repairs: adminSites.reduce((a, s) => a + s.stats.openRepairs, 0),
  }

  return (
    <div>
      <PageHelp what={HUB_HELP.home} />
      <PageHeader
        title={`${greeting()}, ${user?.name.split(" ")[0]}`}
        description={
          <>
            MahaPower Utility (Demo) · You have access to <b>{sites.length}</b> unit{sites.length === 1 ? "" : "s"}.
          </>
        }
        actions={
          <Button variant="outline" asChild>
            <Link to="/modules">Browse module catalogue</Link>
          </Button>
        }
      />

      {adminSites.length > 1 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="size-4 text-slate-500" />
            <h2 className="text-sm font-semibold tracking-wide text-slate-700 uppercase">All units summary</h2>
            <Badge variant="secondary">Admin view · {adminSites.length} units</Badge>
          </div>
          {loading && !sites.length ? (
            <CardsSkeleton count={5} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard label="Pending requests" value={totals.pending} hint="Across all units" icon={ClipboardList} tone={totals.pending ? "warning" : "muted"} />
              <StatCard label="Low-stock items" value={totals.low} hint="Below reorder level" icon={AlertTriangle} tone={totals.low ? "danger" : "success"} />
              <StatCard label="Stock value" value={formatINR(totals.value)} hint="Owned inventory" icon={IndianRupee} />
              <StatCard label="Assignments" value={totals.assignments} hint="Material issued" icon={PackageCheck} tone="success" />
              <StatCard label="Open repairs" value={totals.repairs} hint="Received + In repair" icon={CircuitBoard} tone="warning" />
            </div>
          )}
        </section>
      )}

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-slate-700 uppercase">Your units</h2>
      </div>
      {loading && !sites.length ? (
        <CardsSkeleton count={3} />
      ) : sites.length === 0 ? (
        <EmptyState icon={Building2} title="No units yet" description="Ask an Admin to give you a role on a unit." />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sites.map((s) => (
            <SiteCard key={s.config.siteId} s={s} />
          ))}
        </div>
      )}
    </div>
  )
}
