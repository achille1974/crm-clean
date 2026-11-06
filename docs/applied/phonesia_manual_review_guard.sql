-- Preserve explicit historical review holds across automatic import/customer updates.
-- Manual operator association remains possible with a non-automatic origin.
set local lock_timeout = '5s';
set local statement_timeout = '30s';
insert into phonesia_private.security_snapshots(migration,snapshot)
select 'phonesia_manual_review_guard_functions_20260926',jsonb_build_object('functions',
 jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='phonesia_private' and p.proname in ('prepare_contract','link_customer_contracts');
CREATE OR REPLACE FUNCTION phonesia_private.prepare_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  matched bigint;
  brand text := upper(btrim(coalesce(new.operatore,'')));
  category text := lower(btrim(coalesce(new.categoria,'')));
  contract_type text := lower(btrim(coalesce(new.tipo_contratto,'')));
  provider text;
  family text;
begin
  if tg_op='UPDATE' then
    -- A reviewed historical exception must not be re-linked by an importer retry.
    if coalesce(old.origine_cliente,'') like 'manual_review_%'
      and (coalesce(new.origine_cliente,'') like 'qr_%' or new.origine_cliente='no_qr_customer_match')
    then
      new.cliente_id:=old.cliente_id; new.negozio_id:=old.negozio_id;
      new.origine_cliente:=old.origine_cliente;
    end if;
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
  if new.cliente_id is null and coalesce(new.origine_cliente,'') not like 'manual_review_%' then
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
end $function$;
CREATE OR REPLACE FUNCTION phonesia_private.link_customer_contracts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- Recheck previous automatic links when a customer's identity is corrected.
  if tg_op='UPDATE' and (new.codice_fiscale,new.telefono,new.email) is distinct from (old.codice_fiscale,old.telefono,old.email) then
    update public.phonesia_contratti c set cliente_id=null,negozio_id=null,origine_cliente='no_qr_customer_match'
    where c.cliente_id=new.id and c.origine_cliente like 'qr_%'
      and public.phonesia_match_customer(c.codice_fiscale,c.telefono,c.email) is distinct from new.id;
  end if;
  update public.phonesia_contratti c set cliente_id=new.id,negozio_id=new.negozio_id,origine_cliente='qr_exact_unique'
  where c.cliente_id is null and coalesce(c.origine_cliente,'') not like 'manual_review_%' and (
    (nullif(btrim(new.codice_fiscale),'') is not null and upper(btrim(c.codice_fiscale))=upper(btrim(new.codice_fiscale)))
    or (phonesia_private.normalized_phone(new.telefono) is not null and phonesia_private.normalized_phone(c.telefono)=phonesia_private.normalized_phone(new.telefono))
    or (nullif(btrim(new.email),'') is not null and lower(btrim(c.email))=lower(btrim(new.email)))
  ) and public.phonesia_match_customer(c.codice_fiscale,c.telefono,c.email)=new.id;
  return new;
end $function$;
