-- Server-side business logic: repairs members api.

create function public.api_repair_create(p_site text, p_values jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Member', array['pcb-repair']);
  v_job repairs;
begin
  if btrim(coalesce(p_values ->> 'meterId', '')) = '' then perform _fail('Meter number is required'); end if;
  if btrim(coalesce(p_values ->> 'meterType', '')) = '' then perform _fail('Type of meter is required'); end if;
  if btrim(coalesce(p_values ->> 'fault', '')) = '' then perform _fail('Fault is required'); end if;
  perform pg_advisory_xact_lock(hashtext('repairs:' || p_site));
  insert into repairs (id, site_id, code, meter_id, meter_type, fault, technician, parts_used, status, received_at, updated_at, custom)
  values (_newid('rj'), p_site,
          'RJ-' || _prefix(p_site) || '-' || _next_num(array(select code from repairs where site_id = p_site), 300),
          upper(btrim(p_values ->> 'meterId')), p_values ->> 'meterType', p_values ->> 'fault',
          coalesce(p_values ->> 'technician', ''), coalesce(p_values ->> 'partsUsed', ''), 'Received', now(), now(),
          p_values - array['meterId', 'meterType', 'fault', 'technician', 'partsUsed', 'id', 'code', 'status', 'receivedAt', 'updatedAt', 'requestId', 'returned'])
  returning * into v_job;
  return to_jsonb(v_job);
end $$;

create function public.api_repair_update(p_site text, p_id text, p_values jsonb, p_status text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_role text := _guard(p_site, 'Member', array['pcb-repair']);
  v_job repairs;
begin
  select * into v_job from repairs where id = p_id and site_id = p_site for update;
  if not found then perform _fail('Repair job not found', 404); end if;
  if v_job.returned then perform _fail(v_job.code || ' was already returned to stock and is closed', 409); end if;
  if p_status is not null and p_status not in ('Received', 'In Repair', 'Fixed', 'Scrapped') then perform _fail('Invalid status'); end if;
  update repairs set
    meter_id = coalesce(nullif(btrim(p_values ->> 'meterId'), ''), meter_id),
    meter_type = coalesce(nullif(p_values ->> 'meterType', ''), meter_type),
    fault = coalesce(nullif(p_values ->> 'fault', ''), fault),
    technician = coalesce(p_values ->> 'technician', technician),
    parts_used = coalesce(p_values ->> 'partsUsed', parts_used),
    status = coalesce(p_status, status),
    custom = custom || (p_values - array['meterId', 'meterType', 'fault', 'technician', 'partsUsed', 'id', 'code', 'status', 'receivedAt', 'updatedAt', 'requestId', 'returned']),
    updated_at = now()
  where id = p_id returning * into v_job;
  return to_jsonb(v_job);
end $$;

