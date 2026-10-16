import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle } from "lucide-react"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/context/AuthContext"
import { errorMessage } from "@/lib/useAsync"

const SAMPLE_ACCOUNTS = [
  { email: "admin@plexus.demo", password: "admin123", name: "Aarti Deshmukh", role: "Admin · all offices" },
  { email: "engineer@plexus.demo", password: "eng123", name: "Rahul Patil", role: "Manager · Distribution, Service Centre" },
  { email: "lineman@plexus.demo", password: "line123", name: "Sunil Jadhav", role: "Member · Distribution" },
  { email: "storekeeper@plexus.demo", password: "store123", name: "Meena Kulkarni", role: "Manager · Central Stores" },
  { email: "clerk@plexus.demo", password: "clerk123", name: "Pooja Gaikwad", role: "Member · Central Stores" },
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
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Logo size="lg" className="justify-center" />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Spinner />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Sample accounts — click one to fill in</p>
          <Card className="gap-0 py-1">
            {SAMPLE_ACCOUNTS.map((a) => (
              <Button
                key={a.email}
                type="button"
                variant={email === a.email ? "secondary" : "ghost"}
                className="h-auto w-full justify-between rounded-none px-4 py-2.5"
                onClick={() => {
                  setEmail(a.email)
                  setPassword(a.password)
                  setError(null)
                }}
              >
                <span>{a.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{a.role}</span>
              </Button>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
