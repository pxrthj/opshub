import { useState } from "react"
import { BarChart3, Table2 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/PageHeader"
import { useSite } from "@/context/SiteContext"
import { mix } from "@/lib/theme"
import type { AnalyticsData } from "@/lib/types"
import { useAsync } from "@/lib/useAsync"
import { formatINR } from "@/lib/utils"

/** Second-series colour picked to stay distinguishable (incl. colour-blind) from the site's primary. */
function secondSeries(primaryHex: string) {
  const n = parseInt(primaryHex.replace("#", ""), 16)
  const r = (n >> 16) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  if (max !== min) {
    const d = max - min
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  if (h >= 190 && h < 290) return "#d97706" // blue/indigo -> amber
  if (h >= 80 && h < 190) return "#7c3aed" // green/teal -> violet
  return "#2563eb" // warm -> blue
}

const AXIS = { fontSize: 12, fill: "#64748b" }
const GRID = "#e2e8f0"

function ChartCard({ title, description, children, table }: { title: string; description?: string; children: React.ReactNode; table: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false)
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
          {asTable ? <BarChart3 /> : <Table2 />} {asTable ? "Chart" : "Table"}
        </Button>
      </CardHeader>
      <CardContent>{asTable ? <div className="max-h-72 overflow-auto">{table}</div> : <div className="h-72">{children}</div>}</CardContent>
    </Card>
  )
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((h, i) => (
            <TableHead key={h} className={i ? "text-right" : undefined}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j} className={j ? "text-right tabular-nums" : undefined}>
                {c}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function AnalyticsPage() {
  const { config, siteApi, changeTick } = useSite()
  const { data, loading } = useAsync(() => siteApi.get<AnalyticsData>("analytics"), [changeTick])
  const colorA = mix(config.theme.primary, "#ffffff", 0.1)
  const colorB = secondSeries(config.theme.primary)

  return (
    <div>
      <PageHeader
        title="Charts"
        icon={<BarChart3 />}
        description="This office's numbers at a glance."
      />
      {loading && !data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-96 rounded-lg" />
          ))}
        </div>
      ) : data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard
            title="Stock by category"
            description={`Units on hand · ${data.stockSourceName}`}
            table={<SimpleTable head={["Category", "Qty", "Value"]} rows={data.stockByCategory.map((c) => [c.category, c.qty.toLocaleString("en-IN"), formatINR(c.value)])} />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.stockByCategory} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="category" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => v.toLocaleString("en-IN")} />
                <Tooltip
                  cursor={{ fill: "rgba(100,116,139,0.08)" }}
                  formatter={(v, _n, item) => [`${Number(v).toLocaleString("en-IN")} units · ${formatINR((item.payload as { value: number }).value)}`, "On hand"]}
                />
                <Bar isAnimationActive={false} dataKey="qty" name="Qty on hand" fill={colorA} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title={data.timeline.title}
            description="Last 6 weeks"
            table={<SimpleTable head={["Week of", data.timeline.seriesA, data.timeline.seriesB]} rows={data.timeline.points.map((p) => [p.label, p.a, p.b])} />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.timeline.points} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                <Tooltip />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                <Line isAnimationActive={false} type="monotone" dataKey="a" name={data.timeline.seriesA} stroke={colorA} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} />
                <Line isAnimationActive={false} type="monotone" dataKey="b" name={data.timeline.seriesB} stroke={colorB} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title={data.statusSplit.title}
            description="Current counts"
            table={<SimpleTable head={["Status", "Count"]} rows={data.statusSplit.data.map((d) => [d.name, d.value])} />}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.statusSplit.data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={90} />
                <Tooltip cursor={{ fill: "rgba(100,116,139,0.08)" }} />
                <Bar isAnimationActive={false} dataKey="value" name="Count" fill={colorA} radius={[0, 4, 4, 0]} maxBarSize={32} label={{ position: "right", fontSize: 12, fill: "#334155" }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card>
            <CardHeader>
              <CardTitle>Key figures</CardTitle>
              <CardDescription>From this office's data</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                ["Categories", data.stockByCategory.length],
                ["Units on hand", data.stockByCategory.reduce((s, c) => s + c.qty, 0).toLocaleString("en-IN")],
                ["Stock value", formatINR(data.stockByCategory.reduce((s, c) => s + c.value, 0))],
                [data.timeline.seriesA + " (6 wks)", data.timeline.points.reduce((s, p) => s + p.a, 0)],
                [data.timeline.seriesB + " (6 wks)", data.timeline.points.reduce((s, p) => s + p.b, 0)],
                [data.statusSplit.data[0]?.name ?? "—", data.statusSplit.data[0]?.value ?? 0],
              ].map(([k, v]) => (
                <Card key={String(k)} size="sm" className="gap-1 px-3">
                  <CardDescription className="text-xs">{k}</CardDescription>
                  <p className="text-xl font-semibold tabular-nums">{v}</p>
                </Card>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
