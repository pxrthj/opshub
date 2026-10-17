import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertCircle } from "lucide-react"
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

/** Where the link in the reset email lands. Supabase signs the person in with a short-lived session; here they pick a new password. */
export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) return setError("Use at least 6 characters.")
    if (password !== confirm) return setError("The two passwords are different.")
    setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session) throw new Error("This link has expired. Ask for a new reset email from the sign-in page.")
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      toast.success("Password changed")
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
            <CardTitle className="text-xl">Choose a new password</CardTitle>
            <CardDescription>You opened the link from your reset email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Type it again</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>{error}</AlertTitle>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Spinner />}
                Save password
              </Button>
              <Link to="/login" className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
