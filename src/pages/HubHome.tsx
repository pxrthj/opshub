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
}

/** Turns each office's numbers into a few plain to-dos for this person. */
function todosFor(sites: SiteSummary[]): Todo[] {
  const out: Todo[] = []
  for (const { config, stats, role } of sites) {
    const has = (m: string) => config.modules.includes(m as never)
    const base = `/s/${config.slug}`
    if (has("approval") && role === "Manager" && stats.pendingRequests > 0)
      out.push({
        key: `${config.siteId}-approve`,
        icon: ClipboardList,
        text: `${stats.pendingRequests} request${stats.pendingRequests > 1 ? "s" : ""} waiting for you to decide in ${config.name}`,
        action: "Decide",
        to: `${base}/approvals`,
      })
    if (has("approval") && role === "Admin" && stats.pendingRequests > 0)
      out.push({
        key: `${config.siteId}-approve-admin`,
        icon: ClipboardList,
        text: `${stats.pendingRequests} request${stats.pendingRequests > 1 ? "s" : ""} flowing through ${config.name}`,
        action: "Oversee flow",
        to: `${base}/requests`,
      })
    if (has("inventory") && !config.workflow.stockSourceSiteId && roleAtLeast(role, "Manager") && stats.lowStock > 0)
      out.push({
        key: `${config.siteId}-stock`,
        icon: AlertTriangle,
        text: `${stats.lowStock} item${stats.lowStock > 1 ? "s are" : " is"} almost out of stock in ${config.name}`,
        action: "View stock",
        to: `${base}/inventory`,
      })
    if (has("pcb-repair") && stats.openRepairs > 0) {
      if (role === "Admin") {
        out.push({
          key: `${config.siteId}-repairs-admin`,
          icon: Wrench,
          text: `${stats.openRepairs} board${stats.openRepairs > 1 ? "s" : ""} undergoing repair in ${config.name}`,
          action: "Oversee repairs",
          to: `${base}/repairs`,
        })
      } else if (roleAtLeast(role, "Member")) {
        out.push({
          key: `${config.siteId}-repairs`,
          icon: Wrench,
          text: `${stats.openRepairs} board${stats.openRepairs > 1 ? "s" : ""} being repaired in ${config.name}`,
          action: "View repairs",
          to: `${base}/repairs`,
        })
      }
    }
  }
  return out
}

function OfficeCard({ s }: { s: SiteSummary }) {
  const navigate = useNavigate()
  const { config, role } = s
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-5 text-muted-foreground" /> {config.name}
        </CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary">Your role: {role}</Badge>
      </CardContent>
      <CardFooter className="mt-auto flex-col gap-2">
        <Button size="lg" className="w-full" onClick={() => navigate(`/s/${config.slug}`)}>
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting()}, {user?.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{sites.length === 1 ? "This is your office." : "Choose an office to work in."}</p>
      </div>

      {loading && !sites.length ? (
        <CardsSkeleton count={3} />
      ) : sites.length === 0 ? (
        <EmptyState icon={Building2} title="You don't have access to any office yet" description="Ask an Admin to add you to one." />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-base font-medium">Waiting for you</h2>
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
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <t.icon />
                    </span>
                    <span className="flex-1 text-left">{t.text}</span>
                    <span className="flex items-center gap-1 font-medium">
                      {t.action} <ArrowRight />
                    </span>
                  </Link>
                ))}
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-medium">Your offices</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
