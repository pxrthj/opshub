import { useState, type FormEvent } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, RotateCcw } from "lucide-react"
import { toast } from "sonner"
import { resetDb } from "@/api/db"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/context/AuthContext"
import { DEMO_PASSWORD } from "@/data/seed"
import { errorMessage } from "@/lib/useAsync"

interface Account {
  email: string
  name: string
  note?: string
}

const LEVELS = ["Admin", "Manager", "Member"] as const

// One row per office, one sign-in per level. Every account uses the same password.
const OFFICE_ACCOUNTS: { office: string; people: Account[] }[] = [
  {
    office: "Central Stores",
    people: [
      { email: "stores.admin@plexus.demo", name: "Anil Joshi" },
      { email: "stores.manager@plexus.demo", name: "Meena Kulkarni" },
      { email: "stores.member@plexus.demo", name: "Pooja Gaikwad" },
    ],
  },
  {
    office: "Distribution",
    people: [
      { email: "dist.admin@plexus.demo", name: "Priya Nair" },
      { email: "dist.manager@plexus.demo", name: "Rahul Patil" },
      { email: "dist.member@plexus.demo", name: "Sunil Jadhav" },
    ],
  },
  {
    office: "Service Centre",
    people: [
      { email: "service.admin@plexus.demo", name: "Kavita Rao" },
      { email: "service.manager@plexus.demo", name: "Anjali Joshi" },
      { email: "service.member@plexus.demo", name: "Vikas Shinde" },
    ],
  },
]

// People who work across more than one office.
const SPECIAL_ACCOUNTS: Account[] = [
  { email: "admin@plexus.demo", name: "Aarti Deshmukh", note: "Admin · all offices" },
  { email: "ganesh@plexus.demo", name: "Ganesh More", note: "Member · Distribution + Service Centre" },
  { email: "logistics@plexus.demo", name: "Suresh Pawar", note: "Member · Central Stores + Distribution" },
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
  const next = from && from !== "/login" ? from : "/"
  if (ready && user) return <Navigate to={next} replace />

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
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
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
      toast.success(`Signed in as ${a.name}`)
      navigate(next, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusyAccount(null)
    }
  }

  function handleReset() {
    resetDb()
    setError(null)
    toast.success("Data reset to the starting sample data")
  }

  const disabled = busy || !!busyAccount
  const accountButton = (a: Account, label: string) => (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-auto px-2 py-1 font-normal whitespace-normal"
      disabled={disabled}
      onClick={() => quickSignIn(a)}
      title={a.email}
    >
      {busyAccount === a.email && <Spinner />}
      {label}
    </Button>
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <Logo size="lg" className="justify-center" />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Multi-site operations for the electricity utility</CardDescription>
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
            </form>
          </CardContent>
        </Card>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Sample accounts — click a name to sign in</p>
            <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs text-muted-foreground" onClick={handleReset}>
              <RotateCcw /> Reset data
            </Button>
          </div>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Office</TableHead>
                  {LEVELS.map((l) => (
                    <TableHead key={l}>{l}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {OFFICE_ACCOUNTS.map((row) => (
                  <TableRow key={row.office}>
                    <TableCell className="pl-4 font-medium">{row.office}</TableCell>
                    {row.people.map((p) => (
                      <TableCell key={p.email} className="px-1">
                        {accountButton(p, p.name.split(" ")[0])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Card className="gap-0 py-1">
            {SPECIAL_ACCOUNTS.map((a) => (
              <div key={a.email} className="flex items-center justify-between gap-3 px-2">
                {accountButton(a, a.name)}
                <span className="pr-2 text-xs text-muted-foreground">{a.note}</span>
              </div>
            ))}
          </Card>
          <p className="text-xs text-muted-foreground">Password for every account: {DEMO_PASSWORD}</p>
        </div>
      </div>
    </div>
  )
}
