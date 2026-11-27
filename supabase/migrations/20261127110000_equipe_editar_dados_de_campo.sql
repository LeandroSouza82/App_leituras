begin;

create function equipe_interna.equipe_editar_dados_de_campo(p_condominio_id uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_leiturista uuid := auth.uid();
  v_latitude numeric;
  v_longitude numeric;
begin
  if jsonb_typeof(p_dados) is distinct from 'object'
    or p_dados = '{}'::jsonb
    or p_dados - array['endereco', 'instrucoes_acesso', 'telefone_sindico', 'latitude', 'longitude'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Os dados de edição são inválidos.';
  end if;

  if exists (
    select 1 from jsonb_each(p_dados) as campo(chave, valor)
    where chave in ('endereco', 'instrucoes_acesso', 'telefone_sindico')
      and jsonb_typeof(valor) not in ('string', 'null')
  ) then
    raise exception using errcode = '22023', message = 'Os dados de contato e endereço devem ser texto.';
  end if;

  if p_dados ?| array['latitude', 'longitude'] then
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
  set endereco = case when p_dados ? 'endereco' then nullif(btrim(p_dados->>'endereco'), '') else c.endereco end,
      instrucoes_acesso = case when p_dados ? 'instrucoes_acesso' then nullif(btrim(p_dados->>'instrucoes_acesso'), '') else c.instrucoes_acesso end,
      telefone_sindico = case when p_dados ? 'telefone_sindico' then nullif(btrim(p_dados->>'telefone_sindico'), '') else c.telefone_sindico end,
      latitude = coalesce(v_latitude, c.latitude),
      longitude = coalesce(v_longitude, c.longitude)
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

commit;
