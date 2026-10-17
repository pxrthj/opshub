# OpsHub (Plexus) — one app, many offices

A clickable prototype for a hackathon, set up for **Electrolyte Solutions** (Navi Mumbai), an ISO 9001 L3/L4 PCB
repair and refurbishment company that repairs boards for OEM clients and runs onsite field service. One codebase runs
several **offices** (sites). Each office has its own menu, pages and data, and all of them are drawn by the same code
from a JSON setup, in one shared look. An Admin sets an office up by dragging features onto a board.

| Office | Address | Features switched on |
|---|---|---|
| Component Stores | `/s/component-stores` | Stock, Approvals, Charts, Excel files, Audit log |
| PCB Repair Lab | `/s/pcb-repair-lab` | Requests, Approvals, PCB repairs, Giving out, My items, Usage, Returns |
| Field Service | `/s/field-service` | Requests, Approvals, Giving out, My items, Usage, Returns, Audit log |

The data and sign-in live in **Supabase** (Postgres + Auth), and the site is served as a static app (Vercel). Everyone
signs in with an email and password. What a person can read is limited by row-level security, and every change goes
through server functions that re-check the person's role, their office and the stock rules.

- Database: `supabase/migrations` (tables, security rules, `api_*` functions). Sample data: `supabase/seed`.
- Privileged actions (create a login, change a role, delete stock): the `admin-ops` edge function in `supabase/functions`.
- `supabase/pending` holds SQL that is not installed yet (see the header of that file).
- The app points at the project in `src/lib/supabase.ts`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to use another.
- Deploy: import the repo in Vercel (Vite preset, `npm run build`, output `dist`). `vercel.json` handles page refreshes.
- Regenerate the sample data after changing `src/data/seed.ts`: `npx tsx scripts/export-seed.ts > seed.json`, then `node scripts/seed-to-sql.mjs seed.json out/`.
- `npx tsx scripts/route-smoke.ts seed.json` runs the read routes against stubbed Supabase rows (no network).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run lint
```

Stack: React 19, Vite, TypeScript, Tailwind 4 + shadcn/ui, React Router, React Flow, Recharts, ExcelJS.

## Sample people (click a name on the sign-in page). Password for everyone: `demo123`

| Office | Admin | Manager | Member |
|---|---|---|---|
| Component Stores | stores.admin | stores.manager | stores.member |
| PCB Repair Lab | lab.admin | lab.manager | lab.member |
| Field Service | field.admin | field.manager | field.member |

Also: `admin@plexus.demo` is an Admin in every office; `ganesh@plexus.demo` and `logistics@plexus.demo` work in two
offices each. (All addresses end in `@plexus.demo`. The old `dist.*` and `service.*` addresses still sign in.)

Roles, lowest to highest: **Public, Member, Manager, Admin**. Roles are per office. No role in an office means no access.

- **Member**: asks for things, writes down what was used, gives items back.
- **Manager**: says yes or no to requests, changes stock, downloads Excel.
- **Admin**: also edits offices, manages people, uploads Excel.

## Screens, in plain words

| Menu name | What it is |
|---|---|
| Home | Your to-do list and one card per office |
| Stock trail (Admins) | Follow each request from asked to used or given back; download to Excel |
| Features (Admins) | The list of everything an office can switch on |
| Edit offices (Admins) | The board where you add features, link them, preview and make a version live |
| People (Admins) | Who can sign in and what they can do in each office |

Inside an office: Overview, Stock, Requests, Decide on requests, Give out, My items, What was used, Giving back,
PCB repairs, Charts, Excel files, People (only what is switched on and allowed for you is shown).

## Demo script

1. Sign in as `admin@plexus.demo`. The switcher at the top lists all three offices. Open each one: different look, menu and data.
2. **Edit offices → Field Service.** Drag **Charts** onto the board and link it after **Stock Inventory**. Linked features show what they need in the right-hand panel (use *Link this to another feature*, or drag from one box to the other).
   Press **Preview**, then **Make live**. A **Charts** page now appears. **History → Go back to this** on version 1 removes it again.
3. **Ask, send on, decide, give out** (see "How offices talk to each other" below).
   `field.member` asks for 20 fan capacitors. Only `field.manager` sees it. `field.manager` opens *Approvals* and clicks **Send to Component Stores**. Now `stores.manager` sees it under *Approvals* and clicks **Approve and give out**. Component Stores stock drops by 20 and the technician sees the items under *My items*. Asking for more than is in stock fails and nothing changes.
4. **Use and give back.** As `field.member`, write down 15 used at a customer and give 5 back.
5. **Repairs.** `lab.member` sends in a faulty board, `lab.manager` approves, `lab.member` marks it Fixed and returns it to spares stock. Stock goes up by one.
6. **Excel.** `stores.manager` can download. `stores.member` has the buttons switched off. `stores.admin` can also load a stock list (with a preview first).
7. **Privacy between offices.** Sign in as `field.member`. Only Field Service is listed, and the other offices' addresses say "You can't open this".

## How offices talk to each other

Both the PCB Repair Lab and Field Service take their stock from **Component Stores** (the "Take stock from" setting of each office).
Requests follow one rule: **members never contact another office. Managers do.**

1. A member asks. The request goes to **their own office's managers only**.
2. If the stock lives in another office, their manager clicks **Send to (that office)**, with an optional message. Until then the other office cannot see the request at all.
3. A manager of the supplying office decides. Approving gives the items out and lowers *that* office's stock in one step. If there is not enough, nothing changes.
4. The member sees the status move: *With your manager → With Component Stores → Given out*.

Details: their own manager can also **turn it down** before sending it on; after it is sent on only the supplying office can decide; an office that is not the asker or the supplier cannot see or change the request. Repairs and requests for an office's own stock never leave the office.

## How it is built

```
src/
  api/          pretend server in the browser: router, db, session, transactions, routes/*
  modules/      registry.ts (the 13 features) + definitions.ts (names, needs, fields) + pages/*
  renderer/     SiteRenderer (the one generic page builder), SiteSidebar, DynamicForm
  builder/      React Flow board, box component, side panel, field editor, templates, history page
  pages/        hub pages: sign-in, home, people, features list, edit-offices list, stock trail, 404
  components/   shared pieces (top bar, notification bell, dialogs, badges) and components/ui (shadcn)
  context/      AuthContext, HubContext, SiteContext
  data/         seed.ts (sample data)
  lib/          types, safe formula parser, field checks, format helpers, Excel
```

- **Config-driven.** An office is `{ siteId, slug, name, modules, pages, roles, fields, workflow, canvas }`.
  `SiteRenderer` turns that into the menu and the pages. The board is the source of truth: saving derives the
  features, pages and default fields from the boxes on it.
- **Every call is checked.** For `/api/:siteId/*` the pretend server checks, in order: signed in, office exists, the person
  has a role in *that* office (this is the office-to-office isolation), role is high enough, feature is switched on.
- **All or nothing.** Giving out stock checks every line first, then lowers stock and creates the record in one step. If
  anything is short, nothing changes (`api/transactions.ts`, with the matching SQL in a comment).
- **Safe formulas.** Calculated fields (like `qty * unitPrice`) go through a small parser in `lib/formula.ts`. No `eval`.
- **Look.** Every office and every Hub page share one neutral look and one font (Geist) with a small text scale (12, 14, 16 and 24 px). Only three status colours carry meaning: amber = waiting, green = good, red = a problem.
- **Versions.** Making a version live saves a numbered snapshot. History lists them and can go back to any one.

## Limits of this prototype

- Passwords are plain text and the "session" is a `localStorage` entry. Demo only.
- Works down to laptop width (1024 px); the office menu hides below 768 px.
- All company names, people and data are made up.
