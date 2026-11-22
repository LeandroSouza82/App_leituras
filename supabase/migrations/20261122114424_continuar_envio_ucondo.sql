-- Reaproveita um lote AWS encerrado quando seus únicos trabalhos restantes
-- ainda aguardam o robô. A transferência mantém o vínculo com todos os serviços.
create function public.trabalhos_continuaveis_ucondo(p_transferencia_id uuid)
returns uuid[] language sql stable set search_path = '' as $fn$
  select coalesce(array_agg(t.id order by item.ordem), '{}'::uuid[])
  from public.transferencias_ucondo p
  join public.solicitacoes_lote l on l.id = p.solicitacao_id and l.user_id = p.user_id
  cross join lateral unnest(p.trabalhos_ids) with ordinality as item(id, ordem)
  join public.automacoes_fila t on t.id = item.id and t.user_id = p.user_id
  where p.id = p_transferencia_id and p.user_id = auth.uid() and p.status = 'despachada'
    and l.destino_execucao = 'aws' and l.status in ('erro', 'cancelado', 'concluido')
    and t.status = 'aguardando' and l.trabalhos_ids ? t.id::text
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

revoke all on function public.trabalhos_continuaveis_ucondo(uuid)
  from public, anon, authenticated, service_role;

create function public.envios_ucondo_continuaveis(p_transferencia_ids uuid[])
returns uuid[] language sql stable security definer set search_path = '' as $fn$
  select coalesce(array_agg(p.id), '{}'::uuid[])
  from public.transferencias_ucondo p
  where p.user_id = auth.uid() and p.id = any(p_transferencia_ids)
    and cardinality(public.trabalhos_continuaveis_ucondo(p.id)) > 0;
$fn$;

revoke all on function public.envios_ucondo_continuaveis(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.envios_ucondo_continuaveis(uuid[]) to authenticated;

create function public.continuar_transferencia_ucondo(p_transferencia_id uuid)
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

revoke all on function public.continuar_transferencia_ucondo(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.continuar_transferencia_ucondo(uuid) to authenticated;
