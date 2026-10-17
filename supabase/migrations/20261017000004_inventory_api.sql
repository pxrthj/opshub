-- Server-side business logic: inventory api.

create function public.api_inventory_create(p_site text, p_values jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['inventory']);
  v_item inventory_items;
begin
  perform _assert_own_inventory(p_site);
  perform _inv_check(p_values);
  if exists (select 1 from inventory_items where site_id = p_site and lower(name) = lower(btrim(p_values ->> 'name'))) then
    perform _fail('"' || btrim(p_values ->> 'name') || '" already exists — edit the existing item instead', 409);
  end if;
  insert into inventory_items (id, site_id, name, category, unit, qty, unit_price, reorder_level, custom, updated_at)
  values (_newid('itm'), p_site, btrim(p_values ->> 'name'), p_values ->> 'category', p_values ->> 'unit',
          (p_values ->> 'qty')::int, (p_values ->> 'unitPrice')::numeric, (p_values ->> 'reorderLevel')::int,
          p_values - array['name', 'category', 'unit', 'qty', 'unitPrice', 'reorderLevel', 'id', 'updatedAt'], now())
  returning * into v_item;
  perform _audit(p_site, v_item, 'create', 'created', null, null, 'New item added to inventory', null, v_role);
  return to_jsonb(v_item);
end $$;

create function public.api_inventory_update(p_site text, p_id text, p_values jsonb, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Manager', array['inventory']);
  v_old inventory_items;
  v_item inventory_items;
begin
  perform _assert_own_inventory(p_site);
  select * into v_old from inventory_items where id = p_id and site_id = p_site for update;
  if not found then perform _fail('Item not found', 404); end if;
  perform _inv_check(p_values);
  if exists (select 1 from inventory_items where site_id = p_site and id <> p_id and lower(name) = lower(btrim(p_values ->> 'name'))) then
    perform _fail('Another item is already called "' || btrim(p_values ->> 'name') || '"', 409);
  end if;
  update inventory_items set
    name = btrim(p_values ->> 'name'), category = p_values ->> 'category', unit = p_values ->> 'unit',
    qty = (p_values ->> 'qty')::int, unit_price = (p_values ->> 'unitPrice')::numeric,
    reorder_level = (p_values ->> 'reorderLevel')::int,
    custom = custom || (p_values - array['name', 'category', 'unit', 'qty', 'unitPrice', 'reorderLevel', 'id', 'updatedAt']),
    updated_at = now()
  where id = p_id returning * into v_item;
  if v_item.qty <> v_old.qty then
    perform _audit(p_site, v_item, 'quantity', 'qty', to_jsonb(v_old.qty), to_jsonb(v_item.qty), p_reason, null, v_role);
  end if;
  if v_item.unit_price <> v_old.unit_price then
    perform _audit(p_site, v_item, 'price', 'unitPrice', to_jsonb(v_old.unit_price), to_jsonb(v_item.unit_price), p_reason, null, v_role);
  end if;
  if v_item.reorder_level <> v_old.reorder_level then
    perform _audit(p_site, v_item, 'threshold', 'reorderLevel', to_jsonb(v_old.reorder_level), to_jsonb(v_item.reorder_level), p_reason, null, v_role);
  end if;
  return to_jsonb(v_item);
end $$;

create function public.api_inventory_import(p_site text, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Admin', array['reports']);
  v_row jsonb;
  v_existing inventory_items;
  v_item inventory_items;
  v_created int := 0;
  v_updated int := 0;
begin
  perform _assert_own_inventory(p_site);
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    perform _fail('The file has no rows to import');
  end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    perform _inv_check(v_row);
    select * into v_existing from inventory_items where site_id = p_site and lower(name) = lower(btrim(v_row ->> 'name')) for update;
    if found then
      update inventory_items set
        category = v_row ->> 'category', unit = v_row ->> 'unit', qty = (v_row ->> 'qty')::int,
        unit_price = (v_row ->> 'unitPrice')::numeric, reorder_level = (v_row ->> 'reorderLevel')::int,
        custom = custom || (v_row - array['name', 'category', 'unit', 'qty', 'unitPrice', 'reorderLevel', 'id', 'updatedAt']),
        updated_at = now()
      where id = v_existing.id returning * into v_item;
      v_updated := v_updated + 1;
      if v_item.qty <> v_existing.qty then
        perform _audit(p_site, v_item, 'quantity', 'qty', to_jsonb(v_existing.qty), to_jsonb(v_item.qty), 'Bulk inventory import update', null, v_role);
      end if;
    else
      insert into inventory_items (id, site_id, name, category, unit, qty, unit_price, reorder_level, custom, updated_at)
      values (_newid('itm'), p_site, btrim(v_row ->> 'name'), v_row ->> 'category', v_row ->> 'unit', (v_row ->> 'qty')::int,
              (v_row ->> 'unitPrice')::numeric, (v_row ->> 'reorderLevel')::int,
              v_row - array['name', 'category', 'unit', 'qty', 'unitPrice', 'reorderLevel', 'id', 'updatedAt'], now())
      returning * into v_item;
      v_created := v_created + 1;
      perform _audit(p_site, v_item, 'create', 'created', null, to_jsonb(v_item.qty), 'Bulk inventory import addition', null, v_role);
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated);
end $$;
