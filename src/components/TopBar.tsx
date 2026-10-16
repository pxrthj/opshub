import { useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Blocks,
  Check,
  ChevronsUpDown,
  LayoutGrid,
  LogOut,
  RotateCcw,
  Users,
  Workflow,
} from "lucide-react"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import { NotificationsBell } from "@/components/NotificationsBell"
import { toastError } from "@/lib/useAsync"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "./ConfirmDialog"
import { Logo } from "./Logo"

/** Works out which site (if any) the current URL belongs to. */
export function useCurrentSiteKey(): string | null {
  const { pathname } = useLocation()
  const m = pathname.match(/^\/(s|preview|builder)\/([^/]+)/)
  return m ? decodeURIComponent(m[2]) : null
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export function SiteSwitcher() {
  const { sites } = useHub()
  const navigate = useNavigate()
  const key = useCurrentSiteKey()
  const current = sites.find((s) => s.config.slug === key || s.config.siteId === key)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 min-w-[200px] justify-between gap-2 bg-white px-2.5">
          <span className="flex min-w-0 items-center gap-2">
            {current ? (
              <span className="size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: current.config.theme.primary }} />
            ) : (
              <LayoutGrid className="size-4 text-slate-500" />
            )}
            <span className="truncate text-sm">{current ? current.config.name : "Home"}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onClick={() => navigate("/")}>
          <LayoutGrid className="text-slate-500" />
          <span className="flex-1">Home</span>
          {!current && <Check className="size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sites.map((s) => (
          <DropdownMenuItem key={s.config.siteId} onClick={() => navigate(`/s/${s.config.slug}`)} className="py-2">
            <span className="size-3 shrink-0 rounded-full" style={{ background: s.config.theme.primary }} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{s.config.name}</span>
              <span className="text-xs text-muted-foreground">{s.role}</span>
            </span>
            {current?.config.siteId === s.config.siteId && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        {sites.length === 0 && <div className="px-2 py-3 text-sm text-muted-foreground">You don't have access to any office yet.</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const { sites, bumpData } = useHub()
  const navigate = useNavigate()
  const key = useCurrentSiteKey()
  const [resetOpen, setResetOpen] = useState(false)
  if (!user) return null
  const current = sites.find((s) => s.config.slug === key || s.config.siteId === key)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition-colors outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials(user.name)}
            </span>
            <span className="hidden flex-col leading-tight md:flex">
              <span className="text-sm font-medium text-slate-900">{user.name}</span>
              <span className="text-xs text-slate-500">{current ? `${current.role} · ${current.config.name}` : user.title}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>
            <div className="font-medium text-foreground">{user.name}</div>
            <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setResetOpen(true)}>
            <RotateCcw /> Reset data
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={async () => {
              await logout()
              toast.success("Signed out")
              navigate("/login")
            }}
          >
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset all data?"
        description="Everything goes back to the starting data. This can't be undone."
        confirmLabel="Reset"
        destructive
        onConfirm={async () => {
          try {
            await api.raw.post("/api/hub/reset")
            bumpData()
            toast.success("Data reset")
            navigate("/")
          } catch (e) {
            toastError(e)
            throw e
          }
        }}
      />
    </>
  )
}

export function TopBar() {
  const { isAnyAdmin } = useHub()
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
      isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
    )
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <SiteSwitcher />
        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          <NavLink to="/" end className={link}>
            <LayoutGrid className="size-4" /> Home
          </NavLink>
          {isAnyAdmin && (
            <>
              <NavLink to="/modules" className={link}>
                <Blocks className="size-4" /> Modules
              </NavLink>
              <NavLink to="/builder" className={link}>
                <Workflow className="size-4" /> Builder
              </NavLink>
              <NavLink to="/users" className={link}>
                <Users className="size-4" /> Users
              </NavLink>
            </>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <NotificationsBell />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
