import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSite } from "@/context/SiteContext"
import { fieldsFor } from "@/lib/siteConfig"
import type { AssignmentView } from "@/lib/types"
import { errorMessage } from "@/lib/useAsync"
import { cn } from "@/lib/utils"

export function ProgressLine({ assigned, used, returned }: { assigned: number; used: number; returned: number }) {
  const u = assigned ? (used / assigned) * 100 : 0
  const r = assigned ? (returned / assigned) * 100 : 0
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{ width: `${u}%` }} title={`Used ${used}`} />
      <div className="h-full bg-violet-400" style={{ width: `${r}%` }} title={`Returned ${returned}`} />
    </div>
  )
}

/** Record consumption or a return against an assignment line. */
export function AssignmentActionDialog({
  mode,
  open,
  onOpenChange,
  assignments,
  initial,
  onDone,
}: {
  mode: "usage" | "return"
  open: boolean
  onOpenChange: (o: boolean) => void
  assignments: AssignmentView[]
  initial?: { assignmentId?: string; itemId?: string }
  onDone: () => void
}) {
  const { config, siteApi } = useSite()
  const [assignmentId, setAssignmentId] = useState("")
  const [itemId, setItemId] = useState("")
  const [qty, setQty] = useState("")
  const [location, setLocation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const locationField = fieldsFor(config, "consumption").find((f) => f.key === "location")

  useEffect(() => {
    if (open) {
      setAssignmentId(initial?.assignmentId ?? "")
      setItemId(initial?.itemId ?? "")
      setQty("")
      setLocation("")
      setError(null)
    }
  }, [open, initial?.assignmentId, initial?.itemId])

  const usable = assignments.filter((a) => a.lines.some((l) => l.remaining > 0))
  const a = assignments.find((x) => x.id === assignmentId)
  const line = a?.lines.find((l) => l.itemId === itemId)

  async function submit() {
    setError(null)
    if (!a) return setError("Choose an assignment")
    if (!line) return setError("Choose an item")
    const n = Number(qty)
    if (!Number.isInteger(n) || n <= 0) return setError("Enter a positive whole number")
    if (n > line.remaining) return setError(`Only ${line.remaining} ${line.unit} remaining`)
    if (mode === "usage" && !location.trim()) return setError(`${locationField?.label ?? "Location"} is required`)
    setBusy(true)
    try {
      if (mode === "usage") {
        await siteApi.post("consumption", { assignmentId: a.id, itemId: line.itemId, qty: n, location })
        toast.success(`Recorded ${n} ${line.unit} of ${line.itemName} used`, { description: `Remaining: ${line.remaining - n} ${line.unit}` })
      } else {
        const res = await siteApi.post<{ stockSiteName: string }>("returns", { source: "assignment", refId: a.id, itemId: line.itemId, qty: n })
        toast.success(`Returned ${n} ${line.unit} of ${line.itemName}`, { description: `Stock in ${res.stockSiteName} went up by ${n}.` })
      }
      onOpenChange(false)
      onDone()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "usage" ? "Record usage" : "Return unused material"}</DialogTitle>
          <DialogDescription>
            {mode === "usage" ? "Log how much of the issued material was actually used." : "Unused items go back into stock immediately."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Assignment</Label>
            <Select
              value={assignmentId || undefined}
              onValueChange={(v) => {
                setAssignmentId(v)
                setItemId("")
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={usable.length ? "Choose assignment" : "Nothing left to record"} />
              </SelectTrigger>
              <SelectContent>
                {usable.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.code} · {x.assigneeName} · {x.requestCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select value={itemId || undefined} onValueChange={setItemId} disabled={!a}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose item" />
              </SelectTrigger>
              <SelectContent>
                {a?.lines.map((l) => (
                  <SelectItem key={l.itemId} value={l.itemId} disabled={l.remaining <= 0}>
                    {l.itemName} · {l.remaining} {l.unit} remaining
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {line && (
            <div className="grid grid-cols-4 gap-2 rounded-[var(--radius)] bg-muted/50 p-3 text-center text-xs">
              {[
                ["Assigned", line.qty],
                ["Used", line.used],
                ["Returned", line.returned],
                ["Remaining", line.remaining],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-muted-foreground">{k}</p>
                  <p className={cn("text-base font-semibold tabular-nums", k === "Remaining" && "text-primary")}>{v}</p>
                </div>
              ))}
            </div>
          )}
          <div className={cn("grid gap-4", mode === "usage" && "sm:grid-cols-2")}>
            <div className="space-y-1.5">
              <Label>Quantity {mode === "usage" ? "used" : "returned"}</Label>
              <Input type="number" min={1} max={line?.remaining} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            {mode === "usage" && (
              <div className="space-y-1.5">
                <Label>{locationField?.label ?? "Site / Location"}</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Saswad – Ward 3" />
              </div>
            )}
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {mode === "usage" ? "Record usage" : "Return to stock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
