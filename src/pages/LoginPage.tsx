import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
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
  const { user, login, ready } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [busyAccount, setBusyAccount] = useState<string | null>(null)
  const [sendingReset, setSendingReset] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  /** Emails a password-reset link. Supabase hands the email to the configured sender (the Minimoth hook), and answers
   *  with an error if that sender refuses it, so a success here means the email system accepted the message. */
  async function sendReset() {
    setError(null)
    if (!email.trim()) {
      setError("Type your email above first, then press “Forgot your password?”.")
      return
    }
    setSendingReset(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      toast.success("Reset email requested", { description: "If that address has an account, a link is on its way." })
    } catch (err) {
      setError(`The email could not be sent: ${errorMessage(err)}`)
    } finally {
      setSendingReset(false)
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

  const disabled = busy || !!busyAccount || sendingReset

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
              {error && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={disabled}>
                {busy && <Spinner />}
                Sign in
              </Button>
              <button type="button" onClick={sendReset} disabled={disabled} className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50">
                {sendingReset ? "Sending…" : "Forgot your password?"}
              </button>
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
