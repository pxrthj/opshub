import { useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Blocks, Building2, Check, ChevronsUpDown, LayoutGrid, LogOut, Menu, RotateCcw, Truck, UserRound, Users, Workflow } from "lucide-react"
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
import { NotificationsBell } from "@/components/NotificationsBell"
import { ProfileDialog } from "@/components/ProfileDialog"
import { useCurrentSiteKey } from "@/lib/useCurrentSiteKey"
import { toastError } from "@/lib/useAsync"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "./ConfirmDialog"
import { Logo } from "./Logo"

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
        <Button variant="outline" className="w-36 justify-between sm:w-52">
          <span className="flex min-w-0 items-center gap-2">
            {current ? <Building2 className="text-muted-foreground" /> : <LayoutGrid className="text-muted-foreground" />}
            <span className="truncate text-sm">{current ? current.config.name : "Home"}</span>
          </span>
          <ChevronsUpDown className="text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onClick={() => navigate("/")}>
          <LayoutGrid className="text-muted-foreground" />
          <span className="flex-1">Home</span>
          {!current && <Check className="size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sites.map((s) => (
          <DropdownMenuItem key={s.config.siteId} onClick={() => navigate(`/s/${s.config.slug}`)} className="py-2">
            <Building2 className="text-muted-foreground" />
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
  const [profileOpen, setProfileOpen] = useState(false)
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
            <span className="hidden flex-col leading-tight lg:flex">
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
          <DropdownMenuItem onClick={() => setProfileOpen(true)}>
            <UserRound /> My profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setResetOpen(true)}>
            <RotateCcw /> Start over with sample data
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={async () => {
              await logout()
              toast.success("You are signed out")
              navigate("/login")
            }}
          >
            <LogOut /> Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {profileOpen && <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />}
      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Start over with sample data?"
        description="Everything goes back to the starting data. This can't be undone."
        confirmLabel="Start over"
        destructive
        onConfirm={async () => {
          try {
            await api.raw.post("/api/hub/reset")
            bumpData()
            toast.success("Sample data restored")
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
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <Link to="/" className="shrink-0">
          <Logo compact className="sm:hidden" />
          <Logo className="hidden sm:inline-flex" />
        </Link>
        <Separator orientation="vertical" className="mx-1 hidden h-6! sm:block" />
        <SiteSwitcher />
        {/* Mobile Navigation Dropdown */}
        <div className="flex items-center xl:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Open navigation menu">
                <Menu className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem asChild>
                <Link to="/" className="flex items-center gap-2">
                  <LayoutGrid className="size-4 text-muted-foreground" /> Home
                </Link>
              </DropdownMenuItem>
              {isAnyAdmin && (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/movement" className="flex items-center gap-2">
                      <Truck className="size-4 text-muted-foreground" /> Supply chain
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/modules" className="flex items-center gap-2">
                      <Blocks className="size-4 text-muted-foreground" /> Features
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/builder" className="flex items-center gap-2">
                      <Workflow className="size-4 text-muted-foreground" /> Edit offices
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/users" className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground" /> People
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <nav className="ml-2 hidden items-center gap-1 xl:flex">
          <NavLink to="/" end className={link}>
            <LayoutGrid /> Home
          </NavLink>
          {isAnyAdmin && (
            <>
              <NavLink to="/movement" className={link}>
                <Truck /> Supply chain
              </NavLink>
              <NavLink to="/modules" className={link}>
                <Blocks /> Features
              </NavLink>
              <NavLink to="/builder" className={link}>
                <Workflow /> Edit offices
              </NavLink>
              <NavLink to="/users" className={link}>
                <Users /> People
              </NavLink>
            </>
          )}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <NotificationsBell />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
