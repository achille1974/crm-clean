-- Pulizia colonne legacy durata servizi Beltrami 1876.
-- Non applicata automaticamente: eseguire manualmente solo dopo revisione.
-- Il modello ufficiale usa solo durata_servizio.

-- 1. Verifica dati presenti prima della pulizia.
select
  count(*) filter (where durata_servizio is not null) as righe_con_durata_servizio,
  count(*) filter (where durata_valore is not null) as righe_con_durata_valore,
  count(*) filter (where durata_unita is not null) as righe_con_durata_unita
from public.beltrami_servizi_cliente;

-- 2. Backfill prudente da colonne legacy verso durata_servizio.
-- Eseguire solo se le colonne legacy esistono ancora e contengono dati.
update public.beltrami_servizi_cliente
set durata_servizio =
  case
    when durata_unita in ('years', 'year') then
      durata_valore::text || case when durata_valore = 1 then ' anno' else ' anni' end
    when durata_unita in ('months', 'month') then
      durata_valore::text || case when durata_valore = 1 then ' mese' else ' mesi' end
    when durata_unita in ('days', 'day') then
      durata_valore::text || case when durata_valore = 1 then ' giorno' else ' giorni' end
    else durata_servizio
  end
where durata_servizio is null
  and durata_valore is not null
  and durata_unita is not null;

-- 3. Verifica dopo backfill, prima del drop.
select
  count(*) filter (where durata_servizio is not null) as righe_con_durata_servizio,
  count(*) filter (where durata_valore is not null and durata_servizio is null) as legacy_senza_backfill
from public.beltrami_servizi_cliente;

-- 4. Drop finale colonne legacy.
alter table public.beltrami_servizi_cliente
drop column if exists durata_valore,
drop column if exists durata_unita;
