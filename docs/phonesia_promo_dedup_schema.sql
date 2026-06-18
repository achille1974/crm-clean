-- Deduplica promo WhatsApp Phonesia.
-- Applicare solo sul DB Phonesia, non sul DB Beltrami.
-- Questo file prepara una colonna fisica per la stessa chiave promo che il
-- codice salva gia' in metadata.promo_key per compatibilita' con lo schema attuale.
-- Non applicare automaticamente: eseguire solo dopo verifica manuale del target DB.

alter table public.phonesia_opportunita_inviate
  add column if not exists promo_key text;

create index if not exists phonesia_opportunita_inviate_promo_key_cliente_idx
  on public.phonesia_opportunita_inviate (promo_key, cliente_id);

-- Backfill prudente da metadata, se necessario dopo il rilascio codice:
--
-- update public.phonesia_opportunita_inviate
-- set promo_key = metadata->>'promo_key'
-- where promo_key is null
--   and metadata ? 'promo_key'
--   and nullif(trim(metadata->>'promo_key'), '') is not null;
