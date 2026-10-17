-- OpsHub schema: offices (sites), people, stock, requests and everything that hangs off them.
-- Every operational row carries a site_id. Row-level security limits what a signed-in person can read
-- to the offices where they hold a role; ALL writes go through the api_* functions (next migration),
-- which re-check role, office and stock rules on the server.

-- ---------------------------------------------------------------- offices

create table public.sites (
  id text primary key,
  slug text not null unique,
  name text not null,
  live jsonb not null,                         -- the live SiteConfig
  live_version int not null default 1,
  draft jsonb,                                 -- unpublished SiteConfig from the builder
  draft_saved_at timestamptz,
  draft_saved_by text,
  created_at timestamptz not null default now()
);

create table public.site_versions (
  site_id text not null references public.sites(id) on delete cascade,
  version int not null,
  config jsonb not null,
  published_at timestamptz not null default now(),
  author text not null,
  summary text not null default '',
  primary key (site_id, version)
);

create table public.site_events (
  id text primary key,
  site_id text not null references public.sites(id) on delete cascade,
  action text not null check (action in ('publish', 'rollback')),
  version int not null,
  from_version int not null,
  at timestamptz not null default now(),
  author text not null,
  note text not null default ''
);
create index site_events_site_idx on public.site_events (site_id, at desc);

-- ---------------------------------------------------------------- people

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_id text unique,                       -- id used by the original prototype (u_store, ...)
  email text not null unique,
  name text not null,
  title text not null default 'Staff',
  created_at timestamptz not null default now()
);

create table public.site_members (
  site_id text not null references public.sites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('Public', 'Member', 'Manager', 'Admin')),
  primary key (site_id, user_id)
);
create index site_members_user_idx on public.site_members (user_id);

-- ---------------------------------------------------------------- stock & workflow

create table public.inventory_items (
  id text primary key,
  site_id text not null references public.sites(id) on delete cascade,
  name text not null,
  category text not null,
  unit text not null,
  qty int not null check (qty >= 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  reorder_level int not null check (reorder_level >= 0),
  custom jsonb not null default '{}',          -- extra fields added in the builder
  updated_at timestamptz not null default now()
);
create unique index inventory_items_name_idx on public.inventory_items (site_id, lower(name));

create table public.requests (
  id text primary key,
  code text not null,
  type text not null check (type in ('material', 'repair')),
  site_id text not null references public.sites(id) on delete cascade,        -- the office that asked
  target_site_id text references public.sites(id) on delete cascade,          -- the office that supplies (material)
  lines jsonb not null default '[]',
  repair jsonb,
  purpose text not null default '',
  priority text not null default 'Normal',
  requested_by uuid not null references public.profiles(id),
  requested_by_name text not null,
  created_at timestamptz not null default now(),
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected', 'Assigned')),
  decision_comment text,
  decided_by text,
  decided_at timestamptz,
  assignment_id text,
  repair_job_id text,
  forwarded_at timestamptz,
  forwarded_by text,
  forward_note text,
  custom jsonb not null default '{}'
);
create index requests_site_idx on public.requests (site_id, created_at desc);
create index requests_target_idx on public.requests (target_site_id) where forwarded_at is not null;
create index requests_user_idx on public.requests (requested_by);

create table public.assignments (
  id text primary key,
  code text not null,
  site_id text not null references public.sites(id) on delete cascade,        -- office that holds the manifest
  stock_site_id text not null references public.sites(id) on delete cascade,  -- office whose stock was issued
  request_id text not null,
  request_code text not null,
  assignee_id uuid not null references public.profiles(id),
  assignee_name text not null,
  lines jsonb not null default '[]',
  created_at timestamptz not null default now(),
  created_by text not null
);
create index assignments_site_idx on public.assignments (site_id);
create index assignments_stock_idx on public.assignments (stock_site_id);
create index assignments_assignee_idx on public.assignments (assignee_id);

create table public.consumption (
  id text primary key,
  site_id text not null references public.sites(id) on delete cascade,
  assignment_id text not null,
  item_id text not null,
  item_name text not null,
  qty int not null check (qty > 0),
  location text not null,
  date timestamptz not null default now(),
  recorded_by text not null
);
create index consumption_assignment_idx on public.consumption (assignment_id);
create index consumption_site_idx on public.consumption (site_id);

create table public.returns (
  id text primary key,
  site_id text not null references public.sites(id) on delete cascade,
  source text not null check (source in ('assignment', 'repair')),
  ref_id text not null,
  ref_code text not null,
  item_id text not null,
  item_name text not null,
  qty int not null check (qty > 0),
  condition text not null check (condition in ('Unused', 'Repaired')),
  stock_site_id text not null references public.sites(id) on delete cascade,
  date timestamptz not null default now(),
  returned_by text not null
);
create index returns_site_idx on public.returns (site_id);
create index returns_ref_idx on public.returns (ref_id);

create table public.repairs (
  id text primary key,
  site_id text not null references public.sites(id) on delete cascade,
  code text not null,
  meter_id text not null,
  meter_type text not null,
  fault text not null,
  technician text not null default '',
  parts_used text not null default '',
  status text not null default 'Received' check (status in ('Received', 'In Repair', 'Fixed', 'Scrapped')),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  request_id text,
  returned boolean not null default false,
  custom jsonb not null default '{}'
);
create index repairs_site_idx on public.repairs (site_id);

create table public.product_audits (
  id text primary key,
  site_id text not null references public.sites(id) on delete cascade,        -- the office that owns the stock
  item_id text not null,
  item_name text not null,
  category text not null,
  unit text not null,
  field text not null,
  change_type text not null check (change_type in ('price', 'quantity', 'threshold', 'create', 'dispatch', 'return', 'delete')),
  old_value jsonb,
  new_value jsonb,
  diff text,
  reason text not null default '',
  ref_code text,
  actor_id uuid,
  actor_name text not null,
  actor_role text not null,
  at timestamptz not null default now()
);
create index product_audits_site_idx on public.product_audits (site_id, at desc);

-- Holds the sample data (generated from src/data/seed.ts); reset_demo_data() loads it.
create table public.demo_seed (
  id int primary key check (id = 1),
  payload jsonb not null
);

-- ---------------------------------------------------------------- role helpers (used by policies)

create function public.role_rank(r text) returns int
language sql immutable as $$
  select case r when 'Admin' then 3 when 'Manager' then 2 when 'Member' then 1 else 0 end
$$;

create function public.my_role(p_site text) returns text
language sql stable security definer set search_path = public as $$
  select role from site_members where site_id = p_site and user_id = auth.uid()
$$;

create function public.has_role(p_site text, p_min text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(role_rank(my_role(p_site)) >= role_rank(p_min), false)
$$;

create function public.is_any_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from site_members where user_id = auth.uid() and role = 'Admin')
$$;

-- May the caller read the stock held by p_site? Yes if they hold the role there, or in an office
-- that takes its stock from p_site (a Distribution member browses Central Stores' stock list).
create function public.stock_readable(p_site text, p_min text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from site_members m
    join sites s on s.id = m.site_id
    where m.user_id = auth.uid()
      and role_rank(m.role) >= role_rank(p_min)
      and (s.id = p_site or s.live -> 'workflow' ->> 'stockSourceSiteId' = p_site)
  )
$$;

create function public.owns_assignment(p_assignment text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from assignments where id = p_assignment and assignee_id = auth.uid())
$$;

-- ---------------------------------------------------------------- row-level security (read only)

alter table public.sites enable row level security;
alter table public.site_versions enable row level security;
alter table public.site_events enable row level security;
alter table public.profiles enable row level security;
alter table public.site_members enable row level security;
alter table public.inventory_items enable row level security;
alter table public.requests enable row level security;
alter table public.assignments enable row level security;
alter table public.consumption enable row level security;
alter table public.returns enable row level security;
alter table public.repairs enable row level security;
alter table public.product_audits enable row level security;
alter table public.demo_seed enable row level security;   -- no policies: nobody reads it through the API

create policy sites_read on public.sites for select to authenticated
  using (public.has_role(id, 'Member'));
create policy site_versions_read on public.site_versions for select to authenticated
  using (public.has_role(site_id, 'Admin'));
create policy site_events_read on public.site_events for select to authenticated
  using (public.has_role(site_id, 'Admin'));
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_any_admin());
create policy site_members_read on public.site_members for select to authenticated
  using (user_id = auth.uid() or public.has_role(site_id, 'Admin'));
create policy inventory_read on public.inventory_items for select to authenticated
  using (public.stock_readable(site_id, 'Member'));
create policy requests_read on public.requests for select to authenticated
  using (
    requested_by = auth.uid()
    or public.has_role(site_id, 'Manager')
    or (target_site_id is not null and forwarded_at is not null and public.has_role(target_site_id, 'Manager'))
  );
create policy assignments_read on public.assignments for select to authenticated
  using (assignee_id = auth.uid() or public.has_role(site_id, 'Manager') or public.has_role(stock_site_id, 'Manager'));
create policy consumption_read on public.consumption for select to authenticated
  using (public.has_role(site_id, 'Manager') or public.owns_assignment(assignment_id));
create policy returns_read on public.returns for select to authenticated
  using (public.has_role(site_id, 'Member'));
create policy repairs_read on public.repairs for select to authenticated
  using (public.has_role(site_id, 'Member'));
create policy product_audits_read on public.product_audits for select to authenticated
  using (public.stock_readable(site_id, 'Manager'));

-- Signed-out visitors see nothing; signed-in people can only read (writes use api_* functions).
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on public.sites, public.site_versions, public.site_events, public.profiles, public.site_members,
  public.inventory_items, public.requests, public.assignments, public.consumption, public.returns,
  public.repairs, public.product_audits to authenticated;
revoke all on public.demo_seed from authenticated;
