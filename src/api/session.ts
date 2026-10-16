// Mock session — stands in for an HTTP-only cookie / JWT in the real backend.

const SESSION_KEY = "opshub.session"

export interface Session {
  userId: string
  at: string
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function writeSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}
