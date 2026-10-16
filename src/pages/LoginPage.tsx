import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/context/AuthContext"
import { errorMessage } from "@/lib/useAsync"
import { cn } from "@/lib/utils"

const SAMPLE_ACCOUNTS = [
  { email: "admin@opshub.demo", password: "admin123", name: "Aarti Deshmukh", role: "Admin · all offices" },
  { email: "engineer@opshub.demo", password: "eng123", name: "Rahul Patil", role: "Manager · Distribution, Service Centre" },
  { email: "lineman@opshub.demo", password: "line123", name: "Sunil Jadhav", role: "Member · Distribution" },
  { email: "storekeeper@opshub.demo", password: "store123", name: "Meena Kulkarni", role: "Manager · Central Stores" },
  { email: "clerk@opshub.demo", password: "clerk123", name: "Pooja Gaikwad", role: "Member · Central Stores" },
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
      setError("Enter your email and password.")
      return
    }
    setBusy(true)
    try {
      await login(email, password)
      navigate(from && from !== "/login" ? from : "/", { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mb-8 justify-center" />
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" className="h-10" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" className="h-10" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="h-10 w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-xs text-slate-500">Sample accounts — click one to fill in</p>
          <div className="divide-y overflow-hidden rounded-xl border bg-white">
            {SAMPLE_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email)
                  setPassword(a.password)
                  setError(null)
                }}
                className={cn("flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-50", email === a.email && "bg-slate-50")}
              >
                <span className="font-medium text-slate-900">{a.name}</span>
                <span className="text-xs text-slate-500">{a.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
