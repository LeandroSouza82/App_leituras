set lock_timeout = '5s';

alter table public.condominios
  drop constraint if exists condominios_tipo_leitura_check;
alter table public.condominios add constraint condominios_tipo_leitura_check
  check (tipo_leitura in (
    'Somente Água', 'Somente Gás', 'Energia Elétrica',
    'Água e Gás', 'Água e Energia', 'Gás e Energia', 'Água, Gás e Energia'
  ));

create function public.adicionar_servico_planilha_ucondo(
  p_condominio_id uuid, p_servico text, p_unidades text[]
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_tipo text;
  v_agua boolean;
  v_gas boolean;
  v_energia boolean;
  v_total integer;
begin
  if p_servico is null or p_servico not in ('AGUA', 'GAS', 'ENERGIA')
     or coalesce(cardinality(p_unidades), 0) = 0 then
    raise exception 'Serviço ou lista de unidades inválida.';
  end if;

  -- Serializa importações simultâneas do mesmo condomínio, inclusive em aparelhos diferentes.
  select c.tipo_leitura into strict v_tipo from public.condominios c
    where c.id = p_condominio_id and c.user_id = auth.uid() for update;
  v_agua := p_servico = 'AGUA' or v_tipo ilike '%água%';
  v_gas := p_servico = 'GAS' or v_tipo ilike '%gás%';
  v_energia := p_servico = 'ENERGIA' or v_tipo ilike '%energia%';

  with nomes as (
    select btrim(nome) as nome, regexp_replace(lower(normalize(nome, NFD)), '[^a-z0-9]', '', 'g') as chave
    from unnest(p_unidades) as unidades(nome)
  ), unicos as (
    select distinct on (chave) nome, chave from nomes
    where chave <> '' order by chave, nome
  )
  insert into public.unidades (condominio_id, nome, numero, identificador, status)
    select p_condominio_id, n.nome, n.nome, n.nome, 'pendente'
    from unicos n where not exists (
      select 1 from public.unidades u where u.condominio_id = p_condominio_id
        and regexp_replace(lower(normalize(u.nome, NFD)), '[^a-z0-9]', '', 'g') = n.chave
    );

  select count(*) into v_total from public.unidades u where u.condominio_id = p_condominio_id;
  update public.condominios set
    apartamentos = greatest(apartamentos, v_total),
    tipo_leitura = case
      when v_agua and v_gas and v_energia then 'Água, Gás e Energia'
      when v_agua and v_gas then 'Água e Gás'
      when v_agua and v_energia then 'Água e Energia'
      when v_gas and v_energia then 'Gás e Energia'
      when v_agua then 'Somente Água'
      when v_gas then 'Somente Gás'
      else 'Energia Elétrica'
    end
    where id = p_condominio_id and user_id = auth.uid();
end;
$$;

revoke all on function public.adicionar_servico_planilha_ucondo(uuid, text, text[]) from public, anon;
grant execute on function public.adicionar_servico_planilha_ucondo(uuid, text, text[]) to authenticated;
