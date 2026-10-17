import { useState } from "react"
import { toast } from "sonner"
import { UserPlus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { Spinner } from "@/components/ui/spinner"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import { useSite } from "@/context/SiteContext"
import { ROLES, ROLE_DESCRIPTIONS } from "@/lib/roles"
import type { Role, SiteMember } from "@/lib/types"
import { errorMessage, toastError, useAsync } from "@/lib/useAsync"

const NONE = "__none__"

/** User Management module, scoped to this site: change who has which role here. */
export function TeamPage() {
  const { config, siteApi, changeTick, notifyChange } = useSite()
  const { user } = useAuth()
  const { bumpData } = useHub()
  const { data, loading, reload } = useAsync(() => siteApi.get<SiteMember[]>("members"), [changeTick])
  const [busy, setBusy] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [title, setTitle] = useState("")
  const [password, setPassword] = useState("demo123")
  const [role, setRole] = useState<Role>("Member")
  const [adding, setAdding] = useState(false)

  const members = (data ?? []).sort((a, b) => Number(!!b.role) - Number(!!a.role) || a.user.name.localeCompare(b.user.name))

  async function change(m: SiteMember, value: string) {
    const nextRole = value === NONE ? null : (value as Role)
    setBusy(m.user.id)
    try {
      await siteApi.put(`members/${m.user.id}`, { role: nextRole })
      toast.success(nextRole ? `${m.user.name} is now a ${nextRole} in ${config.name}` : `${m.user.name} can no longer open ${config.name}`)
      reload()
      bumpData()
      notifyChange()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  async function submitAdd() {
    if (!name.trim()) return toast.error("Name is required")
    if (!email.trim() || !email.includes("@")) return toast.error("A valid email is required")
    setAdding(true)
    try {
      const res = await siteApi.post<{ user: { name: string }; role: Role }>("members", {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        title: title.trim() || "Staff",
        password,
        role,
      })
      toast.success(`${res.user.name} was added to ${config.name} as a ${res.role}`)
      setAddOpen(false)
      setName("")
      setEmail("")
      setTitle("")
      setPassword("demo123")
      setRole("Member")
      reload()
      bumpData()
      notifyChange()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="People"
        icon={<Users />}
        description={`Team members and role assignments for ${config.name}.`}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus /> Add person to office
          </Button>
        }
      />
      {loading && !data ? (
        <TableSkeleton />
      ) : members.length === 0 ? (
        <EmptyState icon={Users} title="No team members yet" description="Add someone to this office using the button above." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Person</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className="w-56">Role on {config.name}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.user.id} className={m.role ? undefined : "opacity-70"}>
                  <TableCell className="pl-4">
                    <div className="font-medium">
                      {m.user.name} {m.user.id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.user.email}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.user.title}</TableCell>
                  <TableCell>
                    <Select value={m.role ?? NONE} onValueChange={(v) => change(m, v)} disabled={busy === m.user.id || m.user.id === user?.id}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>No access</SelectItem>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r} <span className="text-xs text-muted-foreground">— {ROLE_DESCRIPTIONS[r]}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add person to {config.name}</DialogTitle>
            <DialogDescription>Assign a team member to this office.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input placeholder="e.g. staff@plexus.demo" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Job Title</Label>
              <Input placeholder="e.g. Technician, Field Assistant" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Role on {config.name}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r} <span className="text-xs text-muted-foreground">— {ROLE_DESCRIPTIONS[r]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={adding}>
              {adding && <Spinner />} Add to office
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
