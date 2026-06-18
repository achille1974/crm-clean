-- Schema handoff risposta negozio 24h - Phonesia.
-- Non applicare automaticamente.
-- Applicare SOLO nel database Supabase Phonesia.
-- NON applicare nel database Beltrami 1876.
-- Accesso previsto solo server-side con service role; non creare policy pubbliche.

create table if not exists public.phonesia_handoff_richieste (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  business_area text not null default 'phonesia',
  cliente_id bigint,
  cliente_phone text not null,
  cliente_nome text,
  negozio_id integer,
  destinazione_nome text not null,
  destinazione_phone text not null,
  inbound_message_id text,
  inbound_body text,
  conversation_id bigint,
  agent_task_id bigint,
  notified_at timestamptz,
  notification_whatsapp_message_id text,
  reply_link text,
  mark_done_url text,
  mark_done_token_hash text not null unique,
  marked_taken_at timestamptz,
  marked_done_at timestamptz,
  marked_done_by text,
  status text not null default 'pending',
  due_at timestamptz not null,
  reminder_sent_at timestamptz,
  reminder_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists phonesia_handoff_richieste_status_due_idx
on public.phonesia_handoff_richieste (status, due_at)
where status in ('pending', 'taken', 'overdue');

create index if not exists phonesia_handoff_richieste_cliente_phone_created_idx
on public.phonesia_handoff_richieste (cliente_phone, created_at desc);

create index if not exists phonesia_handoff_richieste_inbound_message_idx
on public.phonesia_handoff_richieste (inbound_message_id)
where inbound_message_id is not null;

create index if not exists phonesia_handoff_richieste_notification_message_idx
on public.phonesia_handoff_richieste (notification_whatsapp_message_id)
where notification_whatsapp_message_id is not null;

create unique index if not exists phonesia_handoff_richieste_token_hash_uidx
on public.phonesia_handoff_richieste (mark_done_token_hash);

alter table public.phonesia_handoff_richieste enable row level security;

