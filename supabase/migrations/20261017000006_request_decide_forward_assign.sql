-- Server-side business logic: request decide forward assign.

create function public.api_request_reject(p_site text, p_id text, p_comment text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['approval']);
  v_site sites;
  v_req requests;
  v_action text;
  v_comment text := btrim(coalesce(p_comment, ''));
begin
  select * into v_site from sites where id = p_site;
  v_req := _find_request(p_site, p_id);
  if v_req.status <> 'Pending' then perform _fail(v_req.code || ' is already ' || v_req.status, 409); end if;
  v_action := _manager_action(v_req, p_site);
  if v_action = 'waiting-for-other-office' then
    perform _fail(coalesce(_site_name(v_req.target_site_id), 'The other office') || ' is deciding on ' || v_req.code || '.', 403);
  end if;
  if v_action is null then
    perform _fail(v_req.code || ' is not waiting for a decision from ' || v_site.name || '.', 403);
  end if;
  if coalesce((v_site.live -> 'workflow' ->> 'requireRejectComment')::boolean, false) and v_comment = '' then
    perform _fail('A comment is required when rejecting');
  end if;
  update requests set status = 'Rejected', decided_by = _actor_name(), decided_at = now(), decision_comment = nullif(v_comment, '')
  where id = v_req.id returning * into v_req;
  return to_jsonb(v_req);
end $$;

create function public.api_request_forward(p_site text, p_id text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['approval']);
  v_req requests;
  v_action text;
begin
  v_req := _find_request(p_site, p_id);
  if v_req.status <> 'Pending' then perform _fail(v_req.code || ' is already ' || v_req.status, 409); end if;
  v_action := _manager_action(v_req, p_site);
  if v_action = 'waiting-for-other-office' then
    perform _fail(v_req.code || ' was already sent to ' || coalesce(_site_name(v_req.target_site_id), 'the other office'), 409);
  end if;
  if v_action is distinct from 'send-on' then perform _fail(v_req.code || ' does not need to be sent to another office.', 403); end if;
  update requests set forwarded_at = now(), forwarded_by = _actor_name(), forward_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = v_req.id returning * into v_req;
  return to_jsonb(v_req);
end $$;

create function public.api_request_assign(p_site text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['assignment']);
  v_req requests;
  v_asg assignments;
begin
  v_req := _find_request(p_site, p_id);
  if v_req.status <> 'Approved' then
    perform _fail(v_req.code || ' must be Approved before assigning (it is ' || v_req.status || ')', 409);
  end if;
  if v_req.type <> 'material' then perform _fail('Only material requests can be assigned'); end if;
  v_asg := _assign_material(v_req.site_id, coalesce(v_req.target_site_id, p_site), v_req);
  return to_jsonb(v_asg);
end $$;
