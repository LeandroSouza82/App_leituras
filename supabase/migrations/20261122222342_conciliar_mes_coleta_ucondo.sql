-- Para o aplicativo, o escopo mensal é a coleta. A referência é usada quando não há coleta explícita.
create or replace function automacao_interna.provas_transferencia_ucondo(p_transferencia_id uuid)
returns table(servico text, total integer, fotos integer, dispensadas integer, propria boolean)
language sql stable set search_path = '' as $fn$
  with pedido as (
    select * from public.transferencias_ucondo where id = p_transferencia_id and user_id = auth.uid()
  ), escopo as (
    select distinct m->>'servico' servico, m->>'unidade' unidade
    from pedido p cross join lateral jsonb_array_elements(p.manifesto) m
    where m->>'servico' = any(p.servicos) and nullif(btrim(m->>'unidade'), '') is not null
  ), trabalhos as (
    select t.id, t.servico, t.total_unidades, t.id = any(p.trabalhos_ids) vinculado,
      automacao_interna.unidades_fora_grade_ucondo(t) fora_grade
    from pedido p join public.automacoes_fila t
      on t.user_id = p.user_id and t.condominio_id = p.condominio_id and coalesce(t.periodo_coleta, t.periodo) = p.periodo
    where t.servico = any(p.servicos) and t.plataforma = 'ucondo'
      and (t.id = any(p.trabalhos_ids) or t.finalizado_em >= p.created_at)
      and automacao_interna.confirmacao_final_ucondo(t)
  ), por_unidade as (
    select e.servico,
      exists (
        select 1 from trabalhos t
        join automacao_interna.unidades_confirmadas_ucondo v on v.trabalho_id = t.id
        where not t.vinculado and t.servico = e.servico and e.unidade = any(v.unidades)
      ) tem_foto,
      exists (
        select 1 from trabalhos t cross join pedido p
        join public.unidades u on u.condominio_id = p.condominio_id
        where not t.vinculado and t.servico = e.servico and e.unidade = any(t.fora_grade)
          and u.nome = e.unidade and e.servico = any(u.servicos_sem_medidor)
      ) sem_medidor
    from escopo e
  ), cobertura as (
    select e.servico, count(*)::int total,
      count(*) filter (where e.tem_foto)::int fotos,
      count(*) filter (where not e.tem_foto and e.sem_medidor)::int dispensadas
    from por_unidade e group by e.servico
  )
  select c.servico, c.total, c.fotos, c.dispensadas,
    exists(select 1 from trabalhos t where t.vinculado and t.servico = c.servico and t.total_unidades = c.total)
  from cobertura c;
$fn$;

create or replace function public.continuar_transferencia_ucondo(p_transferencia_id uuid)
returns text language plpgsql security definer set search_path = '' as $fn$
declare
  uid uuid := auth.uid();
  pedido public.transferencias_ucondo%rowtype;
  lote public.solicitacoes_lote%rowtype;
  pendentes uuid[];
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'Entre novamente na sua conta.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select * into pedido from public.transferencias_ucondo
    where id = p_transferencia_id and user_id = uid for update;
  if not found then
    raise exception using errcode = '42501', message = 'Envio não disponível nesta conta.';
  end if;

  select * into lote from public.solicitacoes_lote
    where id = pedido.solicitacao_id and user_id = uid for update;
  if (select count(*) = cardinality(pedido.servicos) and count(*) > 0
    and bool_and(c.confirmadas = c.total)
    from automacao_interna.confirmacoes_transferencia_ucondo(pedido.id) c) then
    raise exception using errcode = '22023', message = 'Este envio já foi concluído';
  end if;

  if pedido.status = 'despachada' and lote.destino_execucao = 'aws'
    and lote.status in ('pendente', 'em_andamento') then
    return 'ja_na_fila';
  end if;

  if exists (
    select 1 from public.solicitacoes_lote
      where user_id = uid and status in ('pendente', 'em_andamento')
  ) or exists (
    select 1 from public.automacoes_fila where user_id = uid and status = 'em_andamento'
  ) then
    raise exception using errcode = '22023', message = 'Aguarde o outro envio terminar.';
  end if;

  -- Trava os trabalhos vinculados antes de recalcular o escopo da retomada.
  perform id from public.automacoes_fila
    where user_id = uid and id = any(pedido.trabalhos_ids)
    order by id for update;
  pendentes := public.trabalhos_continuaveis_ucondo(pedido.id);
  if cardinality(pendentes) = 0 then
    raise exception using errcode = '22023', message = 'O envio foi atualizado e não pode ser continuado agora.';
  end if;

  -- O índice de lote ativo por conta também protege contra uma inserção concorrente.
  begin
    update public.solicitacoes_lote
      set status = 'pendente', trabalhos_ids = to_jsonb(pendentes),
          total_trabalhos = cardinality(pendentes), worker_id = null,
          iniciado_em = null, finalizado_em = null, heartbeat_at = null,
          mensagem = 'Envio recolocado na fila do robô.', updated_at = now()
      where id = lote.id and user_id = uid;
  exception when unique_violation then
    raise exception using errcode = '22023', message = 'Aguarde o outro envio terminar.';
  end;
  return 'recolocado';
end;
$fn$;
