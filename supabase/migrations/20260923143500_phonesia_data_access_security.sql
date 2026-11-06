-- PHASE 2: Phonesia vqtoxgcacosdqtoxihko only.
-- Apply AFTER phase 1 and deployment of the server-side QR/API changes.
-- Customer data is preserved. The backend keeps its service_role access.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regprocedure('public.phonesia_register_qr(text,text,text,text,text,bigint,boolean,text,text,text)') is null
     or to_regclass('public.phonesia_user_profiles') is null then
    raise exception 'Phonesia prerequisites missing: apply QR registration migration first';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'Unexpected bypass privileges on a browser role';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls) then
    raise exception 'Expected Supabase service_role with BYPASSRLS';
  end if;
end;
$$;

-- Retain the old security metadata for review and a deliberate rollback.
-- This is a private configuration snapshot, not a copy of customer records.
create table if not exists phonesia_private.security_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  migration text not null,
  snapshot jsonb not null
);
alter table phonesia_private.security_snapshots enable row level security;
revoke all on phonesia_private.security_snapshots from public, anon, authenticated;
insert into phonesia_private.security_snapshots (migration, snapshot)
select '20260923143500_phonesia_data_access_security', jsonb_build_object(
  'relations', (select jsonb_agg(jsonb_build_object(
    'name', c.relname, 'kind', c.relkind, 'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity, 'forced', c.relforcerowsecurity, 'acl', c.relacl, 'options', c.reloptions
  )) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')),
  'column_acl', (select jsonb_agg(jsonb_build_object('table', c.relname, 'column', a.attname, 'acl', a.attacl))
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and a.attacl is not null),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname = 'public'),
  'functions', (select jsonb_agg(jsonb_build_object('name', p.oid::regprocedure::text, 'acl', p.proacl))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
  'default_acl', (select jsonb_agg(to_jsonb(d)) from pg_default_acl d),
  'schema_acl', (select nspacl::text from pg_namespace where nspname = 'public')
);

do $$
declare
  obj record;
  policy_row record;
  column_list text;
  scoped_names text[] := array[
    'phonesia_analytics_attivazione', 'interazioni', 'phonesia_negozi', 'contacts',
    'phonesia_activity_import_rows', 'phonesia_activity_import_batches', 'phonesia_opportunita_inviate',
    'phonesia_contratti_backup_date_future_20260408', 'phonesia_whatsapp_message_statuses',
    'consensi', 'phonesia_attivita', 'phonesia_operazioni', 'whatsapp_templates', 'tasks',
    'phonesia_clienti', 'privacy_consents', 'phonesia_contratti', 'offerte',
    'phonesia_whatsapp_campaign_attempts', 'phonesia_feedback', 'consensi_contatto',
    'phonesia_scadenze', 'offerte_righe', 'phonesia_whatsapp_campaign_progress', 'clienti',
    'phonesia_whatsapp_campaigns', 'phonesia_agent_tasks', 'crm_note', 'messages',
    'phonesia_user_profiles', 'phonesia_activity_customer_links',
    'phonesia_contratti_backup_pre_2025_20260408', 'phonesia_consensi', 'phonesia_servizi_cliente',
    'contact_events', 'phonesia_conversazioni', 'phonesia_whatsapp_delivery_events',
    'phonesia_note_cliente', 'consensi_marketing', 'phonesia_whatsapp_campaign_recipients',
    'phonesia_handoff_richieste'
  ];
begin
  for obj in
    select c.oid, c.relname, c.relkind, pg_get_userbyid(c.relowner) as owner
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any(scoped_names) and c.relkind in ('r', 'p', 'v', 'm')
  loop
    if obj.owner in ('anon', 'authenticated') then
      raise exception 'Unexpected browser ownership of %', obj.relname;
    end if;
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', obj.relname);
    select string_agg(quote_ident(attname), ', ' order by attnum) into column_list
      from pg_attribute where attrelid = obj.oid and attnum > 0 and not attisdropped;
    -- Table-level REVOKE alone does not remove separately granted column access.
    if column_list is not null then
      execute format('revoke all privileges (%s) on table public.%I from public, anon, authenticated', column_list, obj.relname);
    end if;

    if obj.relkind in ('r', 'p') then
      execute format('alter table public.%I enable row level security', obj.relname);
      execute format('grant select, insert, update, delete on table public.%I to service_role', obj.relname);
      if obj.relname = 'phonesia_user_profiles' then
        -- Replace old profile rules to avoid both permissive OR bypasses and
        -- dependencies on RPCs whose browser EXECUTE is revoked below.
        for policy_row in select polname from pg_policy where polrelid = obj.oid loop
          execute format('drop policy %I on public.phonesia_user_profiles', policy_row.polname);
        end loop;
        create policy phonesia_profile_self_read on public.phonesia_user_profiles
          for select to authenticated
          using (auth_user_id = (select auth.uid()) and active = true);
        grant select on public.phonesia_user_profiles to authenticated;
      else
        -- Restrictive denial also protects against existing permissive policies
        -- and grants inherited through another role. Service role bypasses RLS.
        execute format('drop policy if exists phonesia_server_access_only on public.%I', obj.relname);
        execute format(
          'create policy phonesia_server_access_only on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
          obj.relname
        );
      end if;
    else
      if obj.relkind = 'v' then
        execute format('alter view public.%I set (security_invoker = true)', obj.relname);
      end if;
      execute format('grant select on table public.%I to service_role', obj.relname);
    end if;
  end loop;

  -- Preserve identity/serial inserts from the backend while closing browser grants.
  for obj in
    select distinct s.relname
    from pg_class s join pg_namespace sn on sn.oid = s.relnamespace
    join pg_depend d on d.classid = 'pg_class'::regclass and d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class t on t.oid = d.refobjid join pg_namespace tn on tn.oid = t.relnamespace
    where s.relkind = 'S' and sn.nspname = 'public' and tn.nspname = 'public' and t.relname = any(scoped_names)
  loop
    execute format('revoke all on sequence public.%I from public, anon, authenticated', obj.relname);
    execute format('grant usage, select on sequence public.%I to service_role', obj.relname);
  end loop;

  -- No application RPC in this project is required directly from the browser.
  -- Exclude extension-owned functions. Preserve execution for trusted jobs.
  for obj in
    select p.oid::regprocedure as signature, pg_get_userbyid(p.proowner) as owner
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    if obj.owner in ('anon', 'authenticated') then
      raise exception 'Unexpected browser ownership of function %', obj.signature;
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', obj.signature);
    execute format('grant execute on function %s to service_role', obj.signature);
  end loop;
end;
$$;

revoke create on schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from public, anon, authenticated;
-- PostgreSQL's built-in PUBLIC EXECUTE default is global, not per-schema.
alter default privileges for role postgres revoke execute on functions from public;

-- IMPORTANT: this closes defaults for postgres, not for Supabase-managed roles.
-- The live audit found separate supabase_admin defaults. Do not blindly ALTER
-- DEFAULT PRIVILEGES FOR ROLE supabase_admin or acquire that role. Resolve via
-- an authorized platform operation after scripts/phonesia/security-followup-audit.sql,
-- and verify the resulting catalog. Existing scoped objects are protected above.

notify pgrst, 'reload schema';
commit;
