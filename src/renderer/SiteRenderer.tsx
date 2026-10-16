import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Eye, Loader2, Workflow } from "lucide-react"
import { api, ApiError } from "@/api"
import { Button } from "@/components/ui/button"
import { AccessDenied } from "@/components/AccessDenied"
import { PageHelp } from "@/components/PageHelp"
import { ThemeScope } from "@/components/ThemeScope"
import { SiteProvider, useSite, type SiteApi, type SiteContextValue } from "@/context/SiteContext"
import { useHub } from "@/context/HubContext"
import { canDoFor, MODULE_HELP } from "@/lib/help"
import { roleAtLeast } from "@/lib/roles"
import type { Role, SiteConfig } from "@/lib/types"
import { errorMessage } from "@/lib/useAsync"
import { MODULE_DEFINITIONS } from "@/modules/definitions"
import { PAGE_COMPONENTS } from "@/modules/registry"
import { NotFound } from "@/pages/NotFound"
import { SiteSidebar } from "./SiteSidebar"

type Loaded = { config: SiteConfig; role: Role; liveVersion: number; hasDraft: boolean }

/**
 * THE generic renderer. Every site — Central Stores, Service Centre, Distribution, or any
 * new one — is drawn from its JSON config: theme -> CSS vars, pages -> sidebar + routes,
 * modules -> page components from the registry. There is no per-site code.
 */
export function SiteRenderer({ mode }: { mode: "live" | "preview" }) {
  const { slug = "", "*": rest = "" } = useParams()
  const preview = mode === "preview"
  const { dataVersion, refreshSites } = useHub()
  const [state, setState] = useState<{ status: "loading" } | { status: "ok"; data: Loaded } | { status: "error"; code: number; message: string }>({ status: "loading" })
  const [changeTick, setChangeTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState((s) => (s.status === "ok" && s.data.config.slug === slug ? s : { status: "loading" }))
    ;(async () => {
      try {
        const resolved = await api.raw.get<{ siteId: string }>(`/api/hub/resolve/${encodeURIComponent(slug)}`)
        const data = await api.get<Loaded>(resolved.siteId, "config", { preview })
        if (preview && data.role !== "Admin") throw new ApiError(403, "Preview mode is only available to Admins of this site.")
        if (!cancelled) setState({ status: "ok", data })
      } catch (e) {
        if (!cancelled) setState({ status: "error", code: e instanceof ApiError ? e.status : 500, message: errorMessage(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, preview, dataVersion])

  const notifyChange = useCallback(() => {
    setChangeTick((t) => t + 1)
    refreshSites()
  }, [refreshSites])

  const ctxValue = useMemo<SiteContextValue | null>(() => {
    if (state.status !== "ok") return null
    const { config, role, liveVersion } = state.data
    const id = config.siteId
    const siteApi: SiteApi = {
      get: (resource, query) => api.get(id, resource, { preview, query }),
      post: (resource, body) => api.post(id, resource, body, { preview }),
      put: (resource, body) => api.put(id, resource, body, { preview }),
      del: (resource) => api.del(id, resource, { preview }),
    }
    return {
      config,
      role,
      preview,
      liveVersion,
      basePath: `/${preview ? "preview" : "s"}/${config.slug}`,
      siteApi,
      notifyChange,
      changeTick,
    }
  }, [state, preview, notifyChange, changeTick])

  if (state.status === "loading")
    return (
      <div className="flex flex-1 items-center justify-center text-slate-500">
        <Loader2 className="mr-2 size-5 animate-spin" /> Loading unit…
      </div>
    )
  if (state.status === "error") {
    if (state.code === 403) return <AccessDenied message={state.message} />
    return <NotFound message={state.message} />
  }

  const ctx = ctxValue!
  const segment = rest.split("/")[0] ?? ""
  return (
    <ThemeScope theme={ctx.config.theme}>
      <SiteProvider value={ctx}>
        <div className="flex flex-1 flex-col">
          {preview && <PreviewBanner config={ctx.config} hasDraft={state.data.hasDraft} />}
          <div className="flex flex-1">
            <SiteSidebar />
            <main key={ctx.config.siteId} className="min-w-0 flex-1 px-6 py-6 lg:px-8">
              <PageOutlet segment={segment} />
            </main>
          </div>
        </div>
      </SiteProvider>
    </ThemeScope>
  )
}

function PageOutlet({ segment }: { segment: string }) {
  const ctx = useSite()
  const { config, role, basePath } = ctx
  const page = config.pages.find((p) => p.path === segment)
  if (!page) {
    const known = MODULE_DEFINITIONS.find((m) => m.page?.path === segment)
    return (
      <NotFound
        message={known ? `${known.name} is not enabled on ${config.name}. An Admin can add it in the Builder.` : `There is no "${segment}" page on ${config.name}.`}
        backTo={basePath}
        backLabel={`Back to ${config.name}`}
      />
    )
  }
  if (!roleAtLeast(role, page.minRole))
    return (
      <AccessDenied
        message={`${page.label} needs the ${page.minRole} role on ${config.name}. Your role here is ${role}.`}
        backTo={basePath}
        backLabel={`Back to ${config.name}`}
      />
    )
  const Component = PAGE_COMPONENTS[page.moduleId]
  if (!Component) return <NotFound message="This module has no page." backTo={basePath} />
  const help = MODULE_HELP[page.moduleId]
  return (
    <>
      {help && <PageHelp what={help.what} role={role} can={canDoFor(help, role)} />}
      <Component key={`${config.siteId}-${page.id}`} />
    </>
  )
}

function PreviewBanner({ config, hasDraft }: { config: SiteConfig; hasDraft: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="sticky top-14 z-30 flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-1.5 rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
        <Eye className="size-3.5" /> Preview mode
      </span>
      <span>
        {hasDraft ? (
          <>
            You're viewing the <b>unpublished draft</b> of {config.name}. Users still see the live version.
          </>
        ) : (
          <>No draft saved — this is the live config of {config.name}.</>
        )}
      </span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" className="border-amber-400 bg-white/70" asChild>
          <Link to={`/s/${config.slug}`}>View live site</Link>
        </Button>
        <Button size="sm" className="bg-amber-600 text-white hover:bg-amber-700" onClick={() => navigate(`/builder/${config.siteId}`)}>
          <Workflow /> Back to builder
        </Button>
      </div>
    </div>
  )
}
