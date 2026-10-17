-- Server-side business logic: request create approve.

create function public.api_request_create(p_site text, p_body jsonb) returns jsonb
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
    if btrim(coalesce(p_body #>> '{repair,meterId}', '')) = '' then perform _fail('Meter ID is required'); end if;
    if btrim(coalesce(p_body #>> '{repair,fault}', '')) = '' then perform _fail('Fault is required'); end if;
    v_repair := jsonb_build_object(
      'meterId', upper(btrim(p_body #>> '{repair,meterId}')),
      'meterType', coalesce(nullif(p_body #>> '{repair,meterType}', ''), 'Single Phase Smart Meter'),
      'fault', p_body #>> '{repair,fault}');
    if v_purpose = '' then v_purpose := 'Repair ' || (v_repair ->> 'meterId'); end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('requests:' || p_site));
  insert into requests (id, code, type, site_id, target_site_id, lines, repair, purpose, priority, requested_by, requested_by_name,
                        created_at, status, custom)
  values (_newid('rq'),
          'REQ-' || _prefix(p_site) || '-' || _next_num(array(select code from requests where site_id = p_site), 1000),
          v_type, p_site, v_target, v_lines, v_repair, v_purpose, coalesce(nullif(p_body ->> 'priority', ''), 'Normal'),
          auth.uid(), _actor_name(), now(), 'Pending',
          p_body - array['type', 'lines', 'repair', 'purpose', 'priority', 'id', 'code', 'status', 'requestedBy', 'requestedByName', 'createdAt'])
  returning * into v_req;
  return to_jsonb(v_req);
end $$;

create function public.api_request_approve(p_site text, p_id text, p_comment text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['approval']);
  v_site sites;
  v_req requests;
  v_action text;
  v_supplied boolean;
  v_gives boolean;
  v_asg assignments;
  v_job repairs;
  v_asg_code text;
  v_job_code text;
begin
  select * into v_site from sites where id = p_site;
  v_req := _find_request(p_site, p_id);
  if v_req.status <> 'Pending' then perform _fail(v_req.code || ' is already ' || v_req.status, 409); end if;
  v_action := _manager_action(v_req, p_site);
  if v_action = 'send-on' then
    perform _fail('Send ' || v_req.code || ' to ' || coalesce(_site_name(v_req.target_site_id), 'the other office') || ' first. Only their managers can approve it.', 403);
  end if;
  if v_action is distinct from 'decide' then
    perform _fail(v_req.code || ' is not waiting for a decision from ' || v_site.name || '.', 403);
  end if;

  update requests set status = 'Approved', decided_by = _actor_name(), decided_at = now(),
                      decision_comment = nullif(btrim(coalesce(p_comment, '')), '')
  where id = v_req.id returning * into v_req;

  -- An office that supplies stock to another office gives it out as soon as it approves. Otherwise the
  -- asking office's own setup (a "Giving Out Stock" feature) applies.
  v_supplied := v_req.type = 'material' and v_req.target_site_id is not null and v_req.target_site_id <> v_req.site_id;
  v_gives := case when v_supplied then _has_module(p_site, 'inventory') else _has_module(p_site, 'assignment') end;
  if v_req.type = 'material' and v_gives and coalesce((v_site.live -> 'workflow' ->> 'autoAssignOnApproval')::boolean, false) then
    v_asg := _assign_material(v_req.site_id, coalesce(v_req.target_site_id, p_site), v_req);
    v_asg_code := v_asg.code;
    select * into v_req from requests where id = v_req.id;
  end if;

  if v_req.type = 'repair' and v_req.repair is not null and _has_module(p_site, 'pcb-repair') then
    insert into repairs (id, site_id, code, meter_id, meter_type, fault, technician, parts_used, status, received_at, updated_at, request_id)
    values (_newid('rj'), p_site,
            'RJ-' || _prefix(p_site) || '-' || _next_num(array(select code from repairs where site_id = p_site), 300),
            v_req.repair ->> 'meterId', v_req.repair ->> 'meterType', v_req.repair ->> 'fault', '', '', 'Received',
            v_req.decided_at, v_req.decided_at, v_req.id)
    returning * into v_job;
    update requests set repair_job_id = v_job.id where id = v_req.id returning * into v_req;
    v_job_code := v_job.code;
  end if;

  return jsonb_build_object('request', to_jsonb(v_req), 'assignmentCode', v_asg_code, 'repairCode', v_job_code);
end $$;
