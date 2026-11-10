-- Run after the migration against an isolated fixture database. Never sends a batch.
begin;
insert into public.condominios(id,user_id,nome) values
  ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Hamburgo');
insert into public.unidades(id,condominio_id,nome,numero,identificador)
  select md5('unit-'||i)::uuid,'00000000-0000-0000-0000-000000000001',
    '01-'||lpad(i::text,4,'0'),'01-'||lpad(i::text,4,'0'),'01-'||lpad(i::text,4,'0') from generate_series(1,106) i;
insert into public.leituras_detalhes(id,leiturista_id,condominio_nome,unidade_id,servico,leitura_atual,foto_url,data_leitura,created_at)
  select md5('reading-'||i)::uuid,'00000000-0000-0000-0000-000000000002','Hamburgo',
    '01-'||lpad(i::text,4,'0'),'AGUA',case when i<=4 then 0 else 10 end,
    'https://yotzutmarcpuckiqgnpf.supabase.co/storage/v1/object/public/fotos_leituras/'||i||'.jpg',
    '2026-11-10T12:00:00Z','2026-11-10T12:00:00Z' from generate_series(1,106) i;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $test$
declare dados jsonb; normal jsonb;
begin
  if (select nome_ucondo from public.condominios where id='00000000-0000-0000-0000-000000000001')<>'Hamburgo' then
    raise exception 'Legacy insert must fill the missing official name';
  end if;
  update public.condominios set nome_ucondo='Hamburgo*' where id='00000000-0000-0000-0000-000000000001';
  update public.condominios set nome=nome where id='00000000-0000-0000-0000-000000000001';
  if (select nome_ucondo from public.condominios where id='00000000-0000-0000-0000-000000000001')<>'Hamburgo*' then
    raise exception 'Explicit official names must not be overwritten';
  end if;
  normal:=public.manifesto_transferencia_ucondo(auth.uid(),'00000000-0000-0000-0000-000000000001','2026-11',array['AGUA']);
  if exists(select 1 from jsonb_array_elements(normal) e where e ? 'sem_medidor') then
    raise exception 'Normal units must retain the existing manifesto shape';
  end if;
  insert into public.automacoes_fila(id,user_id,condominio_id,status,unidades_processadas,erro_mensagem) values
    ('00000000-0000-0000-0000-000000000010',auth.uid(),'00000000-0000-0000-0000-000000000001','erro',0,
      'Falha na montagem do manifesto: Condomínio sem nome oficial válido configurado para o uCondo.');
  insert into public.solicitacoes_lote(id,status) values ('00000000-0000-0000-0000-000000000011','erro');
  insert into public.transferencias_ucondo(id,user_id,condominio_id,condominio_nome,periodo,servicos,manifesto,assinatura,status,solicitacao_id,trabalhos_ids)
    values ('00000000-0000-0000-0000-000000000012',auth.uid(),'00000000-0000-0000-0000-000000000001','Hamburgo','2026-11',array['AGUA'],normal,md5(normal::text),'despachada',
      '00000000-0000-0000-0000-000000000011',array['00000000-0000-0000-0000-000000000010']::uuid[]);
  perform public.solicitar_transferencia_ucondo('00000000-0000-0000-0000-000000000001','2026-11',array['AGUA'],
    array(select id from public.leituras_detalhes));
  if (select status from public.transferencias_ucondo where id='00000000-0000-0000-0000-000000000012')<>'aguardando' then
    raise exception 'Explicit retry of missing-name failure was not queued';
  end if;
  update public.transferencias_ucondo set status='despachada',solicitacao_id='00000000-0000-0000-0000-000000000011',trabalhos_ids=array['00000000-0000-0000-0000-000000000010']::uuid[];
  update public.automacoes_fila set erro_mensagem='Resultado incerto depois do clique';
  perform public.solicitar_transferencia_ucondo('00000000-0000-0000-0000-000000000001','2026-11',array['AGUA'],
    array(select id from public.leituras_detalhes));
  if (select status from public.transferencias_ucondo where id='00000000-0000-0000-0000-000000000012')<>'despachada' then
    raise exception 'Uncertain work must never be automatically retried';
  end if;
  for i in 1..4 loop
    perform public.configurar_unidade_sem_medidor('00000000-0000-0000-0000-000000000001','01-'||lpad(i::text,4,'0'),'AGUA',true);
  end loop;
  update public.leituras_detalhes set foto_url='' where unidade_id in ('01-0001','01-0002','01-0003','01-0004');
  dados:=public.manifesto_transferencia_ucondo(auth.uid(),'00000000-0000-0000-0000-000000000001','2026-11',array['AGUA']);
  if jsonb_array_length(dados)<>106 or (select count(*) from jsonb_array_elements(dados) e where (e->>'sem_medidor')::boolean)<>4 then
    raise exception 'Expected 106 units and exactly four exemptions';
  end if;
  if (select count(*) from jsonb_array_elements(dados) e where e->>'foto_url' like 'https://%')<>102 then
    raise exception 'Expected 102 real photos';
  end if;
  -- Retrying a toggle is idempotent, and AGUA never changes GAS.
  perform public.configurar_unidade_sem_medidor('00000000-0000-0000-0000-000000000001','01-0001','AGUA',true);
  if (select servicos_sem_medidor from public.unidades where nome='01-0001')<>array['AGUA'] then raise exception 'Wrong service scope'; end if;
  begin
    perform public.configurar_unidade_sem_medidor('00000000-0000-0000-0000-000000000001','01-0005','AGUA',true);
    raise exception 'Nonzero meter was incorrectly exempted';
  exception when invalid_parameter_value then null; end;
  update public.leituras_detalhes set foto_url='' where unidade_id='01-0005';
  begin
    perform public.manifesto_transferencia_ucondo(auth.uid(),'00000000-0000-0000-0000-000000000001','2026-11',array['AGUA']);
    raise exception 'Missing normal photo was accepted';
  exception when invalid_parameter_value then null; end;
  update public.leituras_detalhes set leitura_atual=1 where unidade_id='01-0001';
  begin
    perform public.manifesto_transferencia_ucondo(auth.uid(),'00000000-0000-0000-0000-000000000001','2026-11',array['AGUA']);
    raise exception 'Nonzero exempt reading was accepted';
  exception when invalid_parameter_value then null; end;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
  begin
    perform public.configurar_unidade_sem_medidor('00000000-0000-0000-0000-000000000001','01-0001','AGUA',false);
    raise exception 'Wrong account changed a meter';
  exception when insufficient_privilege then null; end;
end $test$;
rollback;
