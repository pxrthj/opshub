import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Package,
  Wrench,
  Workflow,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { api } from "@/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import type { AppNotification, NotificationCategory, NotificationPriority } from "@/lib/types"
import { cn } from "@/lib/utils"

const CATEGORY_ICONS: Record<NotificationCategory, LucideIcon> = {
  approval: ClipboardList,
  request: AlertCircle,
  inventory: AlertTriangle,
  repair: Wrench,
  assignment: Package,
  system: Workflow,
}

const PRIORITY_BADGES: Record<NotificationPriority, { label: string; className: string; dot: string }> = {
  urgent: {
    label: "Urgent",
    className: "border-red-200 bg-red-50 text-red-700",
    dot: "bg-red-500",
  },
  medium: {
    label: "Medium",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  low: {
    label: "Info",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    dot: "bg-sky-500",
  },
}

export function NotificationsBell() {
  const { user } = useAuth()
  const { dataVersion } = useHub()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [selectedPriority, setSelectedPriority] = useState<"all" | NotificationPriority>("all")
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (!user) return new Set()
    try {
      const stored = localStorage.getItem(`plexus.notifs.read.${user.id}`)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Load notifications from API
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user) return
      try {
        const notifs = await api.raw.get<AppNotification[]>("/api/hub/notifications")
        if (!cancelled) setNotifications(notifs)
      } catch {
        // fail silently for notifications poll
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user, dataVersion])

  // Save readIds to localStorage
  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      if (user) {
        try {
          localStorage.setItem(`plexus.notifs.read.${user.id}`, JSON.stringify([...next]))
        } catch {
          // ignore storage error
        }
      }
      return next
    })
  }

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id)
    setReadIds(new Set(allIds))
    if (user) {
      try {
        localStorage.setItem(`plexus.notifs.read.${user.id}`, JSON.stringify(allIds))
      } catch {
        // ignore
      }
    }
  }

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !readIds.has(n.id)).length
  }, [notifications, readIds])

  const urgentUnreadCount = useMemo(() => {
    return notifications.filter((n) => n.priority === "urgent" && !readIds.has(n.id)).length
  }, [notifications, readIds])

  const priorityCounts = useMemo(() => {
    const counts = { all: notifications.length, urgent: 0, medium: 0, low: 0 }
    for (const n of notifications) {
      counts[n.priority]++
    }
    return counts
  }, [notifications])

  const filteredNotifications = useMemo(() => {
    if (selectedPriority === "all") return notifications
    return notifications.filter((n) => n.priority === selectedPriority)
  }, [notifications, selectedPriority])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
          title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          aria-label="Open notifications"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold text-white shadow-xs",
                urgentUnreadCount > 0 ? "bg-red-600 animate-pulse" : "bg-sky-600",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-96 md:w-[420px] p-0 shadow-2xl rounded-xl border border-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-slate-50/80 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-slate-900 text-white shadow-xs">
              <Bell className="size-3.5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">Notifications</p>
              <p className="text-[11px] text-slate-500">
                {unreadCount > 0 ? `${unreadCount} unread alerts` : "All alerts caught up"}
              </p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="h-7 text-xs text-slate-600 hover:text-slate-900 gap-1 px-2"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Priority Tabs Filter */}
        <div className="flex border-b bg-white px-2 py-1.5 gap-1 text-xs">
          {(
            [
              { id: "all", label: "All", count: priorityCounts.all },
              { id: "urgent", label: "Urgent", count: priorityCounts.urgent, dot: "bg-red-500" },
              { id: "medium", label: "Medium", count: priorityCounts.medium, dot: "bg-amber-500" },
              { id: "low", label: "Info", count: priorityCounts.low, dot: "bg-sky-500" },
            ] as const
          ).map((tab) => {
            const active = selectedPriority === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedPriority(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {"dot" in tab && <span className={cn("size-1.5 rounded-full", tab.dot)} />}
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.2 text-[10px]",
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Notifications List */}
        <ScrollArea className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 bg-white">
          {filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 mb-2">
                <CheckCircle2 className="size-6" />
              </div>
              <p className="text-sm font-semibold text-slate-900">All clear!</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedPriority === "all"
                  ? "No operational notifications at this moment."
                  : `No ${selectedPriority} priority notifications.`}
              </p>
            </div>
          ) : (
            filteredNotifications.map((n) => {
              const Icon = CATEGORY_ICONS[n.category] || Sparkles
              const priorityInfo = PRIORITY_BADGES[n.priority]
              const isRead = readIds.has(n.id)

              return (
                <div
                  key={n.id}
                  onClick={() => {
                    markAsRead(n.id)
                    setOpen(false)
                    navigate(n.link)
                  }}
                  className={cn(
                    "group relative flex items-start gap-3 p-3.5 transition-colors cursor-pointer text-left hover:bg-slate-50/90",
                    !isRead && "bg-sky-50/30",
                  )}
                >
                  {/* Category Icon */}
                  <div
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg shadow-xs",
                      n.priority === "urgent"
                        ? "bg-red-100 text-red-700"
                        : n.priority === "medium"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-700",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className={cn("text-xs leading-tight font-semibold truncate", !isRead ? "text-slate-900 font-bold" : "text-slate-700")}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[10px] text-slate-500">{n.timeAgo}</span>
                    </div>

                    <p className="text-[11.5px] text-slate-600 leading-snug line-clamp-2">
                      {n.message}
                    </p>

                    <div className="flex items-center gap-2 pt-1 text-[10.5px]">
                      <Badge variant="outline" className={cn("px-1.5 py-0 text-[10px] font-medium", priorityInfo.className)}>
                        {priorityInfo.label}
                      </Badge>
                      <span className="text-slate-500 font-medium truncate max-w-[140px]">
                        {n.siteName}
                      </span>
                      <span className="ml-auto opacity-0 group-hover:opacity-100 text-sky-600 font-medium flex items-center gap-0.5 transition-opacity">
                        View <ExternalLink className="size-2.5" />
                      </span>
                    </div>
                  </div>

                  {/* Unread indicator dot */}
                  {!isRead && (
                    <span className="absolute top-3.5 right-3 size-2 rounded-full bg-sky-500 shadow-xs" title="Unread" />
                  )}
                </div>
              )
            })
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t bg-slate-50 px-3 py-2 text-center text-[11px] text-slate-500">
          Showing notifications for {user?.name} ({user?.title || "Staff"})
        </div>
      </PopoverContent>
    </Popover>
  )
}
