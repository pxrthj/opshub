import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertCircle, MailCheck } from "lucide-react"
import { toast } from "sonner"
import { api, ApiError } from "@/api"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Logo } from "@/components/Logo"
import { useAuth } from "@/context/AuthContext"
import { supabase } from "@/lib/supabase"
import { errorMessage } from "@/lib/useAsync"

// Sign in with a one-time code sent by email or text message (Supabase Auth). Only people an admin has already added can
// get in: Supabase is asked NOT to create new accounts, and a login with no OpsHub profile is signed out again.

type Channel = "email" | "phone"
const RESEND_SECONDS = 60

/** +919876543210 form. A plain 10-digit number is taken as an Indian mobile. */
function normalizePhone(raw: string): string | null {
  const t = raw.replace(/[\s\-().]/g, "")
  const withPlus = /^\d{10}$/.test(t) ? `+91${t}` : /^91\d{10}$/.test(t) ? `+${t}` : t
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null
}

function friendly(message: string, channel: Channel) {
  const m = message.toLowerCase()
  if (m.includes("signups not allowed") || m.includes("user not found")) return `That ${channel === "email" ? "email" : "number"} is not registered. Ask an admin to add it.`
  if (m.includes("rate limit") || m.includes("after") && m.includes("seconds")) return "Too many codes requested. Wait a minute, then try once more."
  if (m.includes("unsupported phone provider") || m.includes("sms") && m.includes("provider")) return "Text-message sign-in is not set up yet."
  if (m.includes("expired") || m.includes("invalid")) return "That code is wrong or has expired. Ask for a new one."
  return message
}

export function CodeLoginPage() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [channel, setChannel] = useState<Channel>("email")
  const [step, setStep] = useState<"to" | "code">("to")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const target = channel === "email" ? email.trim().toLowerCase() : normalizePhone(phone)

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!target) return setError(channel === "email" ? "Type your email address." : "Type your mobile number, for example +91 98765 43210.")
    if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return setError("Type a valid email address.")
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithOtp(
        channel === "email" ? { email: target, options: { shouldCreateUser: false } } : { phone: target, options: { shouldCreateUser: false } },
      )
      if (error) throw error
      setStep("code")
      setWait(RESEND_SECONDS)
      toast.success("Code requested", { description: "If that is a registered address, it is on its way." })
    } catch (err) {
      setError(friendly(errorMessage(err), channel))
    } finally {
      setBusy(false)
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const token = code.replace(/\s/g, "")
    if (!/^\d{4,10}$/.test(token)) return setError("Type the numeric code you received.")
    setBusy(true)
    try {
      const { error } = await supabase.auth.verifyOtp(
        channel === "email" ? { email: target!, token, type: "email" } : { phone: target!, token, type: "sms" },
      )
      if (error) throw error
      try {
        await api.raw.get("/api/auth/me") // signed in with Supabase, but is this person set up in OpsHub?
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          await supabase.auth.signOut()
          throw new Error("This account is not registered in OpsHub yet. Ask an admin to add you.")
        }
        throw err
      }
      await refreshUser()
      toast.success("Signed in")
      navigate("/", { replace: true })
    } catch (err) {
      setError(friendly(errorMessage(err), channel))
    } finally {
      setBusy(false)
    }
  }

  function switchChannel(next: Channel) {
    setChannel(next)
    setStep("to")
    setCode("")
    setError(null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <Logo size="lg" className="justify-center" />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sign in with a code</CardTitle>
            <CardDescription>
              {step === "to" ? "We will send a one-time code. No password needed." : `Enter the code we sent to ${channel === "email" ? target : phone}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === "to" && (
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1 text-sm">
                {(["email", "phone"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => switchChannel(c)}
                    className={`rounded-md px-3 py-1.5 font-medium transition ${channel === c ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  >
                    {c === "email" ? "Email" : "Mobile"}
                  </button>
                ))}
              </div>
            )}

            {step === "to" ? (
              <form onSubmit={sendCode} className="space-y-4">
                {channel === "email" ? (
                  <div className="space-y-2">
                    <Label htmlFor="code-email">Email</Label>
                    <Input id="code-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="code-phone">Mobile number</Label>
                    <Input id="code-phone" type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                )}
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>{error}</AlertTitle>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Spinner />}
                  Send code
                </Button>
              </form>
            ) : (
              <form onSubmit={verify} className="space-y-4">
                <Alert>
                  <MailCheck />
                  <AlertTitle>Check your {channel === "email" ? "email" : "messages"} for the code.</AlertTitle>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="code-value">One-time code</Label>
                  <Input id="code-value" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
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
                <Button type="button" variant="ghost" className="w-full" disabled={busy || wait > 0} onClick={() => sendCode()}>
                  {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
                </Button>
                <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => { setStep("to"); setCode(""); setError(null) }}>
                  Use a different {channel === "email" ? "email" : "number"}
                </Button>
              </form>
            )}
            <Link to="/login" className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
              Back to password sign-in
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
