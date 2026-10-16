import { createContext, useContext, type ReactNode } from "react"
import type { ApiOptions } from "@/api"
import type { Role, SiteConfig } from "@/lib/types"

export interface SiteApi {
  get: <T>(resource: string, query?: ApiOptions["query"]) => Promise<T>
  post: <T>(resource: string, body?: unknown) => Promise<T>
  put: <T>(resource: string, body?: unknown) => Promise<T>
  del: <T>(resource: string) => Promise<T>
}

export interface SiteContextValue {
  config: SiteConfig
  role: Role
  preview: boolean
  liveVersion: number
  /** "/s/distribution" or "/preview/distribution" */
  basePath: string
  /** API bound to this site (and to the draft config when previewing). */
  siteApi: SiteApi
  /** Call after any write so dashboards/badges refresh. */
  notifyChange: () => void
  changeTick: number
}

const SiteContext = createContext<SiteContextValue | null>(null)

export function SiteProvider({ value, children }: { value: SiteContextValue; children: ReactNode }) {
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSite() {
  const ctx = useContext(SiteContext)
  if (!ctx) throw new Error("useSite must be used inside a site page")
  return ctx
}
