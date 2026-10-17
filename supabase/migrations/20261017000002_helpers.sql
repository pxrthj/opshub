-- Server-side business logic: helpers.

create function public._fail(p_msg text, p_status int default 400) returns void
language plpgsql as $$
begin
  raise exception '%', p_msg using errcode = 'P0001', hint = p_status::text;
end $$;

create function public._newid(p_prefix text) returns text
language sql volatile as $$
  select p_prefix || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8)
$$;

create function public._prefix(p_site text) returns text
language sql immutable as $$ select upper(split_part(p_site, '-', 1)) $$;

create function public._next_num(p_codes text[], p_start int) returns int
language sql immutable as $$
  select greatest(p_start, coalesce(max((regexp_match(c, '(\d+)$'))[1]::int), 0)) + 1 from unnest(p_codes) c
$$;

create function public._actor_name() returns text
language sql stable security definer set search_path = public as $$
  select name from profiles where id = auth.uid()
$$;

create function public._has_module(p_site text, p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sites s
    where s.id = p_site
      and (s.live -> 'modules' @> to_jsonb(p_module)
           or (my_role(p_site) = 'Admin' and s.draft is not null and s.draft -> 'modules' @> to_jsonb(p_module)))
  )
$$;

create function public._guard(p_site text, p_min text, p_modules text[] default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_site sites;
  v_role text;
begin
  if auth.uid() is null then perform _fail('Please sign in', 401); end if;
  select * into v_site from sites where id = p_site;
  if not found then perform _fail('Site "' || p_site || '" does not exist', 404); end if;
  select role into v_role from site_members where site_id = p_site and user_id = auth.uid();
  if v_role is null then perform _fail('Access denied: you have no role on ' || v_site.name, 403); end if;
  if role_rank(v_role) < role_rank(p_min) then
    perform _fail('Access denied: this action needs the ' || p_min || ' role on ' || v_site.name || ' (you are ' || v_role || ')', 403);
  end if;
  if p_modules is not null and not exists (select 1 from unnest(p_modules) m where _has_module(p_site, m)) then
    perform _fail('That feature is not enabled on ' || v_site.name, 403);
  end if;
  return v_role;
end $$;

create function public._assert_own_inventory(p_site text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_src text;
  v_name text;
begin
  select live -> 'workflow' ->> 'stockSourceSiteId' into v_src from sites where id = p_site;
  if v_src is not null and v_src <> p_site then
    select name into v_name from sites where id = v_src;
    perform _fail('Inventory here is linked read-only from ' || v_name || '. Edit it in ' || v_name || '.', 409);
  end if;
end $$;

create function public._audit(
  p_site text, p_item inventory_items, p_type text, p_field text,
  p_old jsonb, p_new jsonb, p_reason text, p_ref text, p_role text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_diff text;
begin
  if jsonb_typeof(p_old) = 'number' and jsonb_typeof(p_new) = 'number' then
    v_diff := (case when (p_new #>> '{}')::numeric - (p_old #>> '{}')::numeric > 0 then '+' else '' end)
              || trim_scale((p_new #>> '{}')::numeric - (p_old #>> '{}')::numeric)::text;
  end if;
  insert into product_audits (id, site_id, item_id, item_name, category, unit, field, change_type, old_value, new_value,
                              diff, reason, ref_code, actor_id, actor_name, actor_role, at)
  values (_newid('aud'), p_site, p_item.id, p_item.name, p_item.category, p_item.unit, p_field, p_type, p_old, p_new,
          v_diff, coalesce(p_reason, ''), p_ref, auth.uid(), _actor_name(), p_role, now());
end $$;

create function public._inv_check(p_values jsonb) returns void
language plpgsql as $$
begin
  if coalesce(btrim(p_values ->> 'name'), '') = '' then perform _fail('Item is required'); end if;
  if coalesce(btrim(p_values ->> 'category'), '') = '' then perform _fail('Category is required'); end if;
  if coalesce(btrim(p_values ->> 'unit'), '') = '' then perform _fail('Unit is required'); end if;
  if coalesce(p_values ->> 'qty', '') !~ '^\d+$' then perform _fail('Qty must be a whole number'); end if;
  if coalesce(p_values ->> 'unitPrice', '') !~ '^\d+(\.\d+)?$' then perform _fail('Price each (₹) must be a number, not negative'); end if;
  if coalesce(p_values ->> 'reorderLevel', '') !~ '^\d+$' then perform _fail('Warn me when below must be a whole number, not negative'); end if;
end $$;
