-- PHASE 1: Phonesia vqtoxgcacosdqtoxihko only.
-- Apply before deploying the server-side QR form. No existing data is changed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema if not exists phonesia_private;
revoke all on schema phonesia_private from public, anon, authenticated;

create table if not exists phonesia_private.qr_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  attempts integer not null check (attempts > 0),
  primary key (bucket_key, window_start)
);
create index if not exists phonesia_qr_rate_limits_window_idx
  on phonesia_private.qr_rate_limits (window_start);
alter table phonesia_private.qr_rate_limits enable row level security;
revoke all on phonesia_private.qr_rate_limits from public, anon, authenticated;

create or replace function public.phonesia_register_qr(
  p_nome text,
  p_cognome text,
  p_telefono text,
  p_email text,
  p_codice_fiscale text,
  p_negozio_id bigint,
  p_marketing_accepted boolean,
  p_user_agent text,
  p_ip_hash text,
  p_phone_hash text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_ip_window timestamptz;
  v_phone_window timestamptz;
  v_attempts integer;
  v_lock bigint;
  v_id bigint;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_cf text := upper(btrim(p_codice_fiscale));
begin
  if p_nome is null or length(btrim(p_nome)) not between 1 and 100
     or p_cognome is null or length(btrim(p_cognome)) not between 1 and 100
     or coalesce(p_telefono, '') !~ '^\+39[0-9]{9,10}$'
     or coalesce(v_cf, '') !~ '^([A-Z0-9]{16}|[0-9]{11})$'
     or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
     or p_marketing_accepted is null
     or coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$'
     or coalesce(p_phone_hash, '') !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from public.phonesia_negozi where codice = p_negozio_id)
  then
    raise exception 'Invalid registration input' using errcode = '22023';
  end if;

  -- Store keyed hashes only, never raw client IP addresses or telephone numbers.
  delete from phonesia_private.qr_rate_limits where window_start < v_now - interval '1 day';
  v_ip_window := date_bin(interval '10 minutes', v_now, timestamptz '2000-01-01 00:00:00+00');
  insert into phonesia_private.qr_rate_limits as limits (bucket_key, window_start, attempts)
    values ('ip:' || p_ip_hash, v_ip_window, 1)
    on conflict (bucket_key, window_start)
    do update set attempts = least(limits.attempts + 1, 1000)
    returning attempts into v_attempts;
  if v_attempts > 20 then
    return jsonb_build_object('status', 'rate_limited', 'retry_after',
      greatest(1, ceil(extract(epoch from v_ip_window + interval '10 minutes' - v_now))::integer));
  end if;

  v_phone_window := date_trunc('hour', v_now);
  insert into phonesia_private.qr_rate_limits as limits (bucket_key, window_start, attempts)
    values ('phone:' || p_phone_hash, v_phone_window, 1)
    on conflict (bucket_key, window_start)
    do update set attempts = least(limits.attempts + 1, 1000)
    returning attempts into v_attempts;
  if v_attempts > 3 then
    return jsonb_build_object('status', 'rate_limited', 'retry_after',
      greatest(1, ceil(extract(epoch from v_phone_window + interval '1 hour' - v_now))::integer));
  end if;

  -- Serialize registrations sharing any identity field; acquire locks in a
  -- consistent order so simultaneous requests cannot create duplicate customers.
  for v_lock in
    select distinct hashtextextended(identity_key, 0)
    from unnest(array[
      'phonesia-qr:phone:' || p_telefono,
      'phonesia-qr:cf:' || v_cf,
      'phonesia-qr:email:' || v_email
    ]) as identity_key
    where identity_key is not null
    order by 1
  loop
    perform pg_advisory_xact_lock(v_lock);
  end loop;

  if exists (
    select 1 from public.phonesia_clienti c
    where c.telefono = p_telefono or upper(c.codice_fiscale) = v_cf
      or (v_email is not null and lower(c.email) = v_email)
  ) then
    -- Never expose an existing customer's ID, personal data or consent state.
    return jsonb_build_object('status', 'accepted');
  end if;

  begin
    insert into public.phonesia_clienti
      (nome, cognome, telefono, email, codice_fiscale, negozio_id, qr_id)
    values
      (btrim(p_nome), btrim(p_cognome), p_telefono, v_email, v_cf, p_negozio_id, 'phonesia_qr')
    returning id into v_id;

    insert into public.phonesia_consensi
      (cliente_id, tipo_evento, metodo, privacy_version, privacy_hash,
       negozio_id, qr_id, user_agent, welcome_message_pending, welcome_message_type, welcome_message_link)
    values
      (v_id, 'privacy_accepted', 'qr', 'v1.0', 'privacy_v1_placeholder',
       p_negozio_id, 'phonesia_qr', left(coalesce(p_user_agent, ''), 512), true, 'welcome', '/phonesia/biglietto');

    if p_marketing_accepted then
      insert into public.phonesia_consensi
        (cliente_id, tipo_evento, metodo, negozio_id, qr_id, user_agent)
      values (v_id, 'marketing_accepted', 'qr', p_negozio_id, 'phonesia_qr', left(coalesce(p_user_agent, ''), 512));
    end if;
  exception when unique_violation then
    -- The subtransaction rolls back customer and consents together.
    -- Existing importers may concurrently insert the same identity.
    return jsonb_build_object('status', 'accepted');
  end;

  -- Only the trusted server receives the new ID, to send the existing welcome.
  return jsonb_build_object('status', 'created', 'cliente_id', v_id);
end;
$$;

revoke all on function public.phonesia_register_qr(text,text,text,text,text,bigint,boolean,text,text,text)
  from public, anon, authenticated;
grant execute on function public.phonesia_register_qr(text,text,text,text,text,bigint,boolean,text,text,text)
  to service_role;
notify pgrst, 'reload schema';
commit;
