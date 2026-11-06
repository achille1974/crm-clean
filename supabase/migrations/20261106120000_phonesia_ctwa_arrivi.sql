-- Campagna "clic su WhatsApp" Phonesia (Nov 2026).
-- 1) Traccia ogni arrivo da annuncio e la risposta automatica (max 1 ogni 24 ore per numero).
-- 2) Origine della registrazione QR (es. 'ctwa'); NULL = registrazione come oggi.
-- Solo aggiunte: nessun dato esistente modificato. NON APPLICATA senza autorizzazione di Achille.
set local lock_timeout = '5s';

create table if not exists public.phonesia_ctwa_arrivi (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  telefono text not null check (telefono ~ '^\+[0-9]{8,15}$'),
  negozio_id bigint not null check (negozio_id in (1, 2, 3)),
  via text not null check (via in ('referral', 'testo')),
  negozio_non_determinato boolean not null default false,
  source_type text check (length(source_type) <= 40),
  source_id text check (length(source_id) <= 100),
  ctwa_clid text check (length(ctwa_clid) <= 500),
  headline text check (length(headline) <= 200),
  wa_message_id text not null unique,
  cliente_id bigint references public.phonesia_clienti(id) on delete set null,
  risposta text not null default 'in_corso'
    check (risposta in ('in_corso', 'registrazione', 'gia_registrato', 'saltata_24h', 'errore')),
  risposta_inviata_at timestamptz,
  errore text check (length(errore) <= 500)
);

create index if not exists phonesia_ctwa_arrivi_telefono_risposta_idx
  on public.phonesia_ctwa_arrivi (telefono, risposta_inviata_at desc);
create index if not exists phonesia_ctwa_arrivi_created_idx
  on public.phonesia_ctwa_arrivi (created_at);

alter table public.phonesia_ctwa_arrivi enable row level security;
revoke all on table public.phonesia_ctwa_arrivi from public, anon, authenticated;
grant select, insert, update on table public.phonesia_ctwa_arrivi to service_role;
revoke all on sequence public.phonesia_ctwa_arrivi_id_seq from public, anon, authenticated;
grant usage, select on sequence public.phonesia_ctwa_arrivi_id_seq to service_role;

alter table public.phonesia_clienti
  add column if not exists origine_registrazione text
  check (origine_registrazione is null or origine_registrazione ~ '^[a-z0-9_-]{1,32}$');

notify pgrst, 'reload schema';
