# OpsHub — one platform, many business sites

Frontend-only clickable prototype built for a hackathon. One codebase runs several business **sites**
for the fictional utility **MahaPower Utility (Demo)**. An Admin builds each site by dragging modules
onto a canvas; every site has its own theme, pages, workflow and data.

| Unit | URL | Theme | Live modules (v1) |
|---|---|---|---|
| Central Stores | `/s/central-stores` | deep blue | Inventory → Analytics, Reports |
| Service Centre | `/s/service-centre` | orange | Request → Approval → PCB Repair → Returns |
| Distribution | `/s/distribution` | green | Request → Approval → Material Assignment (+ linked Inventory) → My Materials, Consumption |

There is **no backend**. All data is mock data in the browser (React state + `localStorage`, key `opshub.db.v2`),
so it survives a refresh. Use **user menu → Reset data** to restore the seed.

## How to run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

Stack: React 19 + Vite + TypeScript, Tailwind CSS v4 + shadcn/ui, React Router, React Flow (`@xyflow/react`),
Recharts, ExcelJS (in-browser), lucide-react. State is React Context + `useState` only.

## Sample accounts (also on the login page — click to fill)

| Email | Password | Roles (per site) |
|---|---|---|
| admin@opshub.demo | admin123 | Admin on all 3 units |
| engineer@opshub.demo | eng123 | Manager on Distribution + Service Centre |
| lineman@opshub.demo | line123 | Member on Distribution only |
| storekeeper@opshub.demo | store123 | Manager on Central Stores only |
| clerk@opshub.demo | clerk123 | Member on Central Stores (extra — shows the Member view of Reports) |

Roles: Public < Member < Manager < Admin. Roles are **per site**; no role on a site = no access.

## Demo script

1. **Log in as admin.** The site switcher (top bar) lists all 3 units; the home page shows a short "Waiting for you" list (approvals, low stock, repairs) and one big card per office.
2. **Switch Service Centre ↔ Central Stores.** Colours, sidebar style, corner radius, menus, pages and data all change — it is the same renderer reading a different config.
3. **Builder:** Hub → Distribution → *Builder* (`/builder/ds-003`).
   - Drag **Return Management** from the palette onto the canvas. It turns red (requirements missing) and *Save/Publish are blocked*.
   - Try connecting *Inventory → Return Management*: blocked with a toast explaining why.
   - Connect *Material Assignment → Return Management* (drag from the right handle to the left handle).
   - **Preview** → the site renders from the draft under a "Preview mode" banner with a new **Returns** menu.
   - **Back to builder → Publish** → v2 is live. Open the site: Returns is there.
   - **History → Rollback** on v1 → Returns disappears again (`/s/distribution/returns` shows "not enabled").
4. **Workflow + all-or-nothing stock:**
   - Log in as **lineman** → Distribution → Requests → *New request*: 20 × Single Phase Smart Meter.
   - Log in as **engineer** → Distribution → Approvals → *Approve & assign*. Central Stores stock drops **500 → 480** (visible in Distribution's linked Inventory page, or as admin in Central Stores) and an assignment appears under Assignments / My Materials.
   - Raise a request for e.g. 600 meters and approve it: you get a clear "Insufficient stock — nothing was changed" error; stock, request status and assignments are untouched.
5. **Excel:** Central Stores → Reports. Export works for Manager/Admin (storekeeper/admin). As **clerk** (Member) the buttons are disabled with a tooltip. **Import** (Admin only): choose an `.xlsx` (e.g. the export you just downloaded, edited) → preview table with New/Update/Error per row → confirm.
6. **Isolation:** log in as **lineman**. The switcher shows only Distribution. Typing `/s/central-stores` or `/builder/ds-003` shows **Access denied**; so does `/s/distribution/approvals` (needs Manager).

## Architecture

```
src/
  api/          mock REST API (router, db, session, transactions, routes/*)
  modules/      registry.ts (the 13 modules) + definitions.ts (metadata) + pages/* (module pages)
  renderer/     SiteRenderer (the ONE generic renderer), SiteSidebar, DynamicForm
  builder/      React Flow canvas, custom node, settings panel, field editor, presets, deploy history
  pages/        hub-level pages: login, hub, users, module catalogue, builder index, 404
  components/   shared UI (top bar, site switcher, dialogs, badges) + components/ui (shadcn)
  context/      AuthContext, HubContext, SiteContext
  data/         seed.ts
  lib/          types, theme → CSS vars, safe formula parser, field validation, site-config helpers, Excel
```

### 1. Config-driven sites
Every site is one JSON object: `{ siteId, slug, name, theme, modules, pages, roles, fields, workflow, canvas }`.
`SiteRenderer` draws any site from its config: `theme` → CSS variables, `pages` → sidebar + routes, each page's
`moduleId` → component from `modules/registry.ts`. There is no per-site code. `pages` is derived from `modules`
(`lib/siteConfig.ts › derivePages`), so adding a module to a config makes its menu item and page appear.

**The canvas is the source of truth**: on save/publish, `buildConfigFromCanvas` derives `modules` (+ pages, roles,
default fields) from the nodes on the canvas.

### 2. Mock API (`src/api`)
All data access goes through async functions that mimic REST routes and are dispatched by a tiny Express-style router
with a 200 ms artificial delay:

```ts
api.get(siteId, "requests")                    // GET    /api/:siteId/requests
api.post(siteId, "requests", body)             // POST   /api/:siteId/requests
api.post(siteId, `requests/${id}/approve`)     // POST   /api/:siteId/requests/:id/approve
api.put(siteId, `inventory/${id}`, body)       // PUT    /api/:siteId/inventory/:id
api.del(siteId, `inventory/${id}`)             // DELETE /api/:siteId/inventory/:id
```

For every `/api/:siteId/*` route the router checks, before the handler runs:
1. the session user exists (401), 2. the site exists (404), 3. **the user holds a role on that siteId** (403 — site_id isolation),
4. the role is ≥ the route's `minRole` (403), 5. the route's module is enabled on that site (403).
Data is stored keyed by `siteId` (`db.data[siteId].inventory`, …). Every write runs inside `withTransaction`
(work on a copy, commit only if nothing threw).

**Mapping to a future Express backend** — each `register({ method, path, minRole, module, handler })` becomes:

```ts
app[method](path, requireAuth, requireSiteRole(minRole), requireModule(module), handler)
// e.g. app.post("/api/:siteId/requests/:id/approve", requireAuth, requireSiteRole("Manager"), requireModule("approval"), approve)
```

and `dispatch()` in `src/api/router.ts` is replaced by `fetch(url, { method, body, credentials: "include" })`.
The UI does not change. Hub routes: `/api/auth/login|logout|me`, `/api/hub/sites|users|resolve/:key|reset`.

### 3. All-or-nothing material assignment
`api/transactions.ts › assignMaterialTransaction` validates **every** line against stock first; if anything is short it throws
409 and nothing is touched. Only then does it decrement stock, create the assignment and mark the request Assigned.
It is commented with the exact Postgres `BEGIN … SELECT … FOR UPDATE … COMMIT` it maps to.

Distribution has no store of its own: its **Inventory** node is configured with *Stock source = Central Stores*
(builder → Inventory node → Workflow options). Approvals in Distribution therefore issue from Central Stores, and
Distribution's Inventory page is a read-only linked view. Service Centre returns repaired meters to Central Stores the same way.

### 4. Themes
`lib/theme.ts` turns `{ primary, accent, background, radius, sidebar }` into shadcn CSS variables
(`--primary`, `--background`, `--accent`, `--radius`, `--sidebar*`, `--chart-*`) applied to `<html>` while inside a site,
so dialogs, menus and toasts are themed too.

### 5. Builder
Palette (drag or ＋) → React Flow canvas with typed ports (`stock`, `request`, `approved`, `assignment`, …) → settings panel.
Invalid edges are blocked with an explanatory toast; nodes whose requirements are missing or not connected upstream are red and
block Save/Preview/Publish. Settings: per-module fields (text, number, select, date, calculated), workflow options, site name & theme.
Calculated fields use `lib/formula.ts`, a tokenizer + recursive-descent parser supporting `+ - * /`, parentheses, numbers and field
names only — **no `eval`/`new Function`**. Publish creates v1, v2, v3…; **Deploy History** lists versions + activity and can roll back.

## The 13 modules

1 Authentication & RBAC (core) · 2 User Management (core) · 3 Dashboard Shell/Nav/Forms (core) · 4 Inventory · 5 Request ·
6 Approval (needs Request) · 7 Material Assignment (needs Approval + Inventory) · 8 Assignment Frontend (needs Material Assignment) ·
9 Consumption Tracking (needs Material Assignment) · 10 Return Management (needs Material Assignment **or** PCB Repair) ·
11 PCB Repair (needs Approval) · 12 Analytics Dashboard (needs Inventory) · 13 Reports with Excel (needs Inventory).

## Notes / limits of the prototype
- Passwords are compared in plain text against mock users (demo only). Session is a `localStorage` entry standing in for a cookie.
- Responsive down to laptop width (≥1024 px); the site sidebar hides below 768 px.
- All company names and data are fictional.
