import { dispatch } from "./router"
import "./routes/hub"
import "./routes/site"
import "./routes/builder"

export { ApiError } from "./errors"

// Public client for the mock REST API. Every call goes through the router, which
// enforces auth, site_id isolation and roles — exactly like the future Express server:
//
//   api.get(siteId, "requests")              ->  GET    /api/:siteId/requests
//   api.post(siteId, "requests", body)       ->  POST   /api/:siteId/requests
//   api.put(siteId, "inventory/itm_1", body) ->  PUT    /api/:siteId/inventory/:id
//   api.del(siteId, "inventory/itm_1")       ->  DELETE /api/:siteId/inventory/:id
//
// Swapping to a real backend = replacing `dispatch` with `fetch(url, { method, body, credentials: "include" })`.

export interface ApiOptions {
  /** Admin preview: read the site's DRAFT config instead of the live one. */
  preview?: boolean
  query?: Record<string, string | undefined>
}

function url(siteId: string, resource: string, opts?: ApiOptions) {
  const q = new URLSearchParams()
  if (opts?.preview) q.set("preview", "1")
  for (const [k, v] of Object.entries(opts?.query ?? {})) if (v !== undefined) q.set(k, v)
  const qs = q.toString()
  return `/api/${encodeURIComponent(siteId)}/${resource}${qs ? `?${qs}` : ""}`
}

export const api = {
  get: <T>(siteId: string, resource: string, opts?: ApiOptions) => dispatch<T>("GET", url(siteId, resource, opts)),
  post: <T>(siteId: string, resource: string, body?: unknown, opts?: ApiOptions) =>
    dispatch<T>("POST", url(siteId, resource, opts), body),
  put: <T>(siteId: string, resource: string, body?: unknown, opts?: ApiOptions) =>
    dispatch<T>("PUT", url(siteId, resource, opts), body),
  del: <T>(siteId: string, resource: string, opts?: ApiOptions) => dispatch<T>("DELETE", url(siteId, resource, opts)),

  /** Non-site routes: /api/auth/* and /api/hub/* */
  raw: {
    get: <T>(path: string) => dispatch<T>("GET", path),
    post: <T>(path: string, body?: unknown) => dispatch<T>("POST", path, body),
    put: <T>(path: string, body?: unknown) => dispatch<T>("PUT", path, body),
  },
}

export type Api = typeof api
