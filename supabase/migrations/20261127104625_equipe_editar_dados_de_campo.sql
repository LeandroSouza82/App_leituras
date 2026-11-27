begin;

create function equipe_interna.equipe_editar_dados_de_campo(p_condominio_id uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_leiturista uuid := auth.uid();
  v_dia_leitura integer;
  v_latitude numeric;
  v_longitude numeric;
begin
  if jsonb_typeof(p_dados) is distinct from 'object'
    or p_dados = '{}'::jsonb
    or p_dados - array['nome', 'tipo_leitura', 'dia_leitura', 'apartamentos', 'endereco',
      'instrucoes_acesso', 'telefone_sindico', 'latitude', 'longitude'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Os dados de edição são inválidos.';
  end if;

  if exists (
    select 1 from jsonb_each(p_dados) as campo(chave, valor)
    where (chave in ('endereco', 'instrucoes_acesso', 'telefone_sindico')
      and jsonb_typeof(valor) not in ('string', 'null'))
      or (chave in ('nome', 'tipo_leitura', 'dia_leitura')
        and (jsonb_typeof(valor) <> 'string' or btrim(valor #>> '{}') = ''))
  ) then
    raise exception using errcode = '22023', message = 'Os campos de texto do condomínio são inválidos.';
  end if;

  if p_dados ? 'apartamentos' then
    if jsonb_typeof(p_dados->'apartamentos') <> 'number'
      or (p_dados->>'apartamentos') !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'Informe uma quantidade inteira de apartamentos.';
    end if;
  end if;

  if p_dados ? 'dia_leitura' then
    if btrim(p_dados->>'dia_leitura') !~ '^(0?[1-9]|[12][0-9]|3[01])$' then
      raise exception using errcode = '22023', message = 'Informe um dia de leitura entre 1 e 31.';
    end if;
    v_dia_leitura := btrim(p_dados->>'dia_leitura')::integer;
  end if;

  if p_dados ?| array['latitude', 'longitude'] and not (p_dados @> '{"latitude":null,"longitude":null}'::jsonb) then
    if jsonb_typeof(p_dados->'latitude') is distinct from 'number'
      or jsonb_typeof(p_dados->'longitude') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'Informe as duas coordenadas do GPS.';
    end if;
    v_latitude := (p_dados->>'latitude')::numeric;
    v_longitude := (p_dados->>'longitude')::numeric;
    if v_latitude not between -90 and 90 or v_longitude not between -180 and 180 then
      raise exception using errcode = '22023', message = 'As coordenadas do GPS estão fora do intervalo válido.';
    end if;
  end if;

  update public.condominios c
  set nome = case when p_dados ? 'nome' then btrim(p_dados->>'nome') else c.nome end,
      tipo_leitura = case when p_dados ? 'tipo_leitura' then btrim(p_dados->>'tipo_leitura') else c.tipo_leitura end,
      dia_leitura = coalesce(v_dia_leitura, c.dia_leitura),
      apartamentos = case when p_dados ? 'apartamentos' then (p_dados->>'apartamentos')::integer else c.apartamentos end,
      endereco = case when p_dados ? 'endereco' then nullif(btrim(p_dados->>'endereco'), '') else c.endereco end,
      instrucoes_acesso = case when p_dados ? 'instrucoes_acesso' then nullif(btrim(p_dados->>'instrucoes_acesso'), '') else c.instrucoes_acesso end,
      telefone_sindico = case when p_dados ? 'telefone_sindico' then nullif(btrim(p_dados->>'telefone_sindico'), '') else c.telefone_sindico end,
      latitude = case when p_dados ? 'latitude' then v_latitude else c.latitude end,
      longitude = case when p_dados ? 'longitude' then v_longitude else c.longitude end
  where c.id = p_condominio_id and c.user_id <> v_leiturista
    and equipe_interna.equipe_pode_acessar(c.id);

  if not found then
    raise exception using errcode = '42501', message = 'Condomínio compartilhado indisponível para esta conta.';
  end if;
end;
$$;

create function public.equipe_editar_dados_de_campo(p_condominio_id uuid, p_dados jsonb)
returns void language sql set search_path = ''
as $$ select equipe_interna.equipe_editar_dados_de_campo(p_condominio_id, p_dados); $$;

revoke all on function equipe_interna.equipe_editar_dados_de_campo(uuid, jsonb),
  public.equipe_editar_dados_de_campo(uuid, jsonb) from public, anon, authenticated;
grant execute on function equipe_interna.equipe_editar_dados_de_campo(uuid, jsonb),
  public.equipe_editar_dados_de_campo(uuid, jsonb) to authenticated;

create table equipe_interna.condominios_ocultos (
  leiturista_id uuid not null references auth.users(id) on delete cascade,
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  primary key (leiturista_id, condominio_id)
);
alter table equipe_interna.condominios_ocultos enable row level security;
revoke all on equipe_interna.condominios_ocultos from public, anon, authenticated;

create function equipe_interna.equipe_ocultar_condominio(p_condominio_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_leiturista uuid := auth.uid();
begin
  if v_leiturista is null or not equipe_interna.equipe_pode_acessar(p_condominio_id)
    or equipe_interna.equipe_pode_acessar(p_condominio_id, true) then
    raise exception using errcode = '42501', message = 'Condomínio compartilhado indisponível para esta conta.';
  end if;

  insert into equipe_interna.condominios_ocultos (leiturista_id, condominio_id)
    values (v_leiturista, p_condominio_id) on conflict do nothing;
end;
$$;

create function public.equipe_ocultar_condominio(p_condominio_id uuid)
returns void language sql set search_path = ''
as $$ select equipe_interna.equipe_ocultar_condominio(p_condominio_id); $$;

revoke all on function equipe_interna.equipe_ocultar_condominio(uuid),
  public.equipe_ocultar_condominio(uuid) from public, anon, authenticated;
grant execute on function equipe_interna.equipe_ocultar_condominio(uuid),
  public.equipe_ocultar_condominio(uuid) to authenticated;

create or replace function equipe_interna.equipe_listar_condominios_compartilhados(p_mes text)
returns setof jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'user_id', c.user_id, 'nome', c.nome, 'nome_ucondo', c.nome_ucondo,
    'created_at', c.created_at, 'apartamentos', c.apartamentos,
    'dia_leitura', c.dia_leitura, 'tipo_leitura', c.tipo_leitura,
    'endereco', c.endereco, 'instrucoes_acesso', c.instrucoes_acesso,
    'telefone_sindico', c.telefone_sindico, 'latitude', c.latitude, 'longitude', c.longitude,
    'valor', v.valor,
    'leituras', case when l.mes_referencia is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('mes_referencia', l.mes_referencia, 'concluido', l.concluido)) end
  )
  from public.condominios c
  left join equipe_interna.valores_leiturista v
    on v.condominio_id = c.id and v.leiturista_id = (select auth.uid())
  left join public.leituras l on l.condominio_id = c.id and l.mes_referencia = p_mes
  where c.user_id <> (select auth.uid()) and equipe_interna.equipe_pode_acessar(c.id)
    and not exists (
      select 1 from equipe_interna.condominios_ocultos o
      where o.condominio_id = c.id and o.leiturista_id = (select auth.uid())
    );
$$;

commit;
