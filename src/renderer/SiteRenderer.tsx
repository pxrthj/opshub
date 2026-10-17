import { useCallback, useEffect, useMemo, useState } from "react"
import { Spinner } from "@/components/ui/spinner"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Eye, Workflow } from "lucide-react"
import { api, ApiError } from "@/api"
import { Button } from "@/components/ui/button"
import { AccessDenied } from "@/components/AccessDenied"
import { SiteProvider, useSite, type SiteApi, type SiteContextValue } from "@/context/SiteContext"
import { useHub } from "@/context/HubContext"
import { roleAtLeast } from "@/lib/roles"
import type { Role, SiteConfig } from "@/lib/types"
import { errorMessage } from "@/lib/useAsync"
import { MODULE_DEFINITIONS } from "@/modules/definitions"
import { PAGE_COMPONENTS } from "@/modules/registry"
import { NotFound } from "@/pages/NotFound"
import { SiteSidebar } from "./SiteSidebar"

type Loaded = { config: SiteConfig; role: Role; liveVersion: number; hasDraft: boolean }

/**
 * THE generic renderer. Every site — Component Stores, PCB Repair Lab, Field Service, or any
 * new one — is drawn from its JSON config: theme -> CSS vars, pages -> sidebar + routes,
 * modules -> page components from the registry. There is no per-site code.
 */
export function SiteRenderer({ mode }: { mode: "live" | "preview" }) {
  const { slug = "", "*": rest = "" } = useParams()
  const preview = mode === "preview"
  const { dataVersion, refreshSites } = useHub()
  type LoadState = { status: "loading" } | { status: "ok"; data: Loaded } | { status: "error"; code: number; message: string }
  const [loaded, setState] = useState<LoadState>({ status: "loading" })
  // Switching to another office shows the spinner; refreshing the same one keeps the page on screen.
  const state = useMemo<LoadState>(() => (loaded.status === "ok" && loaded.data.config.slug !== slug ? { status: "loading" } : loaded), [loaded, slug])
  const [changeTick, setChangeTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const resolved = await api.raw.get<{ siteId: string }>(`/api/hub/resolve/${encodeURIComponent(slug)}`)
        const data = await api.get<Loaded>(resolved.siteId, "config", { preview })
        if (preview && data.role !== "Admin") throw new ApiError(403, "Only Admins can preview changes.")
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
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner className="mr-2 size-5" /> Opening the office…
      </div>
    )
  if (state.status === "error") {
    if (state.code === 403) return <AccessDenied message={state.message} />
    return <NotFound message={state.message} />
  }

  const ctx = ctxValue!
  const segment = rest.split("/")[0] ?? ""
  return (
    <SiteProvider value={ctx}>
      <div className="flex flex-1 flex-col">
        {preview && <PreviewBanner config={ctx.config} hasDraft={state.data.hasDraft} />}
        <div className="flex flex-1">
          <SiteSidebar />
          <main key={ctx.config.siteId} className="min-w-0 flex-1 px-6 py-8">
            <div className="mx-auto w-full max-w-6xl">
              <PageOutlet segment={segment} />
            </div>
          </main>
        </div>
      </div>
    </SiteProvider>
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
        message={known ? `${known.name} is not switched on in ${config.name}. An Admin can switch it on by editing the office.` : `${config.name} has no page called "${segment}".`}
        backTo={basePath}
        backLabel={`Back to ${config.name}`}
      />
    )
  }
  if (!roleAtLeast(role, page.minRole))
    return (
      <AccessDenied
        message={`You need to be a ${page.minRole} (or higher) in ${config.name} to open ${page.label}. You are a ${role}.`}
        backTo={basePath}
        backLabel={`Back to ${config.name}`}
      />
    )
  const Component = PAGE_COMPONENTS[page.moduleId]
  if (!Component) return <NotFound message="This feature has no page." backTo={basePath} />
  return <Component key={`${config.siteId}-${page.id}`} />
}

function PreviewBanner({ config, hasDraft }: { config: SiteConfig; hasDraft: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="sticky top-14 z-30 flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span className="flex items-center gap-1.5 font-medium">
        <Eye className="size-4" /> Preview
      </span>
      <span>
        {hasDraft ? (
          <>
            You're viewing the <b>preview</b> of {config.name}. Your team still sees the live version.
          </>
        ) : (
          <>Nothing has been changed yet. This is how {config.name} looks now.</>
        )}
      </span>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link to={`/s/${config.slug}`}>Open live version</Link>
        </Button>
        <Button size="sm" onClick={() => navigate(`/builder/${config.siteId}`)}>
          <Workflow /> Back to editing
        </Button>
      </div>
    </div>
  )
}
