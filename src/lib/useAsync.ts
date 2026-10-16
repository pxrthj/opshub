import { useCallback, useEffect, useRef, useState, type DependencyList } from "react"
import { toast } from "sonner"
import { ApiError } from "@/api"

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return "Something went wrong"
}

export function toastError(e: unknown, title?: string) {
  if (title) toast.error(title, { description: errorMessage(e) })
  else toast.error(errorMessage(e))
}

/** Load async data with loading/error state; refetches when deps change. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps)

  const reload = useCallback(async () => {
    const id = ++seq.current
    setLoading(true)
    try {
      const result = await run()
      if (id === seq.current) {
        setData(result)
        setError(null)
      }
    } catch (e) {
      if (id === seq.current) setError(e)
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }, [run])

  useEffect(() => {
    reload()
  }, [reload])

  return { data, loading, error, reload, setData }
}
