import { Link } from "react-router-dom"
import { History, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { AccessDenied } from "@/components/AccessDenied"
import { PageHeader } from "@/components/PageHeader"
import { useHub } from "@/context/HubContext"
import { getModuleDef } from "@/modules/definitions"

/** /builder — pick which site to build (Admin sites only). */
export function BuilderIndex() {
  const { sites, isAnyAdmin, loading } = useHub()
  if (!loading && !isAnyAdmin) return <AccessDenied message="Only Admins can edit offices." />
  const adminSites = sites.filter((s) => s.role === "Admin")
  return (
    <div>
      <PageHeader title="Edit offices" description="Choose an office to change." icon={<Workflow />} />
      <div className="grid gap-4 md:grid-cols-3">
        {adminSites.map((s) => (
          <Card key={s.config.siteId} className="gap-3 p-5">
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-lg" style={{ background: s.config.theme.primary }} />
              <div>
                <p className="font-semibold text-foreground">{s.config.name}</p>
                <p className="text-xs text-muted-foreground">
                  Live v{s.liveVersion} · {s.config.modules.filter((m) => !getModuleDef(m).core).length} modules
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <Link to={`/builder/${s.config.siteId}`}>
                  <Workflow /> Edit
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/builder/${s.config.siteId}/history`}>
                  <History /> History
                </Link>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
