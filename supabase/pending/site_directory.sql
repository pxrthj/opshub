-- NOT APPLIED. Install only if the office-name directory is wanted: the frontend uses it to show the names of
-- offices a person cannot open (for example the office that supplies their stock).

-- Office names and addresses are not secret (they label requests that cross offices), so any signed-in person can list them.
create function public.api_site_directory() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name) order by id), '[]'::jsonb)
  from sites where auth.uid() is not null
$$;

revoke all on function public.api_site_directory() from public, anon;
grant execute on function public.api_site_directory() to authenticated;
