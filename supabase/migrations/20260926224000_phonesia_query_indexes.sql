set local lock_timeout = '5s';
set local statement_timeout = '30s';
insert into phonesia_private.security_snapshots(migration,snapshot)
select '20260926224000_phonesia_query_indexes', jsonb_build_object(
 'indexes',(select jsonb_agg(indexdef) from pg_catalog.pg_indexes where schemaname='public' and indexname in
  ('interazioni_tabaccaio_idx','phonesia_handoff_richieste_token_hash_uidx','phonesia_opportunita_inviate_cliente_code_uidx')),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_catalog.pg_policies p where schemaname='public'
  and tablename in ('whatsapp_templates','interazioni')));

create index if not exists phonesia_attivita_cliente_idx on public.phonesia_attivita(cliente_id);
create index if not exists phonesia_consensi_cliente_idx on public.phonesia_consensi(cliente_id);
create index if not exists phonesia_note_cliente_cliente_idx on public.phonesia_note_cliente(cliente_id);
create index if not exists phonesia_scadenze_attivita_idx on public.phonesia_scadenze(attivita_id);
create index if not exists phonesia_scadenze_cliente_idx on public.phonesia_scadenze(cliente_id);
create index if not exists phonesia_campaign_recipients_cliente_idx on public.phonesia_whatsapp_campaign_recipients(cliente_id);
create index if not exists phonesia_campaigns_creator_idx on public.phonesia_whatsapp_campaigns(created_by);
create index if not exists phonesia_clienti_cf_normalized_idx on public.phonesia_clienti(upper(btrim(codice_fiscale)));
create index if not exists phonesia_clienti_email_normalized_idx on public.phonesia_clienti(lower(btrim(email)));
do $$ begin
 if to_regprocedure('phonesia_private.normalized_phone(text)') is not null then
  execute 'create index if not exists phonesia_clienti_phone_normalized_idx on public.phonesia_clienti(phonesia_private.normalized_phone(telefono))';
 end if;
end $$;

alter policy "authenticated full access" on public.whatsapp_templates
 using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');
alter policy "authenticated full access" on public.interazioni
 using ((select auth.role())='authenticated') with check ((select auth.role())='authenticated');

-- Only redundant standalone indexes. Unique constraints and their indexes remain intact.
drop index public.interazioni_tabaccaio_idx;
drop index public.phonesia_handoff_richieste_token_hash_uidx;
drop index public.phonesia_opportunita_inviate_cliente_code_uidx;
