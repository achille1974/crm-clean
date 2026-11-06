-- Attribuzione vendite alle campagne WhatsApp (sola lettura, nessun dato modificato).
-- Un contratto è attribuito a una campagna se lo stesso cliente lo stipula entro 30 giorni
-- dall'accettazione del messaggio da parte di Meta. Se il cliente ha ricevuto più campagne,
-- il contratto va alla campagna più recente precedente alla stipula (last touch).
-- NON APPLICATA: richiede autorizzazione di Achille.
set local lock_timeout = '5s';

create or replace view public.phonesia_campaign_attribution
with (security_invoker = true) as
with touches as (
  select r.campaign_id, r.cliente_id, r.accepted_at
  from public.phonesia_whatsapp_campaign_recipients r
  where r.accepted_at is not null and r.cliente_id is not null
),
matched as (
  select distinct on (k.id)
         k.id as contratto_id, t.campaign_id, k.cliente_id, k.provider_cluster, k.service_family,
         k.data_stipula, t.accepted_at
  from public.phonesia_contratti k
  join touches t on t.cliente_id = k.cliente_id
   and k.data_stipula::date >= (t.accepted_at at time zone 'Europe/Rome')::date
   and k.data_stipula::date <= ((t.accepted_at at time zone 'Europe/Rome') + interval '30 days')::date
  order by k.id, t.accepted_at desc
)
select c.id as campaign_id, c.promo_key, c.promo_name, c.created_at as campagna_del,
       (select count(*) from touches t where t.campaign_id = c.id) as destinatari_accettati,
       count(m.contratto_id) as contratti_entro_30gg,
       count(distinct m.cliente_id) as clienti_che_hanno_comprato,
       round(100.0 * count(distinct m.cliente_id)
             / nullif((select count(*) from touches t where t.campaign_id = c.id), 0), 2) as conversione_pct,
       array_remove(array_agg(distinct m.provider_cluster), null) as operatori
from public.phonesia_whatsapp_campaigns c
left join matched m on m.campaign_id = c.id
group by c.id, c.promo_key, c.promo_name, c.created_at;

revoke all on public.phonesia_campaign_attribution from anon, authenticated;
grant select on public.phonesia_campaign_attribution to service_role;
comment on view public.phonesia_campaign_attribution is
  'Contratti stipulati entro 30 giorni dalla consegna di una campagna WhatsApp, per campagna (last touch).';
