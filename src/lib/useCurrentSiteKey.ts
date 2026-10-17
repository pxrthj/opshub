import { useLocation } from "react-router-dom"

/** Works out which site (if any) the current URL belongs to. */
export function useCurrentSiteKey(): string | null {
  const { pathname } = useLocation()
  const m = pathname.match(/^\/(s|preview|builder)\/([^/]+)/)
  return m ? decodeURIComponent(m[2]) : null
}
