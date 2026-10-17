-- Admins oversee an office: they read everything but do not act on requests, approvals, assignments,
-- usage, returns or repairs (matches the "oversee only" rule in src/api/routes/site.ts).
-- Every operational function is guarded by one of these features, so the rule lives in _guard.

create or replace function public._guard(p_site text, p_min text, p_modules text[] default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_site sites;
  v_role text;
  v_ops text[] := array['request', 'approval', 'assignment', 'consumption', 'returns', 'pcb-repair'];
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
    perform _fail('Admins oversee the site and do not take part in day-to-day requests, approvals, stock hand-outs, usage, returns or repairs. Managers and Members do that.', 403);
  end if;
  if p_modules is not null and not exists (select 1 from unnest(p_modules) m where _has_module(p_site, m)) then
    perform _fail('That feature is not enabled on ' || v_site.name, 403);
  end if;
  return v_role;
end $$;
