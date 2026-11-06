\set ON_ERROR_STOP on

create extension if not exists dblink;

create or replace function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$ begin
  if value is distinct from true then raise exception 'ASSERTION FAILED: %', message; end if;
end $$;

-- Migrazione storica: conteggi conservati ed esclusione dal claim.
select pg_temp.assert_true((select count(*)=286 from public.phonesia_whatsapp_campaign_recipients
  where campaign_id='e6964dee-865a-4dbf-95dc-223e0c2fece2'), 'historical documented recipients');
select pg_temp.assert_true((select documented_recipients=286 and unreconstructable_count=211
  and historical and not snapshot_complete and state='needs_review'
  from public.phonesia_whatsapp_campaigns where id='e6964dee-865a-4dbf-95dc-223e0c2fece2'), 'historical metadata');
do $$ begin
  begin
    perform public.phonesia_claim_whatsapp_recipients('e6964dee-865a-4dbf-95dc-223e0c2fece2',1,45);
    raise exception 'historical claim unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'campaign is not dispatchable' then raise; end if;
  end;
end $$;

-- Snapshot atomico, idempotenza della doppia conferma e rollback su duplicati.
select public.phonesia_create_whatsapp_campaign_snapshot(
  'atomic-3','promo','Atomic','standard','tpl','it','msg',null,null,null,null,
  '[{"cliente_id":301,"input_position":0,"normalized_phone":"3934000000301","eligibility_snapshot":{"payload":{}}},{"cliente_id":302,"input_position":1,"normalized_phone":"3934000000302","eligibility_snapshot":{"payload":{}}},{"cliente_id":303,"input_position":2,"normalized_phone":"3934000000303","eligibility_snapshot":{"payload":{}}}]'::jsonb
) as atomic_campaign_id \gset
select pg_temp.assert_true((select count(*)=3 from public.phonesia_whatsapp_campaign_recipients where campaign_id=:'atomic_campaign_id'), 'atomic snapshot count');
select pg_temp.assert_true(public.phonesia_create_whatsapp_campaign_snapshot(
  'atomic-3','promo','Atomic','standard','tpl','it','msg',null,null,null,null,
  '[{"cliente_id":301,"input_position":0,"normalized_phone":"3934000000301"}]'::jsonb
)=:'atomic_campaign_id', 'double confirmation idempotency');
select pg_temp.assert_true((select count(*)=1 from public.phonesia_whatsapp_campaigns where idempotency_key='atomic-3'), 'single campaign after double confirmation');

do $$ begin
  begin
    perform public.phonesia_create_whatsapp_campaign_snapshot(
      'rollback-duplicate','promo','Rollback','standard','tpl','it','msg',null,null,null,null,
      '[{"cliente_id":304,"input_position":0,"normalized_phone":"3934000000304"},{"cliente_id":304,"input_position":1,"normalized_phone":"3934000000305"}]'::jsonb);
    raise exception 'invalid snapshot unexpectedly succeeded';
  exception when unique_violation then null;
  end;
  perform pg_temp.assert_true(not exists(select 1 from public.phonesia_whatsapp_campaigns where idempotency_key='rollback-duplicate'), 'incomplete snapshot rollback');
end $$;

-- Vincoli.
create or replace function pg_temp.test_phone_constraint(campaign uuid)
returns void language plpgsql as $$ begin
  begin
    insert into public.phonesia_whatsapp_campaign_recipients(campaign_id,cliente_id,input_position,normalized_phone,send_state)
    values (campaign,305,9,'bad','pending');
    raise exception 'phone constraint unexpectedly succeeded';
  exception when check_violation then null;
  end;
end $$;
select pg_temp.test_phone_constraint(:'atomic_campaign_id');

-- RLS e permessi funzioni.
select pg_temp.assert_true(not has_function_privilege('authenticated','public.phonesia_claim_whatsapp_recipients(uuid,integer,integer)','EXECUTE'), 'authenticated claim denied');
select pg_temp.assert_true(has_function_privilege('service_role','public.phonesia_claim_whatsapp_recipients(uuid,integer,integer)','EXECUTE'), 'service role claim granted');
grant select on public.phonesia_whatsapp_campaigns,
  public.phonesia_whatsapp_campaign_recipients,
  public.phonesia_whatsapp_campaign_attempts,
  public.phonesia_whatsapp_delivery_events to authenticated;
set role authenticated;
select pg_temp.assert_true((select count(*)=0 from public.phonesia_whatsapp_campaigns), 'RLS hides campaigns from non-admin');
reset role;
insert into auth.users values ('10000000-0000-0000-0000-000000000001');
insert into public.phonesia_user_profiles values ('10000000-0000-0000-0000-000000000001',true,'admin');
set role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);
select pg_temp.assert_true((select count(*)>0 from public.phonesia_whatsapp_campaigns), 'RLS permits active admin read');
reset role;

-- Campagna da 497, acquisizione concorrente reale su due connessioni.
select public.phonesia_create_whatsapp_campaign_snapshot(
  'resume-497','promo','Resume','standard','tpl','it','msg',null,null,null,null,
  (select jsonb_agg(jsonb_build_object('cliente_id',i,'input_position',i-400,'normalized_phone','39340'||lpad(i::text,7,'0'),'eligibility_snapshot',jsonb_build_object('payload',jsonb_build_object())))
   from generate_series(400,896) i)
) as resume_campaign_id \gset

select dblink_connect('worker_a',format('host=%s port=%s dbname=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database()));
select dblink_connect('worker_b',format('host=%s port=%s dbname=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database()));
select dblink_send_query('worker_a',format('select count(*) from public.phonesia_claim_whatsapp_recipients(%L,100,45)', :'resume_campaign_id'));
select dblink_send_query('worker_b',format('select count(*) from public.phonesia_claim_whatsapp_recipients(%L,100,45)', :'resume_campaign_id'));
select * from dblink_get_result('worker_a') as t(claimed bigint);
select * from dblink_get_result('worker_b') as t(claimed bigint);
select dblink_disconnect('worker_a');
select dblink_disconnect('worker_b');
select pg_temp.assert_true((select count(*)=200 from public.phonesia_whatsapp_campaign_recipients where campaign_id=:'resume_campaign_id' and lease_token is not null), 'concurrent claims reserve 200 exactly once');
select pg_temp.assert_true((select count(distinct lease_token)=2 from public.phonesia_whatsapp_campaign_recipients where campaign_id=:'resume_campaign_id'), 'two independent concurrent leases');

-- Simula arresto prima di Meta: libera le prenotazioni senza creare tentativi.
update public.phonesia_whatsapp_campaign_recipients set lease_expires_at=now()-interval '1 second' where campaign_id=:'resume_campaign_id';
select count(*) from public.phonesia_claim_whatsapp_recipients(:'resume_campaign_id',1,45);
select pg_temp.assert_true((select count(*)=0 from public.phonesia_whatsapp_campaign_attempts a join public.phonesia_whatsapp_campaign_recipients r on r.id=a.recipient_id where r.campaign_id=:'resume_campaign_id'), 'no attempt before Meta start');

-- Avvio e finalizzazione sintetica: accepted e uncertain non tornano pending.
select id,lease_token from public.phonesia_whatsapp_campaign_recipients where campaign_id=:'resume_campaign_id' and lease_token is not null order by input_position limit 1 \gset accepted_
select public.phonesia_start_whatsapp_attempt(:'accepted_id',:'accepted_lease_token');
select public.phonesia_finish_whatsapp_attempt(:'accepted_id',:'accepted_lease_token','accepted','wamid.accepted',200,null,null,null);

select id,lease_token from public.phonesia_claim_whatsapp_recipients(:'resume_campaign_id',1,1) limit 1 \gset uncertain_
select public.phonesia_start_whatsapp_attempt(:'uncertain_id',:'uncertain_lease_token');
update public.phonesia_whatsapp_campaign_recipients set lease_expires_at=now()-interval '1 second' where id=:'uncertain_id';
select count(*) from public.phonesia_claim_whatsapp_recipients(:'resume_campaign_id',1,45);
select pg_temp.assert_true((select send_state='uncertain' from public.phonesia_whatsapp_campaign_recipients where id=:'uncertain_id'), 'expired started attempt becomes uncertain');
select pg_temp.assert_true((select count(*)=0 from public.phonesia_claim_whatsapp_recipients(:'resume_campaign_id',100,45) where id in (:'accepted_id',:'uncertain_id')), 'accepted and uncertain never reclaimed');

-- Callback duplicate e fuori ordine.
select public.phonesia_record_whatsapp_delivery_event('wamid.accepted','delivered','2026-09-18T10:00:00Z');
select public.phonesia_record_whatsapp_delivery_event('wamid.accepted','sent','2026-09-18T09:00:00Z');
select public.phonesia_record_whatsapp_delivery_event('wamid.accepted','delivered','2026-09-18T10:00:00Z');
select public.phonesia_record_whatsapp_delivery_event('wamid.accepted','read','2026-09-18T11:00:00Z');
select pg_temp.assert_true((select delivery_state='read' from public.phonesia_whatsapp_campaign_recipients where id=:'accepted_id'), 'out-of-order callback reduction');
select pg_temp.assert_true((select count(*)=3 from public.phonesia_whatsapp_delivery_events where whatsapp_message_id='wamid.accepted'), 'duplicate callback deduplication');

-- Tutti i 497 restano persistiti durante arresto/ripresa, nessun duplicato.
select pg_temp.assert_true((select count(*)=497 and count(distinct cliente_id)=497 and count(distinct input_position)=497
  from public.phonesia_whatsapp_campaign_recipients where campaign_id=:'resume_campaign_id'), '497 recipients preserved');

select 'ALL_SQL_TESTS_PASSED' as result;
