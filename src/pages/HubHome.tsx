import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, ClipboardList, Settings2, Truck, Wrench, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/EmptyState"
import { CardsSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import { roleAtLeast } from "@/lib/roles"
import { mix } from "@/lib/theme"
import type { SiteSummary } from "@/lib/types"

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"
}

interface Todo {
  key: string
  icon: LucideIcon
  text: string
  action: string
  to: string
  color: string
}

/** Turns each office's numbers into a few plain to-dos for this person. */
function todosFor(sites: SiteSummary[]): Todo[] {
  const out: Todo[] = []
  for (const { config, stats, role } of sites) {
    const has = (m: string) => config.modules.includes(m as never)
    const color = config.theme.primary
    const base = `/s/${config.slug}`
    if (has("approval") && roleAtLeast(role, "Manager") && stats.pendingRequests > 0)
      out.push({
        key: `${config.siteId}-approve`,
        icon: ClipboardList,
        text: `${stats.pendingRequests} request${stats.pendingRequests > 1 ? "s" : ""} waiting for your approval in ${config.name}`,
        action: "Review",
        to: `${base}/approvals`,
        color,
      })
    if (has("inventory") && !config.workflow.stockSourceSiteId && roleAtLeast(role, "Manager") && stats.lowStock > 0)
      out.push({
        key: `${config.siteId}-stock`,
        icon: AlertTriangle,
        text: `${stats.lowStock} item${stats.lowStock > 1 ? "s are" : " is"} running low in ${config.name}`,
        action: "See stock",
        to: `${base}/inventory`,
        color,
      })
    if (has("pcb-repair") && roleAtLeast(role, "Member") && stats.openRepairs > 0)
      out.push({
        key: `${config.siteId}-repairs`,
        icon: Wrench,
        text: `${stats.openRepairs} meter${stats.openRepairs > 1 ? "s" : ""} on the repair bench in ${config.name}`,
        action: "Open repairs",
        to: `${base}/repairs`,
        color,
      })
  }
  return out
}

function OfficeCard({ s }: { s: SiteSummary }) {
  const navigate = useNavigate()
  const { config, role } = s
  const p = config.theme.primary
  return (
    <Card className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-lg">
      <div className="h-2" style={{ background: p }} />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">{config.name}</h2>
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: mix("#ffffff", p, 0.12), color: mix(p, "#000000", 0.25) }}>
            You are: {role}
          </span>
        </div>
        <p className="text-slate-600">{config.description}</p>
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <Button size="lg" className="h-11 w-full text-base text-white hover:opacity-90" style={{ background: p }} onClick={() => navigate(`/s/${config.slug}`)}>
            Open {config.name} <ArrowRight />
          </Button>
          {role === "Admin" && (
            <Link to={`/builder/${config.siteId}`} className="flex items-center justify-center gap-1.5 py-1 text-sm text-slate-500 hover:text-slate-900">
              <Settings2 className="size-3.5" /> Change this office (Builder)
            </Link>
          )}
        </div>
      </div>
    </Card>
  )
}

export function HubHome() {
  const { user } = useAuth()
  const { sites, loading, isAnyAdmin } = useHub()
  const todos = todosFor(sites)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          {greeting()}, {user?.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-lg text-slate-500">
          {sites.length === 1 ? "Here is your office." : "Pick an office to work in."}
        </p>
      </div>

      {loading && !sites.length ? (
        <CardsSkeleton count={3} />
      ) : sites.length === 0 ? (
        <EmptyState icon={Building2} title="You don't have access to any office yet" description="Ask an Admin to add you to one." />
      ) : (
        <>
          {isAnyAdmin && (
            <section className="mb-10">
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-blue-200 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 text-white shadow-sm sm:flex-row sm:items-center">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300">
                      <Truck className="size-4" />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-300">
                      Central Admin Oversight
                    </span>
                  </div>
                  <h3 className="text-xl font-bold tracking-tight text-white">
                    Movement of Goods & Chain of Custody
                  </h3>
                  <p className="max-w-2xl text-sm text-slate-300">
                    Track the complete movement lifecycle from requester submission and manager approval, to warehouse stock release, field installation, and restock returns.
                  </p>
                </div>
                <Button
                  asChild
                  size="lg"
                  className="shrink-0 bg-blue-600 font-semibold text-white hover:bg-blue-500 shadow-xs"
                >
                  <Link to="/movement">
                    Inspect Movement <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </section>
          )}

          <section className="mb-10">
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">Waiting for you</h2>
            {todos.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
                <CheckCircle2 className="size-5" /> Nothing needs your attention right now.
              </div>
            ) : (
              <div className="divide-y overflow-hidden rounded-xl border bg-white">
                {todos.map((t) => (
                  <Link key={t.key} to={t.to} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: mix("#ffffff", t.color, 0.12), color: t.color }}>
                      <t.icon className="size-4.5" />
                    </span>
                    <span className="flex-1 text-slate-800">{t.text}</span>
                    <span className="flex items-center gap-1 text-sm font-medium" style={{ color: t.color }}>
                      {t.action} <ArrowRight className="size-4" />
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">Your offices</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {sites.map((s) => (
                <OfficeCard key={s.config.siteId} s={s} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
