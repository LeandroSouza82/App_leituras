-- Durable mobile requests are separate from the executor's single active batch.
create table public.transferencias_ucondo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  condominio_nome text not null,
  periodo text not null check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  servicos text[] not null check (cardinality(servicos) between 1 and 2 and servicos <@ array['AGUA','GAS']::text[]),
  manifesto jsonb not null check (jsonb_typeof(manifesto)='array' and jsonb_array_length(manifesto)>0),
  total_leituras integer generated always as (jsonb_array_length(manifesto)) stored,
  assinatura text not null,
  status text not null default 'aguardando' check (status in ('aguardando','despachada','erro')),
  solicitacao_id uuid references public.solicitacoes_lote(id),
  trabalhos_ids uuid[] not null default '{}',
  mensagem text,
  created_at timestamptz not null default now(),
  unique(user_id,condominio_id,periodo,assinatura)
);
create index transferencias_ucondo_user_created on public.transferencias_ucondo(user_id,created_at desc);
create index transferencias_ucondo_pendentes on public.transferencias_ucondo(created_at) where status='aguardando';
alter table public.transferencias_ucondo enable row level security;
revoke all on public.transferencias_ucondo from public, anon, authenticated;
grant select on public.transferencias_ucondo to authenticated;
grant insert(user_id,condominio_id,condominio_nome,periodo,servicos,manifesto,assinatura) on public.transferencias_ucondo to authenticated;
grant all on public.transferencias_ucondo to service_role;
create policy transferencias_proprias_select on public.transferencias_ucondo for select to authenticated
  using ((select auth.uid())=user_id);
create policy transferencias_proprias_insert on public.transferencias_ucondo for insert to authenticated
  with check ((select auth.uid())=user_id and exists(select 1 from public.condominios c where c.id=condominio_id and c.user_id=(select auth.uid())));

-- This invoker helper never bypasses ownership/RLS. The dispatcher revalidates
-- the snapshot too: direct table inserts cannot make it execute arbitrary data.
create function public.manifesto_transferencia_ucondo(p_user_id uuid,p_condominio_id uuid,p_periodo text,p_servicos text[])
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
     or p_servicos is null or cardinality(p_servicos) not between 1 and 2
     or not p_servicos <@ array['AGUA','GAS']::text[]
     or cardinality(p_servicos)<>(select count(distinct s) from unnest(p_servicos) s) then
    raise exception using errcode='22023',message='Confira o mês e os serviços. O robô atual atende água e gás.';
  end if;
  select * into cond from public.condominios where id=p_condominio_id and user_id=p_user_id;
  if not found then raise exception using errcode='42501',message='Condomínio não disponível nesta conta.'; end if;
  inicio := (p_periodo||'-01')::timestamp at time zone 'America/Sao_Paulo';
  fim := ((p_periodo||'-01')::date+interval '1 month')::timestamp at time zone 'America/Sao_Paulo';
  select count(*) into total from public.unidades where condominio_id=cond.id;
  if total<1 or total>1000 then raise exception using errcode='22023',message='Confira o cadastro das unidades antes de enviar.'; end if;
  select jsonb_agg(jsonb_build_object('id',l.id,'unidade',u.nome,'servico',s.servico,
      'leitura_atual',l.leitura_atual,'foto_url',l.foto_url)
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
      or (d->>'leitura_atual')::numeric<0
      or coalesce(d->>'foto_url','') not like 'https://yotzutmarcpuckiqgnpf.supabase.co/storage/v1/object/public/fotos_leituras/%') then
    raise exception using errcode='22023',message='Ainda faltam leituras ou fotos no servidor. Conclua a sincronização antes de enviar.';
  end if;
  return dados;
end $fn$;
revoke all on function public.manifesto_transferencia_ucondo(uuid,uuid,text,text[]) from public,anon;
grant execute on function public.manifesto_transferencia_ucondo(uuid,uuid,text,text[]) to authenticated,service_role;

create function public.solicitar_transferencia_ucondo(p_condominio_id uuid,p_periodo text,p_servicos text[],p_leituras_ids uuid[])
returns public.transferencias_ucondo language plpgsql security invoker set search_path='' as $fn$
declare
  uid uuid := auth.uid();
  dados jsonb;
  assinatura_calculada text;
  resposta public.transferencias_ucondo%rowtype;
  servicos_ordenados text[];
  ids uuid[];
begin
  if uid is null then raise exception using errcode='42501',message='Entre novamente na sua conta.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
  select array_agg(s order by s) into servicos_ordenados from unnest(p_servicos) s;
  dados:=public.manifesto_transferencia_ucondo(uid,p_condominio_id,p_periodo,servicos_ordenados);
  select array_agg((d->>'id')::uuid order by d->>'id') into ids from jsonb_array_elements(dados) d;
  if p_leituras_ids is null or cardinality(p_leituras_ids)<>cardinality(ids)
     or not p_leituras_ids @> ids or not ids @> p_leituras_ids then
    raise exception using errcode='22023',message='Os dados do aplicativo diferem dos dados sincronizados. Atualize e confira antes de enviar.';
  end if;
  assinatura_calculada:=md5(dados::text);
  select * into resposta from public.transferencias_ucondo
    where user_id=uid and condominio_id=p_condominio_id and periodo=p_periodo and assinatura=assinatura_calculada;
  if found then return resposta; end if;
  insert into public.transferencias_ucondo(user_id,condominio_id,condominio_nome,periodo,servicos,manifesto,assinatura)
    select uid,c.id,c.nome,p_periodo,servicos_ordenados,dados,assinatura_calculada
    from public.condominios c where c.id=p_condominio_id and c.user_id=uid returning * into resposta;
  return resposta;
end $fn$;
revoke all on function public.solicitar_transferencia_ucondo(uuid,text,text[],uuid[]) from public,anon;
grant execute on function public.solicitar_transferencia_ucondo(uuid,text,text[],uuid[]) to authenticated;

-- Called only by the AWS worker before polling. Multiple mobile requests can
-- wait here without weakening the executor's existing one-active-batch index.
create function public.despachar_transferencias_ucondo()
returns integer language plpgsql security invoker set search_path='' as $fn$
declare
  pedido public.transferencias_ucondo%rowtype;
  cond public.condominios%rowtype;
  dados jsonb;
  ids uuid[];
  trabalho_id uuid;
  lote_id uuid;
  servico_atual text;
  quantidade integer;
  despachadas integer:=0;
begin
  if current_user not in ('service_role','postgres') then raise exception using errcode='42501',message='Operação exclusiva do servidor.'; end if;
  for pedido in select p.* from public.transferencias_ucondo p where p.status='aguardando'
    and not exists(select 1 from public.solicitacoes_lote s where s.user_id=p.user_id and s.status in ('pendente','em_andamento'))
    order by created_at,id limit 50 for update skip locked loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(pedido.user_id::text,0)) then continue; end if;
    if exists(select 1 from public.solicitacoes_lote where user_id=pedido.user_id and status in ('pendente','em_andamento')) then continue; end if;
    if exists(select 1 from public.automacoes_fila where user_id=pedido.user_id and condominio_id=pedido.condominio_id
      and periodo=pedido.periodo and servico=any(pedido.servicos) and status in ('aguardando','em_andamento')) then continue; end if;
    begin
      dados:=public.manifesto_transferencia_ucondo(pedido.user_id,pedido.condominio_id,pedido.periodo,pedido.servicos);
      if dados is distinct from pedido.manifesto or md5(dados::text)<>pedido.assinatura then
        raise exception 'As leituras ou fotos mudaram depois da solicitação. Confira e solicite um novo envio.';
      end if;
      select * into strict cond from public.condominios where id=pedido.condominio_id and user_id=pedido.user_id;
      ids:='{}';
      foreach servico_atual in array pedido.servicos loop
        select count(*) into quantidade from jsonb_array_elements(dados) d where d->>'servico'=servico_atual;
        insert into public.automacoes_fila(user_id,condominio_id,condominio_nome,servico,periodo,total_unidades)
          values(pedido.user_id,cond.id,cond.nome,servico_atual,pedido.periodo,quantidade) returning id into trabalho_id;
        ids:=array_append(ids,trabalho_id);
      end loop;
      insert into public.solicitacoes_lote(user_id,trabalhos_ids,total_trabalhos,destino_execucao,mensagem)
        values(pedido.user_id,to_jsonb(ids),cardinality(ids),'aws','Solicitação do aplicativo de leituras.') returning id into lote_id;
      update public.transferencias_ucondo set status='despachada',solicitacao_id=lote_id,trabalhos_ids=ids
        where id=pedido.id;
      despachadas:=despachadas+1;
    exception when unique_violation then
      -- A concurrently started desktop/dashboard batch keeps its ownership.
      continue;
    when others then
      update public.transferencias_ucondo set status='erro',mensagem='Não foi possível preparar o envio. Confira se as leituras e fotos continuam sincronizadas e solicite novamente.' where id=pedido.id;
    end;
  end loop;
  return despachadas;
end $fn$;
revoke all on function public.despachar_transferencias_ucondo() from public,anon,authenticated;
grant execute on function public.despachar_transferencias_ucondo() to service_role;
