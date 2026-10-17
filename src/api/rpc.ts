import { FunctionsHttpError } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { ApiError } from "./errors"
import { invalidateSnapshot } from "./snapshot"

// Calls into Supabase. A failed api_* function carries an HTTP-style status in the error "hint"
// (400/401/403/404/409/422), which becomes an ApiError exactly like the old mock API threw.

function statusOf(err: { hint?: string | null; code?: string | null; status?: number }) {
  const fromHint = Number(err.hint)
  if (fromHint >= 400 && fromHint < 600) return fromHint
  if (err.code === "42501") return 403
  if (err.code === "PGRST301" || err.status === 401) return 401
  if (err.code === "PGRST202") return 501 // function missing: not installed on this project yet
  return 400
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  invalidateSnapshot()
  if (error) {
    if (error.code === "PGRST202") throw new ApiError(501, "This action is not installed on the server yet.")
    throw new ApiError(statusOf(error), error.message)
  }
  return data as T
}

/** Privileged actions (creating logins, removing roles, deleting stock, restoring sample data) run in an edge function. */
export async function adminOp<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-ops", { body: { action, ...payload } })
  invalidateSnapshot()
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      throw new ApiError(Number(body?.status) || error.context.status || 400, body?.error ?? error.message)
    }
    throw new ApiError(502, error.message)
  }
  return data as T
}
