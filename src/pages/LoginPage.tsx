import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { ArrowRight, Boxes, CircuitBoard, Loader2, Lock, Mail, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/context/AuthContext"
import { errorMessage } from "@/lib/useAsync"
import { cn } from "@/lib/utils"

const DEMO_ACCOUNTS = [
  { email: "admin@opshub.demo", password: "admin123", name: "Aarti Deshmukh", role: "Admin on all 3 units", color: "bg-indigo-600" },
  { email: "engineer@opshub.demo", password: "eng123", name: "Rahul Patil", role: "Manager · Distribution + Service Centre", color: "bg-orange-500" },
  { email: "lineman@opshub.demo", password: "line123", name: "Sunil Jadhav", role: "Member · Distribution only", color: "bg-green-600" },
  { email: "storekeeper@opshub.demo", password: "store123", name: "Meena Kulkarni", role: "Manager · Central Stores only", color: "bg-blue-800" },
  { email: "clerk@opshub.demo", password: "clerk123", name: "Pooja Gaikwad", role: "Member · Central Stores (extra)", color: "bg-slate-500" },
]

export function LoginPage() {
  const { user, login, ready } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from
  if (ready && user) return <Navigate to={from && from !== "/login" ? from : "/"} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError("Enter your email and password")
      return
    }
    setBusy(true)
    try {
      const u = await login(email, password)
      toast.success(`Welcome, ${u.name.split(" ")[0]}`)
      navigate(from && from !== "/login" ? from : "/", { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_20%,#4f46e5_0,transparent_40%),radial-gradient(circle_at_80%_70%,#16a34a_0,transparent_35%),radial-gradient(circle_at_60%_10%,#ea580c_0,transparent_30%)]" />
        <div className="relative flex items-center gap-2">
          <Logo compact />
          <span className="text-lg font-semibold">
            Ops<span className="text-indigo-400">Hub</span>
          </span>
        </div>
        <div className="relative mt-auto max-w-lg">
          <p className="text-sm font-medium tracking-wider text-indigo-300 uppercase">MahaPower Utility (Demo)</p>
          <h1 className="mt-3 text-4xl leading-tight font-semibold">One platform. Every unit. Built by dragging modules.</h1>
          <p className="mt-4 text-slate-300">
            Each business unit is a config-driven site with its own theme, pages, workflow and data — rendered by a single engine.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { icon: Boxes, name: "Central Stores", c: "from-blue-700 to-blue-900" },
              { icon: CircuitBoard, name: "Service Centre", c: "from-orange-500 to-orange-700" },
              { icon: Truck, name: "Distribution", c: "from-green-600 to-green-800" },
            ].map((s) => (
              <div key={s.name} className={cn("rounded-xl bg-gradient-to-br p-4 shadow-lg", s.c)}>
                <s.icon className="size-5 opacity-90" />
                <p className="mt-6 text-sm font-medium">{s.name}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative mt-10 text-xs text-slate-500">Fictional demo company. Frontend-only prototype — all data stays in your browser.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Logo className="mb-8 lg:hidden" />
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use one of the demo accounts below.</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
                <Input id="email" type="email" autoComplete="username" className="h-10 pl-8" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@opshub.demo" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
                <Input id="password" type="password" autoComplete="current-password" className="h-10 pl-8" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
              </div>
            </div>
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
            <Button type="submit" className="h-10 w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              Sign in
            </Button>
          </form>

          <div className="mt-8">
            <p className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">Demo accounts — click to fill</p>
            <div className="grid gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <Card
                  key={a.email}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEmail(a.email)
                    setPassword(a.password)
                    setError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setEmail(a.email)
                      setPassword(a.password)
                    }
                  }}
                  className={cn(
                    "cursor-pointer gap-0 py-0 transition hover:ring-indigo-300 hover:shadow-sm",
                    email === a.email && "ring-2 ring-indigo-500",
                  )}
                >
                  <CardContent className="flex items-center gap-3 px-3 py-2.5">
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", a.color)}>
                      {a.name.split(" ").map((p) => p[0]).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">
                        {a.name} <span className="font-normal text-slate-500">· {a.role}</span>
                      </p>
                      <p className="truncate font-mono text-xs text-slate-500">
                        {a.email} / {a.password}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
