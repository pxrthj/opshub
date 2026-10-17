-- Server-side business logic: stock engine.

create function public._manager_action(r requests, p_site text) returns text
language plpgsql immutable as $$
declare
  v_supplied boolean := r.type = 'material' and r.target_site_id is not null and r.target_site_id <> r.site_id;
begin
  if r.status <> 'Pending' then return null; end if;
  if not v_supplied then return case when r.site_id = p_site then 'decide' end; end if;
  if p_site = r.site_id then return case when r.forwarded_at is not null then 'waiting-for-other-office' else 'send-on' end; end if;
  if p_site = r.target_site_id then return case when r.forwarded_at is not null then 'decide' end; end if;
  return null;
end $$;

create function public._find_request(p_site text, p_id text) returns requests
language plpgsql security definer set search_path = public as $$
declare
  r requests;
begin
  select * into r from requests where id = p_id and (site_id = p_site or target_site_id = p_site) for update;
  if not found or (r.site_id <> p_site and r.forwarded_at is null) then perform _fail('Request not found', 404); end if;
  return r;
end $$;

create function public._site_name(p_site text) returns text
language sql stable security definer set search_path = public as $$ select name from sites where id = p_site $$;

-- ALL-OR-NOTHING issue of stock: lock the rows, check every line, then decrement, log and create the assignment.

create function public._assign_material(p_origin text, p_stock text, p_req requests) returns assignments
language plpgsql security definer set search_path = public as $$
declare
  v_store text := _site_name(p_stock);
  v_line record;
  v_item inventory_items;
  v_short text[] := '{}';
  v_asg assignments;
begin
  if v_store is null then perform _fail('Stock source site "' || p_stock || '" not found', 404); end if;

  for v_line in
    select l ->> 'itemId' as item_id, sum((l ->> 'qty')::int) as qty, min(l ->> 'itemName') as name
    from jsonb_array_elements(p_req.lines) l group by 1 order by 1
  loop
    select * into v_item from inventory_items where id = v_line.item_id and site_id = p_stock for update;
    if not found then
      v_short := v_short || (v_line.name || ': not stocked in ' || v_store);
    elsif v_item.qty < v_line.qty then
      v_short := v_short || (v_line.name || ': need ' || v_line.qty || ', only ' || v_item.qty || ' ' || v_item.unit || ' available');
    end if;
  end loop;
  if array_length(v_short, 1) > 0 then
    perform _fail('Insufficient stock in ' || v_store || ' — nothing was changed. ' || array_to_string(v_short, '; '), 409);
  end if;

  for v_line in
    select l ->> 'itemId' as item_id, sum((l ->> 'qty')::int) as qty
    from jsonb_array_elements(p_req.lines) l group by 1 order by 1
  loop
    select * into v_item from inventory_items where id = v_line.item_id and site_id = p_stock;
    update inventory_items set qty = qty - v_line.qty, updated_at = now() where id = v_item.id;
    perform _audit(p_stock, v_item, 'dispatch', 'qty', to_jsonb(v_item.qty), to_jsonb(v_item.qty - v_line.qty::int),
                   'Dispatched for ' || p_req.code || case when p_req.purpose <> '' then ' (' || p_req.purpose || ')' else '' end,
                   p_req.code, 'Manager');
  end loop;

  insert into assignments (id, code, site_id, stock_site_id, request_id, request_code, assignee_id, assignee_name, lines, created_at, created_by)
  values (_newid('as'),
          'ASN-' || _prefix(p_stock) || '-' || _next_num(array(select code from assignments where site_id = p_origin), 500),
          p_origin, p_stock, p_req.id, p_req.code, p_req.requested_by, p_req.requested_by_name, p_req.lines, now(), _actor_name())
  returning * into v_asg;
  update requests set status = 'Assigned', assignment_id = v_asg.id where id = p_req.id;
  return v_asg;
end $$;
