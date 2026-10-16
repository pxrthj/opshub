import { useState } from "react"
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Blocks, Check, ChevronsUpDown, LayoutGrid, LogOut, RotateCcw, Users, Workflow } from "lucide-react"
import { api } from "@/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/context/AuthContext"
import { Separator } from "@/components/ui/separator"
import { useHub } from "@/context/HubContext"
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
        <Button variant="outline" className="w-52 justify-between">
          <span className="flex min-w-0 items-center gap-2">
            {current ? (
              <span className="size-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: current.config.theme.primary }} />
            ) : (
              <LayoutGrid className="text-muted-foreground" />
            )}
            <span className="truncate text-sm">{current ? current.config.name : "Home"}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground" />
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
          <Button variant="ghost" className="h-auto gap-2.5 px-2 py-1 text-left">
            <Avatar>
              <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <span className="hidden flex-col leading-tight md:flex">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{current ? `${current.role} · ${current.config.name}` : user.title}</span>
            </span>
          </Button>
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
  // shadcn button styling for the nav links; the active page uses the "secondary" look
  const link = ({ isActive }: { isActive: boolean }) => cn(buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "sm" }))
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4">
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>
        <Separator orientation="vertical" className="mx-1 h-6!" />
        <SiteSwitcher />
        <nav className="ml-2 hidden items-center gap-1 md:flex">
          <NavLink to="/" end className={link}>
            <LayoutGrid /> Home
          </NavLink>
          {isAnyAdmin && (
            <>
              <NavLink to="/modules" className={link}>
                <Blocks /> Modules
              </NavLink>
              <NavLink to="/builder" className={link}>
                <Workflow /> Builder
              </NavLink>
              <NavLink to="/users" className={link}>
                <Users /> Users
              </NavLink>
            </>
          )}
        </nav>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
