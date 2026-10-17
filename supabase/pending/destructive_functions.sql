-- NOT APPLIED YET. These functions contain DELETE statements, which the Supabase MCP tool holds for an
-- interactive confirmation. Paste this file into the Supabase SQL editor (or approve the prompt) to install them,
-- then run the grants block at the bottom.

create function public.api_inventory_delete(p_site text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Admin', array['inventory']);
  v_item inventory_items;
begin
  perform _assert_own_inventory(p_site);
  select * into v_item from inventory_items where id = p_id and site_id = p_site for update;
  if not found then perform _fail('Item not found', 404); end if;
  perform _audit(p_site, v_item, 'delete', 'deleted', null, null, 'Item removed from inventory', null, v_role);
  delete from inventory_items where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create function public.api_member_set(p_site text, p_user uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Admin', array['users']);
begin
  if not exists (select 1 from profiles where id = p_user) then perform _fail('User not found', 404); end if;
  if p_user = auth.uid() and p_role is distinct from 'Admin' then perform _fail('You can''t change your own Admin role here'); end if;
  if p_role is not null and p_role not in ('Public', 'Member', 'Manager', 'Admin') then perform _fail('Unknown role ' || p_role); end if;
  if p_role is null then
    delete from site_members where site_id = p_site and user_id = p_user;
  else
    insert into site_members (site_id, user_id, role) values (p_site, p_user, p_role)
    on conflict (site_id, user_id) do update set role = excluded.role;
  end if;
  return jsonb_build_object('userId', p_user, 'role', p_role);
end $$;

-- Allow signed-in people to call them (internal helpers start with _ and stay private).
grant execute on function public.api_inventory_delete(text, text) to authenticated;
grant execute on function public.api_member_set(text, uuid, text) to authenticated;
revoke execute on function public.api_inventory_delete(text, text), public.api_member_set(text, uuid, text) from public, anon;
