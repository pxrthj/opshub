-- Loads the sample data stored in demo_seed (generated from src/data/seed.ts by scripts/export-seed.ts):
-- the three offices with their setup history, the twelve sample people (real Supabase auth users, password
-- demo123) with their roles, and all stock, requests, assignments, usage, returns, repairs and audit entries.
-- Dates are shifted so the newest entries look as recent as they did when the payload was generated.
-- Internal: not callable from the browser.

create function public._load_demo_seed() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  p jsonb;
  d interval;
  s jsonb;
  u jsonb;
  v_id uuid;
begin
  select payload into p from demo_seed where id = 1;
  if p is null then raise exception 'No sample data is stored in demo_seed'; end if;
  d := now() - (p ->> 'generatedAt')::timestamptz;

  for s in select * from jsonb_array_elements(p -> 'sites') loop
    insert into sites (id, slug, name, live, live_version)
    values (s ->> 'id', s ->> 'slug', s ->> 'name', s -> 'config', 1)
    on conflict (id) do update set slug = excluded.slug, name = excluded.name, live = excluded.live, live_version = 1,
      draft = null, draft_saved_at = null, draft_saved_by = null;
    insert into site_versions (site_id, version, config, published_at, author, summary)
    select s ->> 'id', (v ->> 'version')::int, s -> 'config', (v ->> 'publishedAt')::timestamptz + d, v ->> 'author', v ->> 'summary'
    from jsonb_array_elements(s -> 'versions') v
    on conflict (site_id, version) do nothing;
    insert into site_events (id, site_id, action, version, from_version, at, author, note)
    select e ->> 'id', s ->> 'id', e ->> 'action', (e ->> 'version')::int, (e ->> 'fromVersion')::int,
           (e ->> 'at')::timestamptz + d, e ->> 'author', e ->> 'note'
    from jsonb_array_elements(s -> 'events') e
    on conflict (id) do nothing;
  end loop;

  for u in select * from jsonb_array_elements(p -> 'users') loop
    select id into v_id from profiles where email = u ->> 'email';
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
                              raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token,
                              email_change_token_new, email_change, email_change_token_current, phone_change,
                              phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u ->> 'email',
              crypt('demo123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
              '', '', '', '', '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', u ->> 'email', 'email_verified', true), 'email', now(), now(), now());
      insert into profiles (id, legacy_id, email, name, title) values (v_id, u ->> 'legacyId', u ->> 'email', u ->> 'name', u ->> 'title');
    else
      update profiles set legacy_id = u ->> 'legacyId', name = u ->> 'name', title = u ->> 'title' where id = v_id;
      update auth.users set encrypted_password = crypt('demo123', gen_salt('bf')) where id = v_id;
    end if;
    insert into site_members (site_id, user_id, role)
    select key, v_id, value from jsonb_each_text(u -> 'roles')
    on conflict (site_id, user_id) do update set role = excluded.role;
  end loop;

  insert into inventory_items (id, site_id, name, category, unit, qty, unit_price, reorder_level, custom, updated_at)
  select r ->> 'id', r ->> 'siteId', r ->> 'name', r ->> 'category', r ->> 'unit', (r ->> 'qty')::int, (r ->> 'unitPrice')::numeric,
         (r ->> 'reorderLevel')::int, coalesce(r -> 'custom', '{}'), (r ->> 'updatedAt')::timestamptz + d
  from jsonb_array_elements(p -> 'inventory') r
  on conflict (id) do nothing;

  insert into requests (id, code, type, site_id, target_site_id, lines, repair, purpose, priority, requested_by, requested_by_name,
                        created_at, status, decision_comment, decided_by, decided_at, assignment_id, repair_job_id,
                        forwarded_at, forwarded_by, forward_note, custom)
  select r ->> 'id', r ->> 'code', r ->> 'type', r ->> 'siteId', r ->> 'targetSiteId', r -> 'lines',
         nullif(r -> 'repair', 'null'::jsonb), r ->> 'purpose', coalesce(r ->> 'priority', 'Normal'),
         (select id from profiles where legacy_id = r ->> 'requestedBy'), r ->> 'requestedByName',
         (r ->> 'createdAt')::timestamptz + d, r ->> 'status', r ->> 'decisionComment', r ->> 'decidedBy',
         (r ->> 'decidedAt')::timestamptz + d, r ->> 'assignmentId', r ->> 'repairJobId',
         (r ->> 'forwardedAt')::timestamptz + d, r ->> 'forwardedBy', r ->> 'forwardNote', coalesce(r -> 'custom', '{}')
  from jsonb_array_elements(p -> 'requests') r
  on conflict (id) do nothing;

  insert into assignments (id, code, site_id, stock_site_id, request_id, request_code, assignee_id, assignee_name, lines, created_at, created_by)
  select r ->> 'id', r ->> 'code', r ->> 'siteId', r ->> 'stockSiteId', r ->> 'requestId', r ->> 'requestCode',
         (select id from profiles where legacy_id = r ->> 'assigneeId'), r ->> 'assigneeName', r -> 'lines',
         (r ->> 'createdAt')::timestamptz + d, r ->> 'createdBy'
  from jsonb_array_elements(p -> 'assignments') r
  on conflict (id) do nothing;

  insert into consumption (id, site_id, assignment_id, item_id, item_name, qty, location, date, recorded_by)
  select r ->> 'id', r ->> 'siteId', r ->> 'assignmentId', r ->> 'itemId', r ->> 'itemName', (r ->> 'qty')::int, r ->> 'location',
         (r ->> 'date')::timestamptz + d, r ->> 'recordedBy'
  from jsonb_array_elements(p -> 'consumption') r
  on conflict (id) do nothing;

  insert into returns (id, site_id, source, ref_id, ref_code, item_id, item_name, qty, condition, stock_site_id, date, returned_by)
  select r ->> 'id', r ->> 'siteId', r ->> 'source', r ->> 'refId', r ->> 'refCode', r ->> 'itemId', r ->> 'itemName',
         (r ->> 'qty')::int, r ->> 'condition', r ->> 'stockSiteId', (r ->> 'date')::timestamptz + d, r ->> 'returnedBy'
  from jsonb_array_elements(p -> 'returns') r
  on conflict (id) do nothing;

  insert into repairs (id, site_id, code, meter_id, meter_type, fault, technician, parts_used, status, received_at, updated_at,
                       request_id, returned, custom)
  select r ->> 'id', r ->> 'siteId', r ->> 'code', r ->> 'meterId', r ->> 'meterType', r ->> 'fault', coalesce(r ->> 'technician', ''),
         coalesce(r ->> 'partsUsed', ''), r ->> 'status', (r ->> 'receivedAt')::timestamptz + d, (r ->> 'updatedAt')::timestamptz + d,
         r ->> 'requestId', coalesce((r ->> 'returned')::boolean, false), coalesce(r -> 'custom', '{}')
  from jsonb_array_elements(p -> 'repairs') r
  on conflict (id) do nothing;

  insert into product_audits (id, site_id, item_id, item_name, category, unit, field, change_type, old_value, new_value, diff, reason,
                              ref_code, actor_id, actor_name, actor_role, at)
  select r ->> 'id', r ->> 'siteId', r ->> 'itemId', r ->> 'itemName', r ->> 'category', r ->> 'unit', r ->> 'field', r ->> 'changeType',
         nullif(r -> 'oldValue', 'null'::jsonb), nullif(r -> 'newValue', 'null'::jsonb), r ->> 'diff', coalesce(r ->> 'reason', ''),
         r ->> 'refCode', (select id from profiles where legacy_id = r ->> 'actorId'), r ->> 'actorName', r ->> 'actorRole',
         (r ->> 'timestamp')::timestamptz + d
  from jsonb_array_elements(p -> 'audits') r
  on conflict (id) do nothing;
end $$;

revoke all on function public._load_demo_seed() from public, anon, authenticated;
