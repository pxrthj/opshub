-- A site Admin sees only the people of the offices they administer; an Admin of every office sees everyone.

create function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sites) and not exists (select 1 from sites s where not has_role(s.id, 'Admin'))
$$;

create function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
    or is_super_admin()
    or exists (select 1 from site_members m where m.user_id = p_user and has_role(m.site_id, 'Admin'))
$$;

alter policy profiles_read on public.profiles using (public.can_see_profile(id));

revoke all on function public.is_super_admin(), public.can_see_profile(uuid) from public, anon;
grant execute on function public.is_super_admin(), public.can_see_profile(uuid) to authenticated;
