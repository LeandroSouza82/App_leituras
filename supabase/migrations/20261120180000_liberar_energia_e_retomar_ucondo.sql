-- Libera ENERGIA na fila de transferências do uCondo e cria RPC transacional
-- para retomar envios com falha preservando checkpoints e sem duplicar trabalhos.

alter table public.transferencias_ucondo
  drop constraint if exists transferencias_ucondo_servicos_check;

alter table public.transferencias_ucondo
  add constraint transferencias_ucondo_servicos_check
  check (cardinality(servicos) between 1 and 3 and servicos <@ array['AGUA','GAS','ENERGIA']::text[]);

create or replace function public.manifesto_transferencia_ucondo(
  p_user_id uuid,
  p_condominio_id uuid,
  p_periodo text,
  p_servicos text[]
)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare
  cond public.condominios%rowtype;
  inicio timestamptz;
  fim timestamptz;
  dados jsonb;
  total integer;
begin
  if p_user_id is null or (current_user not in ('service_role','postgres') and p_user_id is distinct from auth.uid()) then
    raise exception using errcode='42501',message='Entre novamente na sua conta.';
  end if;
  if p_periodo is null or p_periodo !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     or p_servicos is null or cardinality(p_servicos) not between 1 and 3
     or not p_servicos <@ array['AGUA','GAS','ENERGIA']::text[]
     or cardinality(p_servicos)<>(select count(distinct s) from unnest(p_servicos) s) then
    raise exception using errcode='22023',message='Confira o mês e os serviços.';
  end if;
  select * into cond from public.condominios where id=p_condominio_id and user_id=p_user_id;
  if not found then raise exception using errcode='42501',message='Condomínio não disponível nesta conta.'; end if;
  inicio := (p_periodo||'-01')::timestamp at time zone 'America/Sao_Paulo';
  fim := ((p_periodo||'-01')::date+interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  select count(*) into total from public.unidades where condominio_id=cond.id;
  if total<1 or total>1000 then raise exception using errcode='22023',message='Confira o cadastro das unidades antes de enviar.'; end if;
  select jsonb_agg(jsonb_build_object('id',l.id,'unidade',u.nome,'servico',s.servico,
      'leitura_atual',l.leitura_atual,'foto_url',l.foto_url)
      || case when s.servico=any(u.servicos_sem_medidor) then jsonb_build_object('sem_medidor',true) else '{}'::jsonb end
      order by s.servico,u.nome)
  into dados
  from public.unidades u cross join unnest(p_servicos) s(servico)
  left join lateral (
    select d.* from public.leituras_detalhes d
    where d.leiturista_id=p_user_id and d.condominio_nome=cond.nome
      and d.unidade_id=u.nome and d.servico=s.servico
      and d.data_leitura>=inicio and d.data_leitura<fim
    order by d.data_leitura desc,d.created_at desc,d.id desc limit 1
  ) l on true
  where u.condominio_id=cond.id;
  if exists(select 1 from jsonb_array_elements(dados) d where d->>'id' is null
      or d->>'leitura_atual' is null or (d->>'leitura_atual')::numeric<0
      or (coalesce((d->>'sem_medidor')::boolean,false) and (d->>'leitura_atual')::numeric<>0)
      or (not coalesce((d->>'sem_medidor')::boolean,false) and coalesce(d->>'foto_url','') not like 'https://yotzutmarcpuckiqgnpf.supabase.co/storage/v1/object/public/fotos_leituras/%')) then
    raise exception using errcode='22023',message='Ainda faltam leituras ou fotos no servidor. Conclua a sincronização antes de enviar.';
  end if;
  return dados;
end $fn$;
revoke all on function public.manifesto_transferencia_ucondo(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.manifesto_transferencia_ucondo(uuid,uuid,text,text[]) to authenticated,service_role;

create or replace function public.retomar_transferencia_ucondo(p_transferencia_id uuid)
returns public.transferencias_ucondo language plpgsql security definer set search_path='' as $fn$
declare
  uid uuid := auth.uid();
  pedido public.transferencias_ucondo%rowtype;
  lote_falho boolean := false;
  tem_trabalho_falho boolean := false;
begin
  if uid is null then
    raise exception using errcode='42501',message='Entre novamente na sua conta.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));

  select * into pedido from public.transferencias_ucondo
    where id=p_transferencia_id and user_id=uid for update;
  if not found then
    raise exception using errcode='42501',message='Envio não disponível nesta conta.';
  end if;

  if exists(select 1 from public.solicitacoes_lote
    where user_id=uid and status in ('pendente','em_andamento')) then
    raise exception using errcode='22023',message='Já existe outro envio em andamento. Aguarde ele terminar para retomar.';
  end if;

  -- Caso 1: falhou antes de despachar trabalhos na fila
  if pedido.status='erro' and cardinality(pedido.trabalhos_ids)=0 then
    update public.transferencias_ucondo
      set status='aguardando', mensagem=null
      where id=pedido.id
      returning * into pedido;
    return pedido;
  end if;

  -- Caso 2: trabalhos já criados — recoloca apenas os trabalhos com falha em 'aguardando'
  -- preservando checkpoints, unidades_processadas e trabalhos já concluídos.
  select exists(
    select 1 from public.automacoes_fila
    where user_id=uid and id=any(pedido.trabalhos_ids)
      and status in ('erro','cancelada','concluida_com_pendencias')
  ) into tem_trabalho_falho;

  select exists(
    select 1 from public.solicitacoes_lote
    where user_id=uid and id=pedido.solicitacao_id
      and status in ('erro','cancelado')
  ) into lote_falho;

  if not tem_trabalho_falho and not lote_falho then
    raise exception using errcode='22023',message='Este envio não está em estado de erro para retomada.';
  end if;

  if tem_trabalho_falho then
    update public.automacoes_fila
      set status='aguardando', erro_mensagem=null
      where user_id=uid and id=any(pedido.trabalhos_ids)
        and status in ('erro','cancelada','concluida_com_pendencias');
  end if;

  if lote_falho then
    update public.solicitacoes_lote
      set status='pendente', finalizado_em=null
      where user_id=uid and id=pedido.solicitacao_id
        and status in ('erro','cancelado');
  end if;

  return pedido;
end $fn$;
revoke all on function public.retomar_transferencia_ucondo(uuid) from public,anon;
grant execute on function public.retomar_transferencia_ucondo(uuid) to authenticated;

