-- Integration test: every fixture and dispatch is uncommitted and rolled back.
-- Refuses to run if a real mobile request exists. No uCondo browser is invoked.
begin;
do $test$
declare
  owner_id uuid;
  other_id uuid;
  condo uuid;
  condo_b uuid;
  foreign_condo uuid:=gen_random_uuid();
  label text;
begin
  if exists(select 1 from public.transferencias_ucondo) then raise exception 'Teste recusado: já há pedidos reais na fila.'; end if;
  select id into owner_id from auth.users u where not exists(select 1 from public.solicitacoes_lote s where s.user_id=u.id and s.status in ('pendente','em_andamento')) order by id limit 1;
  if not exists(select 1 from auth.users where id=owner_id) then raise exception 'Conta de teste existente não encontrada.'; end if;
  select id into other_id from auth.users where id<>owner_id limit 1;
  for number in 1..2 loop
    condo:=gen_random_uuid();label:='__TESTE_UCONDO_'||condo::text;
    insert into public.condominios(id,user_id,nome,dia_leitura,apartamentos,tipo_leitura) values(condo,owner_id,label,1,2,'Somente Água');
    insert into public.unidades(condominio_id,nome) values(condo,'101'),(condo,'102');
    insert into public.leituras_detalhes(leiturista_id,condominio_nome,unidade_id,servico,leitura_atual,foto_url,data_leitura)
      values(owner_id,label,'101','AGUA',100,'https://yotzutmarcpuckiqgnpf.supabase.co/storage/v1/object/public/fotos_leituras/teste-sem-execucao-101.jpg','2026-10-15T12:00:00Z'),
            (owner_id,label,'102','AGUA',200,'https://yotzutmarcpuckiqgnpf.supabase.co/storage/v1/object/public/fotos_leituras/teste-sem-execucao-102.jpg','2026-10-15T12:00:00Z');
    perform set_config('app.test.condo_'||number::text,condo::text,true);
  end loop;
  if other_id is not null then
    insert into public.condominios(id,user_id,nome,dia_leitura,apartamentos,tipo_leitura) values(foreign_condo,other_id,'__TESTE_UCONDO_OUTRA_CONTA_'||foreign_condo,1,1,'Somente Água');
    insert into public.transferencias_ucondo(user_id,condominio_id,condominio_nome,periodo,servicos,manifesto,assinatura,status)
      values(other_id,foreign_condo,'Teste outra conta','2026-10',array['AGUA'],'[{"id":"teste"}]','teste-outra-conta','erro');
  end if;
  perform set_config('app.test.foreign_condo',foreign_condo::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
end $test$;
set local role authenticated;
do $test$
declare
  c uuid;
  ids uuid[];
  response public.transferencias_ucondo%rowtype;
  again public.transferencias_ucondo%rowtype;
  denied boolean:=false;
begin
  for number in 1..2 loop
    c:=current_setting('app.test.condo_'||number::text)::uuid;
    select array_agg(d.id) into ids from public.leituras_detalhes d join public.condominios co on co.nome=d.condominio_nome where co.id=c;
    response:=public.solicitar_transferencia_ucondo(c,'2026-10',array['AGUA'],ids);
    again:=public.solicitar_transferencia_ucondo(c,'2026-10',array['AGUA'],ids);
    if response.id is distinct from again.id or response.status<>'aguardando' then raise exception 'Pedido duplicado ou estado inicial incorreto'; end if;
    perform set_config('app.test.pedido_'||number::text,response.id::text,true);
  end loop;
  if (select count(*) from public.transferencias_ucondo)<>2 then raise exception 'RLS expôs os pedidos de outra conta'; end if;
  begin
    perform public.solicitar_transferencia_ucondo(current_setting('app.test.foreign_condo')::uuid,'2026-10',array['AGUA'],ids);
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Condomínio de outra conta não foi recusado'; end if;
  denied:=false;
  begin
    perform public.despachar_transferencias_ucondo();
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Cliente conseguiu executar o dispatcher'; end if;
  denied:=false;
  begin
    update public.transferencias_ucondo set status='despachada';
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Cliente conseguiu forjar conclusão de envio'; end if;
end $test$;
reset role;
do $test$
declare
  p1 public.transferencias_ucondo%rowtype;
  p2 public.transferencias_ucondo%rowtype;
  n integer;
  c uuid;
  reading_ids uuid[];
  changed public.transferencias_ucondo%rowtype;
begin
  n:=public.despachar_transferencias_ucondo();
  if n<>1 then raise exception 'Deveria despachar somente um condomínio, obtido %',n; end if;
  select * into p1 from public.transferencias_ucondo where id=current_setting('app.test.pedido_1')::uuid;
  select * into p2 from public.transferencias_ucondo where id=current_setting('app.test.pedido_2')::uuid;
  if p1.status<>'despachada' or p2.status<>'aguardando' then raise exception 'A fila não manteve o segundo condomínio aguardando'; end if;
  if not exists(select 1 from public.solicitacoes_lote where id=p1.solicitacao_id and destino_execucao='aws') then raise exception 'Destino AWS incorreto'; end if;
  update public.solicitacoes_lote set status='concluido',finalizado_em=now() where id=p1.solicitacao_id;
  update public.automacoes_fila set status='concluida' where id=any(p1.trabalhos_ids);
  n:=public.despachar_transferencias_ucondo();
  if n<>1 then raise exception 'O próximo condomínio não foi despachado depois da conclusão'; end if;
  select * into p2 from public.transferencias_ucondo where id=p2.id;
  if p2.status<>'despachada' or p2.solicitacao_id=p1.solicitacao_id then raise exception 'Os condomínios foram misturados'; end if;
  update public.solicitacoes_lote set status='concluido',finalizado_em=now() where id=p2.solicitacao_id;
  update public.automacoes_fila set status='concluida' where id=any(p2.trabalhos_ids);
  c:=current_setting('app.test.condo_1')::uuid;
  update public.leituras_detalhes set leitura_atual=110 where unidade_id='101' and condominio_nome=(select nome from public.condominios where id=c);
  select array_agg(d.id) into reading_ids from public.leituras_detalhes d join public.condominios co on co.nome=d.condominio_nome where co.id=c;
  changed:=public.solicitar_transferencia_ucondo(c,'2026-10',array['AGUA'],reading_ids);
  update public.leituras_detalhes set leitura_atual=120 where unidade_id='101' and condominio_nome=(select nome from public.condominios where id=c);
  n:=public.despachar_transferencias_ucondo();
  select * into changed from public.transferencias_ucondo where id=changed.id;
  if n<>0 or changed.status<>'erro' or changed.solicitacao_id is not null then raise exception 'Dados alterados depois do pedido foram despachados'; end if;
end $test$;
select 'PASS: authenticated RPC, idempotency, RLS isolation, client write restrictions, AWS routing and sequential queue; all fixtures rolled back' as verification;
rollback;
