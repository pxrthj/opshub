import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, Blocks, Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/PageHeader"
import { PageHelp } from "@/components/PageHelp"
import { HUB_HELP } from "@/lib/help"
import { useHub } from "@/context/HubContext"
import { cn } from "@/lib/utils"
import { MODULE_DEFINITIONS, PORT_LABELS, requirementLabel, type ModuleCategory } from "@/modules/definitions"

const CATEGORIES: ("All" | ModuleCategory)[] = ["All", "Core", "Stores", "Workflow", "Field", "Service", "Insights"]

export function ModuleCatalogue() {
  const { sites } = useHub()
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All")
  const list = MODULE_DEFINITIONS.filter((m) => cat === "All" || m.category === cat)

  return (
    <div>
      <PageHelp what={HUB_HELP.modules} />
      <PageHeader
        title="Module Catalogue"
        description="The 13 building blocks every OpsHub site is assembled from. Admins drag these onto a site's canvas in the Builder."
        icon={<Blocks />}
      />
      <div className="mb-5 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-medium transition-colors",
              cat === c ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => {
          const usedBy = sites.filter((s) => s.config.modules.includes(m.id))
          return (
            <Card key={m.id} className="gap-3 p-5">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <m.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400 tabular-nums">{String(MODULE_DEFINITIONS.indexOf(m) + 1).padStart(2, "0")}</span>
                    <p className="font-semibold text-slate-900">{m.name}</p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary">{m.category}</Badge>
                    {m.core && (
                      <Badge variant="outline" className="gap-1">
                        <Lock className="size-3" /> Always on
                      </Badge>
                    )}
                    {m.page && <Badge variant="outline">Page: {m.page.label} · {m.page.minRole}+</Badge>}
                  </div>
                </div>
              </div>
              <p className="text-sm text-slate-600">{m.description}</p>
              <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 text-xs">
                <dt className="text-slate-500">Requires</dt>
                <dd className="font-medium text-slate-800">{m.requires.length ? m.requires.map(requirementLabel).join(" + ") : "Nothing"}</dd>
                <dt className="text-slate-500">Inputs</dt>
                <dd className="text-slate-700">{m.inputs.length ? m.inputs.map((p) => PORT_LABELS[p]).join(", ") : "—"}</dd>
                <dt className="text-slate-500">Outputs</dt>
                <dd className="text-slate-700">{m.outputs.length ? m.outputs.map((p) => PORT_LABELS[p]).join(", ") : "—"}</dd>
                <dt className="text-slate-500">Used by</dt>
                <dd className="flex flex-wrap gap-1">
                  {usedBy.length ? (
                    usedBy.map((s) => (
                      <Link
                        key={s.config.siteId}
                        to={`/s/${s.config.slug}`}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:underline"
                        style={{ background: s.config.theme.accent, color: s.config.theme.primary }}
                      >
                        {s.config.name} <ArrowRight className="size-3" />
                      </Link>
                    ))
                  ) : (
                    <span className="text-slate-400">Not used by your units yet</span>
                  )}
                </dd>
              </dl>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
