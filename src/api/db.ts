import { createSeedDatabase, SEED_USERS } from "@/data/seed"
import type { Database } from "@/lib/types"

// The "database": one JSON document in localStorage, with data keyed by siteId.
// In the real backend this becomes Postgres tables that all carry a site_id column.

export const CURRENT_SCHEMA = 5
const DB_KEY = "opshub.db.v5"

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export function loadDb(): Database {
  try {
    // Cleanup older legacy versions if any
    try {
      localStorage.removeItem("opshub.db.v1")
      localStorage.removeItem("opshub.db.v2")
      localStorage.removeItem("opshub.db.v3")
      localStorage.removeItem("opshub.db.v4")
    } catch {
      // ignore
    }

    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      if (parsed && parsed.schema === CURRENT_SCHEMA && parsed.sites && parsed.data) {
        // Ensure all seed users exist with their latest credentials and roles
        const userMap = new Map(parsed.users.map((u) => [u.email.toLowerCase(), u]))
        let changed = false
        for (const su of SEED_USERS) {
          const existing = userMap.get(su.email.toLowerCase())
          if (!existing || existing.password !== su.password || JSON.stringify(existing.roles) !== JSON.stringify(su.roles)) {
            userMap.set(su.email.toLowerCase(), su)
            changed = true
          }
        }
        if (changed || parsed.users.length !== userMap.size) {
          parsed.users = Array.from(userMap.values())
          saveDb(parsed)
        }
        return parsed
      }
    }
  } catch {
    // corrupted storage — fall through to seed
  }
  const seeded = createSeedDatabase()
  saveDb(seeded)
  return seeded
}

export function saveDb(db: Database) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // storage full / blocked: the prototype keeps working in memory for this request
  }
}

export function resetDb(): Database {
  try {
    localStorage.removeItem("opshub.session")
  } catch {
    // ignore
  }
  const seeded = createSeedDatabase()
  saveDb(seeded)
  return seeded
}

/**
 * Run a write against a private copy of the database and commit only if the
 * function finishes without throwing. Maps to BEGIN ... COMMIT / ROLLBACK.
 */
export function withTransaction<T>(fn: (db: Database) => T): T {
  const working = clone(loadDb())
  const result = fn(working) // throws => working copy is discarded, nothing is saved
  saveDb(working)
  return result
}
