do $$ begin
 assert (select count(*) from phonesia_servizi_cliente)=1, 'remove orphan derived services';
 assert (select service_status from phonesia_servizi_cliente limit 1)='ATTIVO', 'preserve confirmed state';
 assert public.phonesia_match_customer('aaaaaa00a00a000a','00393001234567','ONE@example.invalid')=1, 'normalize identity';
 assert public.phonesia_match_customer('AAAAAA00A00A000A','3007654321',null) is null, 'reject contradictory identifiers';
 assert public.phonesia_match_customer('ZZZZZZ00Z00Z000Z','3001234567',null) is null, 'reject conflicting CF';
 assert not has_function_privilege('anon','public.phonesia_match_customer(text,text,text)','EXECUTE'), 'anonymous RPC denied';
 assert not has_function_privilege('authenticated','public.phonesia_match_customer(text,text,text)','EXECUTE'), 'browser RPC denied';
 assert has_function_privilege('service_role','public.phonesia_match_customer(text,text,text)','EXECUTE'), 'server RPC allowed';
 assert (select count(*) from phonesia_private.security_snapshots)>=2, 'backup and removal audit';
end $$;
insert into phonesia_contratti(id,codice_fiscale,operatore,categoria,tipo_contratto)
 values ('00000000-0000-0000-0000-000000000003','AAAAAA00A00A000A','WINDTRE','telefonia','fisso'),
 ('00000000-0000-0000-0000-000000000004','AAAAAA00A00A000A','WINDTRE','energia','mobile'),
 ('00000000-0000-0000-0000-000000000005','CCCCCC00C00C000C','TIM','energia','energia');
do $$ begin
 assert (select cliente_id=1 and negozio_id=1 and service_code='WINDTRE_FISSO' from phonesia_contratti where id='00000000-0000-0000-0000-000000000003'), 'classify and link import';
 assert (select service_status='NON_DEFINITO' from phonesia_servizi_cliente where contratto_id='00000000-0000-0000-0000-000000000003'), 'historical service needs confirmation';
 assert (select classification_confidence='LOW' and service_family is null from phonesia_contratti where id='00000000-0000-0000-0000-000000000004'), 'ambiguous classification';
 assert not exists(select 1 from phonesia_servizi_cliente where contratto_id='00000000-0000-0000-0000-000000000004'), 'no fabricated service';
end $$;
insert into phonesia_clienti values(3,'CCCCCC00C00C000C','3001234999',null,3);
do $$ begin
 assert (select cliente_id=3 from phonesia_contratti where id='00000000-0000-0000-0000-000000000005'), 'late QR links earlier contract';
 assert (select cliente_id=3 and service_code='TIM_ENERGIA' from phonesia_servizi_cliente where contratto_id='00000000-0000-0000-0000-000000000005'), 'late QR synchronizes service';
end $$;
update phonesia_contratti set cliente_id=2 where id='00000000-0000-0000-0000-000000000003';
do $$ begin
 assert (select cliente_id=2 from phonesia_servizi_cliente where contratto_id='00000000-0000-0000-0000-000000000003'), 'reassignment follows contract';
end $$;
update phonesia_contratti set categoria=categoria;
do $$ begin
 assert (select count(*) from phonesia_servizi_cliente)=3, 'idempotent projection';
 assert not exists(select 1 from phonesia_servizi_cliente s join phonesia_contratti c on c.id=s.contratto_id where s.cliente_id is distinct from c.cliente_id), 'no stale links';
end $$;
update phonesia_contratti set cliente_id=null,codice_fiscale=null where id='00000000-0000-0000-0000-000000000003';
do $$ begin
 assert not exists(select 1 from phonesia_servizi_cliente where contratto_id='00000000-0000-0000-0000-000000000003'), 'unlink removes derived state';
end $$;
update phonesia_contratti set categoria='telefonia',tipo_contratto='fisso' where id='00000000-0000-0000-0000-000000000005';
do $$ begin
 assert (select service_code='TIM_FISSO' from phonesia_contratti where id='00000000-0000-0000-0000-000000000005'), 'reclassify changed document';
 assert (select service_code='TIM_FISSO' from phonesia_servizi_cliente where contratto_id='00000000-0000-0000-0000-000000000005'), 'replace obsolete projection';
end $$;
update phonesia_clienti set codice_fiscale='DDDDDD00D00D000D' where id=3;
do $$ begin
 assert (select cliente_id is null from phonesia_contratti where id='00000000-0000-0000-0000-000000000005'), 'customer identity correction clears automatic link';
 assert not exists(select 1 from phonesia_servizi_cliente where contratto_id='00000000-0000-0000-0000-000000000005'), 'customer identity correction removes stale service';
end $$;
update phonesia_contratti set codice_fiscale='AAAAAA00A00A000A' where id='00000000-0000-0000-0000-000000000005';
update phonesia_contratti set codice_fiscale='EEEEEE00E00E000E' where id='00000000-0000-0000-0000-000000000005';
do $$ begin
 assert (select cliente_id is null from phonesia_contratti where id='00000000-0000-0000-0000-000000000005'), 'contract identity correction clears automatic link';
end $$;
select '25 service synchronization/security assertions passed' as result;
create index test_phone_expression_idx on phonesia_clienti(phonesia_private.normalized_phone(telefono));
grant select,insert,update on phonesia_clienti,phonesia_contratti to service_role;
set role service_role;
insert into phonesia_clienti values(99,'FFFFFF00F00F000F','3001111111',null,1);
insert into phonesia_contratti(id,codice_fiscale,operatore,categoria,tipo_contratto)
 values('00000000-0000-0000-0000-000000000099','FFFFFF00F00F000F','TIM','telefonia','mobile');
reset role;
do $$ begin
 assert (select cliente_id=99 from phonesia_servizi_cliente where contratto_id='00000000-0000-0000-0000-000000000099'), 'real service_role writes with private expression index';
end $$;
