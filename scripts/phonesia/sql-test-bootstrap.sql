\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.phonesia_clienti (
  id bigint primary key,
  telefono text,
  whatsapp_active boolean not null default true
);
create table public.phonesia_user_profiles (
  auth_user_id uuid primary key,
  active boolean not null,
  role text not null
);
create table public.phonesia_opportunita_inviate (
  id bigint generated always as identity primary key,
  cliente_id bigint not null references public.phonesia_clienti(id),
  batch_id uuid,
  messaggio text,
  attachment_public_url text,
  attachment_file_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.phonesia_whatsapp_message_statuses (
  whatsapp_message_id text not null,
  status text not null,
  timestamp_meta timestamptz not null,
  error_code text,
  error_title text,
  error_message text
);

insert into public.phonesia_clienti(id,telefono)
select i, '39340' || lpad(i::text, 7, '0') from generate_series(1, 900) i;

insert into public.phonesia_opportunita_inviate
  (cliente_id,batch_id,messaggio,attachment_public_url,attachment_file_name,metadata,created_at)
select i,'e6964dee-865a-4dbf-95dc-223e0c2fece2','storico','https://example.invalid/image.jpg','image.jpg',
       jsonb_build_object('whatsapp_message_id','wamid.historical.' || i),now() + i * interval '1 second'
from generate_series(1,286) i;

insert into public.phonesia_whatsapp_message_statuses
select 'wamid.historical.' || i,
       case when i % 3 = 0 then 'read' when i % 3 = 1 then 'sent' else 'delivered' end,
       now(),null,null,null
from generate_series(1,286) i;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant select on public.phonesia_user_profiles to authenticated, service_role;
