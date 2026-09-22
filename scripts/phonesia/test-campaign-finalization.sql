create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

-- Solo le colonne usate dalla nuova migrazione: nessun servizio o credenziale.
create table public.phonesia_whatsapp_campaigns (
  id uuid primary key,
  state text not null check (state in ('draft','ready','processing','paused','completed','needs_review')),
  historical boolean not null default false,
  snapshot_complete boolean not null,
  selected_declared integer not null,
  documented_recipients integer not null,
  unreconstructable_count integer not null default 0,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.phonesia_whatsapp_campaign_recipients (
  id uuid primary key,
  campaign_id uuid not null references public.phonesia_whatsapp_campaigns(id),
  send_state text not null check (send_state in ('pending','processing','accepted','rejected','skipped','uncertain')),
  lease_token uuid,
  delivery_state text,
  exclusion_reason text
);

-- Campagna già terminata prima dell'installazione dei trigger.
insert into public.phonesia_whatsapp_campaigns
  (id,state,snapshot_complete,selected_declared,documented_recipients)
values ('00000000-0000-0000-0000-000000000001','ready',true,1,1);
insert into public.phonesia_whatsapp_campaign_recipients (id,campaign_id,send_state)
values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','accepted');

\ir ../../supabase/migrations/20260922_phonesia_whatsapp_campaign_finalization.sql

-- Il recupero non tocca i destinatari e finalizza il pregresso.
do $$ begin
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000001') <> 'ready' then
    raise exception 'migration unexpectedly changed existing campaign';
  end if;
end $$;
select public.phonesia_finalize_idle_whatsapp_campaigns();

-- Ultimo accepted: chiude senza attendere delivered/read.
insert into public.phonesia_whatsapp_campaigns (id,state,snapshot_complete,selected_declared,documented_recipients)
values ('00000000-0000-0000-0000-000000000002','ready',true,1,1);
insert into public.phonesia_whatsapp_campaign_recipients (id,campaign_id,send_state)
values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','pending');
update public.phonesia_whatsapp_campaign_recipients set send_state='accepted'
where id='10000000-0000-0000-0000-000000000002';
update public.phonesia_whatsapp_campaign_recipients set delivery_state='read'
where id='10000000-0000-0000-0000-000000000002';

-- Pending e processing, anche con lease, impediscono la chiusura.
insert into public.phonesia_whatsapp_campaigns (id,state,snapshot_complete,selected_declared,documented_recipients)
values ('00000000-0000-0000-0000-000000000003','ready',true,2,2);
insert into public.phonesia_whatsapp_campaign_recipients (id,campaign_id,send_state,lease_token)
values
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','pending',null),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000003','processing','20000000-0000-0000-0000-000000000004');
update public.phonesia_whatsapp_campaign_recipients set send_state='accepted'
where id='10000000-0000-0000-0000-000000000003';

-- Rifiutati e saltati restano documentati ma non impediscono la chiusura.
insert into public.phonesia_whatsapp_campaigns (id,state,snapshot_complete,selected_declared,documented_recipients)
values ('00000000-0000-0000-0000-000000000004','ready',true,2,2);
insert into public.phonesia_whatsapp_campaign_recipients (id,campaign_id,send_state,exclusion_reason)
values
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','pending',null),
 ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000004','pending',null);
update public.phonesia_whatsapp_campaign_recipients set send_state='rejected'
where id='10000000-0000-0000-0000-000000000005';
update public.phonesia_whatsapp_campaign_recipients
set send_state='skipped', exclusion_reason='consenso mancante'
where id='10000000-0000-0000-0000-000000000006';

-- Uncertain richiede revisione, senza riaprire il destinatario.
insert into public.phonesia_whatsapp_campaigns (id,state,snapshot_complete,selected_declared,documented_recipients)
values ('00000000-0000-0000-0000-000000000005','ready',true,1,1);
insert into public.phonesia_whatsapp_campaign_recipients (id,campaign_id,send_state)
values ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000005','pending');
update public.phonesia_whatsapp_campaign_recipients set send_state='uncertain'
where id='10000000-0000-0000-0000-000000000007';

-- Snapshot incompleto e storico non vengono chiusi.
insert into public.phonesia_whatsapp_campaigns
  (id,state,snapshot_complete,historical,selected_declared,documented_recipients,unreconstructable_count)
values
 ('00000000-0000-0000-0000-000000000006','ready',false,false,1,1,0),
 ('00000000-0000-0000-0000-000000000007','needs_review',false,true,497,286,211);
insert into public.phonesia_whatsapp_campaign_recipients (id,campaign_id,send_state)
values ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000006','accepted');

-- Campagna interamente saltata durante la creazione.
insert into public.phonesia_whatsapp_campaigns (id,state,snapshot_complete,selected_declared,documented_recipients)
values ('00000000-0000-0000-0000-000000000008','ready',true,1,1);
insert into public.phonesia_whatsapp_campaign_recipients (id,campaign_id,send_state,exclusion_reason)
values ('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000008','skipped','consenso mancante');

do $$
declare v_finished timestamptz;
begin
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000001') <> 'completed' then raise exception 'recovery failed'; end if;
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000002') <> 'completed' then raise exception 'accepted finalization failed'; end if;
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000003') <> 'ready' then raise exception 'active work finalized'; end if;
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000004') <> 'completed' then raise exception 'mixed outcomes not finalized'; end if;
  if (select count(*) from public.phonesia_whatsapp_campaign_recipients where campaign_id='00000000-0000-0000-0000-000000000004' and send_state in ('rejected','skipped')) <> 2 then raise exception 'outcome counts changed'; end if;
  if (select exclusion_reason from public.phonesia_whatsapp_campaign_recipients where id='10000000-0000-0000-0000-000000000006') <> 'consenso mancante' then raise exception 'skip reason changed'; end if;
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000005') <> 'needs_review' then raise exception 'uncertain not reviewed'; end if;
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000006') <> 'ready' then raise exception 'incomplete snapshot finalized'; end if;
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000007') <> 'needs_review' then raise exception 'historical campaign changed'; end if;
  if (select state from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000008') <> 'completed' then raise exception 'all-skipped campaign not finalized'; end if;
  select finished_at into v_finished from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000002';
  perform public.phonesia_finalize_whatsapp_campaign('00000000-0000-0000-0000-000000000002');
  if (select finished_at from public.phonesia_whatsapp_campaigns where id='00000000-0000-0000-0000-000000000002') is distinct from v_finished then raise exception 'repeat finalization changed timestamp'; end if;
end $$;

-- Per il test concorrente il dato è preesistente e il trigger è sospeso solo localmente.
alter table public.phonesia_whatsapp_campaign_recipients disable trigger phonesia_wa_campaign_finalize_on_insert;
insert into public.phonesia_whatsapp_campaigns (id,state,snapshot_complete,selected_declared,documented_recipients)
values ('00000000-0000-0000-0000-000000000009','ready',true,1,1);
insert into public.phonesia_whatsapp_campaign_recipients (id,campaign_id,send_state)
values ('10000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000009','accepted');
alter table public.phonesia_whatsapp_campaign_recipients enable trigger phonesia_wa_campaign_finalize_on_insert;
