import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AlertCircle, AlertTriangle, Bell, CheckCircle2, ClipboardList, Package, Settings2, Wrench, type LucideIcon } from "lucide-react"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import type { AppNotification, NotificationCategory } from "@/lib/types"
import { cn } from "@/lib/utils"

const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  approval: ClipboardList,
  request: AlertCircle,
  inventory: AlertTriangle,
  repair: Wrench,
  assignment: Package,
  system: Settings2,
}

function readKey(userId: string) {
  return `plexus.notifs.read.${userId}`
}

function loadRead(userId?: string) {
  if (!userId) return new Set<string>()
  try {
    const stored = localStorage.getItem(readKey(userId))
    return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>()
  } catch {
    return new Set<string>()
  }
}

export function NotificationsBell() {
  const { user } = useAuth()
  const { dataVersion } = useHub()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(() => loadRead(user?.id))

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api.raw
      .get<AppNotification[]>("/api/hub/notifications")
      .then((list) => {
        if (!cancelled) setNotifications(list)
      })
      .catch(() => {
        // The bell is a convenience; stay quiet if it can't load.
      })
    return () => {
      cancelled = true
    }
  }, [user, dataVersion])

  const saveRead = (ids: Set<string>) => {
    setReadIds(ids)
    if (!user) return
    try {
      localStorage.setItem(readKey(user.id), JSON.stringify([...ids]))
    } catch {
      // ignore storage errors
    }
  }

  const unreadCount = useMemo(() => notifications.filter((n) => !readIds.has(n.id)).length, [notifications, readIds])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={unreadCount > 0 ? `${unreadCount} new notifications` : "Notifications"}>
          <Bell />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-96 gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-medium">Notifications</p>
            <p className="text-xs text-muted-foreground">{unreadCount > 0 ? `${unreadCount} new` : "You're all caught up"}</p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => saveRead(new Set(notifications.map((n) => n.id)))}>
              Mark all as read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <CheckCircle2 className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nothing needs your attention.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => {
                const Icon = CATEGORY_ICONS[n.category] ?? Bell
                const isRead = readIds.has(n.id)
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        saveRead(new Set(readIds).add(n.id))
                        setOpen(false)
                        navigate(n.link)
                      }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                          n.priority === "urgent" ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-sm", isRead ? "text-muted-foreground" : "font-medium")}>{n.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{n.timeAgo}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.message}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{n.siteName}</span>
                      </span>
                      {!isRead && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="New" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
