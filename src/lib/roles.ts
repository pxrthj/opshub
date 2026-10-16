import type { Role } from "./types"

export const ROLES: Role[] = ["Public", "Member", "Manager", "Admin"]

const RANK: Record<Role, number> = { Public: 0, Member: 1, Manager: 2, Admin: 3 }

export function roleAtLeast(role: Role | null | undefined, min: Role): boolean {
  if (!role) return false
  return RANK[role] >= RANK[min]
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Public: "Read-only dashboard",
  Member: "Raise requests, record usage & returns",
  Manager: "Approve, manage stock, export reports",
  Admin: "Full control, builder, import",
}
