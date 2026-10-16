import { useState } from "react"
import { toast } from "sonner"
import { Users } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/PageHeader"
import { TableSkeleton } from "@/components/TableSkeleton"
import { useAuth } from "@/context/AuthContext"
import { useHub } from "@/context/HubContext"
import { useSite } from "@/context/SiteContext"
import { ROLES, ROLE_DESCRIPTIONS } from "@/lib/roles"
import type { Role, SiteMember } from "@/lib/types"
import { toastError, useAsync } from "@/lib/useAsync"

const NONE = "__none__"

/** User Management module, scoped to this site: change who has which role here. */
export function TeamPage() {
  const { config, siteApi, changeTick } = useSite()
  const { user } = useAuth()
  const { bumpData } = useHub()
  const { data, loading, reload } = useAsync(() => siteApi.get<SiteMember[]>("members"), [changeTick])
  const [busy, setBusy] = useState<string | null>(null)
  const members = (data ?? []).sort((a, b) => Number(!!b.role) - Number(!!a.role) || a.user.name.localeCompare(b.user.name))

  async function change(m: SiteMember, value: string) {
    const role = value === NONE ? null : (value as Role)
    setBusy(m.user.id)
    try {
      await siteApi.put(`members/${m.user.id}`, { role })
      toast.success(role ? `${m.user.name} is now ${role} on ${config.name}` : `Removed ${m.user.name} from ${config.name}`)
      reload()
      bumpData()
    } catch (e) {
      toastError(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader title="Team" icon={<Users />} description={`Roles are per site. Changes here only affect ${config.name}.`} />
      {loading && !data ? (
        <TableSkeleton />
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="pl-4">User</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-64">Role on {config.name}</TableHead>
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
                      <SelectTrigger className="w-56">
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
    </div>
  )
}
