import { useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/**
 * Controlled confirm dialog. onConfirm may be async; the dialog shows a spinner and
 * closes only when it resolves (return false or throw to keep it open).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  onConfirm,
  children,
  confirmDisabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<unknown> | unknown
  children?: ReactNode
  confirmDisabled?: boolean
}) {
  const [busy, setBusy] = useState(false)
  async function handle() {
    setBusy(true)
    try {
      const ok = await onConfirm()
      if (ok !== false) onOpenChange(false)
    } catch {
      // caller already toasted the error; keep the dialog open
    } finally {
      setBusy(false)
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription asChild>
              <div>{description}</div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} onClick={handle} disabled={busy || confirmDisabled}>
            {busy && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
