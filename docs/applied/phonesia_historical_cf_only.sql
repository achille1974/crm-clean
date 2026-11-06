-- User explicitly authorized the conservative historical repair on 2026-09-26.
-- Execute as one transaction through apply_migration or psql --single-transaction.
-- Expected production impact: 55 CF links, 1,214 classifications, 503 new unknown-state
-- services, 18 archived obsolete projections, 519 resulting services. No messages.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Keep writes stable throughout backup and reconciliation; ordinary reads remain possible.
lock table public.phonesia_clienti, public.phonesia_contratti,
  public.phonesia_servizi_cliente in share row exclusive mode;

-- Abort if production has moved outside the freshly recalculated, authorized scope.
do $$ begin
 if (select count(*) from public.phonesia_clienti)<>1170
   or (select count(*) from public.phonesia_contratti)<>1576
   or (select count(*) from public.phonesia_servizi_cliente)<>34
 then raise exception 'Production counts differ from the approved preview'; end if;
 if md5(pg_get_functiondef('public.phonesia_match_customer(text,text,text)'::regprocedure))<>'6a1f21b5c8301929e17df2c19a81ff8a'
 then raise exception 'Future matching definition changed after preview'; end if;
end $$;

do $$ begin
 if exists(select 1 from phonesia_private.security_snapshots
   where migration='phonesia_historical_cf_only_20260926')
 then raise exception 'Historical CF repair already recorded'; end if;
 if (select count(*) from pg_trigger where not tgisinternal
    and tgname in ('phonesia_prepare_contract','phonesia_sync_contract_service','phonesia_link_customer_contracts')
    and tgenabled='O'
    and tgrelid in ('public.phonesia_contratti'::regclass,'public.phonesia_clienti'::regclass))<>3
 then raise exception 'Required prospective synchronization is not enabled'; end if;
end $$;

create temporary table phonesia_cf_repair_original_function on commit drop as
select pg_get_functiondef('public.phonesia_match_customer(text,text,text)'::regprocedure) definition;

create temporary table phonesia_cf_repair_before on commit drop as
select 'phonesia_historical_cf_only_20260926'::text migration, jsonb_build_object(
 'customer_count',(select count(*) from public.phonesia_clienti),
 'contract_count',(select count(*) from public.phonesia_contratti),
 'contracts',(select jsonb_agg(jsonb_build_object(
   'id',id,'cliente_id',cliente_id,'negozio_id',negozio_id,'origine_cliente',origine_cliente,
   'provider_cluster',provider_cluster,'service_family',service_family,'service_role',service_role,
   'service_code',service_code,'classification_confidence',classification_confidence,
   'classification_notes',classification_notes,
   'unchanged_fields_digest',md5((to_jsonb(c)-array['cliente_id','negozio_id','origine_cliente',
     'provider_cluster','service_family','service_role','service_code','classification_confidence','classification_notes'])::text)))
   from public.phonesia_contratti c),
 'services',(select jsonb_agg(to_jsonb(s)) from public.phonesia_servizi_cliente s),
 'original_matcher_definition',(select definition from phonesia_cf_repair_original_function)
) snapshot;

insert into phonesia_private.security_snapshots(migration,snapshot)
select migration,snapshot from phonesia_cf_repair_before;

create or replace function public.phonesia_match_customer(p_cf text, p_phone text, p_email text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  cf text := nullif(upper(btrim(coalesce(p_cf,''))), '');
  phone text := phonesia_private.normalized_phone(p_phone);
  match_email text := nullif(lower(btrim(coalesce(p_email,''))), '');
  candidates bigint[];
begin
  -- Consider every exact identifier together. Conflicting/duplicate identities fail closed.
  select array_agg(distinct c.id) into candidates from public.phonesia_clienti c
  where (cf is not null and upper(btrim(c.codice_fiscale))=cf)
    or (phone is not null and length(phone)>=8 and phonesia_private.normalized_phone(c.telefono)=phone)
    or (match_email is not null and lower(btrim(c.email))=match_email);
  if coalesce(cardinality(candidates),0) <> 1 then return null; end if;
  if cf is not null and exists(select 1 from public.phonesia_clienti c where c.id=candidates[1]
       and nullif(upper(btrim(c.codice_fiscale)),'') is not null and upper(btrim(c.codice_fiscale))<>cf)
  then return null; end if;
  -- Temporary historical rule: require the same non-empty CF on both records.
  if not exists(select 1 from public.phonesia_clienti c where c.id=candidates[1]
    and nullif(upper(btrim(c.codice_fiscale)), '')=cf)
  then return null; end if;
  return candidates[1];
end $$;

-- Existing classification/service triggers are reused. Only the matcher is temporarily stricter.
update public.phonesia_contratti set categoria=categoria;

-- Restore the exact original future-matching function before committing.
do $$ declare original_definition text; begin
 select definition into strict original_definition from phonesia_cf_repair_original_function;
 execute original_definition;
 if pg_get_functiondef('public.phonesia_match_customer(text,text,text)'::regprocedure)<>original_definition
 then raise exception 'Original customer matching function was not restored'; end if;
end $$;

do $$ declare before_snapshot jsonb; begin
 select snapshot into strict before_snapshot from phonesia_cf_repair_before;
 if (select count(*) from public.phonesia_clienti)<>(before_snapshot->>'customer_count')::bigint
   or (select count(*) from public.phonesia_contratti)<>(before_snapshot->>'contract_count')::bigint
 then raise exception 'Customer or contract row count changed'; end if;
 if exists(select 1 from jsonb_array_elements(before_snapshot->'contracts') b
   join public.phonesia_contratti c on c.id=(b->>'id')::uuid
   where b->>'unchanged_fields_digest'<>md5((to_jsonb(c)-array['cliente_id','negozio_id','origine_cliente',
     'provider_cluster','service_family','service_role','service_code','classification_confidence','classification_notes'])::text))
 then raise exception 'Original contract content or timestamps were modified'; end if;
 if exists(select 1 from jsonb_array_elements(before_snapshot->'contracts') b
   join public.phonesia_contratti c on c.id=(b->>'id')::uuid
   where b->>'cliente_id' is not null and c.cliente_id is distinct from (b->>'cliente_id')::bigint)
 then raise exception 'An existing customer link was changed'; end if;
 if exists(select 1 from jsonb_array_elements(before_snapshot->'contracts') b
   join public.phonesia_contratti c on c.id=(b->>'id')::uuid
   join public.phonesia_clienti u on u.id=c.cliente_id
   where b->>'cliente_id' is null and c.cliente_id is not null
   and (nullif(upper(btrim(c.codice_fiscale)),'') is null
     or upper(btrim(c.codice_fiscale)) is distinct from upper(btrim(u.codice_fiscale))))
 then raise exception 'Historical association without equal CF'; end if;
 if exists(select 1 from public.phonesia_servizi_cliente s
   where not exists(select 1 from jsonb_array_elements(coalesce(before_snapshot->'services','[]'::jsonb)) b
     where b->>'id'=s.id::text) and s.service_status<>'NON_DEFINITO')
 then raise exception 'A new historical service was marked active'; end if;
 if exists(select 1 from public.phonesia_servizi_cliente s join public.phonesia_contratti c on c.id=s.contratto_id
   where s.source_type='CONTRATTO_IMPORTATO' and s.cliente_id is distinct from c.cliente_id)
 then raise exception 'Service/customer reconciliation failed'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(before_snapshot->'services','[]'::jsonb)) b
   left join public.phonesia_servizi_cliente s on s.id=(b->>'id')::bigint
   where b->>'source_type'<>'CONTRATTO_IMPORTATO' and to_jsonb(s) is distinct from b)
 then raise exception 'A manually maintained service changed'; end if;
 if exists(select 1 from jsonb_array_elements(coalesce(before_snapshot->'services','[]'::jsonb)) b
   join public.phonesia_servizi_cliente s on s.id=(b->>'id')::bigint
   where s.cliente_id=(b->>'cliente_id')::bigint
     and s.service_status is distinct from b->>'service_status')
 then raise exception 'An existing service status changed'; end if;
end $$;

-- Exact impact checks execute before COMMIT, so any drift rolls back the entire repair.
do $$ declare before_snapshot jsonb; impact jsonb; begin
 select snapshot into strict before_snapshot from phonesia_cf_repair_before;
 select jsonb_build_object(
  'new_customer_links',(select count(*) from jsonb_array_elements(before_snapshot->'contracts') b
    join public.phonesia_contratti c on c.id=(b->>'id')::uuid where b->>'cliente_id' is null and c.cliente_id is not null),
  'new_classifications',(select count(*) from jsonb_array_elements(before_snapshot->'contracts') b
    join public.phonesia_contratti c on c.id=(b->>'id')::uuid where (b->>'service_family' is null or b->>'service_code' is null)
      and c.service_family is not null and c.service_code is not null and c.classification_confidence='HIGH'),
  'new_services',(select count(*) from public.phonesia_servizi_cliente s where not exists(
    select 1 from jsonb_array_elements(before_snapshot->'services') b where b->>'id'=s.id::text)),
  'removed_services',(select count(*) from jsonb_array_elements(before_snapshot->'services') b where not exists(
    select 1 from public.phonesia_servizi_cliente s where s.id::text=b->>'id')),
  'services_total',(select count(*) from public.phonesia_servizi_cliente),
  'services_coherent',(select count(*) from public.phonesia_servizi_cliente_coerenti),
  'remaining_unlinked',(select count(*) from public.phonesia_contratti where cliente_id is null),
  'unclassified',(select count(*) from public.phonesia_contratti where service_family is null or service_code is null)
 ) into impact;
 if impact<>jsonb_build_object('new_customer_links',55,'new_classifications',1214,'new_services',503,
   'removed_services',18,'services_total',519,'services_coherent',519,'remaining_unlinked',1040,'unclassified',42)
 then raise exception 'Reconciliation impact differs from approved preview: %',impact; end if;
 insert into phonesia_private.security_snapshots(migration,snapshot)
 values('phonesia_historical_cf_only_20260926_result',impact);
end $$;
