# OpsHub (Plexus) — one app, many offices

A clickable prototype for a hackathon. One codebase runs several **offices** (sites) for a made-up business
group. Each office has its own colours, menu, pages and data, and all of them are drawn by the same code from a
JSON setup. An Admin sets an office up by dragging features onto a board.

| Office | Address | Look | Features switched on |
|---|---|---|---|
| Central Stores | `/s/central-stores` | blue | Stock, Charts, Excel files |
| Service Centre | `/s/service-centre` | orange | Requests, Approvals, Meter repairs, Giving back |
| Distribution | `/s/distribution` | green | Requests, Approvals, Giving out, My items, Usage |

There is **no backend** in this folder. Data lives in the browser (`localStorage`, key `opshub.db.v7`) and survives a
refresh. Use **your name (top right) → Start over with sample data** to restore it. The real backend version of this
app lives in the separate `plexus` folder.

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
| Central Stores | stores.admin | stores.manager | stores.member |
| Distribution | dist.admin | dist.manager | dist.member |
| Service Centre | service.admin | service.manager | service.member |

Also: `admin@plexus.demo` is an Admin in every office; `ganesh@plexus.demo` and `logistics@plexus.demo` work in two
offices each. (All addresses end in `@plexus.demo`.)

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
Meter repairs, Charts, Excel files, People (only what is switched on and allowed for you is shown).

## Demo script

1. Sign in as `admin@plexus.demo`. The switcher at the top lists all three offices. Open each one: different look, menu and data.
2. **Edit offices → Distribution.** Drag **Stock Returns** onto the board. It shows a red "needs" message until you link it after **Giving Out Stock** (use *Link this to another feature* in the right-hand panel, or drag from one box to the other).
   Press **Preview**, then **Make live**. A **Giving back** page now appears. **History → Go back to this** on version 1 removes it again.
3. **Ask, send on, decide, give out** (see "How offices talk to each other" below).
   `dist.member` asks for 20 of an item. Only `dist.manager` sees it. `dist.manager` opens *Approvals* and clicks **Send to Central Stores**. Now `stores.manager` sees it under *Approvals* and clicks **Approve and give out**. Central Stores stock drops by 20 and the member sees the items under *My items*. Asking for more than is in stock fails and nothing changes.
4. **Use and give back.** As `dist.member`, write down 15 used and give 5 back.
5. **Repairs.** `service.member` sends in a meter, `service.manager` approves, `service.member` marks it Fixed and gives it back. Stock goes up by one.
6. **Excel.** `stores.manager` can download. `stores.member` has the buttons switched off. `stores.admin` can also load a stock list (with a preview first).
7. **Privacy between offices.** Sign in as `dist.member`. Only Distribution is listed, and the other offices' addresses say "You can't open this".

## How offices talk to each other

Offices get stock from each other in a chain: **Central Stores → Distribution → Service Centre** (the "Take stock from" setting of each office).
Requests follow one rule: **members never contact another office. Managers do.**

1. A member asks. The request goes to **their own office's managers only**.
2. If the stock lives in another office, their manager clicks **Send to (that office)**, with an optional message. Until then the other office cannot see the request at all.
3. A manager of the supplying office decides. Approving gives the items out and lowers *that* office's stock in one step. If there is not enough, nothing changes.
4. The member sees the status move: *With your manager → With Central Stores → Given out*.

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
  lib/          types, theme → CSS variables, safe formula parser, field checks, format helpers, Excel
```

- **Config-driven.** An office is `{ siteId, slug, name, theme, modules, pages, roles, fields, workflow, canvas }`.
  `SiteRenderer` turns that into the theme, the menu and the pages. The board is the source of truth: saving derives the
  features, pages and default fields from the boxes on it.
- **Every call is checked.** For `/api/:siteId/*` the pretend server checks, in order: signed in, office exists, the person
  has a role in *that* office (this is the office-to-office isolation), role is high enough, feature is switched on.
- **All or nothing.** Giving out stock checks every line first, then lowers stock and creates the record in one step. If
  anything is short, nothing changes (`api/transactions.ts`, with the matching SQL in a comment).
- **Safe formulas.** Calculated fields (like `qty * unitPrice`) go through a small parser in `lib/formula.ts`. No `eval`.
- **Look.** The Hub uses plain shadcn neutral colours. Each office overrides colours, corner roundness and menu style from
  its own theme. Only three status colours carry meaning: amber = waiting, green = good, red = a problem.
- **Versions.** Making a version live saves a numbered snapshot. History lists them and can go back to any one.

## Limits of this prototype

- Passwords are plain text and the "session" is a `localStorage` entry. Demo only.
- Works down to laptop width (1024 px); the office menu hides below 768 px.
- All company names, people and data are made up.
