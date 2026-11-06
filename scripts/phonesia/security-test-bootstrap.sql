\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated, service_role;

create table public.phonesia_negozi (
  id uuid primary key default gen_random_uuid(), nome text not null,
  slug text not null, codice integer unique
);
insert into public.phonesia_negozi(nome,slug,codice) values ('Test','test',1);
create table public.phonesia_clienti (
  id bigint generated always as identity primary key,
  nome text, cognome text, telefono text unique, email text unique, codice_fiscale text unique,
  negozio_id bigint, qr_id text, created_at timestamptz default now(),
  welcome_sent_at timestamptz, whatsapp_active boolean default false
);
create table public.phonesia_consensi (
  id bigint generated always as identity primary key,
  cliente_id bigint references public.phonesia_clienti(id), tipo_evento text, metodo text,
  privacy_version text, privacy_hash text, negozio_id bigint, qr_id text,
  user_agent text check (user_agent <> 'force-consent-failure'),
  welcome_message_pending boolean not null default false,
  welcome_message_type text, welcome_message_link text, created_at timestamptz default now()
);
create table public.phonesia_user_profiles (
  id bigint generated always as identity primary key,
  auth_user_id uuid unique not null, email text not null, nome text,
  role text not null, negozio_id integer, active boolean not null default true
);
insert into public.phonesia_clienti(nome, cognome, telefono, codice_fiscale, email)
values ('Originale','Test','+390000000001','AAAAAA00A00A000A','originale@example.invalid');
insert into public.phonesia_user_profiles(auth_user_id,email,role,active) values
('10000000-0000-0000-0000-000000000001','admin@example.invalid','admin',true),
('10000000-0000-0000-0000-000000000002','user@example.invalid','user',true),
('10000000-0000-0000-0000-000000000003','inactive@example.invalid','admin',false);

do $$ declare table_name text; begin
  foreach table_name in array array[
    'interazioni','contacts','phonesia_activity_import_rows',
    'phonesia_activity_import_batches','phonesia_opportunita_inviate',
    'phonesia_contratti_backup_date_future_20260408','phonesia_whatsapp_message_statuses',
    'consensi','phonesia_attivita','phonesia_operazioni','whatsapp_templates','tasks',
    'privacy_consents','phonesia_contratti','offerte','phonesia_whatsapp_campaign_attempts',
    'phonesia_feedback','consensi_contatto','phonesia_scadenze','offerte_righe','clienti',
    'phonesia_whatsapp_campaigns','phonesia_agent_tasks','crm_note','messages',
    'phonesia_activity_customer_links','phonesia_contratti_backup_pre_2025_20260408',
    'phonesia_servizi_cliente','contact_events','phonesia_conversazioni',
    'phonesia_whatsapp_delivery_events','phonesia_note_cliente','consensi_marketing',
    'phonesia_whatsapp_campaign_recipients','phonesia_handoff_richieste'
  ] loop
    execute format('create table public.%I (id bigint generated always as identity primary key, content text)', table_name);
    execute format('insert into public.%I (content) values (%L)', table_name, 'Synthetic confidential data');
  end loop;
end; $$;
-- The live audit confirmed 39 tables and TWO views, not 40 tables and one view.
create view public.phonesia_analytics_attivazione as select count(*)::bigint as id from public.phonesia_clienti;
create view public.phonesia_whatsapp_campaign_progress as select id, email from public.phonesia_clienti;
create function public.send_whatsapp_from_contact(bigint) returns boolean language sql security definer as $$ select true $$;
create function public.phonesia_is_active_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.phonesia_user_profiles where auth_user_id=auth.uid() and active and role='admin')
$$;

-- Reproduce legacy open grants, permissive policies and column-level exceptions.
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant select(email), update(email) on public.phonesia_clienti to public;
create policy legacy_open on public.phonesia_clienti for all to public using (true) with check (true);
alter table public.phonesia_user_profiles enable row level security;
create policy legacy_profiles on public.phonesia_user_profiles for all to authenticated using (public.phonesia_is_active_admin()) with check (true);

alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
