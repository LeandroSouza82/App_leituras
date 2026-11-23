-- Validação transacional: usa a conta do condomínio sintético e desfaz todos os registros criados.
begin;
set local lock_timeout='5s';
select set_config('request.jwt.claim.sub',(select user_id::text from public.condominios where nome='TESTE IMPORTACAO V20'),true);
set local role authenticated;
do $test$
declare ordem text[]; ordens text[][]:=array[['AGUA','GAS','ENERGIA'],['AGUA','ENERGIA','GAS'],['GAS','AGUA','ENERGIA'],['GAS','ENERGIA','AGUA'],['ENERGIA','AGUA','GAS'],['ENERGIA','GAS','AGUA']]; cid uuid; tipo text; esperado text; dono uuid:=auth.uid(); n integer;
begin
 if dono is null then raise exception 'Conta de teste ausente'; end if;
 foreach ordem slice 1 in array ordens loop
  esperado:=case ordem[1] when 'AGUA' then 'Somente Água' when 'GAS' then 'Somente Gás' else 'Energia Elétrica' end;
  insert into public.condominios(user_id,nome,tipo_leitura,dia_leitura,apartamentos,valor) values(dono,'__TESTE_ROLLBACK_SERVICOS__',esperado,10,0,0) returning id into cid;
  perform public.adicionar_servico_planilha_ucondo(cid,ordem[1],array['TESTE-001',' TESTE-001 ','TESTE-002']);
  select tipo_leitura into tipo from public.condominios where id=cid;
  if tipo<>esperado then raise exception 'Primeiro serviço incorreto %',tipo; end if;
  perform public.adicionar_servico_planilha_ucondo(cid,ordem[2],array['TESTE-002','TESTE-001']);
  esperado:=case when 'AGUA'=any(ordem[1:2]) and 'GAS'=any(ordem[1:2]) then 'Água e Gás' when 'AGUA'=any(ordem[1:2]) then 'Água e Energia' else 'Gás e Energia' end;
  select tipo_leitura into tipo from public.condominios where id=cid;
  if tipo<>esperado then raise exception 'Combinação dupla incorreta %',tipo; end if;
  perform public.adicionar_servico_planilha_ucondo(cid,ordem[3],array['TESTE-001']);
  perform public.adicionar_servico_planilha_ucondo(cid,ordem[1],array['TESTE-001']);
  select tipo_leitura,apartamentos into tipo,n from public.condominios where id=cid;
  if tipo<>'Água, Gás e Energia' or n<>2 or (select count(*) from public.unidades where condominio_id=cid)<>2 then raise exception 'Serviços ou unidades perdidos/duplicados'; end if;
 end loop;
 begin
  perform public.adicionar_servico_planilha_ucondo(cid,'INVALIDO',array['TESTE-001']);
  raise exception 'Teste falhou: aceitou serviço inválido';
 exception when raise_exception then if sqlerrm not like 'Serviço ou lista%' then raise; end if; end;
 begin
  perform public.adicionar_servico_planilha_ucondo(cid,'AGUA','{}'::text[]);
  raise exception 'Teste falhou: aceitou lista vazia';
 exception when raise_exception then if sqlerrm not like 'Serviço ou lista%' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin
  perform public.adicionar_servico_planilha_ucondo(cid,'AGUA',array['OUTRA-CONTA']);
  raise exception 'Teste falhou: outra conta alterou o condomínio';
 exception when no_data_found then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.adicionar_servico_planilha_ucondo(cid,'AGUA',array['SEM-SESSAO']);
  raise exception 'Teste falhou: sem sessão alterou o condomínio';
 exception when no_data_found then null; end;
end $test$;
rollback;
