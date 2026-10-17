import { useState } from "react"
import { Link } from "react-router-dom"
import { Blocks, Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PageHeader } from "@/components/PageHeader"
import { useHub } from "@/context/HubContext"
import { MODULE_DEFINITIONS, PORT_LABELS, requirementLabel, type ModuleCategory } from "@/modules/definitions"

const CATEGORIES: ("All" | ModuleCategory)[] = ["All", "Core", "Stores", "Workflow", "Field", "Service", "Insights"]

export function ModuleCatalogue() {
  const { sites } = useHub()
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All")
  const list = MODULE_DEFINITIONS.filter((m) => cat === "All" || m.category === cat)

  return (
    <div>
      <PageHeader title="Features" description="Everything an office can switch on." icon={<Blocks />} />
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={cat}
        onValueChange={(v) => v && setCat(v as typeof cat)}
        className="mb-6 flex-wrap"
      >
        {CATEGORIES.map((c) => (
          <ToggleGroupItem key={c} value={c}>
            {c}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((m) => {
          const usedBy = sites.filter((s) => s.config.modules.includes(m.id))
          return (
            <Card key={m.id}>
              <CardHeader className="flex flex-row items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <m.icon className="size-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <CardTitle>{m.name}</CardTitle>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{m.category}</Badge>
                    {m.core && (
                      <Badge variant="outline">
                        <Lock /> Always on
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription>{m.description}</CardDescription>
                <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Needs first</dt>
                  <dd className="font-medium">{m.requires.length ? m.requires.map(requirementLabel).join(" + ") : "Nothing"}</dd>
                  <dt className="text-muted-foreground">Uses</dt>
                  <dd>{m.inputs.length ? m.inputs.map((p) => PORT_LABELS[p]).join(", ") : "—"}</dd>
                  <dt className="text-muted-foreground">Provides</dt>
                  <dd>{m.outputs.length ? m.outputs.map((p) => PORT_LABELS[p]).join(", ") : "—"}</dd>
                  <dt className="text-muted-foreground">Used in</dt>
                  <dd className="flex flex-wrap gap-1">
                    {usedBy.length ? (
                      usedBy.map((s) => (
                        <Badge key={s.config.siteId} variant="outline" asChild>
                          <Link to={`/s/${s.config.slug}`}>
                            {s.config.name}
                          </Link>
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">No office yet</span>
                    )}
                  </dd>
                </dl>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
