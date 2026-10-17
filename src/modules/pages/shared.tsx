import { useState } from "react"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "sonner"
import { AlertCircle } from "lucide-react"
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
  // share of the material that is used up or given back
  const done = assigned ? Math.min(100, ((used + returned) / assigned) * 100) : 0
  return <Progress value={done} className="h-2" title={`Used ${used}, given back ${returned}, out of ${assigned}`} />
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

  // Start with a clean form each time the dialog opens.
  const openKey = open ? `${initial?.assignmentId ?? ""}|${initial?.itemId ?? ""}` : ""
  const [seenKey, setSeenKey] = useState("")
  if (openKey !== seenKey) {
    setSeenKey(openKey)
    if (open) {
      setAssignmentId(initial?.assignmentId ?? "")
      setItemId(initial?.itemId ?? "")
      setQty("")
      setLocation("")
      setError(null)
    }
  }

  const usable = assignments.filter((a) => a.lines.some((l) => l.remaining > 0))
  const a = assignments.find((x) => x.id === assignmentId)
  const line = a?.lines.find((l) => l.itemId === itemId)

  async function submit() {
    setError(null)
    if (!a) return setError("Pick what was given out.")
    if (!line) return setError("Pick an item.")
    const n = Number(qty)
    if (!Number.isInteger(n) || n <= 0) return setError("Type a whole number, like 5.")
    if (n > line.remaining) return setError(`Only ${line.remaining} ${line.unit} left. Type ${line.remaining} or less.`)
    if (mode === "usage" && !location.trim()) return setError(`${locationField?.label ?? "Location"} is required`)
    setBusy(true)
    try {
      if (mode === "usage") {
        await siteApi.post("consumption", { assignmentId: a.id, itemId: line.itemId, qty: n, location })
        toast.success(`Written down: ${n} ${line.unit} of ${line.itemName} used`, { description: `${line.remaining - n} ${line.unit} left` })
      } else {
        const res = await siteApi.post<{ stockSiteName: string }>("returns", { source: "assignment", refId: a.id, itemId: line.itemId, qty: n })
        toast.success(`Gave back ${n} ${line.unit} of ${line.itemName}`, { description: `Stock in ${res.stockSiteName} went up by ${n}.` })
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
          <DialogTitle>{mode === "usage" ? "Write down what was used" : "Give back unused items"}</DialogTitle>
          <DialogDescription>
            {mode === "usage" ? "Say how much you really used." : "Unused items go straight back into stock."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>What you were given</Label>
            <Select
              value={assignmentId || undefined}
              onValueChange={(v) => {
                setAssignmentId(v)
                setItemId("")
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={usable.length ? "Pick one" : "Nothing left"} />
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
                <SelectValue placeholder="Pick an item" />
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
            <div className="grid grid-cols-4 gap-2 rounded-lg bg-muted/50 p-3 text-center text-xs">
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
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where was it used?" />
              </div>
            )}
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Spinner />}
            {mode === "usage" ? "Save" : "Give back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
