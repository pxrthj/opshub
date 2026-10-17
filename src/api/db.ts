import { createSeedDatabase } from "@/data/seed"
import type { Database } from "@/lib/types"

// The "database": one JSON document in localStorage, with data keyed by siteId.
// In the real backend this becomes Postgres tables that all carry a site_id column.

const DB_KEY = "opshub.db.v4"
const OLD_KEYS = ["opshub.db.v1", "opshub.db.v2", "opshub.db.v3"]

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export function loadDb(): Database {
  // Remove any stale keys from previous versions
  OLD_KEYS.forEach((k) => localStorage.removeItem(k))
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Database
      if (parsed && parsed.schema === 1 && parsed.sites && parsed.data) return parsed
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
