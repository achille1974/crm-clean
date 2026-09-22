begin;

create extension if not exists pgcrypto;

create table if not exists public.phonesia_whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  promo_key text not null,
  promo_name text not null,
  send_mode text not null,
  template_name text not null,
  template_language text not null default 'it',
  normalized_message text,
  attachment_public_url text,
  attachment_file_name text,
  attachment_mime_type text,
  selected_declared integer not null check (selected_declared >= 0),
  documented_recipients integer not null default 0 check (documented_recipients >= 0),
  unreconstructable_count integer not null default 0 check (unreconstructable_count >= 0),
  snapshot_complete boolean not null default false,
  historical boolean not null default false,
  state text not null default 'draft' check (
    state in ('draft', 'ready', 'processing', 'paused', 'completed', 'needs_review')
  ),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check (documented_recipients + unreconstructable_count <= selected_declared),
  check (not snapshot_complete or documented_recipients = selected_declared),
  check (not historical or state <> 'processing')
);

create table if not exists public.phonesia_whatsapp_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.phonesia_whatsapp_campaigns(id) on delete restrict,
  cliente_id bigint references public.phonesia_clienti(id) on delete restrict,
  input_position integer not null check (input_position >= 0),
  normalized_phone text check (normalized_phone is null or normalized_phone ~ '^[0-9]{8,20}$'),
  send_state text not null check (
    send_state in ('pending', 'processing', 'accepted', 'rejected', 'skipped', 'uncertain')
  ),
  delivery_state text check (delivery_state in ('sent', 'delivered', 'read', 'failed')),
  exclusion_reason text,
  error_code text,
  error_message text,
  whatsapp_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempt_started_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  eligibility_snapshot jsonb not null default '{}'::jsonb,
  last_eligibility_check jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, input_position),
  unique (campaign_id, normalized_phone),
  unique (campaign_id, cliente_id),
  unique (whatsapp_message_id),
  check ((send_state = 'accepted') = (whatsapp_message_id is not null)),
  check (send_state <> 'processing' or (lease_token is not null and attempt_started_at is not null))
);

create table if not exists public.phonesia_whatsapp_campaign_attempts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.phonesia_whatsapp_campaign_recipients(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  lease_token uuid not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text not null default 'processing' check (
    outcome in ('processing', 'accepted', 'rejected', 'skipped', 'uncertain')
  ),
  http_status integer,
  whatsapp_message_id text,
  error_code text,
  error_message text,
  response_summary jsonb,
  unique (recipient_id, attempt_number),
  unique (recipient_id, lease_token)
);

create table if not exists public.phonesia_whatsapp_delivery_events (
  id bigint generated always as identity primary key,
  whatsapp_message_id text not null,
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  timestamp_meta timestamptz not null,
  error_code text,
  error_title text,
  error_message text,
  payload jsonb,
  created_at timestamptz not null default now(),
  unique (whatsapp_message_id, status, timestamp_meta)
);

create index if not exists phonesia_wa_campaigns_state_idx
  on public.phonesia_whatsapp_campaigns (state, created_at);
create index if not exists phonesia_wa_recipients_claim_idx
  on public.phonesia_whatsapp_campaign_recipients (campaign_id, send_state, input_position);
create index if not exists phonesia_wa_recipients_lease_idx
  on public.phonesia_whatsapp_campaign_recipients (send_state, lease_expires_at)
  where send_state = 'processing';
create index if not exists phonesia_wa_delivery_message_idx
  on public.phonesia_whatsapp_delivery_events (whatsapp_message_id, timestamp_meta);

alter table public.phonesia_whatsapp_campaigns enable row level security;
alter table public.phonesia_whatsapp_campaign_recipients enable row level security;
alter table public.phonesia_whatsapp_campaign_attempts enable row level security;
alter table public.phonesia_whatsapp_delivery_events enable row level security;

create or replace function public.phonesia_is_active_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.phonesia_user_profiles p
    where p.auth_user_id = auth.uid() and p.active = true and p.role = 'admin'
  );
$$;

create or replace function public.phonesia_create_whatsapp_campaign_snapshot(
  p_idempotency_key text,
  p_promo_key text,
  p_promo_name text,
  p_send_mode text,
  p_template_name text,
  p_template_language text,
  p_normalized_message text,
  p_attachment_public_url text,
  p_attachment_file_name text,
  p_attachment_mime_type text,
  p_created_by uuid,
  p_recipients jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_campaign_id uuid; v_count integer;
begin
  if jsonb_typeof(p_recipients) <> 'array' then raise exception 'recipients must be an array'; end if;
  v_count := jsonb_array_length(p_recipients);
  if v_count < 1 then raise exception 'empty campaign'; end if;

  select id into v_campaign_id from public.phonesia_whatsapp_campaigns
   where idempotency_key=p_idempotency_key;
  if found then return v_campaign_id; end if;

  insert into public.phonesia_whatsapp_campaigns
    (idempotency_key,promo_key,promo_name,send_mode,template_name,template_language,
     normalized_message,attachment_public_url,attachment_file_name,attachment_mime_type,
     selected_declared,documented_recipients,unreconstructable_count,snapshot_complete,state,created_by)
  values
    (p_idempotency_key,p_promo_key,p_promo_name,p_send_mode,p_template_name,p_template_language,
     p_normalized_message,p_attachment_public_url,p_attachment_file_name,p_attachment_mime_type,
     v_count,v_count,0,true,'ready',p_created_by)
  returning id into v_campaign_id;

  insert into public.phonesia_whatsapp_campaign_recipients
    (campaign_id,cliente_id,input_position,normalized_phone,send_state,exclusion_reason,eligibility_snapshot)
  select v_campaign_id,x.cliente_id,x.input_position,x.normalized_phone,
         case when nullif(x.exclusion_reason,'') is null then 'pending' else 'skipped' end,
         nullif(x.exclusion_reason,''),coalesce(x.eligibility_snapshot,'{}'::jsonb)
  from jsonb_to_recordset(p_recipients) as x(
    cliente_id bigint,input_position integer,normalized_phone text,
    exclusion_reason text,eligibility_snapshot jsonb
  );

  if (select count(*) from public.phonesia_whatsapp_campaign_recipients where campaign_id=v_campaign_id) <> v_count then
    raise exception 'incomplete recipient snapshot';
  end if;
  return v_campaign_id;
exception when unique_violation then
  select id into v_campaign_id from public.phonesia_whatsapp_campaigns where idempotency_key=p_idempotency_key;
  if v_campaign_id is null then raise; end if;
  return v_campaign_id;
end;
$$;

drop policy if exists phonesia_wa_campaigns_admin_read on public.phonesia_whatsapp_campaigns;
create policy phonesia_wa_campaigns_admin_read on public.phonesia_whatsapp_campaigns
  for select using (public.phonesia_is_active_admin());
drop policy if exists phonesia_wa_recipients_admin_read on public.phonesia_whatsapp_campaign_recipients;
create policy phonesia_wa_recipients_admin_read on public.phonesia_whatsapp_campaign_recipients
  for select using (public.phonesia_is_active_admin());
drop policy if exists phonesia_wa_attempts_admin_read on public.phonesia_whatsapp_campaign_attempts;
create policy phonesia_wa_attempts_admin_read on public.phonesia_whatsapp_campaign_attempts
  for select using (public.phonesia_is_active_admin());
drop policy if exists phonesia_wa_delivery_admin_read on public.phonesia_whatsapp_delivery_events;
create policy phonesia_wa_delivery_admin_read on public.phonesia_whatsapp_delivery_events
  for select using (public.phonesia_is_active_admin());

create or replace function public.phonesia_claim_whatsapp_recipients(
  p_campaign_id uuid,
  p_limit integer default 25,
  p_lease_seconds integer default 45
) returns setof public.phonesia_whatsapp_campaign_recipients
language plpgsql security definer set search_path = public as $$
declare v_token uuid := gen_random_uuid();
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'invalid claim limit'; end if;
  if not exists (
    select 1 from public.phonesia_whatsapp_campaigns c
    where c.id=p_campaign_id and c.historical=false and c.snapshot_complete=true
      and c.state in ('ready','processing')
  ) then raise exception 'campaign is not dispatchable'; end if;

  -- Una prenotazione scaduta prima dell'avvio non rappresenta un tentativo.
  update public.phonesia_whatsapp_campaign_recipients
     set lease_token = null, lease_expires_at = null, updated_at = now()
   where campaign_id = p_campaign_id and send_state = 'pending'
     and attempt_started_at is null and lease_expires_at < now();

  -- Dopo l'avvio, processing non torna mai pending: l'esito Meta potrebbe essere ambiguo.
  update public.phonesia_whatsapp_campaign_recipients
     set send_state = 'uncertain',
         error_code = coalesce(error_code, 'lease_expired'),
         error_message = coalesce(error_message, 'Worker interrotto dopo l''avvio del tentativo.'),
         completed_at = now(), lease_token = null, lease_expires_at = null, updated_at = now()
   where campaign_id = p_campaign_id and send_state = 'processing' and lease_expires_at < now();

  return query with candidates as (
    select r.id
      from public.phonesia_whatsapp_campaign_recipients r
     where r.campaign_id = p_campaign_id and r.send_state = 'pending' and r.lease_token is null
     order by r.input_position
     for update skip locked
     limit p_limit
  ), claimed as (
    update public.phonesia_whatsapp_campaign_recipients r
       set lease_token = v_token,
           lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
      from candidates c where r.id = c.id
    returning r.*
  )
  select claimed.* from claimed order by claimed.input_position;
end;
$$;

create or replace function public.phonesia_start_whatsapp_attempt(
  p_recipient_id uuid, p_lease_token uuid
) returns void language plpgsql security definer set search_path = public as $$
declare v_attempt integer;
begin
  update public.phonesia_whatsapp_campaign_recipients
     set send_state='processing', attempt_started_at=now(),
         attempt_count=attempt_count+1, lease_expires_at=now() + interval '45 seconds',
         updated_at=now()
   where id=p_recipient_id and send_state='pending' and lease_token=p_lease_token
     and lease_expires_at >= now() and attempt_started_at is null
   returning attempt_count into v_attempt;
  if not found then raise exception 'recipient reservation lost'; end if;

  insert into public.phonesia_whatsapp_campaign_attempts
    (recipient_id,attempt_number,lease_token)
  values (p_recipient_id,v_attempt,p_lease_token);
end;
$$;

create or replace function public.phonesia_release_whatsapp_recipient(
  p_recipient_id uuid, p_lease_token uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.phonesia_whatsapp_campaign_recipients
     set lease_token=null, lease_expires_at=null, updated_at=now()
   where id=p_recipient_id and send_state='pending' and lease_token=p_lease_token
     and attempt_started_at is null;
  if not found then raise exception 'recipient reservation lost'; end if;
end;
$$;

create or replace function public.phonesia_skip_whatsapp_recipient(
  p_recipient_id uuid, p_lease_token uuid, p_message text
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.phonesia_whatsapp_campaign_recipients
     set send_state='skipped', exclusion_reason=p_message, error_message=p_message,
         completed_at=now(), lease_token=null, lease_expires_at=null, updated_at=now()
   where id=p_recipient_id and send_state='pending' and lease_token=p_lease_token
     and attempt_started_at is null;
  if not found then raise exception 'recipient reservation lost'; end if;
end;
$$;

create or replace function public.phonesia_finish_whatsapp_attempt(
  p_recipient_id uuid, p_lease_token uuid, p_outcome text,
  p_whatsapp_message_id text default null, p_http_status integer default null,
  p_error_code text default null, p_error_message text default null,
  p_response_summary jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_outcome not in ('accepted','rejected','skipped','uncertain') then
    raise exception 'invalid terminal outcome';
  end if;
  if (p_outcome = 'accepted') <> (p_whatsapp_message_id is not null) then
    raise exception 'accepted requires whatsapp_message_id';
  end if;

  update public.phonesia_whatsapp_campaign_recipients
     set send_state = p_outcome, whatsapp_message_id = p_whatsapp_message_id,
         accepted_at = case when p_outcome = 'accepted' then now() else accepted_at end,
         completed_at = now(), error_code = p_error_code, error_message = p_error_message,
         lease_token = null, lease_expires_at = null, updated_at = now()
   where id = p_recipient_id and send_state = 'processing' and lease_token = p_lease_token;
  if not found then raise exception 'recipient lease lost'; end if;

  update public.phonesia_whatsapp_campaign_attempts
     set outcome = p_outcome, finished_at = now(), http_status = p_http_status,
         whatsapp_message_id = p_whatsapp_message_id, error_code = p_error_code,
         error_message = p_error_message, response_summary = p_response_summary
   where recipient_id = p_recipient_id and lease_token = p_lease_token and outcome = 'processing';
end;
$$;

create or replace function public.phonesia_record_whatsapp_delivery_event(
  p_whatsapp_message_id text, p_status text, p_timestamp_meta timestamptz,
  p_error_code text default null, p_error_title text default null,
  p_error_message text default null, p_payload jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_delivery_state text;
begin
  insert into public.phonesia_whatsapp_delivery_events
    (whatsapp_message_id,status,timestamp_meta,error_code,error_title,error_message,payload)
  values (p_whatsapp_message_id,p_status,p_timestamp_meta,p_error_code,p_error_title,p_error_message,p_payload)
  on conflict (whatsapp_message_id,status,timestamp_meta) do nothing;

  select case
    when bool_or(status='read') then 'read'
    when bool_or(status='delivered') then 'delivered'
    when bool_or(status='failed') then 'failed'
    when bool_or(status='sent') then 'sent'
  end into v_delivery_state
  from public.phonesia_whatsapp_delivery_events where whatsapp_message_id=p_whatsapp_message_id;

  update public.phonesia_whatsapp_campaign_recipients
     set delivery_state=v_delivery_state,
         error_code=case when v_delivery_state='failed' then coalesce(p_error_code,error_code) else error_code end,
         error_message=case when v_delivery_state='failed' then coalesce(p_error_message,error_message) else error_message end,
         updated_at=now()
   where whatsapp_message_id=p_whatsapp_message_id;
end;
$$;

create or replace view public.phonesia_whatsapp_campaign_progress as
select c.id, c.idempotency_key, c.promo_key, c.promo_name, c.state, c.historical,
       c.snapshot_complete, c.selected_declared, c.documented_recipients,
       c.unreconstructable_count,
       count(r.id) filter (where r.send_state='pending')::integer as pending,
       count(r.id) filter (where r.send_state='processing')::integer as processing,
       count(r.id) filter (where r.send_state='accepted')::integer as accepted,
       count(r.id) filter (where r.send_state='rejected')::integer as rejected,
       count(r.id) filter (where r.send_state='skipped')::integer as skipped,
       (count(r.id) filter (where r.send_state='uncertain') + c.unreconstructable_count)::integer as uncertain,
       count(r.id) filter (where r.delivery_state='sent')::integer as sent,
       count(r.id) filter (where r.delivery_state='delivered')::integer as delivered,
       count(r.id) filter (where r.delivery_state='read')::integer as read,
       count(r.id) filter (where r.delivery_state='failed')::integer as delivery_failed,
       case when count(r.id) filter (where r.send_state in ('pending','processing','uncertain'))=0
                  and c.unreconstructable_count=0 then true else false end as can_be_completed
from public.phonesia_whatsapp_campaigns c
left join public.phonesia_whatsapp_campaign_recipients r on r.campaign_id=c.id
group by c.id;

-- Preserva la campagna storica senza inventare i 211 clienti mancanti.
insert into public.phonesia_whatsapp_campaigns
  (id,idempotency_key,promo_key,promo_name,send_mode,template_name,template_language,
   normalized_message,attachment_public_url,attachment_file_name,attachment_mime_type,
   selected_declared,documented_recipients,unreconstructable_count,snapshot_complete,historical,state)
select 'e6964dee-865a-4dbf-95dc-223e0c2fece2'::uuid,
       'historical:e6964dee-865a-4dbf-95dc-223e0c2fece2',
       'promo_luce_gas_202609','Campagna storica 18/09/2026','custom_message_image','ph_msg_img_v1','it',
       max(o.messaggio),max(o.attachment_public_url),max(o.attachment_file_name),'image/jpeg',
       497,286,211,false,true,'needs_review'
from public.phonesia_opportunita_inviate o
where o.batch_id='e6964dee-865a-4dbf-95dc-223e0c2fece2'
having count(distinct o.cliente_id)=286
on conflict (id) do nothing;

insert into public.phonesia_whatsapp_campaign_recipients
  (campaign_id,cliente_id,input_position,normalized_phone,send_state,whatsapp_message_id,
   accepted_at,completed_at,eligibility_snapshot)
select 'e6964dee-865a-4dbf-95dc-223e0c2fece2'::uuid,o.cliente_id,
       row_number() over(order by o.created_at,o.id)-1,
       regexp_replace(coalesce(cl.telefono,''),'[^0-9]','','g'),'accepted',
       o.metadata->>'whatsapp_message_id',coalesce(o.created_at,now()),coalesce(o.created_at,now()),
       jsonb_build_object('historical',true,'source','phonesia_opportunita_inviate')
from public.phonesia_opportunita_inviate o
join public.phonesia_clienti cl on cl.id=o.cliente_id
where o.batch_id='e6964dee-865a-4dbf-95dc-223e0c2fece2'
  and nullif(o.metadata->>'whatsapp_message_id','') is not null
on conflict do nothing;

insert into public.phonesia_whatsapp_delivery_events
  (whatsapp_message_id,status,timestamp_meta,error_code,error_title,error_message)
select s.whatsapp_message_id,s.status,s.timestamp_meta,s.error_code,s.error_title,s.error_message
from public.phonesia_whatsapp_message_statuses s
join public.phonesia_whatsapp_campaign_recipients r
  on r.whatsapp_message_id=s.whatsapp_message_id
where r.campaign_id='e6964dee-865a-4dbf-95dc-223e0c2fece2'
on conflict do nothing;

update public.phonesia_whatsapp_campaign_recipients r set delivery_state=x.delivery_state
from (
  select whatsapp_message_id,case when bool_or(status='read') then 'read'
    when bool_or(status='delivered') then 'delivered'
    when bool_or(status='failed') then 'failed' when bool_or(status='sent') then 'sent' end delivery_state
  from public.phonesia_whatsapp_delivery_events group by whatsapp_message_id
) x where r.whatsapp_message_id=x.whatsapp_message_id
  and r.campaign_id='e6964dee-865a-4dbf-95dc-223e0c2fece2';

revoke all on function public.phonesia_claim_whatsapp_recipients(uuid,integer,integer) from public, anon, authenticated;
revoke all on function public.phonesia_start_whatsapp_attempt(uuid,uuid) from public, anon, authenticated;
revoke all on function public.phonesia_release_whatsapp_recipient(uuid,uuid) from public, anon, authenticated;
revoke all on function public.phonesia_skip_whatsapp_recipient(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.phonesia_create_whatsapp_campaign_snapshot(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.phonesia_finish_whatsapp_attempt(uuid,uuid,text,text,integer,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.phonesia_record_whatsapp_delivery_event(text,text,timestamptz,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.phonesia_claim_whatsapp_recipients(uuid,integer,integer) to service_role;
grant execute on function public.phonesia_start_whatsapp_attempt(uuid,uuid) to service_role;
grant execute on function public.phonesia_release_whatsapp_recipient(uuid,uuid) to service_role;
grant execute on function public.phonesia_skip_whatsapp_recipient(uuid,uuid,text) to service_role;
grant execute on function public.phonesia_create_whatsapp_campaign_snapshot(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.phonesia_finish_whatsapp_attempt(uuid,uuid,text,text,integer,text,text,jsonb) to service_role;
grant execute on function public.phonesia_record_whatsapp_delivery_event(text,text,timestamptz,text,text,text,jsonb) to service_role;

commit;
