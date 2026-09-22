begin;

set local lock_timeout = '5s';

-- Chiusura della sola elaborazione: la consegna continua a evolvere via callback.
create or replace function public.phonesia_finalize_whatsapp_campaign(p_campaign_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.phonesia_whatsapp_campaigns%rowtype;
  v_recipients integer;
  v_active integer;
  v_uncertain integer;
  v_state text;
begin
  -- Serializza finalizzazioni e worker concorrenti sulla riga campagna.
  select * into v_campaign
  from public.phonesia_whatsapp_campaigns
  where id = p_campaign_id
  for update;
  if not found then raise exception 'campaign not found'; end if;

  if v_campaign.historical or not v_campaign.snapshot_complete
     or v_campaign.state not in ('ready', 'processing') then
    return v_campaign.state;
  end if;

  select count(*)::integer,
         count(*) filter (
           where send_state in ('pending', 'processing') or lease_token is not null
         )::integer,
         count(*) filter (where send_state = 'uncertain')::integer
    into v_recipients, v_active, v_uncertain
  from public.phonesia_whatsapp_campaign_recipients
  where campaign_id = p_campaign_id;

  -- Il vincolo snapshot_complete verifica il dichiarato, non il numero fisico di righe.
  if v_recipients <> v_campaign.documented_recipients or v_active > 0 then
    return v_campaign.state;
  end if;

  v_state := case
    when v_uncertain > 0 or v_campaign.unreconstructable_count > 0 then 'needs_review'
    else 'completed'
  end;

  update public.phonesia_whatsapp_campaigns
     set state = v_state, finished_at = coalesce(finished_at, now()), updated_at = now()
   where id = p_campaign_id;
  return v_state;
end;
$$;

-- L'ultimo destinatario e una campagna interamente saltata si chiudono
-- nella stessa transazione che rende terminali i destinatari.
create or replace function public.phonesia_finalize_whatsapp_campaign_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.phonesia_finalize_whatsapp_campaign(new.campaign_id);
  return null;
end;
$$;

drop trigger if exists phonesia_wa_campaign_finalize_on_insert
  on public.phonesia_whatsapp_campaign_recipients;
create trigger phonesia_wa_campaign_finalize_on_insert
after insert on public.phonesia_whatsapp_campaign_recipients
for each row
execute function public.phonesia_finalize_whatsapp_campaign_trigger();

drop trigger if exists phonesia_wa_campaign_finalize_on_terminal_state
  on public.phonesia_whatsapp_campaign_recipients;
create trigger phonesia_wa_campaign_finalize_on_terminal_state
after update of send_state on public.phonesia_whatsapp_campaign_recipients
for each row
when (
  old.send_state is distinct from new.send_state
  and new.send_state in ('accepted', 'rejected', 'skipped', 'uncertain')
)
execute function public.phonesia_finalize_whatsapp_campaign_trigger();

-- Recupera finalizzazioni saltate senza chiamare worker o Meta.
create or replace function public.phonesia_finalize_idle_whatsapp_campaigns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign record;
  v_after text;
  v_finalized integer := 0;
begin
  for v_campaign in
    select c.id, c.state
    from public.phonesia_whatsapp_campaigns c
    where c.historical = false
      and c.snapshot_complete = true
      and c.state in ('ready', 'processing')
      and not exists (
        select 1 from public.phonesia_whatsapp_campaign_recipients r
        where r.campaign_id = c.id
          and (r.send_state in ('pending', 'processing') or r.lease_token is not null)
      )
  loop
    v_after := public.phonesia_finalize_whatsapp_campaign(v_campaign.id);
    if v_after in ('completed', 'needs_review') then
      v_finalized := v_finalized + 1;
    end if;
  end loop;
  return v_finalized;
end;
$$;

revoke all on function public.phonesia_finalize_whatsapp_campaign(uuid)
  from public, anon, authenticated;
revoke all on function public.phonesia_finalize_idle_whatsapp_campaigns()
  from public, anon, authenticated;
revoke all on function public.phonesia_finalize_whatsapp_campaign_trigger()
  from public, anon, authenticated;
grant execute on function public.phonesia_finalize_whatsapp_campaign(uuid) to service_role;
grant execute on function public.phonesia_finalize_idle_whatsapp_campaigns() to service_role;

commit;
