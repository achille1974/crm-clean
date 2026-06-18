-- Bozza schema servizi/scadenze Beltrami 1876.
-- Non applicata automaticamente: eseguire manualmente solo dopo revisione.
-- Applicare nel progetto Supabase dedicato a Beltrami, non nel database Phonesia.
-- Il campo servizio resta testo libero: non introdurre whitelist applicative o DB.
-- durata_valore e durata_unita sono state eliminate dal modello ufficiale:
-- usare solo durata_servizio.

create table if not exists public.beltrami_servizi_cliente (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cliente_id bigint references public.beltrami_clienti(id) on delete set null,
  nome text,
  cognome text,
  telefono text,
  telefono_normalizzato text not null,
  email text,
  codice_fiscale text,
  servizio text not null,
  data_attivazione date,
  data_scadenza date not null,
  durata_servizio text,
  stato text not null default 'attivo',
  note text,
  source_file_name text,
  source_file_hash text,
  source_row_index integer,
  source_row_hash text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists beltrami_servizi_cliente_telefono_idx
on public.beltrami_servizi_cliente (telefono_normalizzato);

create index if not exists beltrami_servizi_cliente_data_scadenza_idx
on public.beltrami_servizi_cliente (data_scadenza);

create index if not exists beltrami_servizi_cliente_stato_scadenza_idx
on public.beltrami_servizi_cliente (stato, data_scadenza);

create table if not exists public.beltrami_import_batches (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  source_file_name text,
  source_file_path text,
  source_file_hash text unique,
  import_status text not null,
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  error_rows integer not null default 0,
  skipped_rows integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.beltrami_import_rows (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  batch_id bigint references public.beltrami_import_batches(id) on delete cascade,
  source_row_index integer not null,
  row_hash text not null,
  raw_json jsonb not null,
  validation_status text not null,
  validation_error text,
  cliente_id bigint references public.beltrami_clienti(id) on delete set null,
  servizio_cliente_id bigint references public.beltrami_servizi_cliente(id) on delete set null
);

create unique index if not exists beltrami_import_rows_batch_row_uidx
on public.beltrami_import_rows (batch_id, source_row_index);

create table if not exists public.beltrami_reminder_invii (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  cliente_id bigint references public.beltrami_clienti(id) on delete set null,
  servizio_cliente_id bigint references public.beltrami_servizi_cliente(id) on delete cascade,
  telefono_normalizzato text not null,
  servizio text not null,
  data_scadenza date not null,
  reminder_type text not null default 'expiry_7_days',
  status text not null,
  whatsapp_message_id text,
  template_name text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists beltrami_reminder_invii_servizio_scadenza_type_uidx
on public.beltrami_reminder_invii (servizio_cliente_id, data_scadenza, reminder_type);

alter table public.beltrami_servizi_cliente enable row level security;
alter table public.beltrami_import_batches enable row level security;
alter table public.beltrami_import_rows enable row level security;
alter table public.beltrami_reminder_invii enable row level security;

-- Migrazione idempotente per installazioni create prima della semplificazione Excel.
-- Non applicare automaticamente: eseguire manualmente solo dopo revisione.
alter table public.beltrami_servizi_cliente
  add column if not exists durata_servizio text;
