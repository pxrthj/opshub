import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, ArrowRight, Building2, CheckCircle2, ClipboardList, Settings2, Wrench, type LucideIcon } from "lucide-react"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/EmptyState"
import { CardsSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import { roleAtLeast } from "@/lib/roles"
import { mix } from "@/lib/theme"
import type { SiteSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

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
        text: `${stats.pendingRequests} request${stats.pendingRequests > 1 ? "s" : ""} waiting for you to decide in ${config.name}`,
        action: "Decide",
        to: `${base}/approvals`,
        color,
      })
    if (has("inventory") && !config.workflow.stockSourceSiteId && roleAtLeast(role, "Manager") && stats.lowStock > 0)
      out.push({
        key: `${config.siteId}-stock`,
        icon: AlertTriangle,
        text: `${stats.lowStock} item${stats.lowStock > 1 ? "s are" : " is"} almost out of stock in ${config.name}`,
        action: "View stock",
        to: `${base}/inventory`,
        color,
      })
    if (has("pcb-repair") && roleAtLeast(role, "Member") && stats.openRepairs > 0)
      out.push({
        key: `${config.siteId}-repairs`,
        icon: Wrench,
        text: `${stats.openRepairs} meter${stats.openRepairs > 1 ? "s" : ""} being repaired in ${config.name}`,
        action: "View repairs",
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
    <Card className="overflow-hidden pt-0 transition-shadow hover:shadow-md">
      <div className="h-1.5" style={{ background: p }} />
      <CardHeader>
        <CardTitle className="text-lg">{config.name}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="outline" style={{ background: mix("#ffffff", p, 0.1), color: mix(p, "#000000", 0.25), borderColor: mix("#ffffff", p, 0.3) }}>
          Your role: {role}
        </Badge>
      </CardContent>
      <CardFooter className="mt-auto flex-col gap-2">
        <Button size="lg" className="w-full text-white hover:opacity-90" style={{ background: p }} onClick={() => navigate(`/s/${config.slug}`)}>
          Open {config.name} <ArrowRight />
        </Button>
        {role === "Admin" && (
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" asChild>
            <Link to={`/builder/${config.siteId}`}>
              <Settings2 /> Edit this office
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export function HubHome() {
  const { user } = useAuth()
  const { sites, loading } = useHub()
  const todos = todosFor(sites)

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting()}, {user?.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-muted-foreground">{sites.length === 1 ? "This is your office." : "Choose an office to work in."}</p>
      </div>

      {loading && !sites.length ? (
        <CardsSkeleton count={3} />
      ) : sites.length === 0 ? (
        <EmptyState icon={Building2} title="You don't have access to any office yet" description="Ask an Admin to add you to one." />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Waiting for you</h2>
            {todos.length === 0 ? (
              <Alert>
                <CheckCircle2 />
                <AlertTitle>Nothing needs you right now.</AlertTitle>
              </Alert>
            ) : (
              <Card className="gap-0 py-1">
                {todos.map((t) => (
                  <Link
                    key={t.key}
                    to={t.to}
                    className={cn(buttonVariants({ variant: "ghost" }), "h-auto justify-start gap-3 rounded-none px-4 py-3 font-normal whitespace-normal")}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ background: mix("#ffffff", t.color, 0.12), color: t.color }}>
                      <t.icon />
                    </span>
                    <span className="flex-1 text-left">{t.text}</span>
                    <span className="flex items-center gap-1 font-medium" style={{ color: t.color }}>
                      {t.action} <ArrowRight />
                    </span>
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Your offices</h2>
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
