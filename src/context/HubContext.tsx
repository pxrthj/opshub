import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { api } from "@/api"
import type { SiteSummary } from "@/lib/types"
import { useAuth } from "./AuthContext"

interface HubContextValue {
  sites: SiteSummary[]
  loading: boolean
  /** Bumped whenever data changes globally (reset, publish) so pages refetch. */
  dataVersion: number
  refreshSites: () => Promise<void>
  bumpData: () => void
  isAnyAdmin: boolean
  siteBySlugOrId: (key: string) => SiteSummary | undefined
}

const HubContext = createContext<HubContextValue | null>(null)

export function HubProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [sites, setSites] = useState<SiteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [dataVersion, setDataVersion] = useState(0)

  const refreshSites = useCallback(async () => {
    if (!user) return
    try {
      setSites(await api.raw.get<SiteSummary[]>("/api/hub/sites"))
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    setLoading(true)
    refreshSites()
  }, [refreshSites, dataVersion])

  const bumpData = useCallback(() => setDataVersion((v) => v + 1), [])

  const value = useMemo<HubContextValue>(
    () => ({
      sites,
      loading,
      dataVersion,
      refreshSites,
      bumpData,
      isAnyAdmin: !!user && Object.values(user.roles).includes("Admin"),
      siteBySlugOrId: (key) => sites.find((s) => s.config.slug === key || s.config.siteId === key),
    }),
    [sites, loading, dataVersion, refreshSites, bumpData, user],
  )
  return <HubContext.Provider value={value}>{children}</HubContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHub() {
  const ctx = useContext(HubContext)
  if (!ctx) throw new Error("useHub must be used inside HubProvider")
  return ctx
}
