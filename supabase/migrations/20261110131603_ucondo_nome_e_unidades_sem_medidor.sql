-- Apply schema first; deploy the worker before enabling any exemption.
-- Normal units retain the previous transfer manifesto and signature.
alter table public.unidades add column servicos_sem_medidor text[] not null default '{}'::text[]
  check (servicos_sem_medidor <@ array['AGUA','GAS','ENERGIA']::text[]
    and array_position(servicos_sem_medidor,null) is null);

create function public.configurar_unidade_sem_medidor(
  p_condominio_id uuid,p_unidade text,p_servico text,p_sem_medidor boolean)
returns text[] language plpgsql security invoker set search_path='' as $fn$
declare
  cond public.condominios%rowtype;
  uni public.unidades%rowtype;
  quantidade integer;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Entre novamente na sua conta.'; end if;
  if p_servico is null or p_servico not in ('AGUA','GAS','ENERGIA') or p_sem_medidor is null then
    raise exception using errcode='22023',message='Confira o serviço da unidade.';
  end if;
  -- Same account lock as the transfer dispatcher; never alter an active batch.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
  select * into cond from public.condominios where id=p_condominio_id and user_id=auth.uid();
  if not found then raise exception using errcode='42501',message='Condomínio não disponível nesta conta.'; end if;
  if exists(select 1 from public.automacoes_fila where condominio_id=cond.id and status='em_andamento') then
    raise exception using errcode='22023',message='Aguarde o envio em andamento antes de alterar o medidor.';
  end if;
  select count(*) into quantidade from public.unidades where condominio_id=cond.id and nome=p_unidade;
  if quantidade<>1 then raise exception using errcode='22023',message='Unidade ausente ou duplicada no cadastro.'; end if;
  select * into uni from public.unidades where condominio_id=cond.id and nome=p_unidade for update;
  if p_sem_medidor and exists(select 1 from public.leituras_detalhes d
    where d.leiturista_id=cond.user_id and d.condominio_nome=cond.nome
      and d.unidade_id in (uni.nome,uni.numero,uni.identificador,uni.id::text)
      and d.servico=p_servico and d.leitura_atual<>0) then
    raise exception using errcode='22023',message='Esta unidade possui leitura diferente de zero. Confira o medidor antes de dispensar a foto.';
  end if;
  update public.unidades set servicos_sem_medidor=case
    when p_sem_medidor then array(select distinct s from unnest(servicos_sem_medidor||array[p_servico]) s order by s)
    else array_remove(servicos_sem_medidor,p_servico) end
    where id=uni.id returning servicos_sem_medidor into uni.servicos_sem_medidor;
  return uni.servicos_sem_medidor;
end $fn$;
revoke all on function public.configurar_unidade_sem_medidor(uuid,text,text,boolean) from public,anon;
grant execute on function public.configurar_unidade_sem_medidor(uuid,text,text,boolean) to authenticated;

create or replace function public.manifesto_transferencia_ucondo(p_user_id uuid,p_condominio_id uuid,p_periodo text,p_servicos text[])
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


-- Explicit retry after the original missing-name failure.
create or replace function public.solicitar_transferencia_ucondo(p_condominio_id uuid,p_periodo text,p_servicos text[],p_leituras_ids uuid[])
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
  if found then
    -- A missing name failed before opening the browser. Permit an explicit retry
    -- only for that proven pre-send failure; uncertain or partial work is never reset.
    if resposta.status='despachada' and cardinality(resposta.trabalhos_ids)>0
      and (select count(*) from public.automacoes_fila j where j.id=any(resposta.trabalhos_ids)
        and j.user_id=uid and j.status='erro' and coalesce(j.unidades_processadas,0)=0
        and j.erro_mensagem like '%Condomínio sem nome oficial válido configurado para o uCondo.%')
          =cardinality(resposta.trabalhos_ids)
      and exists(select 1 from public.solicitacoes_lote l where l.id=resposta.solicitacao_id and l.status='erro') then
      update public.transferencias_ucondo set status='aguardando',solicitacao_id=null,
        trabalhos_ids='{}'::uuid[],mensagem=null where id=resposta.id returning * into resposta;
    end if;
    return resposta;
  end if;
  insert into public.transferencias_ucondo(user_id,condominio_id,condominio_nome,periodo,servicos,manifesto,assinatura)
    select uid,c.id,c.nome,p_periodo,servicos_ordenados,dados,assinatura_calculada
    from public.condominios c where c.id=p_condominio_id and c.user_id=uid returning * into resposta;
  return resposta;
end $fn$;
revoke all on function public.solicitar_transferencia_ucondo(uuid,text,text[],uuid[]) from public,anon;
grant execute on function public.solicitar_transferencia_ucondo(uuid,text,text[],uuid[]) to authenticated;
