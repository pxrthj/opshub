// Splits the seed payload (scripts/export-seed.ts) into small SQL statements that rebuild it in demo_seed.
// Usage: node scripts/seed-to-sql.mjs seed.json outdir
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
const [, , input, outDir] = process.argv
const p = JSON.parse(readFileSync(input, "utf8"))
mkdirSync(outDir, { recursive: true })
const q = (v) => `$j$${JSON.stringify(v)}$j$::jsonb`
const parts = []
parts.push(`insert into public.demo_seed (id, payload) values (1, ${q({ generatedAt: p.generatedAt, users: p.users })});`)
const append = (key, items) =>
  `update public.demo_seed set payload = jsonb_set(payload, '{${key}}', coalesce(payload -> '${key}', '[]'::jsonb) || ${q(items)}) where id = 1;`
for (const s of p.sites) parts.push(append("sites", [s]))
parts.push(append("inventory", p.inventory))
parts.push(append("requests", p.requests.slice(0, 11)))
parts.push(append("requests", p.requests.slice(11)))
parts.push(append("assignments", p.assignments), append("consumption", p.consumption), append("returns", p.returns))
parts.push(append("repairs", p.repairs), append("audits", p.audits))
parts.push(append("cases", (p.cases ?? []).slice(0, 3)), append("cases", (p.cases ?? []).slice(3)))
parts.forEach((sql, i) => writeFileSync(`${outDir}/${String(i + 1).padStart(2, "0")}.sql`, sql + "\n"))
console.log(parts.map((s, i) => `${i + 1}: ${s.length}`).join("\n"))
