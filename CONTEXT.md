# OpsHub (Plexus) — AI Context & Architecture Reference

This document serves as an exhaustive, technical context reference designed for AI models, coding agents, and developers to instantly understand the structure, architecture, domain logic, and patterns of this repository.

---

## 1. Executive Summary & Purpose

**OpsHub (Plexus)** is a multi-tenant, config-driven operations management platform prototype built for industrial/utility workflows (e.g., smart meter distribution, maintenance, repairs, and supply chain logistics).

### Core Highlights
- **Single Engine, Multiple Offices:** A single SPA codebase renders distinct "offices" (sites) such as *Central Stores*, *Distribution*, and *Service Centre*.
- **Config-Driven UI (`SiteConfig`):** Every office is defined completely by JSON metadata (`modules`, `pages`, `fields`, `roles`, `workflow`, and visual node layout). The UI dynamically renders menus, pages, dialogs, and tables from this configuration without hardcoded site routing.
- **Visual Module Builder:** Admins configure an office using an interactive node-and-edge visual graph builder (powered by React Flow). Modules have typed input/output ports and dependency rules.
- **Hierarchical Inter-Office Supply Chain:** Physical goods flow through a multi-tier hierarchy (*Central Stores ➔ Distribution ➔ Service Centre*). Strict role isolation guarantees that staff members only ever interact with their local site manager, who can review and route requisitions upstream.
- **Simulated In-Browser Backend:** All API operations, authentication, permissions, database persistence (`localStorage` key `opshub.db.v8`), and multi-step transactions run client-side with zero external server dependencies, while strictly mirroring backend REST semantics.

---

## 2. Tech Stack

- **Runtime & Build:** Node.js, Vite 8, TypeScript 6
- **Frontend Framework:** React 19, React Router v7 (`react-router-dom`)
- **Styling:** Tailwind CSS v4, Radix UI primitives (`radix-ui`), shadcn/ui components, Geist font family
- **Graph & Visualization:** `@xyflow/react` (React Flow), Recharts
- **Data & Documents:** ExcelJS (Excel import/export)
- **Linter:** `oxlint`

---

## 3. Architecture & Data Flow

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser Window                        │
│                                                             │
│  ┌───────────────────────┐       ┌───────────────────────┐  │
│  │       Hub Pages       │       │   Site Renderer       │  │
│  │ (Home, Builder, Users,│       │ (/s/:siteSlug/*)      │  │
│  │  Stock Trail, Catalog)│       │ Dynamic Sidebar/Pages │  │
│  └───────────┬───────────┘       └───────────┬───────────┘  │
│              │                               │              │
│              ▼                               ▼              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Contexts (AuthContext, SiteContext)          │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │      Client API Layer (src/api/client.ts & router.ts) │  │
│  │      - Route matching: /api/sites/:siteId/*, /api/hub │  │
│  │      - Multi-layer Auth & Permission Pipeline         │  │
│  │      - Atomic Transactions (src/api/transactions.ts)  │  │
│  └───────────────────────────┬───────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │       In-Memory DB + LocalStorage (opshub.db.v8)       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 In-Browser Backend & Route Execution Pipeline (`src/api/*`)
The application executes API calls via `siteApi` / `api` helpers. When a request hits `/api/sites/:siteId/*`:
1. **Authentication:** Verifies current session exists (`ctx.user`).
2. **Site Existence:** Checks `ctx.db.sites[siteId]`.
3. **Office Isolation (Authorization):** Checks that the user has an assigned `Role` in *that specific office* (unless global Admin). Users cannot access unauthorized offices.
4. **Role Threshold:** Verifies `roleAtLeast(userRole, requiredRole)`.
5. **Feature Flag Check:** Verifies that the targeted module is enabled in `site.live.modules`.
6. **Transaction Execution & Rollback:** Multi-entity operations run against a clone of the DB. If validation fails or stock is short, an error is thrown, the transaction is rolled back, and no storage mutations occur.

### 3.3 Atomic Material Allocation (`src/api/transactions.ts`)
When materials are issued:
- **Phase 1 (Validation):** Inspects stock for every requested item in the supplying warehouse. If any item has insufficient quantity, throws a `conflict` error listing exact shortages and terminates before modifying anything.
- **Phase 2 (Mutation):** Decrements `item.qty`, stamps `item.updatedAt`, creates an `Assignment` entity (`ASN-XX-###`), marks the `MaterialRequest` as `Assigned`, and registers the assignment in both destination and dispatching sites.

---

## 4. Supply Chain & Request Routing Logic

### 4.1 Hierarchy of Offices
- **Central Stores (`/s/central-stores`):** Primary upstream supplier holding raw stock, cables, meters, transformers.
- **Distribution (`/s/distribution`):** Obtains stock upstream from Central Stores (`stockSourceSiteId: "stores"`). Dispatches items to field technicians.
- **Service Centre (`/s/service-centre`):** Obtains stock upstream from Distribution (`stockSourceSiteId: "distribution"`). Repairs faulty meters and returns repaired units.

### 4.2 The "Members Never Contact Upstream" Rule
- **Staff (Member):** Submits a request for items or repairs. The request is strictly sent to the **local site manager** of their own office.
- **Local Site Manager:** Reviews the request.
  - If the requested items are stocked locally: Manager approves and issues items directly.
  - If items come from an upstream office (`stockSourceSiteId` is set): Manager clicks **"Send to (Upstream Office)"**. Until this step, the upstream office cannot see or act on the request.
- **Upstream Manager:** Once forwarded, the upstream office manager reviews the requisition, approves it, and dispatches materials (automatically decrementing upstream stock and issuing materials to the member).
- **Visual Progress:** Both the requester and managers track status through the `RequestRoute` component (`You ➔ Your Manager ➔ Supplying Office Manager`).

---

## 5. Module System & Visual Builder (`src/modules/*`, `src/builder/*`)

### 5.1 The 13 Pluggable Modules
| Module ID | Category | Port Inputs | Port Outputs | Requirements | Description |
|---|---|---|---|---|---|
| `auth` | Core | - | - | - | User login, session management & RBAC |
| `users` | Core | - | - | - | User & role management per office |
| `shell` | Core | - | - | - | Overview dashboard & navigation layout |
| `inventory` | Stores | - | `stock` | - | Stock management, low-stock warnings, reorder thresholds |
| `request` | Workflow | - | `request` | - | Requisition creation for items & meter repairs |
| `approval` | Workflow | `request` | `approved` | `request` | Manager review, rejection comments, inter-office forwarding |
| `assignment` | Workflow | `approved`, `stock` | `assignment` | `approval`, `inventory` | Atomic material issuance and inventory deduction |
| `assignment-frontend`| Field | `assignment` | - | `assignment` | "My Items" page for field staff |
| `consumption` | Field | `assignment` | `usage` | `assignment` | Field material consumption tracking by location |
| `returns` | Field | `assignment`, `repair` | `stock-return`| `assignment` or `pcb-repair` | Return unused items or refurbished meters to stock |
| `pcb-repair` | Service | `approved` | `repair` | `approval` | Meter diagnostic, fault tracking, repair lifecycle |
| `analytics` | Insights | `stock`, `usage` | - | `inventory` | Stock distribution and requisition velocity charts |
| `reports` | Insights | `stock` | - | `inventory` | Excel stock export and bulk template import |

### 5.2 Visual Flow Builder (`src/builder/*`)
- **Node-Edge Graph:** React Flow canvas displaying installed modules as interactive nodes with input/output connection handles.
- **Validation Engine:** Enforces port compatibility (e.g., `stock` connects to `stock`, `request` connects to `request`) and checks that prerequisite modules exist.
- **Draft & Snapshot Versioning:** Changes are drafted on the canvas. Clicking **"Make Live"** creates a numbered version snapshot (`DeployHistoryPage.tsx`) allowing instant rollbacks.

---

## 6. Directory Layout & File Roles

```
d:\genesis26'\
├── public/                 # Static assets (Plexus logos, icons)
├── src/
│   ├── api/                # Simulated backend engine
│   │   ├── db.ts           # DB schema, initialization, localStorage persistence
│   │   ├── router.ts       # URL pattern matching & HTTP dispatcher
│   │   ├── transactions.ts # Multi-step atomic stock allocations
│   │   └── routes/         # Handlers: site.ts (office operations), hub.ts (global), builder.ts
│   ├── builder/            # Visual configuration canvas (React Flow)
│   │   ├── BuilderPage.tsx # Main canvas and drag-and-drop orchestration
│   │   ├── ModuleNode.tsx  # Node card representation with handles
│   │   ├── SettingsPanel.tsx# Module settings & connection linking inspector
│   │   └── FieldEditor.tsx # Custom schema field editor for dynamic forms
│   ├── components/         # Shared UI components
│   │   ├── ui/             # shadcn/ui primitives (button, dialog, table, card, etc.)
│   │   ├── RequestRoute.tsx# Multi-step requisition route tracker
│   │   ├── NotificationsBell.tsx # Role-prioritized notification center
│   │   └── TopBar.tsx      # Global office switcher, profile, breadcrumb navigation
│   ├── context/            # Global React contexts
│   │   ├── AuthContext.tsx # User session, login/logout, active role resolution
│   │   ├── HubContext.tsx  # Central hub state & global site list
│   │   └── SiteContext.tsx # Active office config, site-scoped API client, permissions
│   ├── data/               # Seed data (`seed.ts` with mock users, offices, stock items)
│   ├── lib/                # Shared utilities and domain logic
│   │   ├── types.ts        # Comprehensive TypeScript types & interfaces
│   │   ├── requestFlow.ts  # State machine for inter-site request routing & permissions
│   │   ├── formula.ts      # Safe AST formula evaluator for computed fields (e.g. qty * unitPrice)
│   │   ├── fields.ts       # Dynamic field validation & value normalization
│   │   └── excel.ts        # ExcelJS workbook generation & parsing
│   ├── modules/            # Pluggable feature modules
│   │   ├── definitions.ts  # Module metadata, categories, ports, default fields
│   │   ├── registry.ts     # Map of ModuleId to lazy React page components
│   │   └── pages/          # Individual module views (Inventory, Requests, Approvals, Repairs...)
│   ├── pages/              # Hub-level views (HubHome, GoodsMovementPage, UsersPage, LoginPage)
│   ├── renderer/           # Dynamic site interpretation
│   │   ├── SiteRenderer.tsx# Resolves active site config into routes and layouts
│   │   ├── SiteSidebar.tsx # Dynamically generates navigation links from enabled modules
│   │   └── DynamicForm.tsx # Renders form inputs from FieldDef specifications
│   ├── App.tsx             # Root router setup (`/`, `/login`, `/s/:siteSlug/*`, `/builder/:siteId`)
│   └── index.css           # Tailwind CSS v4 styling & color token definitions
```

---

## 7. Role-Based Access Control (RBAC)

Roles exist on an ascending hierarchy:
$$\text{Public} < \text{Member} < \text{Manager} < \text{Admin}$$

Roles are configured **per office** in `User.roles: Record<string, Role>`:
- **Public:** Can view the office overview (if public).
- **Member:** Can submit requests, log consumption, return items, record meter repair steps, view assigned materials.
- **Manager:** Can approve/reject requests, forward requisitions to upstream offices, dispatch inventory, manage stock levels, download Excel reports.
- **Admin:** Full control over office settings, team member roles, visual builder canvas, deploying revisions, uploading bulk Excel data.
- **Global Admin (`admin@plexus.demo`):** Has Admin authority across all offices and access to Hub-level configuration.

---

## 8. Development & Common Commands

```powershell
# Install dependencies
npm install

# Start Vite dev server (runs on http://localhost:5173)
npm run dev

# Full TypeScript check and production bundle build
npm run build

# Run fast code linter (Oxlint)
npm run lint
```

---

## 9. Key Conventions for AI Assistance

When proposing or generating code for this repository, adhere strictly to these patterns:

1. **Client API Calls:** Always use `siteApi.get/post/put/delete` inside office modules (via `useSite()`) or `api` from `src/api/client.ts` for hub-level operations.
2. **Design System & Styling:** Use Tailwind CSS utility classes and `shadcn/ui` components from `@/components/ui/*`. Maintain the neutral palette and standard text scale (12px, 14px, 16px, 24px) using `text-xs`, `text-sm`, `text-base`, `text-2xl`.
3. **No Unsafe Evaluations:** Never use `eval()` or `Function()` for calculated expressions; use the safe formula parser in `@/lib/formula`.
4. **Preserve Atomic Transactions:** When modifying stock or requisition status, ensure state updates go through `@/api/transactions.ts` or follow the two-phase check-then-commit pattern.
5. **Office Isolation:** Do not hardcode office IDs or bypass `originSiteId`/`targetSiteId` checks. Multi-site routing must respect `requestFlow.ts`.
