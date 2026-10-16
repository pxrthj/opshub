import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { ArrowRight, Loader2, RotateCcw, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/context/AuthContext"
import { resetDb } from "@/api/db"
import { errorMessage } from "@/lib/useAsync"
import { cn } from "@/lib/utils"

interface SampleAccount {
  email: string
  password: string
  name: string
  title: string
  tier: string
  role: string
  badgeVariant?: "default" | "secondary" | "outline"
  badgeClass?: string
}

const SAMPLE_ACCOUNTS: SampleAccount[] = [
  {
    email: "admin@opshub.demo",
    password: "admin123",
    name: "Aarti Deshmukh",
    title: "Platform Administrator",
    tier: "All Sites",
    role: "Admin",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
  },
  {
    email: "storekeeper@opshub.demo",
    password: "store123",
    name: "Meena Kulkarni",
    title: "Central Storekeeper",
    tier: "Tier 1: Central Stores",
    role: "Manager",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
  },
  {
    email: "clerk@opshub.demo",
    password: "clerk123",
    name: "Pooja Gaikwad",
    title: "Store Inventory Clerk",
    tier: "Tier 1: Central Stores",
    role: "Member",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    email: "engineer@opshub.demo",
    password: "eng123",
    name: "Rahul Patil",
    title: "Distribution Section Engineer",
    tier: "Tier 2: Distribution",
    role: "Manager",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  {
    email: "lineman@opshub.demo",
    password: "line123",
    name: "Sunil Jadhav",
    title: "Lineman, Pune Rural",
    tier: "Tier 2: Distribution",
    role: "Member",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  {
    email: "service_manager@opshub.demo",
    password: "scman123",
    name: "Anjali Joshi",
    title: "Service Centre Manager",
    tier: "Tier 3: Service Centre",
    role: "Manager",
    badgeClass: "bg-orange-100 text-orange-800 border-orange-200",
  },
  {
    email: "technician@opshub.demo",
    password: "tech123",
    name: "Vikas Shinde",
    title: "Senior Meter Technician",
    tier: "Tier 3: Service Centre",
    role: "Member",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
  },
  {
    email: "ganesh@opshub.demo",
    password: "demo123",
    name: "Ganesh More",
    title: "Multi-Site Field & Meter Support",
    tier: "Distribution + Service",
    role: "Cross-Site Member",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200",
  },
  {
    email: "logistics@opshub.demo",
    password: "demo123",
    name: "Suresh Pawar",
    title: "Inter-Office Logistics Assistant",
    tier: "Central + Distribution",
    role: "Cross-Site Member",
    badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-200",
  },
]

export function LoginPage() {
  const { user, login, ready } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [busyAccount, setBusyAccount] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from
  if (ready && user) return <Navigate to={from && from !== "/login" ? from : "/"} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError("Enter your email and password.")
      return
    }
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate(from && from !== "/login" ? from : "/", { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function quickSignIn(acc: SampleAccount) {
    setError(null)
    setEmail(acc.email)
    setPassword(acc.password)
    setBusyAccount(acc.email)
    try {
      await login(acc.email, acc.password)
      toast.success(`Signed in as ${acc.name}`)
      navigate(from && from !== "/login" ? from : "/", { replace: true })
    } catch (err) {
      setError(errorMessage(err))
      toast.error(`Login failed: ${errorMessage(err)}`)
    } finally {
      setBusyAccount(null)
    }
  }

  function handleReset() {
    resetDb()
    setError(null)
    toast.success("Database and sample accounts reset to default")
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 font-sans">
      <div className="w-full max-w-md">
        <Logo className="mb-6 justify-center" />
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Sign in to OpsHub</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">Electricity Utility Multi-Site Operations</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-5" />
            </div>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="e.g. admin@opshub.demo"
                className="h-10 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-10 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="rounded-md bg-destructive/10 p-2 text-xs font-medium text-destructive">{error}</p>}
            <Button type="submit" className="h-10 w-full font-medium" disabled={busy || !!busyAccount}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Sample Accounts (1-Click Instant Sign In)</p>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              title="Reset demo data if login is stuck"
            >
              <RotateCcw className="size-3" /> Reset demo data
            </button>
          </div>

          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {SAMPLE_ACCOUNTS.map((a) => {
              const isSelected = email === a.email
              const isLoggingIn = busyAccount === a.email

              return (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => quickSignIn(a)}
                  disabled={busy || !!busyAccount}
                  className={cn(
                    "group flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 disabled:opacity-50",
                    isSelected && "bg-muted/40",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                        {a.name}
                      </span>
                      <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none", a.badgeClass)}>
                        {a.role}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">{a.title}</span>
                      <span>·</span>
                      <span className="shrink-0 font-medium text-foreground/80">{a.tier}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary">
                    {isLoggingIn ? (
                      <Loader2 className="size-4 animate-spin text-primary" />
                    ) : (
                      <span className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                        Sign in <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
