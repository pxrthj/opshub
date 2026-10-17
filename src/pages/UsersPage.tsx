import { useMemo, useState } from "react"
import { Navigate } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { Pencil, Search, UserPlus, Users, AlertCircle } from "lucide-react"
import { api } from "@/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import { ROLES, ROLE_DESCRIPTIONS } from "@/lib/roles"
import type { PublicUser, Role } from "@/lib/types"
import { errorMessage, toastError, useAsync } from "@/lib/useAsync"

type Draft = { id?: string; name: string; email: string; title: string; password: string; roles: Record<string, Role | null> }

const NONE = "__none__"

export function UsersPage() {
  const { user, refreshUser } = useAuth()
  const { sites, isAnyAdmin, bumpData, loading: hubLoading } = useHub()
  const { data: users, loading, reload } = useAsync(() => (isAnyAdmin ? api.raw.get<PublicUser[]>("/api/hub/users") : Promise.resolve([])), [isAnyAdmin])
  const [q, setQ] = useState("")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      (users ?? []).filter((u) =>
        [u.name, u.email, u.title].join(" ").toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [users, q],
  )

  if (!hubLoading && !isAnyAdmin) return <Navigate to="/" replace />

  const adminOn = (siteId: string) => user?.roles[siteId] === "Admin"

  function openNew() {
    setFormError(null)
    setDraft({ name: "", email: "", title: "", password: "", roles: {} })
  }
  function openEdit(u: PublicUser) {
    setFormError(null)
    setDraft({ id: u.id, name: u.name, email: u.email, title: u.title, password: "", roles: { ...u.roles } })
  }

  async function save() {
    if (!draft) return
    setFormError(null)
    if (!draft.name.trim()) return setFormError("Please type a name.")
    if (!draft.id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) return setFormError("Please type a real email address.")
    if (!draft.id && draft.password.length < 4) return setFormError("The password needs at least 4 characters.")
    setBusy(true)
    try {
      if (draft.id) {
        await api.raw.put(`/api/hub/users/${draft.id}`, { name: draft.name, title: draft.title, password: draft.password || undefined, roles: draft.roles })
        toast.success(`${draft.name} was updated`)
      } else {
        await api.raw.post("/api/hub/users", draft)
        toast.success(`${draft.name} was added`, { description: `They can sign in with ${draft.email}` })
      }
      setDraft(null)
      reload()
      if (draft.id === user?.id) refreshUser()
      bumpData()
    } catch (e) {
      setFormError(errorMessage(e))
      toastError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="People"
        description="Everyone who can sign in, and what they can do in each office."
        icon={<Users />}
        actions={
          <Button onClick={openNew}>
            <UserPlus /> Add user
          </Button>
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, email or job" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} users</span>
      </div>
      {loading && !users ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No one found" description="Try a different search." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Person</TableHead>
                <TableHead>Job</TableHead>
                {sites.map((s) => (
                  <TableHead key={s.config.siteId}>
                    {s.config.name}
                  </TableHead>
                ))}
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4">
                    <div className="font-medium text-foreground">
                      {u.name} {u.id === user?.id && <span className="text-xs text-muted-foreground">(you)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.title}</TableCell>
                  {sites.map((s) => {
                    const r = u.roles[s.config.siteId]
                    return (
                      <TableCell key={s.config.siteId}>
                        {r ? (
                          <Badge variant="secondary">
                            {r}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No access</span>
                        )}
                      </TableCell>
                    )
                  })}
                  <TableCell>
                    <Button size="icon-sm" variant="ghost" onClick={() => openEdit(u)} aria-label={`Edit ${u.name}`}>
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && !busy && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Change this person" : "Add a person"}</DialogTitle>
            <DialogDescription>Choose what they can do in each office.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Job</Label>
                  <Input value={draft.title} placeholder="For example: Storekeeper" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input value={draft.email} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{draft.id ? "New password" : "Password *"}</Label>
                  <Input type="password" value={draft.password} placeholder={draft.id ? "Leave empty to keep the old one" : ""} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>What they can do in each office</Label>
                {sites.map((s) => {
                  const id = s.config.siteId
                  const editable = adminOn(id)
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                      <span className="text-sm font-medium">{s.config.name}</span>
                      <Select
                        value={draft.roles[id] ?? NONE}
                        disabled={!editable}
                        onValueChange={(v) => setDraft({ ...draft, roles: { ...draft.roles, [id]: v === NONE ? null : (v as Role) } })}
                      >
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
                    </div>
                  )
                })}
              </div>
              {formError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>{formError}</AlertTitle>
            </Alert>
          )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Spinner />}
              {draft?.id ? "Save" : "Add person"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
