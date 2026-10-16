import { ShieldX } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export function AccessDenied({
  title = "Access denied",
  message,
  backTo = "/",
  backLabel = "Back to home",
}: {
  title?: string
  message: string
  backTo?: string
  backLabel?: string
}) {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-red-50 text-red-600">
          <ShieldX />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
