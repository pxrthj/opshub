-- Repair cases: a client company asks for boards or units to be repaired. The Central Hub (the office with the
-- "case-desk" feature) routes each case to an onsite team (Distribution) and/or an in-house team (Service Centre),
-- both offices with the "case-work" feature. Their managers assign a technician, who logs visits / diagnosis and asks
-- for parts (normal material requests linked to the case). When the work is done the Hub is informed and closes the
-- case. Every step is appended to the case's own history (events), which is what the Excel export documents.

create table public.service_cases (
  id text primary key,
  code text not null unique,
  client_site_id text not null references public.sites(id) on delete cascade,
  client_name text not null,
  hub_site_id text not null references public.sites(id) on delete cascade,
  title text not null,
  description text not null default '',
  items jsonb not null default '[]',              -- [{ name, qty }] what the client wants repaired
  location text not null default '',              -- where onsite work happens
  priority text not null default 'Normal',
  status text not null default 'Submitted'
    check (status in ('Submitted', 'Routed', 'In Progress', 'Repaired', 'Closed', 'Rejected')),
  field_site_id text references public.sites(id) on delete set null,   -- onsite team
  field_status text check (field_status in ('Open', 'Assigned', 'Done')),
  field_assignee_id uuid references public.profiles(id) on delete set null,
  field_assignee_name text,
  lab_site_id text references public.sites(id) on delete set null,     -- in-house team
  lab_status text check (lab_status in ('Open', 'Assigned', 'Done')),
  lab_assignee_id uuid references public.profiles(id) on delete set null,
  lab_assignee_name text,
  events jsonb not null default '[]',
  created_by uuid references public.profiles(id) on delete set null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index service_cases_client_idx on public.service_cases (client_site_id);
create index service_cases_field_idx on public.service_cases (field_site_id);
create index service_cases_lab_idx on public.service_cases (lab_site_id);

alter table public.requests add column case_id text references public.service_cases(id) on delete set null;
create index requests_case_idx on public.requests (case_id) where case_id is not null;

-- Who can read a case: the client person who raised it and their managers, everyone at the Hub, and everyone at an
-- office the case was routed to.
alter table public.service_cases enable row level security;
create policy service_cases_read on public.service_cases for select to authenticated
  using (
    created_by = auth.uid()
    or public.has_role(client_site_id, 'Manager')
    or public.has_role(hub_site_id, 'Member')
    or (field_site_id is not null and public.has_role(field_site_id, 'Member'))
    or (lab_site_id is not null and public.has_role(lab_site_id, 'Member'))
  );
grant select on public.service_cases to authenticated;
revoke all on public.service_cases from anon;

-- Admins oversee; the people doing the work act. Case features join the operational list.
create or replace function public._guard(p_site text, p_min text, p_modules text[] default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_site sites;
  v_role text;
  v_ops text[] := array['request', 'approval', 'assignment', 'consumption', 'returns', 'pcb-repair', 'cases', 'case-desk', 'case-work'];
begin
  if auth.uid() is null then perform _fail('Please sign in', 401); end if;
  select * into v_site from sites where id = p_site;
  if not found then perform _fail('Site "' || p_site || '" does not exist', 404); end if;
  select role into v_role from site_members where site_id = p_site and user_id = auth.uid();
  if v_role is null then perform _fail('Access denied: you have no role on ' || v_site.name, 403); end if;
  if role_rank(v_role) < role_rank(p_min) then
    perform _fail('Access denied: this action needs the ' || p_min || ' role on ' || v_site.name || ' (you are ' || v_role || ')', 403);
  end if;
  if v_role = 'Admin' and p_modules && v_ops then
    perform _fail('Admins oversee the site and do not take part in day-to-day requests, approvals, stock hand-outs, usage, returns, repairs or cases. Managers and Members do that.', 403);
  end if;
  if p_modules is not null and not exists (select 1 from unnest(p_modules) m where _has_module(p_site, m)) then
    perform _fail('That feature is not enabled on ' || v_site.name, 403);
  end if;
  return v_role;
end $$;

-- ---------------------------------------------------------------- helpers (internal)

create function public._case_event(p_case text, p_site text, p_kind text, p_note text, p_data jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  update service_cases
  set events = events || jsonb_build_array(jsonb_build_object(
        'id', _newid('ce'), 'at', now(), 'siteId', p_site, 'siteName', _site_name(p_site),
        'actor', coalesce(_actor_name(), 'System'), 'kind', p_kind, 'note', coalesce(p_note, ''), 'data', coalesce(p_data, '{}'::jsonb))),
      updated_at = now()
  where id = p_case;
end $$;

/** The case, locked, if this office is part of it. */
create function public._case_for(p_site text, p_id text) returns service_cases
language plpgsql security definer set search_path = public as $$
declare
  c service_cases;
begin
  select * into c from service_cases where id = p_id for update;
  if not found or p_site not in (c.client_site_id, c.hub_site_id, coalesce(c.field_site_id, ''), coalesce(c.lab_site_id, '')) then
    perform _fail('Case not found', 404);
  end if;
  return c;
end $$;

create function public._case_open(c service_cases) returns void
language plpgsql set search_path = public as $$
begin
  if c.status in ('Closed', 'Rejected') then perform _fail(c.code || ' is ' || lower(c.status) || '.', 409); end if;
end $$;

create function public._case_note(p_note text, p_what text) returns text
language plpgsql set search_path = public as $$
begin
  if btrim(coalesce(p_note, '')) = '' then perform _fail(p_what || ' is required'); end if;
  return btrim(p_note);
end $$;

-- ---------------------------------------------------------------- client

create function public.api_case_create(p_site text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Member', array['cases']);
  v_hub text;
  v_title text := btrim(coalesce(p_body ->> 'title', ''));
  v_items jsonb := '[]';
  v_i jsonb;
  v_n int := 0;
  v_case service_cases;
begin
  select id into v_hub from sites where live -> 'modules' ? 'case-desk' and id <> p_site order by id limit 1;
  if v_hub is null then perform _fail('No office handles repair cases yet (add the Case desk feature to one)', 409); end if;
  if v_title = '' then perform _fail('Say what needs repairing'); end if;
  if jsonb_typeof(p_body -> 'items') <> 'array' or jsonb_array_length(p_body -> 'items') = 0 then
    perform _fail('Add at least one component or unit to repair');
  end if;
  for v_i in select * from jsonb_array_elements(p_body -> 'items') loop
    v_n := v_n + 1;
    if btrim(coalesce(v_i ->> 'name', '')) = '' then perform _fail('Line ' || v_n || ': name the component'); end if;
    if coalesce(v_i ->> 'qty', '') !~ '^\d+$' or (v_i ->> 'qty')::int <= 0 then
      perform _fail('Line ' || v_n || ': quantity must be a positive whole number');
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object('name', btrim(v_i ->> 'name'), 'qty', (v_i ->> 'qty')::int));
  end loop;

  perform pg_advisory_xact_lock(hashtext('service_cases'));
  insert into service_cases (id, code, client_site_id, client_name, hub_site_id, title, description, items, location, priority,
                             created_by, created_by_name)
  values (_newid('case'), 'CASE-' || _next_num(array(select code from service_cases), 1000), p_site, _site_name(p_site), v_hub,
          v_title, btrim(coalesce(p_body ->> 'description', '')), v_items, btrim(coalesce(p_body ->> 'location', '')),
          coalesce(nullif(p_body ->> 'priority', ''), 'Normal'), auth.uid(), coalesce(_actor_name(), 'Client'))
  returning * into v_case;
  perform _case_event(v_case.id, p_site, 'submitted',
    'Asked to repair ' || (select string_agg((i ->> 'qty') || ' × ' || (i ->> 'name'), ', ') from jsonb_array_elements(v_items) i));
  select * into v_case from service_cases where id = v_case.id;
  return to_jsonb(v_case);
end $$;

-- ---------------------------------------------------------------- Central Hub

create function public.api_case_offices() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'ownStock', live -> 'workflow' ->> 'stockSourceSiteId' is null) order by name), '[]')
  from sites where live -> 'modules' ? 'case-work'
$$;

create function public.api_case_route(p_site text, p_id text, p_field text, p_lab text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['case-desk']);
  c service_cases := _case_for(p_site, p_id);
  v_field text := nullif(btrim(coalesce(p_field, '')), '');
  v_lab text := nullif(btrim(coalesce(p_lab, '')), '');
begin
  if c.hub_site_id <> p_site then perform _fail('Only ' || _site_name(c.hub_site_id) || ' routes ' || c.code, 403); end if;
  if c.status <> 'Submitted' then perform _fail(c.code || ' was already ' || lower(c.status), 409); end if;
  if v_field is null and v_lab is null then perform _fail('Send it onsite, in-house, or both'); end if;
  if v_field is not null and not _has_module(v_field, 'case-work') then perform _fail('That onsite office does not take cases', 422); end if;
  if v_lab is not null and not _has_module(v_lab, 'case-work') then perform _fail('That in-house office does not take cases', 422); end if;
  update service_cases set status = 'Routed',
    field_site_id = v_field, field_status = case when v_field is null then null else 'Open' end,
    lab_site_id = v_lab, lab_status = case when v_lab is null then null else 'Open' end
  where id = c.id;
  perform _case_event(c.id, p_site, 'routed',
    concat_ws(' and ', case when v_field is not null then 'Onsite work: ' || _site_name(v_field) end,
                       case when v_lab is not null then 'In-house work: ' || _site_name(v_lab) end)
    || coalesce(nullif(' — ' || btrim(coalesce(p_note, '')), ' — '), ''));
  select * into c from service_cases where id = c.id;
  return to_jsonb(c);
end $$;

create function public.api_case_reject(p_site text, p_id text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['case-desk']);
  c service_cases := _case_for(p_site, p_id);
  v_note text := _case_note(p_note, 'A reason');
begin
  if c.hub_site_id <> p_site then perform _fail('Only ' || _site_name(c.hub_site_id) || ' can turn down ' || c.code, 403); end if;
  if c.status <> 'Submitted' then perform _fail(c.code || ' was already ' || lower(c.status), 409); end if;
  update service_cases set status = 'Rejected', closed_at = now() where id = c.id;
  perform _case_event(c.id, p_site, 'rejected', v_note);
  select * into c from service_cases where id = c.id;
  return to_jsonb(c);
end $$;

create function public.api_case_close(p_site text, p_id text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['case-desk']);
  c service_cases := _case_for(p_site, p_id);
begin
  if c.hub_site_id <> p_site then perform _fail('Only ' || _site_name(c.hub_site_id) || ' closes ' || c.code, 403); end if;
  if c.status <> 'Repaired' then perform _fail(c.code || ' can be closed once the repair is reported done (it is ' || c.status || ')', 409); end if;
  update service_cases set status = 'Closed', closed_at = now() where id = c.id;
  perform _case_event(c.id, p_site, 'closed', coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Case closed'));
  select * into c from service_cases where id = c.id;
  return to_jsonb(c);
end $$;

-- The client or the Hub is not happy with the result: the teams that worked on it pick it up again.
create function public.api_case_reopen(p_site text, p_id text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['case-desk']);
  c service_cases := _case_for(p_site, p_id);
  v_note text := _case_note(p_note, 'A reason');
begin
  if c.hub_site_id <> p_site then perform _fail('Only ' || _site_name(c.hub_site_id) || ' reopens ' || c.code, 403); end if;
  if c.status <> 'Repaired' then perform _fail(c.code || ' is ' || c.status || ', there is nothing to send back', 409); end if;
  update service_cases set status = 'In Progress',
    field_status = case when field_site_id is null then null when field_assignee_id is null then 'Open' else 'Assigned' end,
    lab_status = case when lab_site_id is null then null when lab_assignee_id is null then 'Open' else 'Assigned' end
  where id = c.id;
  perform _case_event(c.id, p_site, 'reopened', v_note);
  select * into c from service_cases where id = c.id;
  return to_jsonb(c);
end $$;

-- ---------------------------------------------------------------- onsite and in-house teams

create function public.api_case_people(p_site text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['case-work']);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'title', p.title, 'role', m.role) order by m.role desc, p.name)
    from site_members m join profiles p on p.id = m.user_id
    where m.site_id = p_site and m.role in ('Member', 'Manager')), '[]');
end $$;

create function public.api_case_assign(p_site text, p_id text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['case-work']);
  c service_cases := _case_for(p_site, p_id);
  v_name text;
  v_field boolean := p_site = c.field_site_id;
begin
  perform _case_open(c);
  if p_site not in (coalesce(c.field_site_id, ''), coalesce(c.lab_site_id, '')) then perform _fail(c.code || ' was not sent to ' || _site_name(p_site), 403); end if;
  if (case when v_field then c.field_status else c.lab_status end) = 'Done' then
    perform _fail('This office already reported its work on ' || c.code || ' as done', 409);
  end if;
  select p.name into v_name from site_members m join profiles p on p.id = m.user_id
  where m.site_id = p_site and m.user_id = p_user and m.role in ('Member', 'Manager');
  if v_name is null then perform _fail('Pick someone who works in ' || _site_name(p_site), 422); end if;
  if v_field then
    update service_cases set field_assignee_id = p_user, field_assignee_name = v_name, field_status = 'Assigned' where id = c.id;
  else
    update service_cases set lab_assignee_id = p_user, lab_assignee_name = v_name, lab_status = 'Assigned' where id = c.id;
  end if;
  update service_cases set status = 'In Progress' where id = c.id and status in ('Routed', 'In Progress');
  perform _case_event(c.id, p_site, 'assigned', 'Assigned to ' || v_name);
  select * into c from service_cases where id = c.id;
  return to_jsonb(c);
end $$;

-- visit (onsite team), diagnosis (onsite or in-house team) or note (anyone on the case, client included).
create function public.api_case_log(p_site text, p_id text, p_kind text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Member', array['cases', 'case-desk', 'case-work']);
  c service_cases := _case_for(p_site, p_id);
  v_note text := _case_note(p_note, 'A note');
  v_work boolean := p_site in (coalesce(c.field_site_id, ''), coalesce(c.lab_site_id, ''));
begin
  perform _case_open(c);
  if p_kind not in ('visit', 'diagnosis', 'note') then perform _fail('Unknown entry type'); end if;
  if p_kind = 'visit' and p_site is distinct from c.field_site_id then perform _fail('Visits are logged by the onsite team', 403); end if;
  if p_kind = 'diagnosis' and not v_work then perform _fail('Diagnosis is written by the team doing the work', 403); end if;
  if v_work and p_kind <> 'note' and role_rank(v_role) < 2 and auth.uid() is distinct from
     (case when p_site = c.field_site_id then c.field_assignee_id else c.lab_assignee_id end) then
    perform _fail('Only the technician assigned to ' || c.code || ' or a manager can do that', 403);
  end if;
  perform _case_event(c.id, p_site, p_kind, v_note);
  select * into c from service_cases where id = c.id;
  return to_jsonb(c);
end $$;

-- The team reports its part as done; once every team that got the case is done, the Hub sees it as Repaired.
create function public.api_case_complete(p_site text, p_id text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Member', array['case-work']);
  c service_cases := _case_for(p_site, p_id);
  v_note text := _case_note(p_note, 'What was done');
  v_field boolean := p_site = c.field_site_id;
begin
  perform _case_open(c);
  if p_site not in (coalesce(c.field_site_id, ''), coalesce(c.lab_site_id, '')) then perform _fail(c.code || ' was not sent to ' || _site_name(p_site), 403); end if;
  if (case when v_field then c.field_status else c.lab_status end) <> 'Assigned' then
    perform _fail('Assign a technician to ' || c.code || ' first', 409);
  end if;
  if role_rank(v_role) < 2 and auth.uid() is distinct from (case when v_field then c.field_assignee_id else c.lab_assignee_id end) then
    perform _fail('Only the technician assigned to ' || c.code || ' or a manager can report it done', 403);
  end if;
  if v_field then update service_cases set field_status = 'Done' where id = c.id;
  else update service_cases set lab_status = 'Done' where id = c.id; end if;
  select * into c from service_cases where id = c.id;
  if coalesce(c.field_status, 'Done') = 'Done' and coalesce(c.lab_status, 'Done') = 'Done' then
    update service_cases set status = 'Repaired' where id = c.id;
    perform _case_event(c.id, p_site, 'work-done', v_note || ' — ' || _site_name(c.hub_site_id) || ' informed');
  else
    perform _case_event(c.id, p_site, 'work-done', v_note);
  end if;
  select * into c from service_cases where id = c.id;
  return to_jsonb(c);
end $$;

-- ---------------------------------------------------------------- parts for a case

create or replace function public.api_request_create(p_site text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Member', array['request']);
  v_site sites;
  v_wf jsonb;
  v_type text := case when p_body ->> 'type' = 'repair' then 'repair' else 'material' end;
  v_target text;
  v_stock text;
  v_lines jsonb := '[]';
  v_repair jsonb;
  v_purpose text := btrim(coalesce(p_body ->> 'purpose', ''));
  v_l jsonb;
  v_i int := 0;
  v_item inventory_items;
  v_qty numeric;
  v_max int;
  v_req requests;
  v_case service_cases;
  v_case_id text := nullif(btrim(coalesce(p_body ->> 'caseId', '')), '');
begin
  select * into v_site from sites where id = p_site;
  v_wf := v_site.live -> 'workflow';
  if v_type = 'material' and not coalesce((v_wf ->> 'allowMaterialRequests')::boolean, false) then
    perform _fail('Material requests are disabled on this site', 403);
  end if;
  if v_type = 'repair' and not coalesce((v_wf ->> 'allowRepairRequests')::boolean, false) then
    perform _fail('Repair jobs are disabled on this site', 403);
  end if;
  v_target := case when v_type = 'material' and v_wf ->> 'stockSourceSiteId' is not null then v_wf ->> 'stockSourceSiteId' else p_site end;
  v_stock := coalesce(v_wf ->> 'stockSourceSiteId', p_site);
  v_max := coalesce((v_wf ->> 'maxQtyPerLine')::int, 1000);

  if v_type = 'material' then
    if p_body -> 'lines' is null or jsonb_typeof(p_body -> 'lines') <> 'array' or jsonb_array_length(p_body -> 'lines') = 0 then
      perform _fail('Add at least one item');
    end if;
    for v_l in select * from jsonb_array_elements(p_body -> 'lines') loop
      v_i := v_i + 1;
      select * into v_item from inventory_items where id = v_l ->> 'itemId' and site_id = v_stock;
      if not found then perform _fail('Line ' || v_i || ': choose an item'); end if;
      if coalesce(v_l ->> 'qty', '') !~ '^\d+$' or (v_l ->> 'qty')::numeric <= 0 then
        perform _fail('Line ' || v_i || ': quantity must be a positive whole number');
      end if;
      v_qty := (v_l ->> 'qty')::numeric;
      if v_qty > v_max then perform _fail('Line ' || v_i || ': max ' || v_max || ' per line on this site'); end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('itemId', v_item.id, 'itemName', v_item.name, 'unit', v_item.unit, 'qty', v_qty::int));
    end loop;
  else
    if btrim(coalesce(p_body #>> '{repair,meterId}', '')) = '' then perform _fail('Board serial is required'); end if;
    if btrim(coalesce(p_body #>> '{repair,fault}', '')) = '' then perform _fail('Fault is required'); end if;
    v_repair := jsonb_build_object(
      'meterId', upper(btrim(p_body #>> '{repair,meterId}')),
      'meterType', coalesce(nullif(p_body #>> '{repair,meterType}', ''), 'BLDC Fan Controller PCB'),
      'fault', p_body #>> '{repair,fault}');
    if v_purpose = '' then v_purpose := 'Repair ' || (v_repair ->> 'meterId'); end if;
  end if;

  -- Parts asked for a repair case: the case must be routed to this office and still open, and a Member must be the
  -- technician assigned to it here.
  if v_case_id is not null then
    if v_type <> 'material' then perform _fail('Only parts can be asked for a case'); end if;
    select * into v_case from service_cases where id = v_case_id for update;
    if not found or p_site not in (coalesce(v_case.field_site_id, ''), coalesce(v_case.lab_site_id, '')) then
      perform _fail('That case is not with this office', 404);
    end if;
    if v_case.status in ('Closed', 'Rejected') then
      perform _fail(v_case.code || ' is ' || lower(v_case.status) || ', so no more parts can be asked for it', 409);
    end if;
    if role_rank(v_role) < 2 and auth.uid() is distinct from
       (case when p_site = v_case.field_site_id then v_case.field_assignee_id else v_case.lab_assignee_id end) then
      perform _fail('Only the technician assigned to ' || v_case.code || ' or a manager can ask for parts for it', 403);
    end if;
    if v_purpose = '' then v_purpose := 'Parts for ' || v_case.code; end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('requests:' || p_site));
  insert into requests (id, code, type, site_id, target_site_id, lines, repair, purpose, priority, requested_by, requested_by_name,
                        created_at, status, case_id, custom)
  values (_newid('rq'),
          'REQ-' || _prefix(p_site) || '-' || _next_num(array(select code from requests where site_id = p_site), 1000),
          v_type, p_site, v_target, v_lines, v_repair, v_purpose, coalesce(nullif(p_body ->> 'priority', ''), 'Normal'),
          auth.uid(), _actor_name(), now(), 'Pending', v_case_id,
          p_body - array['type', 'lines', 'repair', 'purpose', 'priority', 'id', 'code', 'status', 'requestedBy', 'requestedByName', 'createdAt', 'caseId'])
  returning * into v_req;
  if v_case_id is not null then
    perform _case_event(v_case_id, p_site, 'parts-requested',
      v_req.code || ': ' || (select string_agg((l ->> 'qty') || ' × ' || (l ->> 'itemName'), ', ') from jsonb_array_elements(v_lines) l),
      jsonb_build_object('requestId', v_req.id, 'code', v_req.code));
  end if;
  return to_jsonb(v_req);
end $$;

-- Parts requests for a case write their progress into the case history.
create function public._case_request_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_decider text;
begin
  if new.case_id is null then return new; end if;
  if new.forwarded_at is not null and old.forwarded_at is null then
    perform _case_event(new.case_id, new.site_id, 'parts-forwarded',
      new.code || ' sent to ' || coalesce(_site_name(new.target_site_id), 'the other office'),
      jsonb_build_object('requestId', new.id, 'code', new.code));
  end if;
  if new.status is distinct from old.status then
    v_decider := case when new.target_site_id is not null and new.target_site_id <> new.site_id and new.forwarded_at is not null
                      then new.target_site_id else new.site_id end;
    perform _case_event(new.case_id, v_decider,
      case new.status when 'Assigned' then 'parts-issued' when 'Rejected' then 'parts-rejected' else 'parts-approved' end,
      new.code || ' ' || case new.status when 'Assigned' then 'issued to ' || new.requested_by_name else lower(new.status) end
        || coalesce(': ' || new.decision_comment, ''),
      jsonb_build_object('requestId', new.id, 'code', new.code));
  end if;
  return new;
end $$;
create trigger requests_case_events after update on public.requests
  for each row execute function public._case_request_trigger();

-- An office with its own store (Service Centre) can still ask another office (the Central Hub) when it is short:
-- its manager "sends on" a request from its own team, and the lines are matched to that office's items by name.
create or replace function public.api_request_forward(p_site text, p_id text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['approval']);
  v_req requests;
  v_action text;
  v_up text;
  v_lines jsonb := '[]';
  v_l jsonb;
  v_item inventory_items;
begin
  v_req := _find_request(p_site, p_id);
  if v_req.status <> 'Pending' then perform _fail(v_req.code || ' is already ' || v_req.status, 409); end if;
  v_action := _manager_action(v_req, p_site);
  if v_action = 'waiting-for-other-office' then
    perform _fail(v_req.code || ' was already sent to ' || coalesce(_site_name(v_req.target_site_id), 'the other office'), 409);
  end if;
  if v_action = 'decide' and v_req.type = 'material' and v_req.site_id = p_site and coalesce(v_req.target_site_id, p_site) = p_site then
    select live -> 'workflow' ->> 'upstreamSiteId' into v_up from sites where id = p_site;
    if v_up is null or v_up = p_site or not exists (select 1 from sites where id = v_up) then
      perform _fail('This office has no other office to ask for stock. Set "Ask another office when short" first.', 409);
    end if;
    for v_l in select * from jsonb_array_elements(v_req.lines) loop
      select * into v_item from inventory_items where site_id = v_up and lower(name) = lower(v_l ->> 'itemName');
      if not found then perform _fail((v_l ->> 'itemName') || ' is not stocked in ' || _site_name(v_up) || ' — nothing was sent', 409); end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object('itemId', v_item.id, 'itemName', v_item.name, 'unit', v_item.unit, 'qty', (v_l ->> 'qty')::int));
    end loop;
    update requests set target_site_id = v_up, lines = v_lines, forwarded_at = now(), forwarded_by = _actor_name(),
                        forward_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = v_req.id returning * into v_req;
    return to_jsonb(v_req);
  end if;
  if v_action is distinct from 'send-on' then perform _fail(v_req.code || ' does not need to be sent to another office.', 403); end if;
  update requests set forwarded_at = now(), forwarded_by = _actor_name(), forward_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_req.id returning * into v_req;
  return to_jsonb(v_req);
end $$;

-- ---------------------------------------------------------------- who may call what

revoke all on function public._case_event(text, text, text, text, jsonb), public._case_for(text, text),
  public._case_open(service_cases), public._case_note(text, text), public._case_request_trigger() from public, anon, authenticated;
revoke all on function public.api_case_create(text, jsonb), public.api_case_offices(), public.api_case_route(text, text, text, text, text),
  public.api_case_reject(text, text, text), public.api_case_close(text, text, text), public.api_case_reopen(text, text, text),
  public.api_case_people(text), public.api_case_assign(text, text, uuid), public.api_case_log(text, text, text, text),
  public.api_case_complete(text, text, text) from public, anon;
grant execute on function public.api_case_create(text, jsonb), public.api_case_offices(), public.api_case_route(text, text, text, text, text),
  public.api_case_reject(text, text, text), public.api_case_close(text, text, text), public.api_case_reopen(text, text, text),
  public.api_case_people(text), public.api_case_assign(text, text, uuid), public.api_case_log(text, text, text, text),
  public.api_case_complete(text, text, text) to authenticated;
