begin;

create table equipe_interna.valores_leiturista (
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  leiturista_id uuid not null references auth.users(id) on delete cascade,
  valor numeric(12,2) not null check (valor between 0 and 9999999999.99),
  primary key (condominio_id, leiturista_id)
);
alter table equipe_interna.valores_leiturista enable row level security;
revoke all on equipe_interna.valores_leiturista from public, anon, authenticated;

create function equipe_interna.equipe_listar_condominios_compartilhados(p_mes text)
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
  where c.user_id <> (select auth.uid()) and equipe_interna.equipe_pode_acessar(c.id);
$$;

create function equipe_interna.equipe_salvar_valor_individual(p_condominio_id uuid, p_valor numeric)
returns numeric
language plpgsql security definer set search_path = ''
as $$
declare
  v_leiturista uuid := auth.uid();
begin
  if v_leiturista is null or not equipe_interna.equipe_pode_acessar(p_condominio_id)
    or equipe_interna.equipe_pode_acessar(p_condominio_id, true) then
    raise exception using errcode = '42501', message = 'Condomínio compartilhado indisponível para esta conta.';
  end if;
  if p_valor is null or not (p_valor between 0 and 9999999999.99) or p_valor <> round(p_valor, 2) then
    raise exception using errcode = '22023', message = 'Informe um valor válido com até duas casas decimais.';
  end if;

  insert into equipe_interna.valores_leiturista(condominio_id, leiturista_id, valor)
    values(p_condominio_id, v_leiturista, p_valor)
    on conflict (condominio_id, leiturista_id) do update set valor = excluded.valor;
  return p_valor;
end;
$$;

create function equipe_interna.equipe_nome_condominio(p_condominio_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select c.nome from public.condominios c where c.id = p_condominio_id
    and equipe_interna.equipe_pode_acessar(c.id);
$$;

create function public.equipe_listar_condominios_compartilhados(p_mes text)
returns setof jsonb language sql stable set search_path = ''
as $$ select * from equipe_interna.equipe_listar_condominios_compartilhados(p_mes); $$;

create function public.equipe_salvar_valor_individual(p_condominio_id uuid, p_valor numeric)
returns numeric language sql set search_path = ''
as $$ select equipe_interna.equipe_salvar_valor_individual(p_condominio_id, p_valor); $$;

revoke all on function equipe_interna.equipe_listar_condominios_compartilhados(text),
  equipe_interna.equipe_salvar_valor_individual(uuid, numeric), equipe_interna.equipe_nome_condominio(uuid),
  public.equipe_listar_condominios_compartilhados(text), public.equipe_salvar_valor_individual(uuid, numeric)
  from public, anon, authenticated;
grant execute on function equipe_interna.equipe_listar_condominios_compartilhados(text),
  equipe_interna.equipe_salvar_valor_individual(uuid, numeric), equipe_interna.equipe_nome_condominio(uuid),
  public.equipe_listar_condominios_compartilhados(text), public.equipe_salvar_valor_individual(uuid, numeric)
  to authenticated;

-- A consulta direta da tabela continua disponível para o dono do cadastro.
-- O leiturista recebe os dados pela RPC de equipe, sem acesso à coluna do gestor.
drop policy equipe_condominios_select on public.condominios;

create or replace function equipe_interna.equipe_validar_leitura()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_nome text;
  v_pasta text;
begin
  if tg_op = 'UPDATE' then
    if old.leiturista_id is distinct from new.leiturista_id
      or (old.condominio_id is not null and old.condominio_id is distinct from new.condominio_id) then
      raise exception 'A autoria e o condomínio de uma leitura vinculada são permanentes.';
    end if;
  end if;
  if new.condominio_id is null then
    return new;
  end if;

  select nome into v_nome from public.condominios where id = new.condominio_id;
  if not found then
    v_nome := equipe_interna.equipe_nome_condominio(new.condominio_id);
    if v_nome is null then
      raise exception using errcode = '42501', message = 'Condomínio indisponível para esta conta.';
    end if;
  end if;
  new.condominio_nome := v_nome;
  v_pasta := '/storage/v1/object/public/fotos_leituras/equipe/' || new.condominio_id || '/' || new.leiturista_id || '/';
  if coalesce(new.foto_url, '') <> '' and (
    split_part(new.foto_url, v_pasta, 1) !~ '^https?://[^/?#]+$'
    or split_part(new.foto_url, v_pasta, 2) !~ '^[a-zA-Z0-9._-]+$'
    or split_part(new.foto_url, v_pasta, 2) in ('.', '..')
    or split_part(new.foto_url, v_pasta, 3) <> ''
  ) and not equipe_interna.equipe_foto_legada_vinculada(
    new.foto_url, new.condominio_id, new.leiturista_id
  ) then
    raise exception 'A foto precisa pertencer à leitura deste condomínio.';
  end if;
  return new;
end;
$$;

commit;
