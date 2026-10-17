import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { useAuth } from "@/context/AuthContext"
import { errorMessage } from "@/lib/useAsync"

/** "My profile": change your own name, job title and password. Everything else about a login stays with Admins. */
export function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, refreshUser } = useAuth()
  const [name, setName] = useState(user?.name ?? "")
  const [title, setTitle] = useState(user?.title ?? "")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError("Name is required.")
    if (newPassword && newPassword.length < 6) return setError("Use at least 6 characters for the new password.")
    if (newPassword && !currentPassword) return setError("Type your current password to set a new one.")
    setBusy(true)
    try {
      await api.raw.put("/api/auth/me", { name, title, currentPassword, newPassword })
      await refreshUser()
      toast.success(newPassword ? "Profile and password updated" : "Profile updated")
      setCurrentPassword("")
      setNewPassword("")
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>My profile</DialogTitle>
            <DialogDescription>{user?.email}. Your roles are set by an Admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-title">Job title</Label>
            <Input id="profile-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-current">Current password</Label>
            <Input id="profile-current" type="password" autoComplete="current-password" placeholder="Only needed to change the password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-new">New password</Label>
            <Input id="profile-new" type="password" autoComplete="new-password" placeholder="Leave empty to keep it" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
