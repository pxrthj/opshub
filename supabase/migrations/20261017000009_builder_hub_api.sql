-- Server-side business logic: builder hub api.

create function public._check_config(p_site text, p_cfg jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_cfg is null or p_cfg -> 'canvas' is null then perform _fail('Missing config'); end if;
  if btrim(coalesce(p_cfg ->> 'name', '')) = '' then perform _fail('Site name is required'); end if;
  if p_cfg -> 'workflow' ->> 'stockSourceSiteId' is not null
     and not exists (select 1 from sites where id = p_cfg -> 'workflow' ->> 'stockSourceSiteId') then
    perform _fail('Stock source site does not exist', 422);
  end if;
  if p_cfg ->> 'siteId' is distinct from p_site then perform _fail('Config belongs to another site', 422); end if;
end $$;

create function public.api_draft_save(p_site text, p_config jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Admin');
begin
  perform _check_config(p_site, p_config);
  update sites set draft = p_config, draft_saved_at = now(), draft_saved_by = _actor_name() where id = p_site;
  return jsonb_build_object('ok', true);
end $$;

create function public.api_draft_discard(p_site text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Admin');
begin
  update sites set draft = null, draft_saved_at = null, draft_saved_by = null where id = p_site;
  return jsonb_build_object('ok', true);
end $$;

create function public.api_publish(p_site text, p_config jsonb, p_summary text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Admin');
  v_site sites;
  v_cfg jsonb;
  v_version int;
  v_summary text := coalesce(nullif(btrim(coalesce(p_summary, '')), ''), 'Nothing changed');
begin
  select * into v_site from sites where id = p_site for update;
  v_cfg := coalesce(p_config, v_site.draft);
  if v_cfg is null then perform _fail('There is nothing to make live yet. Save your changes first.', 409); end if;
  perform _check_config(p_site, v_cfg);
  select coalesce(max(version), 0) + 1 into v_version from site_versions where site_id = p_site;
  insert into site_versions (site_id, version, config, published_at, author, summary)
  values (p_site, v_version, v_cfg, now(), _actor_name(), v_summary);
  insert into site_events (id, site_id, action, version, from_version, at, author, note)
  values (_newid('ev'), p_site, 'publish', v_version, v_site.live_version, now(), _actor_name(), v_summary);
  update sites set live = v_cfg, live_version = v_version, name = v_cfg ->> 'name',
                   draft = null, draft_saved_at = null, draft_saved_by = null
  where id = p_site;
  return jsonb_build_object('published', v_version, 'summary', v_summary);
end $$;

create function public.api_rollback(p_site text, p_version int, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Admin');
  v_site sites;
  v_target site_versions;
begin
  select * into v_site from sites where id = p_site for update;
  select * into v_target from site_versions where site_id = p_site and version = p_version;
  if not found then perform _fail('Version v' || p_version || ' not found', 404); end if;
  if v_site.live_version = p_version then perform _fail('v' || p_version || ' is already live', 409); end if;
  insert into site_events (id, site_id, action, version, from_version, at, author, note)
  values (_newid('ev'), p_site, 'rollback', p_version, v_site.live_version, now(), _actor_name(),
          coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Rolled back v' || v_site.live_version || ' → v' || p_version));
  update sites set live = v_target.config, live_version = p_version, name = v_target.config ->> 'name',
                   draft = null, draft_saved_at = null, draft_saved_by = null
  where id = p_site;
  return jsonb_build_object('ok', true);
end $$;

create function public.api_resolve_site(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_site sites;
begin
  if auth.uid() is null then perform _fail('Please sign in', 401); end if;
  select * into v_site from sites where slug = p_key or id = p_key;
  if not found then perform _fail('No unit called "' || p_key || '"', 404); end if;
  return jsonb_build_object('siteId', v_site.id, 'slug', v_site.slug, 'name', v_site.name, 'role', my_role(v_site.id));
end $$;
