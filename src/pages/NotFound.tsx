import { Compass } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export function NotFound({ message = "We couldn't find that page.", backTo = "/", backLabel = "Back to home" }: { message?: string; backTo?: string; backLabel?: string }) {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Compass />
        </EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
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
