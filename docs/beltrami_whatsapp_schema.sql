-- Bozza schema WhatsApp Beltrami 1876.
-- Non applicata automaticamente: eseguire manualmente solo nel DB Supabase dedicato a Beltrami.
-- Serve per tracciare outbound/inbound/status e abilitare routing futuro context.id / last touch / ambiguous.

alter table public.beltrami_clienti
  add column if not exists whatsapp_active boolean not null default false,
  add column if not exists whatsapp_activated_at timestamptz,
  add column if not exists welcome_sent_at timestamptz,
  add column if not exists welcome_status text,
  add column if not exists welcome_whatsapp_message_id text,
  add column if not exists welcome_template_name text,
  add column if not exists last_whatsapp_outbound_at timestamptz,
  add column if not exists last_whatsapp_outbound_message_id text,
  add column if not exists last_whatsapp_outbound_kind text;

create table if not exists public.beltrami_whatsapp_messages (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  cliente_id bigint references public.beltrami_clienti(id) on delete set null,
  direction text not null,
  message_kind text not null,
  routing_status text,
  from_phone text,
  to_phone text,
  body text,
  template_name text,
  whatsapp_message_id text,
  context_message_id text,
  status text,
  status_reason text,
  notification_key text,
  raw_json jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists beltrami_whatsapp_messages_wamid_uidx
on public.beltrami_whatsapp_messages (whatsapp_message_id)
where whatsapp_message_id is not null;

create unique index if not exists beltrami_whatsapp_messages_notification_key_uidx
on public.beltrami_whatsapp_messages (notification_key)
where notification_key is not null;

create index if not exists beltrami_whatsapp_messages_cliente_created_idx
on public.beltrami_whatsapp_messages (cliente_id, created_at desc);

create index if not exists beltrami_whatsapp_messages_context_idx
on public.beltrami_whatsapp_messages (context_message_id)
where context_message_id is not null;

create index if not exists beltrami_whatsapp_messages_from_phone_idx
on public.beltrami_whatsapp_messages (from_phone, created_at desc);

create index if not exists beltrami_whatsapp_messages_to_phone_idx
on public.beltrami_whatsapp_messages (to_phone, created_at desc);

create index if not exists beltrami_whatsapp_messages_routing_status_idx
on public.beltrami_whatsapp_messages (routing_status, created_at desc);

create table if not exists public.beltrami_whatsapp_statuses (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  whatsapp_message_id text not null,
  status text not null,
  recipient_phone text,
  timestamp_meta timestamptz,
  conversation_id_meta text,
  pricing_category text,
  pricing_billable boolean,
  error_code text,
  error_title text,
  error_message text,
  raw_json jsonb
);

create unique index if not exists beltrami_whatsapp_statuses_uidx
on public.beltrami_whatsapp_statuses (whatsapp_message_id, status, timestamp_meta);

alter table public.beltrami_whatsapp_messages enable row level security;
alter table public.beltrami_whatsapp_statuses enable row level security;
