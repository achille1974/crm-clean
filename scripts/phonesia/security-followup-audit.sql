-- Phonesia vqtoxgcacosdqtoxihko ONLY. Metadata-only follow-up, not a migration.
-- Run with execute_sql in the connected session. Never run HTTP functions,
-- TRUNCATE, application routines, queue reads, or privilege-changing probes.
-- This script does not return function bodies, API keys or customer records.
begin transaction read only;
set local statement_timeout = '15s';

-- 1. Roles relevant to default privileges. Membership is evidence, not permission
-- to bypass platform restrictions or promote postgres to a managed/superuser role.
select current_user as audit_user, r.rolname, r.rolsuper, r.rolcreaterole,
       r.rolinherit, r.rolbypassrls,
       pg_has_role(current_user, r.oid, 'MEMBER') as current_user_is_member,
       pg_has_role(current_user, r.oid, 'USAGE') as current_user_inherits_role
from pg_roles r
where r.rolname in ('postgres', 'supabase_admin')
order by r.rolname;

-- 2. Explicit browser-facing default ACLs, separated by creator and schema.
select pg_get_userbyid(d.defaclrole) as creator_role,
       coalesce(n.nspname, '(global)') as schema_name, d.defaclobjtype as object_type,
       case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
       a.privilege_type, a.is_grantable
from pg_default_acl d
left join pg_namespace n on n.oid=d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where (n.nspname='public' or d.defaclnamespace=0)
  and (a.grantee=0 or a.grantee in (select oid from pg_roles where rolname in ('anon','authenticated')))
order by creator_role, schema_name, object_type, grantee, a.privilege_type;

-- A creator with NO global function ACL still has built-in PUBLIC EXECUTE.
select r.rolname as creator_role,
       not exists(select 1 from pg_default_acl d
         where d.defaclrole=r.oid and d.defaclnamespace=0 and d.defaclobjtype='f')
         as implicit_global_public_function_execute
from pg_roles r where r.rolname in ('postgres','supabase_admin') order by r.rolname;

-- 3. Exact signatures and fingerprints of routines without a fixed search_path.
-- Review each corresponding definition privately before changing identifiers.
-- Do not paste whole bodies into a report: they can contain embedded secrets.
select p.oid::regprocedure::text as function_signature,
       pg_get_userbyid(p.proowner) as owner, l.lanname as language,
       p.prorettype::regtype::text as result_type, p.prosecdef as security_definer,
       p.provolatile as volatility, md5(pg_get_functiondef(p.oid)) as definition_fingerprint,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_language l on l.oid=p.prolang
where n.nspname='public' and p.prokind in ('f','p')
  and not exists(select 1 from unnest(p.proconfig) cfg where cfg like 'search_path=%')
  and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass
    and d.objid=p.oid and d.deptype='e')
order by function_signature;

-- 4. pg_net registration schema is not necessarily its runtime-object schema.
select e.extname, e.extversion, pg_get_userbyid(e.extowner) as owner,
       n.nspname as registered_schema, e.extrelocatable
from pg_extension e join pg_namespace n on n.oid=e.extnamespace
where e.extname='pg_net';

select p.oid::regprocedure::text as function_signature,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
       has_schema_privilege('anon',n.oid,'USAGE') as anon_schema_usage,
       has_schema_privilege('authenticated',n.oid,'USAGE') as authenticated_schema_usage,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute,
       has_function_privilege(current_user,p.oid,'EXECUTE WITH GRANT OPTION') as audit_user_execute_grant_option
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='net' and p.prokind='f' order by function_signature;

-- 5. Potential references, without calling the routines or returning their bodies.
-- This is a heuristic, not a complete dependency graph (dynamic SQL can hide calls).
select p.oid::regprocedure::text as function_signature,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
       md5(pg_get_functiondef(p.oid)) as definition_fingerprint
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname not in ('pg_catalog','information_schema') and p.prokind in ('f','p')
  and pg_get_functiondef(p.oid) ~* '(net[[:space:]]*\.[[:space:]]*http_|send_whatsapp_from_contact|supabase_functions[[:space:]]*\.[[:space:]]*http_request)'
order by function_signature;

select tn.nspname as table_schema, c.relname as table_name, t.tgname as trigger_name,
       t.tgenabled, p.oid::regprocedure::text as function_signature
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace tn on tn.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
where not t.tgisinternal and tn.nspname='public'
order by table_name, trigger_name;

-- 6. Exposed schemas from role/database settings, if present. Empty output does
-- NOT prove net is unexposed: also verify the actual Data API dashboard settings.
select coalesce(r.rolname,'(all roles)') as role_name,
       coalesce(d.datname,'(all databases)') as database_name, cfg as api_schema_setting
from pg_db_role_setting s left join pg_roles r on r.oid=s.setrole
left join pg_database d on d.oid=s.setdatabase
cross join lateral unnest(s.setconfig) cfg
where cfg like 'pgrst.db_schemas=%' or cfg like 'pgrst.db_extra_search_path=%'
order by role_name, database_name, api_schema_setting;

commit;
