import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { api } from "@/api"
import { readSession, writeSession } from "@/api/session"
import type { PublicUser } from "@/lib/types"

interface AuthContextValue {
  user: PublicUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<PublicUser>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null)
  const [ready, setReady] = useState(false)

  const refreshUser = useCallback(async () => {
    if (!readSession()) {
      setUser(null)
      return
    }
    try {
      setUser(await api.raw.get<PublicUser>("/api/auth/me"))
    } catch {
      writeSession(null)
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!readSession()) {
        if (!cancelled) setReady(true)
        return
      }
      try {
        const me = await api.raw.get<PublicUser>("/api/auth/me")
        if (!cancelled) setUser(me)
      } catch {
        writeSession(null)
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
