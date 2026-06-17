-- Bozza schema Beltrami 1876.
-- Non applicata automaticamente: eseguire manualmente solo dopo revisione.
-- Applicare nel progetto Supabase dedicato a Beltrami, attualmente supreme-crm.
-- Non applicare nel database Supabase usato da Phonesia.

create table if not exists public.beltrami_clienti (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nome text not null,
  cognome text not null,
  telefono text not null,
  telefono_normalizzato text not null,
  email text,
  codice_fiscale text,
  note text,
  servizio_interesse text,
  privacy_consent boolean not null default false,
  whatsapp_consent boolean not null default false,
  privacy_version text not null default 'beltrami_privacy_v1',
  qr_id text not null default 'beltrami_1876_qr',
  source text not null default 'qr_beltrami_1876'
);

create unique index if not exists beltrami_clienti_telefono_normalizzato_uidx
on public.beltrami_clienti (telefono_normalizzato);

create index if not exists beltrami_clienti_codice_fiscale_idx
on public.beltrami_clienti (codice_fiscale)
where codice_fiscale is not null;

create index if not exists beltrami_clienti_email_idx
on public.beltrami_clienti (email)
where email is not null;

create table if not exists public.beltrami_consensi (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  cliente_id bigint not null references public.beltrami_clienti(id) on delete cascade,
  tipo_evento text not null,
  metodo text not null default 'qr',
  privacy_version text,
  qr_id text,
  user_agent text
);

create index if not exists beltrami_consensi_cliente_id_idx
on public.beltrami_consensi (cliente_id);

create index if not exists beltrami_consensi_tipo_evento_idx
on public.beltrami_consensi (tipo_evento);

alter table public.beltrami_clienti enable row level security;
alter table public.beltrami_consensi enable row level security;
