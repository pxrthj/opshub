import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { api } from "@/api"
import { invalidateSnapshot } from "@/api/snapshot"
import { supabase } from "@/lib/supabase"
import type { PublicUser } from "@/lib/types"

interface AuthContextValue {
  user: PublicUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<PublicUser>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Sign-in is Supabase Auth (email + password). Supabase keeps the session in the browser and refreshes it.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [ready, setReady] = useState(false)

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setUser(null)
      return
    }
    try {
      setUser(await api.raw.get<PublicUser>("/api/auth/me"))
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    refreshUser().finally(() => {
      if (!cancelled) setReady(true)
    })
    // Signing out in another tab (or an expired session) signs this one out too.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        invalidateSnapshot()
        setUser(null)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const u = await api.raw.post<PublicUser>("/api/auth/login", { email, password })
    setUser(u)
    return u
  }, [])

  const logout = useCallback(async () => {
    await api.raw.post("/api/auth/logout")
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, ready, login, logout, refreshUser }), [user, ready, login, logout, refreshUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider")
  return ctx
}
