create role anon;
create role authenticated;
create role service_role bypassrls;
create schema phonesia_private;
create table phonesia_private.security_snapshots(id bigint generated always as identity, captured_at timestamptz default now(), migration text, snapshot jsonb);
alter table phonesia_private.security_snapshots enable row level security;
create table public.phonesia_clienti(id bigint primary key, codice_fiscale text, telefono text, email text, negozio_id bigint);
create table public.phonesia_contratti(id uuid primary key, cliente_id bigint references phonesia_clienti(id), negozio_id bigint,
  codice_fiscale text, telefono text, email text, origine_cliente text, operatore text, categoria text, tipo_contratto text,
  provider_cluster text, service_family text, service_role text, service_code text, classification_confidence text, classification_notes text,
  offerta text, prodotto text, data_stipula date, created_at timestamp default now());
create table public.phonesia_servizi_cliente(id bigint generated always as identity primary key,
  cliente_id bigint not null references phonesia_clienti(id), contratto_id uuid not null references phonesia_contratti(id), negozio_id bigint,
  provider_cluster text not null, service_family text not null, service_role text not null, service_code text not null,
  brand_raw text, offer_label text, product_label text, start_date date, end_date date, service_status text not null,
  is_primary boolean, source_type text not null, confidence text, notes text, updated_at timestamptz default now(),
  unique(contratto_id,service_code));
insert into phonesia_clienti values(1,'AAAAAA00A00A000A','+393001234567','one@example.invalid',1),
 (2,'BBBBBB00B00B000B','3007654321','two@example.invalid',2);
insert into phonesia_contratti(id,cliente_id,operatore,categoria,tipo_contratto,provider_cluster,service_family,service_role,service_code,classification_confidence)
values ('00000000-0000-0000-0000-000000000001',1,'TIM','telefonia','mobile','TIM','MOBILE','BASE','TIM_MOBILE','HIGH'),
 ('00000000-0000-0000-0000-000000000002',null,'TIM','telefonia','mobile','TIM','MOBILE','BASE','TIM_MOBILE','HIGH');
insert into phonesia_servizi_cliente(cliente_id,contratto_id,provider_cluster,service_family,service_role,service_code,service_status,source_type)
select 1,id,provider_cluster,service_family,service_role,service_code,'ATTIVO','CONTRATTO_IMPORTATO' from phonesia_contratti;
