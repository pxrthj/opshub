import { useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { AlertCircle, MailCheck } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Logo } from "@/components/Logo"
import { supabase } from "@/lib/supabase"
import { errorMessage } from "@/lib/useAsync"

// Forgot password with a one-time code. Supabase Auth creates the code and hands the email to the configured sender
// (the Minimoth hook). Step 1 asks for the email: if the sender refuses the message Supabase answers with an error, so
// getting to step 2 means the email system accepted it. Step 2 takes the code from the email plus a new password.

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? "")
  const [code, setCode] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cleanEmail = () => email.trim().toLowerCase().replace("@opshub.demo", "@plexus.demo")

  async function sendCode(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail())) return setError("Type a valid email address.")
    setBusy(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail())
      if (error) throw error
      setStep("code")
      toast.success("Code requested", { description: "If that address has an account, a code is on its way." })
    } catch (err) {
      setError(`The email could not be sent: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function saveNewPassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const token = code.replace(/\s/g, "")
    if (!/^\d{6,10}$/.test(token)) return setError("Type the numeric code from the email.")
    if (password.length < 6) return setError("Use at least 6 characters for the new password.")
    if (password !== confirm) return setError("The two passwords are different.")
    setBusy(true)
    try {
      const verified = await supabase.auth.verifyOtp({ email: cleanEmail(), token, type: "recovery" })
      if (verified.error) throw new Error(verified.error.message.toLowerCase().includes("expired") ? "That code has expired or was already used. Ask for a new one." : verified.error.message)
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success("Password changed. You are signed in.")
      navigate("/", { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <Logo size="lg" className="justify-center" />
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Forgot your password?</CardTitle>
            <CardDescription>{step === "email" ? "We will email you a one-time code." : `Enter the code we sent to ${cleanEmail()}.`}</CardDescription>
          </CardHeader>
          <CardContent>
            {step === "email" ? (
              <form onSubmit={sendCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-email">Email</Label>
                  <Input id="fp-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
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
              <form onSubmit={saveNewPassword} className="space-y-4">
                <Alert>
                  <MailCheck />
                  <AlertTitle>Check your email for the code.</AlertTitle>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="fp-code">One-time code</Label>
                  <Input id="fp-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fp-password">New password</Label>
                  <Input id="fp-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fp-confirm">Type it again</Label>
                  <Input id="fp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>{error}</AlertTitle>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Spinner />}
                  Save new password
                </Button>
                <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => sendCode()}>
                  Send a new code
                </Button>
              </form>
            )}
            <Link to="/login" className="mt-4 block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
