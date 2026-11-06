-- Read-only safety boundary: display services only for their contract's current customer.
-- This does not alter any customer, contract, classification, service or consent row.
create or replace view public.phonesia_servizi_cliente_coerenti with (security_invoker=true) as
select s.* from public.phonesia_servizi_cliente s
join public.phonesia_contratti c on c.id=s.contratto_id and c.cliente_id=s.cliente_id;
revoke all on public.phonesia_servizi_cliente_coerenti from public,anon,authenticated;
grant select on public.phonesia_servizi_cliente_coerenti to service_role;
