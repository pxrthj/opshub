import { ShieldX } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export function AccessDenied({
  title = "Access denied",
  message,
  backTo = "/",
  backLabel = "Back to hub",
}: {
  title?: string
  message: string
  backTo?: string
  backLabel?: string
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600 ring-8 ring-red-50/60">
          <ShieldX className="size-7" />
        </div>
        <p className="text-xs font-semibold tracking-widest text-red-600 uppercase">Error 403</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <Button asChild className="mt-6">
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  )
}
