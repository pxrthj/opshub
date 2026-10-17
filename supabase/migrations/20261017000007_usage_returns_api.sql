-- Server-side business logic: usage returns api.

create function public._line_remaining(p_asg assignments, p_item text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'itemName', l ->> 'itemName', 'unit', l ->> 'unit',
    'remaining', (l ->> 'qty')::int
      - coalesce((select sum(qty) from consumption where assignment_id = p_asg.id and item_id = p_item), 0)
      - coalesce((select sum(qty) from returns where source = 'assignment' and ref_id = p_asg.id and item_id = p_item), 0))
  from jsonb_array_elements(p_asg.lines) l where l ->> 'itemId' = p_item limit 1
$$;

create function public.api_consumption_create(p_site text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Member', array['consumption']);
  v_asg assignments;
  v_line jsonb;
  v_qty int;
  v_loc text := btrim(coalesce(p_body ->> 'location', ''));
  v_rec consumption;
begin
  select * into v_asg from assignments where id = p_body ->> 'assignmentId' and (site_id = p_site or stock_site_id = p_site) for update;
  if not found then perform _fail('Assignment not found', 404); end if;
  if role_rank(v_role) < 2 and v_asg.assignee_id <> auth.uid() then
    perform _fail('You can only record usage for material issued to you', 403);
  end if;
  v_line := _line_remaining(v_asg, p_body ->> 'itemId');
  if v_line is null then perform _fail('Choose an item from this assignment'); end if;
  if coalesce(p_body ->> 'qty', '') !~ '^\d+$' or (p_body ->> 'qty')::numeric <= 0 then
    perform _fail('Quantity used must be a positive whole number');
  end if;
  v_qty := (p_body ->> 'qty')::int;
  if v_qty > (v_line ->> 'remaining')::int then
    perform _fail('Only ' || (v_line ->> 'remaining') || ' ' || (v_line ->> 'unit') || ' remaining for ' || (v_line ->> 'itemName'));
  end if;
  if v_loc = '' then perform _fail('Site / Location is required'); end if;
  insert into consumption (id, site_id, assignment_id, item_id, item_name, qty, location, date, recorded_by)
  values (_newid('cn'), p_site, v_asg.id, p_body ->> 'itemId', v_line ->> 'itemName', v_qty, v_loc, now(), _actor_name())
  returning * into v_rec;
  return to_jsonb(v_rec);
end $$;

create function public.api_return_create(p_site text, p_body jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Member', array['returns']);
  v_stock text;
  v_store text;
  v_job repairs;
  v_asg assignments;
  v_item inventory_items;
  v_line jsonb;
  v_qty int;
  v_rec returns;
begin
  select coalesce(live -> 'workflow' ->> 'stockSourceSiteId', p_site) into v_stock from sites where id = p_site;
  v_store := _site_name(v_stock);

  if p_body ->> 'source' = 'repair' then
    if not _has_module(p_site, 'pcb-repair') then perform _fail('PCB Repair is not enabled on this site', 403); end if;
    select * into v_job from repairs where id = p_body ->> 'refId' and site_id = p_site for update;
    if not found then perform _fail('Repair job not found', 404); end if;
    if v_job.status <> 'Fixed' then perform _fail(v_job.code || ' is ' || v_job.status || ' — only Fixed meters can be returned', 409); end if;
    if v_job.returned then perform _fail(v_job.code || ' was already returned to stock', 409); end if;
    select * into v_item from inventory_items where site_id = v_stock and lower(name) = lower(v_job.meter_type) for update;
    if not found then perform _fail('"' || v_job.meter_type || '" is not an item in ' || v_store, 409); end if;
    update inventory_items set qty = qty + 1, updated_at = now() where id = v_item.id;
    perform _audit(v_stock, v_item, 'return', 'qty', to_jsonb(v_item.qty), to_jsonb(v_item.qty + 1),
                   'Repaired meter returned to stock (' || v_job.code || ')', v_job.code, v_role);
    update repairs set returned = true, updated_at = now() where id = v_job.id;
    insert into returns (id, site_id, source, ref_id, ref_code, item_id, item_name, qty, condition, stock_site_id, date, returned_by)
    values (_newid('rt'), p_site, 'repair', v_job.id, v_job.code, v_item.id, v_item.name, 1, 'Repaired', v_stock, now(), _actor_name())
    returning * into v_rec;
  else
    if not _has_module(p_site, 'assignment') then perform _fail('Material Assignment is not enabled on this site', 403); end if;
    select * into v_asg from assignments where id = p_body ->> 'refId' and (site_id = p_site or stock_site_id = p_site) for update;
    if not found then perform _fail('Assignment not found', 404); end if;
    if role_rank(v_role) < 2 and v_asg.assignee_id <> auth.uid() then
      perform _fail('You can only return material issued to you', 403);
    end if;
    v_line := _line_remaining(v_asg, p_body ->> 'itemId');
    if v_line is null then perform _fail('Choose an item from this assignment'); end if;
    if coalesce(p_body ->> 'qty', '') !~ '^\d+$' or (p_body ->> 'qty')::numeric <= 0 then
      perform _fail('Return quantity must be a positive whole number');
    end if;
    v_qty := (p_body ->> 'qty')::int;
    if v_qty > (v_line ->> 'remaining')::int then
      perform _fail('Only ' || (v_line ->> 'remaining') || ' ' || (v_line ->> 'unit') || ' unused for ' || (v_line ->> 'itemName'));
    end if;
    select * into v_item from inventory_items where id = p_body ->> 'itemId' and site_id = v_stock for update;
    if not found then perform _fail((v_line ->> 'itemName') || ' no longer exists in stores', 409); end if;
    update inventory_items set qty = qty + v_qty, updated_at = now() where id = v_item.id;
    perform _audit(v_stock, v_item, 'return', 'qty', to_jsonb(v_item.qty), to_jsonb(v_item.qty + v_qty),
                   'Unused material returned from ' || v_asg.code, v_asg.code, v_role);
    insert into returns (id, site_id, source, ref_id, ref_code, item_id, item_name, qty, condition, stock_site_id, date, returned_by)
    values (_newid('rt'), p_site, 'assignment', v_asg.id, v_asg.code, v_item.id, v_item.name, v_qty, 'Unused', v_stock, now(), _actor_name())
    returning * into v_rec;
  end if;
  return jsonb_build_object('record', to_jsonb(v_rec), 'stockSiteName', v_store);
end $$;
