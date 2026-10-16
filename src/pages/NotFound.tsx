import { Compass } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"

export function NotFound({ message = "We couldn't find that page.", backTo = "/", backLabel = "Back to hub" }: { message?: string; backTo?: string; backLabel?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Compass className="size-7" />
        </div>
        <p className="text-xs font-semibold tracking-widest text-slate-500 uppercase">Error 404</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <Button asChild className="mt-6">
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  )
}
