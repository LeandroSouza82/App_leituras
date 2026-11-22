-- Evidências por unidade sobrevivem à limpeza do log de atividade.
create table automacao_interna.unidades_confirmadas_ucondo (
  trabalho_id uuid primary key references public.automacoes_fila(id) on delete cascade,
  unidades text[] not null
);
revoke all on table automacao_interna.unidades_confirmadas_ucondo
  from public, anon, authenticated, service_role;

create function automacao_interna.confirmacao_final_ucondo(t public.automacoes_fila)
returns boolean language sql immutable set search_path = '' as $fn$
  select coalesce(t.status = 'concluida' and t.total_unidades > 0
    and t.sucessos = t.total_unidades and t.pendencias = 0 and t.erros = 0
    and m[1] = t.servico and m[2]::int between 0 and t.total_unidades
    and m[3]::int + m[4]::int = t.total_unidades
    and t.total_unidades - m[2]::int = coalesce(cardinality(d), 0)
    and t.total_unidades - m[2]::int <= m[4]::int
    and coalesce(cardinality(d), 0) = (select count(distinct btrim(u)) from unnest(d) u where btrim(u) <> ''),
    false)
  from (select
    regexp_match(t.resultado_mensagem, '^Fluxo completo concluído \(([A-Z]+)\): ([0-9]{1,6}) unidades com leituras conferidas \(([0-9]{1,6}) fotos confirmadas, ([0-9]{1,6}) marcadas sem foto\)\.') m,
    string_to_array((regexp_match(t.resultado_mensagem, 'Unidades sem medidor fora da grade: (.+)\.$'))[1], ',') d
  ) partes;
$fn$;

create function automacao_interna.fotos_confirmadas_ucondo(t public.automacoes_fila)
returns text[] language sql stable set search_path = '' as $fn$
  select coalesce(array_agg(distinct m[3] order by m[3]), '{}'::text[])
  from public.automacoes_atividade a
  cross join lateral regexp_match(a.mensagem,
    '^Leituras conferidas: ([0-9]{1,6})/([0-9]{1,6}) unidades\. Fotos confirmadas: [0-9]+/[0-9]+ unidades\. [0-9]+ marcadas sem foto\. Fotos: foto da unidade (.+) confirmada no uCondo\.$') m
  where a.trabalho_id = t.id and a.user_id = t.user_id
    and m[1] = m[2] and m[2]::int = t.total_unidades;
$fn$;

insert into automacao_interna.unidades_confirmadas_ucondo (trabalho_id, unidades)
select t.id, f.unidades
from public.automacoes_fila t
cross join lateral (select automacao_interna.fotos_confirmadas_ucondo(t) unidades) f
where t.plataforma = 'ucondo' and automacao_interna.confirmacao_final_ucondo(t)
  and cardinality(f.unidades) > 0;

create function automacao_interna.registrar_unidades_confirmadas_ucondo()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare unidades text[];
begin
  if new.plataforma = 'ucondo' and automacao_interna.confirmacao_final_ucondo(new) then
    unidades := automacao_interna.fotos_confirmadas_ucondo(new);
    if cardinality(unidades) > 0 then
      insert into automacao_interna.unidades_confirmadas_ucondo as existente (trabalho_id, unidades)
        values (new.id, unidades)
        on conflict (trabalho_id) do update set unidades = array(
          select distinct u from unnest(existente.unidades || excluded.unidades) u order by u
        );
    end if;
  end if;
  return new;
end;
$fn$;
create trigger registrar_unidades_confirmadas_ucondo
  after insert or update of status, resultado_mensagem on public.automacoes_fila
  for each row when (new.status = 'concluida')
  execute function automacao_interna.registrar_unidades_confirmadas_ucondo();

create function automacao_interna.confirmacoes_transferencia_ucondo(p_transferencia_id uuid)
returns table(servico text, total integer, confirmadas integer, externas integer)
language sql stable set search_path = '' as $fn$
  with pedido as (
    select * from public.transferencias_ucondo
    where id = p_transferencia_id and user_id = auth.uid()
  ), escopo as (
    select distinct m->>'servico' servico, m->>'unidade' unidade
    from pedido p cross join lateral jsonb_array_elements(p.manifesto) m
    where m->>'servico' = any(p.servicos) and nullif(btrim(m->>'unidade'), '') is not null
  ), servicos as (
    select e.servico, count(*)::int total from escopo e group by e.servico
  ), trabalhos as (
    select t.*, t.id = any(p.trabalhos_ids) vinculado
    from pedido p join public.automacoes_fila t
      on t.user_id = p.user_id and t.condominio_id = p.condominio_id and t.periodo = p.periodo
    where t.servico = any(p.servicos) and t.plataforma = 'ucondo'
      and (t.id = any(p.trabalhos_ids) or t.finalizado_em >= p.created_at)
      and automacao_interna.confirmacao_final_ucondo(t)
  ), cobertura as (
    select e.servico, count(*)::int quantidade
    from escopo e
    where exists (
      select 1 from trabalhos t
      join automacao_interna.unidades_confirmadas_ucondo v on v.trabalho_id = t.id
      where not t.vinculado and t.servico = e.servico and e.unidade = any(v.unidades)
    )
    group by e.servico
  )
  select s.servico, s.total,
    case when exists(select 1 from trabalhos t where t.vinculado and t.servico = s.servico and t.total_unidades = s.total)
      then s.total else coalesce(c.quantidade, 0) end,
    coalesce(c.quantidade, 0)
  from servicos s left join cobertura c on c.servico = s.servico;
$fn$;

revoke all on function automacao_interna.confirmacao_final_ucondo(public.automacoes_fila),
  automacao_interna.fotos_confirmadas_ucondo(public.automacoes_fila),
  automacao_interna.registrar_unidades_confirmadas_ucondo(),
  automacao_interna.confirmacoes_transferencia_ucondo(uuid)
  from public, anon, authenticated, service_role;

create function public.confirmacoes_envios_ucondo(p_transferencia_ids uuid[])
returns table(transferencia_id uuid, servico text, total integer, externas integer)
language sql stable security definer set search_path = '' as $fn$
  select p.id, c.servico, c.total, c.externas
  from public.transferencias_ucondo p
  cross join lateral automacao_interna.confirmacoes_transferencia_ucondo(p.id) c
  where p.user_id = auth.uid() and p.id = any(p_transferencia_ids) and c.externas > 0;
$fn$;
revoke all on function public.confirmacoes_envios_ucondo(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.confirmacoes_envios_ucondo(uuid[]) to authenticated;

create or replace function public.retomar_transferencia_ucondo(p_transferencia_id uuid)
returns public.transferencias_ucondo language plpgsql security definer set search_path = '' as $fn$
declare
  uid uuid := auth.uid();
  pedido public.transferencias_ucondo%rowtype;
  lote public.solicitacoes_lote%rowtype;
  pendentes uuid[];
  tem_trabalho_falho boolean;
  confirmado boolean;
  tem_evidencia_externa boolean;
begin
  if uid is null then
    raise exception using errcode='42501', message='Entre novamente na sua conta.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select * into pedido from public.transferencias_ucondo
    where id = p_transferencia_id and user_id = uid for update;
  if not found then
    raise exception using errcode='42501', message='Envio não disponível nesta conta.';
  end if;

  select * into lote from public.solicitacoes_lote
    where id = pedido.solicitacao_id and user_id = uid for update;
  perform id from public.automacoes_fila
    where user_id = uid and id = any(pedido.trabalhos_ids) order by id for update;

  select count(*) = cardinality(pedido.servicos) and count(*) > 0 and bool_and(c.confirmadas = c.total),
    coalesce(bool_or(c.externas > 0), false)
    into confirmado, tem_evidencia_externa
  from automacao_interna.confirmacoes_transferencia_ucondo(pedido.id) c;

  if confirmado then
    raise exception using errcode='22023', message='Este envio já foi concluído';
  end if;
  if exists (select 1 from public.solicitacoes_lote
    where user_id = uid and status in ('pendente','em_andamento'))
    or exists (select 1 from public.automacoes_fila where user_id = uid and status = 'em_andamento') then
    raise exception using errcode='22023', message='Já existe outro envio em andamento. Aguarde ele terminar para retomar.';
  end if;
  if pedido.status = 'erro' and cardinality(pedido.trabalhos_ids) = 0 then
    if tem_evidencia_externa then
      raise exception using errcode='22023', message='Parte deste envio já foi confirmada. Confira as unidades restantes no AutoFast.';
    end if;
    update public.transferencias_ucondo set status='aguardando', mensagem=null
      where id=pedido.id returning * into pedido;
    return pedido;
  end if;

  if lote.id is null or lote.status not in ('erro','cancelado','concluido') then
    raise exception using errcode='22023', message='Este envio não está em estado de erro para retomada.';
  end if;

  with candidatos as (
    select t.id, t.servico, t.status
    from public.automacoes_fila t
    where t.user_id = uid and t.condominio_id = pedido.condominio_id and t.periodo = pedido.periodo
      and t.servico = any(pedido.servicos) and t.plataforma = 'ucondo'
      and t.id = any(pedido.trabalhos_ids)
      and (t.status in ('erro','cancelada','concluida_com_pendencias')
        or (t.status = 'aguardando' and lote.status in ('erro','cancelado')))
  )
  select coalesce(array_agg(t.id order by t.id) filter (where coalesce(c.externas, 0) = 0), '{}'::uuid[]),
    coalesce(bool_or(t.status in ('erro','cancelada','concluida_com_pendencias')), false)
    into pendentes, tem_trabalho_falho
  from candidatos t left join automacao_interna.confirmacoes_transferencia_ucondo(pedido.id) c on c.servico = t.servico;

  if cardinality(pendentes) = 0 and tem_evidencia_externa then
    raise exception using errcode='22023', message='Parte deste envio já foi confirmada. Confira as unidades restantes no AutoFast.';
  end if;
  if cardinality(pendentes) = 0 or (not tem_trabalho_falho and lote.status = 'concluido') then
    raise exception using errcode='22023', message='Este envio não está em estado de erro para retomada.';
  end if;

  update public.automacoes_fila set status='aguardando', erro_mensagem=null
    where user_id=uid and id=any(pendentes) and status in ('erro','cancelada','concluida_com_pendencias');
  update public.solicitacoes_lote set status='pendente', trabalhos_ids=to_jsonb(pendentes),
    total_trabalhos=cardinality(pendentes), finalizado_em=null, iniciado_em=null,
    worker_id=null, heartbeat_at=null, updated_at=now()
    where id=lote.id and user_id=uid;
  return pedido;
exception when unique_violation then
  raise exception using errcode='22023', message='Já existe outro envio em andamento. Aguarde ele terminar para retomar.';
end;
$fn$;
create or replace function public.trabalhos_continuaveis_ucondo(p_transferencia_id uuid)
returns uuid[] language sql stable set search_path = '' as $fn$
  select coalesce(array_agg(t.id order by item.ordem), '{}'::uuid[])
  from public.transferencias_ucondo p
  join public.solicitacoes_lote l on l.id = p.solicitacao_id and l.user_id = p.user_id
  cross join lateral unnest(p.trabalhos_ids) with ordinality as item(id, ordem)
  join public.automacoes_fila t on t.id = item.id and t.user_id = p.user_id
  where p.id = p_transferencia_id and p.user_id = auth.uid() and p.status = 'despachada'
    and l.destino_execucao = 'aws' and l.status in ('erro', 'cancelado', 'concluido')
    and t.status = 'aguardando' and l.trabalhos_ids ? t.id::text
    and not exists (
      select 1 from automacao_interna.confirmacoes_transferencia_ucondo(p.id) c
      where c.servico = t.servico and c.externas > 0
    )
    and cardinality(p.trabalhos_ids) = (
      select count(*) from public.automacoes_fila original
      where original.user_id = p.user_id and original.id = any(p.trabalhos_ids)
        and original.status in ('aguardando', 'concluida')
    )
    and not exists (
      select 1 from public.automacoes_fila pendente
      where pendente.user_id = p.user_id and pendente.id = any(p.trabalhos_ids)
        and pendente.status = 'aguardando' and not (l.trabalhos_ids ? pendente.id::text)
    )
    and not exists (
      select 1 from public.solicitacoes_lote ativo
      where ativo.user_id = p.user_id and ativo.status in ('pendente', 'em_andamento')
    )
    and not exists (
      select 1 from public.automacoes_fila ativo
      where ativo.user_id = p.user_id and ativo.status = 'em_andamento'
    );
$fn$;
