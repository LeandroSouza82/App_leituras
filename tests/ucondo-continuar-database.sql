-- Run only against an empty, isolated Postgres database.
-- Existing Supabase installations already have the auth schema, so this stops
-- before fixtures or a migration can be run against their data.
\set ON_ERROR_STOP on
begin;
create schema auth;
create role anon;
create role authenticated;
create role service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create table public.automacoes_fila (
  id uuid primary key, user_id uuid not null, status text not null, servico text not null,
  sucessos integer not null, resultado_mensagem text, checkpoint jsonb
);
create table public.solicitacoes_lote (
  id uuid primary key, user_id uuid not null, status text not null,
  destino_execucao text not null, trabalhos_ids jsonb not null, total_trabalhos integer not null,
  worker_id text, iniciado_em timestamptz, finalizado_em timestamptz, heartbeat_at timestamptz,
  mensagem text, updated_at timestamptz not null default now()
);
create unique index idx_solicitacoes_lote_usuario_ativa
  on public.solicitacoes_lote (user_id) where status in ('pendente', 'em_andamento');
create table public.transferencias_ucondo (
  id uuid primary key, user_id uuid not null, status text not null,
  solicitacao_id uuid references public.solicitacoes_lote(id),
  trabalhos_ids uuid[] not null, manifesto jsonb not null
);
\ir ../supabase/migrations/20261122114424_continuar_envio_ucondo.sql

select set_config('app.test.owner', '10000000-0000-4000-8000-000000000001', true);
select set_config('app.test.other', '10000000-0000-4000-8000-000000000002', true);
select set_config('app.test.pedido', '20000000-0000-4000-8000-000000000001', true);
select set_config('app.test.lote', '30000000-0000-4000-8000-000000000001', true);
select set_config('app.test.lote_concorrente', '30000000-0000-4000-8000-000000000002', true);
select set_config('app.test.agua', '40000000-0000-4000-8000-000000000001', true);
select set_config('app.test.energia', '40000000-0000-4000-8000-000000000002', true);

do $test$
declare
  dono uuid := current_setting('app.test.owner')::uuid;
  agua uuid := current_setting('app.test.agua')::uuid;
  energia uuid := current_setting('app.test.energia')::uuid;
  lote uuid := current_setting('app.test.lote')::uuid;
begin
  insert into public.automacoes_fila values
    (agua, dono, 'concluida', 'AGUA', 14, '14 leituras e 14 fotos', '{"agua":"confirmada"}'),
    (energia, dono, 'aguardando', 'ENERGIA', 0, 'Preservado na fila', '{"energia":"existente"}');
  insert into public.solicitacoes_lote (id,user_id,status,destino_execucao,trabalhos_ids,total_trabalhos)
    values (lote,dono,'pendente','aws',to_jsonb(array[agua,energia]),2);
  insert into public.transferencias_ucondo values (
    current_setting('app.test.pedido')::uuid,dono,'despachada',lote,array[agua,energia],
    '[{"leitura":14,"foto":"foto-agua"},{"leitura":21,"foto":"foto-energia"}]'
  );
end $test$;
create temp table trabalhos_antes as table public.automacoes_fila;
create temp table pedido_antes as table public.transferencias_ucondo;

select set_config('request.jwt.claim.sub', current_setting('app.test.owner'), true);
set local role authenticated;
do $test$
declare pedido uuid := current_setting('app.test.pedido')::uuid;
begin
  if public.envios_ucondo_continuaveis(array[pedido]) is distinct from '{}'::uuid[] then
    raise exception 'Uma espera normal recebeu o botão';
  end if;
  if public.continuar_transferencia_ucondo(pedido) is distinct from 'ja_na_fila' then
    raise exception 'Uma espera normal foi alterada';
  end if;
end $test$;
reset role;

update public.solicitacoes_lote set status='erro', worker_id='worker-anterior',
  iniciado_em=now(), finalizado_em=now(), heartbeat_at=now()
  where id=current_setting('app.test.lote')::uuid;
insert into public.solicitacoes_lote (id,user_id,status,destino_execucao,trabalhos_ids,total_trabalhos)
  values (current_setting('app.test.lote_concorrente')::uuid, current_setting('app.test.owner')::uuid,
          'em_andamento','pc','[]',0);
set local role authenticated;
do $test$
declare pedido uuid := current_setting('app.test.pedido')::uuid;
begin
  if public.envios_ucondo_continuaveis(array[pedido]) is distinct from '{}'::uuid[] then
    raise exception 'Um lote concorrente recebeu o botão';
  end if;
  begin
    perform public.continuar_transferencia_ucondo(pedido);
    raise exception 'Um lote concorrente não foi bloqueado';
  exception when invalid_parameter_value then null;
  end;
end $test$;
reset role;
update public.solicitacoes_lote set status='concluido' where id=current_setting('app.test.lote_concorrente')::uuid;

select set_config('request.jwt.claim.sub', current_setting('app.test.other'), true);
set local role authenticated;
do $test$
declare pedido uuid := current_setting('app.test.pedido')::uuid;
begin
  if public.envios_ucondo_continuaveis(array[pedido]) is distinct from '{}'::uuid[] then
    raise exception 'Visibilidade indevida entre contas';
  end if;
  begin
    perform public.continuar_transferencia_ucondo(pedido);
    raise exception 'Outra conta conseguiu reabrir o envio';
  exception when insufficient_privilege then null;
  end;
end $test$;
reset role;

select set_config('request.jwt.claim.sub', current_setting('app.test.owner'), true);
set local role authenticated;
do $test$
declare pedido uuid := current_setting('app.test.pedido')::uuid;
begin
  if public.envios_ucondo_continuaveis(array[pedido]) is distinct from array[pedido] then
    raise exception 'Trabalho aguardando em lote encerrado ficou sem o botão';
  end if;
  if public.continuar_transferencia_ucondo(pedido) is distinct from 'recolocado' then
    raise exception 'Primeiro toque não recolocou o envio';
  end if;
  if public.continuar_transferencia_ucondo(pedido) is distinct from 'ja_na_fila' then
    raise exception 'Segundo toque não foi idempotente';
  end if;
  if public.envios_ucondo_continuaveis(array[pedido]) is distinct from '{}'::uuid[] then
    raise exception 'O botão permaneceu visível após recolocar o envio';
  end if;
end $test$;
reset role;
do $test$
declare
  lote public.solicitacoes_lote%rowtype;
  energia uuid := current_setting('app.test.energia')::uuid;
begin
  select * into strict lote from public.solicitacoes_lote
    where id=current_setting('app.test.lote')::uuid;
  if lote.status <> 'pendente' or lote.destino_execucao <> 'aws' or lote.total_trabalhos <> 1
    or lote.trabalhos_ids <> to_jsonb(array[energia]) or lote.worker_id is not null
    or lote.iniciado_em is not null or lote.finalizado_em is not null or lote.heartbeat_at is not null then
    raise exception 'O lote original não contém somente o trabalho original de Energia';
  end if;
  if (select count(*) from public.solicitacoes_lote) <> 2
    or (select jsonb_agg(to_jsonb(t) order by t.id) from public.automacoes_fila t)
        is distinct from (select jsonb_agg(to_jsonb(t) order by t.id) from trabalhos_antes t)
    or (select jsonb_agg(to_jsonb(p) order by p.id) from public.transferencias_ucondo p)
        is distinct from (select jsonb_agg(to_jsonb(p) order by p.id) from pedido_antes p) then
    raise exception 'Houve duplicação ou alteração de trabalho, manifesto ou checkpoint';
  end if;
  if has_function_privilege('anon', 'public.continuar_transferencia_ucondo(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.trabalhos_continuaveis_ucondo(uuid)', 'EXECUTE') then
    raise exception 'Permissão de execução maior que a prevista';
  end if;
end $test$;
select 'PASS: espera normal, lote ativo concorrente, isolamento por conta, lote encerrado, duplo clique e preservação da Água' as verification;
rollback;
