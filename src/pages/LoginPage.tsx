import { useState, type FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/context/AuthContext"
import { DEMO_PASSWORD } from "@/data/seed"
import { supabase } from "@/lib/supabase"
import { errorMessage } from "@/lib/useAsync"

interface Account {
  email: string
  name: string
  role: string
}

// Sample people, grouped by office. Everyone uses the same password.
const SAMPLE_PEOPLE: { group: string; people: Account[] }[] = [
  {
    group: "Everywhere",
    people: [{ email: "admin@plexus.demo", name: "Aarti Deshmukh", role: "Admin in every office" }],
  },
  {
    group: "Central Stores",
    people: [
      { email: "stores.admin@plexus.demo", name: "Anil Joshi", role: "Admin" },
      { email: "stores.manager@plexus.demo", name: "Meena Kulkarni", role: "Manager" },
      { email: "stores.member@plexus.demo", name: "Pooja Gaikwad", role: "Member" },
    ],
  },
  {
    group: "Distribution",
    people: [
      { email: "dist.admin@plexus.demo", name: "Priya Nair", role: "Admin" },
      { email: "dist.manager@plexus.demo", name: "Rahul Patil", role: "Manager" },
      { email: "dist.member@plexus.demo", name: "Sunil Jadhav", role: "Member" },
    ],
  },
  {
    group: "Service Centre",
    people: [
      { email: "service.admin@plexus.demo", name: "Kavita Rao", role: "Admin" },
      { email: "service.manager@plexus.demo", name: "Anjali Joshi", role: "Manager" },
      { email: "service.member@plexus.demo", name: "Vikas Shinde", role: "Member" },
    ],
  },
]

const ALL_PEOPLE = SAMPLE_PEOPLE.flatMap((g) => g.people)

export function LoginPage() {
  const { user, login, ready, accessNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [busyAccount, setBusyAccount] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from
  const next = from && from !== "/login" ? from : "/"
  if (ready && user) return <Navigate to={next} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError("Please type your email and password.")
      return
    }
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** Google sign-in. Supabase sends the person to Google and back here; only people an admin has added can get in. */
  async function signInWithGoogle() {
    setError(null)
    setGoogleBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    })
    if (error) {
      setError(`Google sign-in is not available: ${error.message}`)
      setGoogleBusy(false)
    }
  }

  /** One click signs straight in as that account. */
  async function quickSignIn(a: Account) {
    setError(null)
    setEmail(a.email)
    setPassword(DEMO_PASSWORD)
    setBusyAccount(a.email)
    try {
      await login(a.email, DEMO_PASSWORD)
      toast.success(`Welcome, ${a.name}`)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyAccount(null)
    }
  }

  const disabled = busy || !!busyAccount || googleBusy

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <Logo size="lg" className="justify-center" />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Use your email and password.</CardDescription>
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
              {(error ?? accessNotice) && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>{error ?? accessNotice}</AlertTitle>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={disabled}>
                {busy && <Spinner />}
                Sign in
              </Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" className="w-full" disabled={disabled} onClick={signInWithGoogle}>
                {googleBusy ? <Spinner /> : (
                  <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
                    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
                    <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
                    <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.8V6.5H1.4a12 12 0 0 0 0 11l4-3.1Z" />
                    <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.5l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
                  </svg>
                )}
                Continue with Google
              </Button>
              <Link to="/forgot-password" state={{ email }} className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
                Forgot your password?
              </Link>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label htmlFor="sample">Just looking around? Sign in as a sample person</Label>
          <Select value="" disabled={disabled} onValueChange={(email) => quickSignIn(ALL_PEOPLE.find((p) => p.email === email)!)}>
            <SelectTrigger id="sample" className="w-full bg-card">
              {busyAccount ? <Spinner /> : null}
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {SAMPLE_PEOPLE.map((g) => (
                <SelectGroup key={g.group}>
                  <SelectLabel>{g.group}</SelectLabel>
                  {g.people.map((p) => (
                    <SelectItem key={p.email} value={p.email}>
                      {p.name} · {p.role}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Every sample person uses the password {DEMO_PASSWORD}.</p>
        </div>
      </div>
    </div>
  )
}
