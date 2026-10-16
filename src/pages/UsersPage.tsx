import { useMemo, useState } from "react"
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
import { AccessDenied } from "@/components/AccessDenied"
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

  if (!hubLoading && !isAnyAdmin) return <AccessDenied message="User Management is only available to Admins." />

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
    if (!draft.name.trim()) return setFormError("Name is required")
    if (!draft.id && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.email.trim())) return setFormError("Enter a valid email")
    if (!draft.id && draft.password.length < 4) return setFormError("Password must be at least 4 characters")
    setBusy(true)
    try {
      if (draft.id) {
        await api.raw.put(`/api/hub/users/${draft.id}`, { name: draft.name, title: draft.title, password: draft.password || undefined, roles: draft.roles })
        toast.success(`Updated ${draft.name}`)
      } else {
        await api.raw.post("/api/hub/users", draft)
        toast.success(`Created ${draft.name}`, { description: `They can now sign in as ${draft.email}` })
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
        title="Users"
        description="Everyone who can sign in, and their access to each office."
        icon={<Users />}
        actions={
          <Button onClick={openNew}>
            <UserPlus /> Add user
          </Button>
        }
      />
      <div className="mb-4 flex items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-8" placeholder="Search name, email or title" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="text-sm text-slate-500">{filtered.length} users</span>
      </div>
      {loading && !users ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users match" description="Try a different search." />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Title</TableHead>
                {sites.map((s) => (
                  <TableHead key={s.config.siteId}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: s.config.theme.primary }} />
                      {s.config.name}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="pl-4">
                    <div className="font-medium text-slate-900">
                      {u.name} {u.id === user?.id && <span className="text-xs text-slate-400">(you)</span>}
                    </div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-slate-600">{u.title}</TableCell>
                  {sites.map((s) => {
                    const r = u.roles[s.config.siteId]
                    return (
                      <TableCell key={s.config.siteId}>
                        {r ? (
                          <Badge variant="outline" style={{ background: s.config.theme.accent, color: s.config.theme.primary, borderColor: s.config.theme.accent }}>
                            {r}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">No access</span>
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
            <DialogTitle>{draft?.id ? "Edit user" : "Add user"}</DialogTitle>
            <DialogDescription>Choose their access to each office.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name *</Label>
                  <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={draft.title} placeholder="e.g. Lineman" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email *</Label>
                  <Input value={draft.email} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>{draft.id ? "New password" : "Password *"}</Label>
                  <Input type="password" value={draft.password} placeholder={draft.id ? "Leave blank to keep" : ""} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Access per office</Label>
                {sites.map((s) => {
                  const id = s.config.siteId
                  const editable = adminOn(id)
                  return (
                    <div key={id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="size-2.5 rounded-full" style={{ background: s.config.theme.primary }} />
                        {s.config.name}
                      </span>
                      <Select
                        value={draft.roles[id] ?? NONE}
                        disabled={!editable}
                        onValueChange={(v) => setDraft({ ...draft, roles: { ...draft.roles, [id]: v === NONE ? null : (v as Role) } })}
                      >
                        <SelectTrigger className="w-44">
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
              {draft?.id ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
