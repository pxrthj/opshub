import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`
}

export function formatINR(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN")
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}
