import { Link } from "react-router-dom"
import { ClipboardList, HardHat } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/EmptyState"
import { PageHeader } from "@/components/PageHeader"
import { CardsSkeleton } from "@/components/TableSkeleton"
import { useSite } from "@/context/SiteContext"
import type { Assignment } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { formatDate } from "@/lib/utils"

/** Assignment Frontend: the material that has been handed to the signed-in person. */
export function MyMaterialsPage() {
  const { config, siteApi, changeTick, basePath } = useSite()
  const { data, loading } = useAsync(() => siteApi.get<Assignment[]>("assignments", { scope: "mine" }), [changeTick])

  return (
    <div>
      <PageHeader
        title="My material"
        icon={<HardHat />}
        description="Material handed to you."
        actions={
          config.modules.includes("request") && (
            <Button variant="outline" asChild>
              <Link to={`${basePath}/requests`}>
                <ClipboardList /> Ask for more
              </Link>
            </Button>
          )
        }
      />
      {loading && !data ? (
        <CardsSkeleton count={2} />
      ) : !data?.length ? (
        <EmptyState icon={HardHat} title="Nothing handed to you yet" description="It shows up here once your request is approved." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle>{a.requestCode}</CardTitle>
                <CardDescription>
                  Handed over on {formatDate(a.createdAt)} by {a.createdBy}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {a.lines.map((l) => (
                      <TableRow key={l.itemId}>
                        <TableCell>{l.itemName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {l.qty.toLocaleString("en-IN")} {l.unit}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
