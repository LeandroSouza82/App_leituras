-- Confirma apenas manifestos com mesmas unidades, IDs, valores, conta, mes e servico.
create or replace function automacao_interna.provas_transferencia_ucondo(p_transferencia_id uuid)
returns table(servico text, total integer, fotos integer, dispensadas integer, propria boolean)
language sql stable set search_path = '' as $fn$
  with pedido as (
    select * from public.transferencias_ucondo where id = p_transferencia_id and user_id = auth.uid()
  ), escopo as (
    select distinct m->>'servico' servico, m->>'unidade' unidade, m->>'id' leitura_id, m->'leitura_atual' leitura_atual
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
  ), manifestos_concluidos as (
    select t.servico, m->>'unidade' unidade, m->>'id' leitura_id, m->'leitura_atual' leitura_atual,
      coalesce(m->>'sem_medidor','false') = 'true' sem_medidor
    from pedido p join trabalhos t on not t.vinculado
    join public.transferencias_ucondo q on q.user_id=p.user_id and q.condominio_id=p.condominio_id
      and q.periodo=p.periodo and q.id<>p.id and q.created_at>=p.created_at
      and t.id=any(q.trabalhos_ids) and q.status='despachada'
    cross join lateral regexp_match(
      (select resultado_mensagem from public.automacoes_fila where id=t.id),
      '^Fluxo completo concluído \(([A-Z]+)\): ([0-9]+) unidades com leituras conferidas \(([0-9]+) fotos confirmadas, ([0-9]+) marcadas sem foto\)\.'
    ) final
    cross join lateral (
      select count(*) total, count(distinct x->>'unidade') unicas,
        count(*) filter (where coalesce(x->>'sem_medidor','false') <> 'true' and nullif(x->>'foto_url','') is not null) fotos,
        count(*) filter (where x->>'sem_medidor'='true' and x->'leitura_atual'='0'::jsonb
          and exists(select 1 from public.unidades u where u.condominio_id=p.condominio_id
            and u.nome=x->>'unidade' and t.servico=any(u.servicos_sem_medidor))) dispensadas
      from jsonb_array_elements(q.manifesto) x where x->>'servico'=t.servico
    ) contagens
    cross join lateral jsonb_array_elements(q.manifesto) m
    where m->>'servico'=t.servico and final[1]=t.servico
      and contagens.total=t.total_unidades and contagens.unicas=t.total_unidades
      and contagens.fotos=final[3]::int and contagens.dispensadas=final[4]::int
  ), por_unidade as (
    select e.servico,
      exists (
        select 1 from trabalhos t
        join automacao_interna.unidades_confirmadas_ucondo v on v.trabalho_id = t.id
        where not t.vinculado and t.servico = e.servico and e.unidade = any(v.unidades)
      ) or exists (
        select 1 from manifestos_concluidos m where m.servico=e.servico and m.unidade=e.unidade
          and m.leitura_id=e.leitura_id and m.leitura_atual=e.leitura_atual and not m.sem_medidor
      ) tem_foto,
      exists (
        select 1 from trabalhos t cross join pedido p
        join public.unidades u on u.condominio_id = p.condominio_id
        where not t.vinculado and t.servico = e.servico and e.unidade = any(t.fora_grade)
          and u.nome = e.unidade and e.servico = any(u.servicos_sem_medidor)
      ) or exists (
        select 1 from manifestos_concluidos m where m.servico=e.servico and m.unidade=e.unidade
          and m.leitura_id=e.leitura_id and m.leitura_atual=e.leitura_atual and m.sem_medidor
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

  if exists(select 1 from public.automacoes_fila t
    where t.user_id=uid and t.id=any(pedido.trabalhos_ids)
      and coalesce(t.resultado_mensagem,'') ~* 'checkpoint.*(divergente|reconcilia)') then
    raise exception using errcode='22023', message='Este envio exige conferência do cadastro no AutoFast antes de retomar.';
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
