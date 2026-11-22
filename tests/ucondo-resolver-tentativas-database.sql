-- Execute em um banco Postgres vazio e isolado.
\set ON_ERROR_STOP on
begin;
create schema auth;
create schema automacao_interna;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.automacoes_fila (
  id uuid primary key, user_id uuid not null, condominio_id uuid not null, periodo text not null,
  plataforma text not null default 'ucondo', servico text not null, status text not null, total_unidades int not null,
  sucessos int not null default 0, pendencias int not null default 0, erros int not null default 0,
  resultado_mensagem text, erro_mensagem text, finalizado_em timestamptz, checkpoint jsonb
);
create table public.automacoes_atividade (trabalho_id uuid, user_id uuid, mensagem text);
create table public.solicitacoes_lote (
  id uuid primary key, user_id uuid not null, status text not null, destino_execucao text not null,
  trabalhos_ids jsonb not null, total_trabalhos int not null,
  worker_id text, iniciado_em timestamptz, finalizado_em timestamptz, heartbeat_at timestamptz,
  mensagem text, updated_at timestamptz not null default now()
);
create unique index um_lote_ativo on public.solicitacoes_lote(user_id) where status in ('pendente','em_andamento');
create table public.transferencias_ucondo (
  id uuid primary key, user_id uuid not null, condominio_id uuid not null, periodo text not null,
  servicos text[] not null, status text not null, solicitacao_id uuid references public.solicitacoes_lote(id),
  trabalhos_ids uuid[] not null, manifesto jsonb not null, created_at timestamptz not null, mensagem text
);
\ir ../supabase/migrations/20261122114424_continuar_envio_ucondo.sql

insert into public.automacoes_fila
  (id, user_id, condominio_id, periodo, servico, status, total_unidades, sucessos, resultado_mensagem, finalizado_em, checkpoint)
values
  ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-11','GAS','erro',2,0,null,null,'{"preservar":true}'),
  ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','2026-11','GAS','concluida',2,2,
   'Fluxo completo concluído (GAS): 2 unidades com leituras conferidas (2 fotos confirmadas, 0 marcadas sem foto).', '2026-11-21',null);
insert into public.automacoes_atividade values
  ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001',
   'Leituras conferidas: 2/2 unidades. Fotos confirmadas: 1/2 unidades. 0 marcadas sem foto. Fotos: foto da unidade APTO-101 confirmada no uCondo.'),
  ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001',
   'Leituras conferidas: 2/2 unidades. Fotos confirmadas: 2/2 unidades. 0 marcadas sem foto. Fotos: foto da unidade APTO-999 confirmada no uCondo.');
insert into public.solicitacoes_lote (id,user_id,status,destino_execucao,trabalhos_ids,total_trabalhos)
values ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001','erro','aws',
  '["00000000-0000-0000-0000-000000000011"]',1);
insert into public.transferencias_ucondo (id,user_id,condominio_id,periodo,servicos,status,solicitacao_id,trabalhos_ids,manifesto,created_at)
values ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '2026-11',array['GAS'],'despachada','00000000-0000-0000-0000-000000000021',array['00000000-0000-0000-0000-000000000011']::uuid[],
  '[{"servico":"GAS","unidade":"APTO-101"},{"servico":"GAS","unidade":"APTO-102"}]', '2026-11-19');

\ir ../supabase/migrations/20261122194948_resolver_tentativas_ucondo_confirmadas.sql
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $test$
declare pedido uuid := '00000000-0000-0000-0000-000000000031';
begin
  if (select externas from public.confirmacoes_envios_ucondo(array[pedido])) is distinct from 1 then
    raise exception 'O mesmo total não prova a mesma unidade';
  end if;
  begin
    perform public.retomar_transferencia_ucondo(pedido);
    raise exception 'Retomada parcial permitiria reenviar unidade confirmada';
  exception when invalid_parameter_value then
    if sqlerrm not like 'Parte deste envio já foi confirmada.%' then raise; end if;
  end;
end $test$;
reset role;

-- Uma nova execução conclui a unidade que realmente faltava.
insert into public.automacoes_fila
  (id,user_id,condominio_id,periodo,servico,status,total_unidades,sucessos,resultado_mensagem,finalizado_em)
values ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '2026-11','GAS','em_andamento',1,0,null,null);
insert into public.automacoes_atividade values
  ('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000001',
   'Leituras conferidas: 1/1 unidades. Fotos confirmadas: 1/1 unidades. 0 marcadas sem foto. Fotos: foto da unidade APTO-102 confirmada no uCondo.');
update public.automacoes_fila set status='concluida', sucessos=1, finalizado_em='2026-11-22',
  resultado_mensagem='Fluxo completo concluído (GAS): 1 unidades com leituras conferidas (1 fotos confirmadas, 0 marcadas sem foto).'
where id='00000000-0000-0000-0000-000000000013';
-- A prova deve sobreviver à expiração do log.
delete from public.automacoes_atividade;
set local role authenticated;
do $test$
declare pedido uuid := '00000000-0000-0000-0000-000000000031';
begin
  if (select externas from public.confirmacoes_envios_ucondo(array[pedido])) is distinct from 2 then
    raise exception 'A outra execução não resolveu as unidades originais';
  end if;
  begin
    perform public.retomar_transferencia_ucondo(pedido);
    raise exception 'O toque desatualizado reenfileirou o trabalho';
  exception when invalid_parameter_value then
    if sqlerrm <> 'Este envio já foi concluído' then raise; end if;
  end;
end $test$;
reset role;

do $test$
begin
  if (select status from public.automacoes_fila where id='00000000-0000-0000-0000-000000000011') <> 'erro'
    or (select status from public.solicitacoes_lote) <> 'erro' then
    raise exception 'Trabalho ou lote alterado pela conferência';
  end if;
end $test$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
set local role authenticated;
do $test$
begin
  if exists(select 1 from public.confirmacoes_envios_ucondo(array['00000000-0000-0000-0000-000000000031']::uuid[])) then
    raise exception 'Evidência exposta a outra conta';
  end if;
end $test$;
reset role;

-- Outro mês não recebe cobertura dos trabalhos de novembro.
update public.automacoes_fila set periodo='2026-12'
  where id='00000000-0000-0000-0000-000000000011';
update public.transferencias_ucondo set periodo='2026-12';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select public.retomar_transferencia_ucondo('00000000-0000-0000-0000-000000000031');
reset role;
do $test$
begin
  if (select status from public.automacoes_fila where id='00000000-0000-0000-0000-000000000011') <> 'aguardando'
    or (select status from public.solicitacoes_lote) <> 'pendente'
    or (select checkpoint from public.automacoes_fila where id='00000000-0000-0000-0000-000000000011') <> '{"preservar": true}'::jsonb then
    raise exception 'Falha real ou seu checkpoint não foram preservados na retomada';
  end if;
end $test$;
update public.solicitacoes_lote set status='erro';
set local role authenticated;
do $test$
declare pedido uuid := '00000000-0000-0000-0000-000000000031';
begin
  if public.continuar_transferencia_ucondo(pedido) <> 'recolocado' then
    raise exception 'Continuar envio deixou de funcionar quando não há confirmação externa';
  end if;
end $test$;
reset role;

select 'PASS: cobertura exata e parcial, prova durável, conta isolada, toque desatualizado, falha real e Continuar envio' as verification;
-- Khiva: o pedido antigo ainda esperava fotos de uma loja sem medidor.
create table public.unidades (condominio_id uuid not null, nome varchar not null, servicos_sem_medidor text[] not null);
insert into public.unidades values ('00000000-0000-0000-0000-000000000005','LOJA-001',array['GAS']);
insert into public.automacoes_fila
  (id,user_id,condominio_id,periodo,servico,status,total_unidades,sucessos,resultado_mensagem,finalizado_em)
values
  ('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005',
    '2026-11','GAS','erro',2,0,null,null),
  ('00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005',
    '2026-11','GAS','concluida',2,2,'Fluxo completo concluído (GAS): 1 unidades com leituras conferidas (1 fotos confirmadas, 1 marcadas sem foto). Unidades sem medidor fora da grade: LOJA-001.', '2026-11-21');
insert into public.automacoes_atividade values
  ('00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000004',
   'Leituras conferidas: 1/1 unidades. Fotos confirmadas: 1/2 unidades. 1 marcadas sem foto. Fotos: foto da unidade APTO-101 confirmada no uCondo.');
insert into public.solicitacoes_lote (id,user_id,status,destino_execucao,trabalhos_ids,total_trabalhos)
values ('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000004','erro','aws',
  '["00000000-0000-0000-0000-000000000014"]',1);
insert into public.transferencias_ucondo (id,user_id,condominio_id,periodo,servicos,status,solicitacao_id,trabalhos_ids,manifesto,created_at)
values ('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005',
  '2026-11',array['GAS'],'despachada','00000000-0000-0000-0000-000000000022',array['00000000-0000-0000-0000-000000000014']::uuid[],
  '[{"servico":"GAS","unidade":"APTO-101"},{"servico":"GAS","unidade":"LOJA-001"}]', '2026-11-19');

\ir ../supabase/migrations/20261122221348_reconhecer_dispensas_ucondo.sql

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',true);
set local role authenticated;
do $test$
declare pedido uuid := '00000000-0000-0000-0000-000000000032';
begin
  if not exists (select 1 from public.confirmacoes_envios_ucondo_v2(array[pedido]) where total = 2 and externas = 1 and dispensadas = 1) then
    raise exception 'A unidade dispensada não foi distinguida da foto confirmada';
  end if;
  if (select externas from public.confirmacoes_envios_ucondo(array[pedido])) is distinct from 1 then
    raise exception 'O contrato da versão anterior passou a somar dispensas como fotos';
  end if;
  begin
    perform public.retomar_transferencia_ucondo(pedido);
    raise exception 'Foi possível reenviar uma execução com todas as unidades cobertas';
  exception when invalid_parameter_value then
    if sqlerrm <> 'Este envio já foi concluído' then raise; end if;
  end;
end $test$;
reset role;
update public.unidades set servicos_sem_medidor=array['AGUA'];
set local role authenticated;
do $test$
begin
  if not exists (
    select 1 from public.confirmacoes_envios_ucondo_v2(array['00000000-0000-0000-0000-000000000032']::uuid[])
    where externas = 1 and dispensadas = 0
  ) then
    raise exception 'Cadastro sem dispensa de Gás não pôde impedir a baixa integral';
  end if;
end $test$;
reset role;
select 'PASS: Khiva, foto real e dispensa separadas, cadastro por serviço e retomada bloqueada' as verification;

-- Selenita: as unidades foram coletadas em novembro e lançadas na referência de dezembro.
alter table public.automacoes_fila add column periodo_coleta text;
insert into public.automacoes_fila
  (id,user_id,condominio_id,periodo,periodo_coleta,servico,status,total_unidades)
values
  ('00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007',
    '2026-11',null,'AGUA','erro',1),
  ('00000000-0000-0000-0000-000000000017','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007',
    '2026-12','2026-11','AGUA','em_andamento',1),
  ('00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007',
    '2026-11',null,'GAS','erro',1),
  ('00000000-0000-0000-0000-000000000019','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007',
    '2026-12','2026-11','GAS','em_andamento',1);
insert into public.automacoes_atividade
  (trabalho_id,user_id,mensagem)
select id,user_id,'Leituras conferidas: 1/1 unidades. Fotos confirmadas: 1/1 unidades. 0 marcadas sem foto. Fotos: foto da unidade APTO-101 confirmada no uCondo.'
from public.automacoes_fila where periodo_coleta='2026-11';
update public.automacoes_fila set status='concluida',sucessos=1,finalizado_em='2026-11-21',
  resultado_mensagem='Fluxo completo concluído ('||servico||'): 1 unidades com leituras conferidas (1 fotos confirmadas, 0 marcadas sem foto).'
where periodo_coleta='2026-11';
insert into public.solicitacoes_lote(id,user_id,status,destino_execucao,trabalhos_ids,total_trabalhos)
values ('00000000-0000-0000-0000-000000000023','00000000-0000-0000-0000-000000000006','erro','aws',
  '["00000000-0000-0000-0000-000000000016","00000000-0000-0000-0000-000000000018"]',2);
insert into public.transferencias_ucondo (id,user_id,condominio_id,periodo,servicos,status,solicitacao_id,trabalhos_ids,manifesto,created_at)
values
  ('00000000-0000-0000-0000-000000000033','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007',
    '2026-11',array['AGUA','GAS'],'despachada','00000000-0000-0000-0000-000000000023',
    array['00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000018']::uuid[],
    '[{"servico":"AGUA","unidade":"APTO-101"},{"servico":"GAS","unidade":"APTO-101"}]','2026-11-19'),
  ('00000000-0000-0000-0000-000000000034','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007',
    '2026-12',array['AGUA'],'erro',null,'{}',
    '[{"servico":"AGUA","unidade":"APTO-101"}]','2026-11-19');

\ir ../supabase/migrations/20261122222342_conciliar_mes_coleta_ucondo.sql

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',true);
set local role authenticated;
do $test$
declare novembro uuid := '00000000-0000-0000-0000-000000000033';
  dezembro uuid := '00000000-0000-0000-0000-000000000034';
begin
  if (select count(*) from public.confirmacoes_envios_ucondo_v2(array[novembro]) where total=1 and externas=1) <> 2 then
    raise exception 'A conclusão não foi associada ao mês da coleta';
  end if;
  if exists (select 1 from public.confirmacoes_envios_ucondo_v2(array[dezembro])) then
    raise exception 'A referência de dezembro foi confundida com outra coleta';
  end if;
  begin
    perform public.retomar_transferencia_ucondo(novembro);
    raise exception 'Retomar reenfileirou um envio já confirmado';
  exception when invalid_parameter_value then
    if sqlerrm <> 'Este envio já foi concluído' then raise; end if;
  end;
  begin
    perform public.continuar_transferencia_ucondo(novembro);
    raise exception 'Continuar reenfileirou um envio já confirmado';
  exception when invalid_parameter_value then
    if sqlerrm <> 'Este envio já foi concluído' then raise; end if;
  end;
end $test$;
reset role;
do $test$
begin
  if (select status from public.solicitacoes_lote where id='00000000-0000-0000-0000-000000000023') <> 'erro'
     or (select count(*) from public.automacoes_fila where user_id='00000000-0000-0000-0000-000000000006' and status='erro') <> 2 then
    raise exception 'As tentativas antigas foram alteradas';
  end if;
end $test$;
select 'PASS: Selenita, coleta em novembro, referência em dezembro, dois serviços, bloqueio antes da fila' as verification;

rollback;
