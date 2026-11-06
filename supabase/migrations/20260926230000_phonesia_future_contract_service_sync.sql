-- Prospective repair only: install synchronization for future customer/contract writes.
-- No historical UPDATE/DELETE/INSERT is executed by this migration.
-- The rejected 1,576-contract backfill is explicitly excluded and remains pending approval.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create or replace function phonesia_private.normalized_phone(value text)
returns text language sql immutable set search_path = '' as $$
  with digits as (select regexp_replace(coalesce(value,''), '[^0-9]', '', 'g') as n),
  prefix as (select case when n like '00%' then substr(n,3) else n end as n from digits)
  select nullif(case when n ~ '^39[0-9]{9,11}$' then substr(n,3) else n end,'') from prefix
$$;

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
  return candidates[1];
end $$;

create or replace function phonesia_private.prepare_contract()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  matched bigint;
  brand text := upper(btrim(coalesce(new.operatore,'')));
  category text := lower(btrim(coalesce(new.categoria,'')));
  contract_type text := lower(btrim(coalesce(new.tipo_contratto,'')));
  provider text;
  family text;
begin
  if tg_op='UPDATE' then
    if (new.codice_fiscale,new.telefono,new.email) is distinct from (old.codice_fiscale,old.telefono,old.email)
      and new.cliente_id is not distinct from old.cliente_id and coalesce(new.origine_cliente,'') like 'qr_%'
    then
      new.cliente_id:=null; new.negozio_id:=null; new.origine_cliente:='no_qr_customer_match';
    end if;
    if (new.operatore,new.categoria,new.tipo_contratto) is distinct from (old.operatore,old.categoria,old.tipo_contratto)
      and (new.provider_cluster,new.service_family,new.service_role,new.service_code)
        is not distinct from (old.provider_cluster,old.service_family,old.service_role,old.service_code)
    then
      new.provider_cluster:=null; new.service_family:=null; new.service_role:=null; new.service_code:=null;
    end if;
  end if;
  if new.cliente_id is null then
    matched := public.phonesia_match_customer(new.codice_fiscale,new.telefono,new.email);
    if matched is not null then
      new.cliente_id := matched;
      select c.negozio_id into new.negozio_id from public.phonesia_clienti c where c.id=matched;
      new.origine_cliente := 'qr_exact_unique';
    end if;
  end if;

  -- Keep an existing explicit classification; classify only unclassified documents.
  if new.service_family is null or new.service_code is null then
    provider := case when brand in ('WINDTRE','WIND TRE','WIND3') then 'WINDTRE'
      when brand in ('TIM','TIM ENERGIA') then 'TIM'
      when brand in ('VODAFONE','FASTWEB','VF_FW') then 'VF_FW' end;
    family := case
      when category in ('telefonia','internet','mobile') and contract_type='mobile' and category<>'internet' then 'MOBILE'
      when category in ('telefonia','internet','fisso','linea fissa') and contract_type='fisso' then 'FISSO'
      when category='energia' and contract_type in ('','energia') then 'ENERGIA' end;
    if provider is not null and family is not null then
      new.provider_cluster:=provider; new.service_family:=family; new.service_role:='BASE';
      new.service_code:=provider||'_'||family; new.classification_confidence:='HIGH';
      new.classification_notes:='Campi strutturati coerenti; classificazione automatica v2. Lo stato di attivazione richiede conferma.';
    else
      new.classification_confidence:='LOW';
      new.classification_notes:='Da verificare: operatore, categoria o tipo contratto mancanti o incoerenti.';
    end if;
  end if;
  return new;
end $$;

create or replace function phonesia_private.sync_contract_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare eligible boolean;
begin
  eligible := new.cliente_id is not null and new.provider_cluster in ('WINDTRE','TIM','VF_FW')
    and new.service_family in ('MOBILE','FISSO','ENERGIA','TV','SMARTPHONE','ACCESSORI','ASSICURAZIONE','SICUREZZA','FOTOVOLTAICO','ALTRO')
    and new.service_role in ('BASE','COMPLEMENTARE') and new.service_code is not null
    and new.classification_confidence='HIGH';
  -- Only derived records are removed. Manual services and operator-confirmed sources are preserved.
  with removed as (
    delete from public.phonesia_servizi_cliente s where s.contratto_id=new.id
      and s.source_type='CONTRATTO_IMPORTATO'
      and (not coalesce(eligible,false) or s.service_code is distinct from new.service_code)
    returning s.*
  ) insert into phonesia_private.security_snapshots(migration,snapshot)
    select 'contract_service_sync_removed',jsonb_build_object('services',jsonb_agg(to_jsonb(r)))
    from removed r having count(*)>0;
  if coalesce(eligible,false) then
    insert into public.phonesia_servizi_cliente as s
      (cliente_id,contratto_id,negozio_id,provider_cluster,service_family,service_role,service_code,
       brand_raw,offer_label,product_label,start_date,service_status,is_primary,source_type,confidence,notes)
    values (new.cliente_id,new.id,new.negozio_id,new.provider_cluster,new.service_family,new.service_role,new.service_code,
       new.operatore,new.offerta,new.prodotto,new.data_stipula,'NON_DEFINITO',true,'CONTRATTO_IMPORTATO','HIGH',
       'Contratto importato; stato attuale del servizio da verificare.')
    on conflict (contratto_id,service_code) do update set
       cliente_id=excluded.cliente_id,negozio_id=excluded.negozio_id,provider_cluster=excluded.provider_cluster,
       service_family=excluded.service_family,service_role=excluded.service_role,brand_raw=excluded.brand_raw,
       offer_label=excluded.offer_label,product_label=excluded.product_label,start_date=excluded.start_date,
       service_status=case when s.cliente_id is distinct from excluded.cliente_id then 'NON_DEFINITO' else s.service_status end
    where s.source_type='CONTRATTO_IMPORTATO' and
      (s.cliente_id,s.negozio_id,s.provider_cluster,s.service_family,s.service_role,s.brand_raw,s.offer_label,s.product_label,s.start_date)
      is distinct from
      (excluded.cliente_id,excluded.negozio_id,excluded.provider_cluster,excluded.service_family,excluded.service_role,excluded.brand_raw,excluded.offer_label,excluded.product_label,excluded.start_date);
  end if;
  return new;
end $$;

create or replace function phonesia_private.link_customer_contracts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Recheck previous automatic links when a customer's identity is corrected.
  if tg_op='UPDATE' and (new.codice_fiscale,new.telefono,new.email) is distinct from (old.codice_fiscale,old.telefono,old.email) then
    update public.phonesia_contratti c set cliente_id=null,negozio_id=null,origine_cliente='no_qr_customer_match'
    where c.cliente_id=new.id and c.origine_cliente like 'qr_%'
      and public.phonesia_match_customer(c.codice_fiscale,c.telefono,c.email) is distinct from new.id;
  end if;
  update public.phonesia_contratti c set cliente_id=new.id,negozio_id=new.negozio_id,origine_cliente='qr_exact_unique'
  where c.cliente_id is null and (
    (nullif(btrim(new.codice_fiscale),'') is not null and upper(btrim(c.codice_fiscale))=upper(btrim(new.codice_fiscale)))
    or (phonesia_private.normalized_phone(new.telefono) is not null and phonesia_private.normalized_phone(c.telefono)=phonesia_private.normalized_phone(new.telefono))
    or (nullif(btrim(new.email),'') is not null and lower(btrim(c.email))=lower(btrim(new.email)))
  ) and public.phonesia_match_customer(c.codice_fiscale,c.telefono,c.email)=new.id;
  return new;
end $$;

revoke all on function public.phonesia_match_customer(text,text,text) from public,anon,authenticated;
grant execute on function public.phonesia_match_customer(text,text,text) to service_role;
revoke all on function phonesia_private.normalized_phone(text), phonesia_private.prepare_contract(),
  phonesia_private.sync_contract_service(), phonesia_private.link_customer_contracts() from public,anon,authenticated;
grant usage on schema phonesia_private to service_role;
grant execute on function phonesia_private.normalized_phone(text) to service_role;

create trigger phonesia_prepare_contract before insert or update on public.phonesia_contratti
for each row execute function phonesia_private.prepare_contract();
create trigger phonesia_sync_contract_service after insert or update on public.phonesia_contratti
for each row execute function phonesia_private.sync_contract_service();
create trigger phonesia_link_customer_contracts after insert or update of codice_fiscale,telefono,email on public.phonesia_clienti
for each row execute function phonesia_private.link_customer_contracts();


create index if not exists phonesia_clienti_phone_normalized_idx
 on public.phonesia_clienti(phonesia_private.normalized_phone(telefono));
