-- Target: Phonesia vqtoxgcacosdqtoxihko. Run after phase 2.
-- No application function is invoked. Original definitions remain in the private snapshot.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $hardening$
declare
  item record;
  function_oid oid;
  original_definition text;
  updated_definition text;
begin
  for item in select * from (values
    ('public.phonesia_agent_tasks_set_updated_at()', '164f3929ad130238f8d12489782298eb'),
    ('public.phonesia_set_updated_at()', 'e4125a7f993db368462ac89bfb46b7e0'),
    ('public.send_whatsapp_from_contact(uuid,text)', '55b40f2f5e756f181a5f79a63f13d5b6'),
    ('public.set_phonesia_user_profiles_updated_at()', 'ee35fe827df0abf1e3583a64db937605'),
    ('public.set_updated_at()', '4d6804d5850641a33867814c9e76a714')
  ) as expected(signature, fingerprint)
  loop
    function_oid := to_regprocedure(item.signature);
    if function_oid is null then raise exception 'Missing function %', item.signature; end if;
    original_definition := pg_get_functiondef(function_oid);
    if md5(original_definition) <> item.fingerprint then
      raise exception 'Definition changed since review: %', item.signature;
    end if;
    if (select pg_get_userbyid(proowner) <> 'postgres' from pg_proc where oid=function_oid) then
      raise exception 'Unexpected owner: %', item.signature;
    end if;
    insert into phonesia_private.security_snapshots(migration,snapshot)
    select 'phonesia_function_search_path', jsonb_build_object(
      'signature',item.signature,'definition',original_definition,
      'owner',pg_get_userbyid(proowner),'acl',proacl,'config',proconfig)
    from pg_proc where oid=function_oid;
    if item.signature='public.send_whatsapp_from_contact(uuid,text)' then
      if position('from contacts' in original_definition)=0
         or position('from consensi_marketing' in original_definition)=0 then
        raise exception 'Expected relation references missing';
      end if;
      updated_definition := replace(replace(original_definition,
        'from contacts','from public.contacts'),
        'from consensi_marketing','from public.consensi_marketing');
      execute updated_definition;
    end if;
    execute format('alter function %s set search_path = %L',item.signature,'');
  end loop;
end;
$hardening$;
notify pgrst, 'reload schema';
commit;
