\set ON_ERROR_STOP on
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'FAIL: %', message; end if;
  raise notice 'PASS: %', message;
end;
$$;
create function pg_temp.assert_denied(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege then
    raise notice 'PASS: denied %', statement;
    return;
  end;
  raise exception 'FAIL: unexpectedly allowed %', statement;
end;
$$;
grant execute on function pg_temp.assert_true(boolean,text), pg_temp.assert_denied(text) to anon, authenticated, service_role;

select pg_temp.assert_true(
  (select count(*) filter (where c.relkind='r')=39 and count(*) filter (where c.relkind='v')=2
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'Fixture matches the audited scope of 39 tables and two views');
select pg_temp.assert_true(
  not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 'RLS enabled on every existing public table');
select pg_temp.assert_true(
  not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v') and has_any_column_privilege('anon',c.oid,'SELECT')),
  'No anonymous table or column SELECT grants, including backups and view');
select pg_temp.assert_true(
  (select reloptions @> array['security_invoker=true'] from pg_class where oid='public.phonesia_whatsapp_campaign_progress'::regclass),
  'Campaign view invokes caller security');
select pg_temp.assert_true(
  (select reloptions @> array['security_invoker=true'] from pg_class where oid='public.phonesia_analytics_attivazione'::regclass),
  'Activation analytics view also invokes caller security');
select pg_temp.assert_true(
  not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
    and (has_table_privilege('anon',c.oid,'TRUNCATE') or has_table_privilege('authenticated',c.oid,'TRUNCATE'))),
  'Neither browser role retains TRUNCATE, which is not protected by RLS');
select pg_temp.assert_true((select count(*)=1 from phonesia_private.security_snapshots), 'Previous security configuration saved privately');

set role anon;
select pg_temp.assert_denied('select * from public.phonesia_clienti');
select pg_temp.assert_denied('select email from public.phonesia_clienti');
select pg_temp.assert_denied('select * from public.phonesia_whatsapp_campaign_progress');
select pg_temp.assert_denied('select * from public.phonesia_analytics_attivazione');
select pg_temp.assert_denied('select * from public.phonesia_contratti_backup_pre_2025_20260408');
select pg_temp.assert_denied('insert into public.phonesia_clienti(nome) values (''intruder'')');
select pg_temp.assert_denied('update public.phonesia_clienti set nome=''intruder''');
select pg_temp.assert_denied('delete from public.phonesia_clienti');
-- These statements run ONLY against the isolated, synthetic test database.
select pg_temp.assert_denied('truncate public.tasks');
select pg_temp.assert_denied('select nextval(''public.tasks_id_seq'')');
select pg_temp.assert_denied('select public.send_whatsapp_from_contact(1)');
select pg_temp.assert_denied('select public.phonesia_register_qr(null,null,null,null,null,null,null,null,null,null)');
select pg_temp.assert_denied('select * from phonesia_private.qr_rate_limits');
reset role;

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
select pg_temp.assert_true((select count(*)=1 from public.phonesia_user_profiles), 'Admin can read exactly their own profile');
select pg_temp.assert_true((select role='admin' from public.phonesia_user_profiles), 'Admin login role preserved');
select pg_temp.assert_denied('update public.phonesia_user_profiles set role=''admin''');
select pg_temp.assert_denied('insert into public.phonesia_user_profiles(auth_user_id,email,role) values (gen_random_uuid(),''bad@example.invalid'',''admin'')');
select pg_temp.assert_denied('delete from public.phonesia_user_profiles');
select pg_temp.assert_denied('select * from public.phonesia_clienti');
select pg_temp.assert_denied('select * from public.phonesia_analytics_attivazione');
select pg_temp.assert_denied('truncate public.tasks');
select pg_temp.assert_denied('select nextval(''public.tasks_id_seq'')');
select pg_temp.assert_denied('select public.send_whatsapp_from_contact(1)');
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
select pg_temp.assert_true((select count(*)=1 from public.phonesia_user_profiles where role='user'), 'User can only read own non-admin profile');
select pg_temp.assert_true((select count(*)=0 from public.phonesia_user_profiles where role='admin'), 'User cannot read other profiles');
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
select pg_temp.assert_true((select count(*)=0 from public.phonesia_user_profiles), 'Inactive account cannot load an active profile');
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000099';
select pg_temp.assert_true((select count(*)=0 from public.phonesia_user_profiles), 'New unapproved account has no CRM profile');
reset role;

set role service_role;
select pg_temp.assert_true((select count(*)=1 from public.phonesia_clienti), 'Server can still read customers');
select pg_temp.assert_true((select count(*)=1 from public.phonesia_whatsapp_campaign_progress), 'Server can still read campaign view');
select pg_temp.assert_true((select count(*)=1 from public.phonesia_analytics_attivazione), 'Server can still read activation analytics view');
select pg_temp.assert_true(public.phonesia_register_qr('Nuovo','Test','+390000000002','new@example.invalid','BBBBBB00B00B000B',1,true,'test',repeat('a',64),repeat('b',64))->>'status'='created', 'QR creates customer and required consents');
select pg_temp.assert_true((select count(*)=2 from public.phonesia_consensi where cliente_id=(select id from public.phonesia_clienti where telefono='+390000000002')), 'Privacy and optional marketing stored together');
select pg_temp.assert_true(public.phonesia_register_qr('Malicious','Overwrite','+390000000003','new@example.invalid','CCCCCC00C00C000C',1,false,'test',repeat('a',64),repeat('c',64))=jsonb_build_object('status','accepted'), 'Duplicate email returns no existing ID');
select pg_temp.assert_true((select nome='Nuovo' from public.phonesia_clienti where telefono='+390000000002'), 'Duplicate cannot overwrite existing identity');
select pg_temp.assert_true((select count(*)=2 from public.phonesia_clienti), 'Duplicate creates no second customer');
select pg_temp.assert_true(public.phonesia_register_qr('No','Overwrite','+390000000001',null,'ZZZZZZ00Z00Z000Z',1,false,'test',repeat('a',64),repeat('f',64))=jsonb_build_object('status','accepted'), 'Duplicate phone returns no ID and does not create a customer');
select pg_temp.assert_true(public.phonesia_register_qr('No','Overwrite','+390000000099',null,'AAAAAA00A00A000A',1,false,'test',repeat('a',64),repeat('0',64))=jsonb_build_object('status','accepted'), 'Duplicate fiscal code returns no ID and does not create a customer');

do $$ begin
  begin
    perform public.phonesia_register_qr('Atomic','Test','+390000000004',null,'DDDDDD00D00D000D',1,false,'force-consent-failure',repeat('a',64),repeat('d',64));
    raise exception 'FAIL: expected consent failure';
  exception when check_violation then null;
  end;
end; $$;
select pg_temp.assert_true((select count(*)=0 from public.phonesia_clienti where telefono='+390000000004'), 'Consent failure rolls back the customer');

select public.phonesia_register_qr('Nuovo','Test','+390000000002','new@example.invalid','BBBBBB00B00B000B',1,true,'test',repeat('a',64),repeat('b',64));
select public.phonesia_register_qr('Nuovo','Test','+390000000002','new@example.invalid','BBBBBB00B00B000B',1,true,'test',repeat('a',64),repeat('b',64));
select pg_temp.assert_true(public.phonesia_register_qr('Nuovo','Test','+390000000002','new@example.invalid','BBBBBB00B00B000B',1,true,'test',repeat('a',64),repeat('b',64))->>'status'='rate_limited', 'Fourth request for same phone is rate limited');
do $$ declare i integer; result jsonb; begin
  for i in 1..21 loop
    result := public.phonesia_register_qr('Originale','Test','+390000000001',null,'AAAAAA00A00A000A',1,false,'test',repeat('e',64),lpad(i::text,64,'0'));
    if i <= 20 and result->>'status' <> 'accepted' then raise exception 'FAIL: IP limited too early'; end if;
  end loop;
  perform pg_temp.assert_true(result->>'status'='rate_limited', 'IP limit enforced across different phone buckets');
end; $$;

insert into public.phonesia_clienti(nome,telefono) values ('Importer','+390000000005');
update public.phonesia_clienti set cognome='Still working' where telefono='+390000000005';
select pg_temp.assert_true((select cognome='Still working' from public.phonesia_clienti where telefono='+390000000005'), 'Importer insert/update and identity sequence still work');
delete from public.phonesia_clienti where telefono='+390000000005';
reset role;

-- Prove RLS still denies reads/writes even if a future migration regrants access.
grant select,update,delete on public.phonesia_clienti to anon, authenticated;
set role anon;
select pg_temp.assert_true((select count(*)=0 from public.phonesia_clienti), 'Restrictive RLS defeats old permissive policy after accidental grant');
update public.phonesia_clienti set nome='intruder';
delete from public.phonesia_clienti;
reset role;
select pg_temp.assert_true((select count(*)=2 from public.phonesia_clienti), 'RLS preserves all customer rows during denied updates/deletes');
revoke select,update,delete on public.phonesia_clienti from anon, authenticated;

create table public.phonesia_security_future_probe (id bigint generated always as identity);
create function public.phonesia_security_future_probe_fn() returns integer language sql as $$ select 1 $$;
select pg_temp.assert_true(not has_table_privilege('anon','public.phonesia_security_future_probe','SELECT'), 'New tables created by postgres are not automatically exposed');
select pg_temp.assert_true(not has_function_privilege('anon','public.phonesia_security_future_probe_fn()','EXECUTE'), 'New functions have no PUBLIC/anon execution');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.phonesia_security_future_probe_fn()','EXECUTE'), 'New functions require explicit authenticated grants');

-- This suite does not simulate Supabase-managed supabase_admin privileges.
-- Its defaults require the separate live follow-up audit; do not infer they are fixed.

-- The public readiness route must never create customer/consent/rate-limit data.
do $$
declare before_counts jsonb; after_counts jsonb;
begin
  select jsonb_build_array((select count(*) from public.phonesia_clienti),
    (select count(*) from public.phonesia_consensi), (select count(*) from phonesia_private.qr_rate_limits)) into before_counts;
  begin
    perform public.phonesia_register_qr(null,null,null,null,null,0,false,'phonesia-qr-health',null,null);
    raise exception 'FAIL: readiness probe must reject invalid input';
  exception when sqlstate '22023' then null;
  end;
  select jsonb_build_array((select count(*) from public.phonesia_clienti),
    (select count(*) from public.phonesia_consensi), (select count(*) from phonesia_private.qr_rate_limits)) into after_counts;
  perform pg_temp.assert_true(before_counts = after_counts, 'Readiness probe creates no customer, consent or rate-limit rows');
end;
$$;
