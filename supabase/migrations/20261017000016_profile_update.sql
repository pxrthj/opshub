-- Lets a signed-in person change their own display name and job title (everything else about a login stays with Admins).
create function public.api_profile_update(p_name text, p_title text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_title text := btrim(coalesce(p_title, ''));
begin
  if auth.uid() is null then perform _fail('Please sign in', 401); end if;
  if v_name = '' then perform _fail('Name is required'); end if;
  if length(v_name) > 80 or length(v_title) > 80 then perform _fail('Name and title must be 80 characters or fewer'); end if;
  update profiles set name = v_name, title = case when v_title = '' then title else v_title end where id = auth.uid();
  if not found then perform _fail('This login has no profile', 404); end if;
  return jsonb_build_object('name', v_name);
end $$;

revoke all on function public.api_profile_update(text, text) from public, anon;
grant execute on function public.api_profile_update(text, text) to authenticated;
