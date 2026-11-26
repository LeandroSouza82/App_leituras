begin;

create schema if not exists equipe_interna;
revoke all on schema equipe_interna from public;
grant usage on schema equipe_interna to authenticated;

create table equipe_interna.administradores (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table equipe_interna.administradores enable row level security;

create table equipe_interna.convites (
  id uuid primary key default gen_random_uuid(),
  administrador_id uuid not null references auth.users(id) on delete cascade,
  email text,
  token_hash text not null unique,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_por uuid references auth.users(id) on delete set null,
  aceito_em timestamptz,
  revogado_em timestamptz
);

create table equipe_interna.condominios_convidados (
  convite_id uuid not null references equipe_interna.convites(id) on delete cascade,
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  primary key (convite_id, condominio_id)
);

create table equipe_interna.fotos_legadas (
  caminho text primary key,
  condominio_id uuid not null references public.condominios(id) on delete restrict,
  leiturista_id uuid not null
);
alter table equipe_interna.fotos_legadas enable row level security;

create index equipe_convites_administrador_idx
  on equipe_interna.convites (administrador_id, aceito_por);
create index equipe_convites_leiturista_idx
  on equipe_interna.convites (aceito_por) where revogado_em is null;
create index equipe_condominios_convidados_idx
  on equipe_interna.condominios_convidados (condominio_id);

alter table equipe_interna.convites enable row level security;
alter table equipe_interna.condominios_convidados enable row level security;

create function equipe_interna.equipe_e_administrador(p_usuario uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from equipe_interna.administradores a where a.user_id = p_usuario);
$$;

create function equipe_interna.equipe_pode_acessar(p_condominio_id uuid, p_somente_administrador boolean default false)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.condominios c where c.id = p_condominio_id
      and (
        c.user_id = (select auth.uid())
        or (
          not p_somente_administrador and exists (
            select 1
            from equipe_interna.condominios_convidados cc
            join equipe_interna.convites cv on cv.id = cc.convite_id
            where cc.condominio_id = c.id and cv.administrador_id = c.user_id
              and equipe_interna.equipe_e_administrador(cv.administrador_id)
              and cv.aceito_por = (select auth.uid()) and cv.aceito_em is not null
              and cv.revogado_em is null
          )
        )
      )
  );
$$;

create function equipe_interna.equipe_criar_convite(p_condominios uuid[])
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_administrador uuid := auth.uid();
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_convite uuid;
begin
  if not equipe_interna.equipe_e_administrador() then
    raise exception using errcode = '42501', message = 'Somente a conta administradora pode criar convites.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_administrador::text, 7124));
  if (select count(*) from equipe_interna.convites
    where administrador_id = v_administrador and aceito_em is null
      and revogado_em is null and expira_em > now()) >= 50 then
    raise exception 'Cancele convites pendentes antes de criar outro.';
  end if;
  if coalesce(cardinality(p_condominios), 0) not between 1 and 250 or exists (
    select 1 from unnest(p_condominios) selecionado(id)
    where not equipe_interna.equipe_pode_acessar(selecionado.id, true)
  ) then
    raise exception 'Selecione os condomínios que o leiturista poderá atender.';
  end if;

  insert into equipe_interna.convites (administrador_id, token_hash)
    values (v_administrador, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
    returning id into v_convite;
  insert into equipe_interna.condominios_convidados (convite_id, condominio_id)
    select v_convite, id from (select distinct unnest(p_condominios) as id) selecionados;
  return v_token;
end;
$$;

create function equipe_interna.equipe_aceitar_convite(p_token text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_leiturista uuid := auth.uid();
  v_administrador uuid;
  v_hash text;
  v_convite equipe_interna.convites%rowtype;
  v_email text;
begin
  if v_leiturista is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    return 'invalido';
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select administrador_id into v_administrador from equipe_interna.convites where token_hash = v_hash;
  if not equipe_interna.equipe_e_administrador(v_administrador) then
    return 'invalido';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_administrador::text, 7124));

  select * into v_convite from equipe_interna.convites where token_hash = v_hash for update;
  if not found or v_convite.revogado_em is not null or v_convite.administrador_id = v_leiturista then
    return 'invalido';
  end if;
  if v_convite.aceito_em is not null then
    return case when v_convite.aceito_por = v_leiturista then 'aceito' else 'invalido' end;
  end if;
  if v_convite.expira_em <= now() or not exists (
    select 1 from equipe_interna.condominios_convidados cc
    join public.condominios c on c.id = cc.condominio_id and c.user_id = v_convite.administrador_id
    where cc.convite_id = v_convite.id
  ) then
    return 'invalido';
  end if;
  select lower(i.identity_data->>'email') into v_email from auth.identities i
    where i.user_id = v_leiturista and i.provider = 'google'
      and i.identity_data->>'email_verified' = 'true'
      and nullif(trim(i.identity_data->>'email'), '') is not null
    order by i.last_sign_in_at desc nulls last limit 1;
  if v_email is null then
    return 'conta_incorreta';
  end if;

  update equipe_interna.convites set aceito_por = v_leiturista, email = v_email, aceito_em = now()
    where id = v_convite.id;
  return 'aceito';
end;
$$;

create function equipe_interna.equipe_listar_convites()
returns table (id uuid, email text, ativo boolean, condominios text[], condominio_ids uuid[])
language sql stable security definer set search_path = ''
as $$
  select (array_agg(cv.id order by cv.criado_em desc))[1], max(cv.email), bool_or(cv.aceito_em is not null),
    coalesce(array_agg(distinct c.nome order by c.nome) filter (where c.id is not null), array[]::text[]),
    coalesce(array_agg(distinct c.id) filter (where c.id is not null), array[]::uuid[])
  from equipe_interna.convites cv
  left join equipe_interna.condominios_convidados cc on cc.convite_id = cv.id
  left join public.condominios c on c.id = cc.condominio_id and c.user_id = cv.administrador_id
  where (select equipe_interna.equipe_e_administrador()) and cv.administrador_id = (select auth.uid()) and cv.revogado_em is null
    and ((cv.aceito_em is not null and cv.aceito_por is not null) or (cv.aceito_em is null and cv.expira_em > now()))
  group by coalesce(cv.aceito_por, cv.id)
  order by max(cv.criado_em) desc;
$$;

create function equipe_interna.equipe_revogar_acesso(p_convite_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_administrador uuid := auth.uid();
  v_leiturista uuid;
begin
  if not equipe_interna.equipe_e_administrador() then
    raise exception using errcode = '42501', message = 'Somente a conta administradora pode remover o acesso.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_administrador::text, 7124));
  select cv.aceito_por into v_leiturista from equipe_interna.convites cv
    where cv.id = p_convite_id and cv.administrador_id = v_administrador for update;
  if not found then
    raise exception 'Convite indisponível para esta conta.';
  end if;

  update equipe_interna.convites cv set revogado_em = now()
    where cv.administrador_id = v_administrador and cv.revogado_em is null
      and (cv.id = p_convite_id or cv.aceito_por = v_leiturista);
end;
$$;

create function equipe_interna.equipe_atualizar_condominios(p_convite_id uuid, p_condominios uuid[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_administrador uuid := auth.uid();
  v_leiturista uuid;
begin
  if not equipe_interna.equipe_e_administrador() then
    raise exception using errcode = '42501', message = 'Somente a conta administradora pode liberar condomínios.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_administrador::text, 7124));
  select cv.aceito_por into v_leiturista from equipe_interna.convites cv
    where cv.id = p_convite_id and cv.administrador_id = v_administrador
      and cv.revogado_em is null and cv.aceito_em is not null;
  if v_leiturista is null then
    raise exception 'Membro indisponível para esta conta.';
  end if;
  if coalesce(cardinality(p_condominios), 251) > 250 or exists (
    select 1 from unnest(p_condominios) selecionado(id)
    where not equipe_interna.equipe_pode_acessar(selecionado.id, true)
  ) then
    raise exception 'Selecione apenas condomínios da sua conta.';
  end if;

  delete from equipe_interna.condominios_convidados cc using equipe_interna.convites cv
    where cc.convite_id = cv.id and cv.administrador_id = v_administrador
      and cv.aceito_por = v_leiturista and cv.revogado_em is null;
  insert into equipe_interna.condominios_convidados (convite_id, condominio_id)
    select p_convite_id, id from (select distinct unnest(p_condominios) as id) selecionados;
end;
$$;

create function equipe_interna.equipe_status_leitura(p_condominio_id uuid, p_mes text, p_concluido boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_administrador uuid;
begin
  if not equipe_interna.equipe_pode_acessar(p_condominio_id) then
    raise exception 'Esse condomínio não está disponível para sua conta.';
  end if;
  select user_id into strict v_administrador from public.condominios where id = p_condominio_id;
  insert into public.leituras (condominio_id, user_id, mes_referencia, concluido, data_conclusao)
    values (p_condominio_id, v_administrador, p_mes, p_concluido, case when p_concluido then now() end)
    on conflict (condominio_id, mes_referencia) do update
    set concluido = excluded.concluido, data_conclusao = excluded.data_conclusao;
end;
$$;

create function equipe_interna.equipe_listar_autores()
returns table (id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.email::text from auth.users u
    where (select equipe_interna.equipe_e_administrador()) and u.id = (select auth.uid())
  union all
  select distinct cv.aceito_por, cv.email from equipe_interna.convites cv
    where (select equipe_interna.equipe_e_administrador()) and cv.administrador_id = (select auth.uid())
      and cv.aceito_por is not null;
$$;

create function equipe_interna.equipe_pode_ver_planilha(p_condominio text, p_leiturista uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when p_condominio ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  then exists (select 1 from public.condominios c
    where c.id = p_condominio::uuid and c.user_id = p_leiturista
      and equipe_interna.equipe_pode_acessar(c.id))
  else false end;
$$;

revoke all on all functions in schema equipe_interna from public, anon, authenticated;
grant execute on function equipe_interna.equipe_pode_acessar(uuid, boolean),
  equipe_interna.equipe_criar_convite(uuid[]), equipe_interna.equipe_aceitar_convite(text),
  equipe_interna.equipe_listar_convites(), equipe_interna.equipe_revogar_acesso(uuid),
  equipe_interna.equipe_atualizar_condominios(uuid, uuid[]),
  equipe_interna.equipe_status_leitura(uuid, text, boolean), equipe_interna.equipe_listar_autores(),
  equipe_interna.equipe_pode_ver_planilha(text, uuid) to authenticated;

create function equipe_interna.equipe_meu_papel()
returns boolean
language sql stable security definer set search_path = ''
as $$ select equipe_interna.equipe_e_administrador(); $$;
revoke all on function equipe_interna.equipe_meu_papel() from public, anon, authenticated;
grant execute on function equipe_interna.equipe_meu_papel() to authenticated;

create function public.equipe_meu_papel()
returns boolean language sql stable set search_path = ''
as $$ select equipe_interna.equipe_meu_papel(); $$;

create function public.equipe_criar_convite(p_condominios uuid[])
returns text language sql set search_path = ''
as $$ select equipe_interna.equipe_criar_convite(p_condominios); $$;

create function public.equipe_aceitar_convite(p_token text)
returns text language sql set search_path = ''
as $$ select equipe_interna.equipe_aceitar_convite(p_token); $$;

create function public.equipe_listar_convites()
returns table (id uuid, email text, ativo boolean, condominios text[], condominio_ids uuid[])
language sql stable set search_path = ''
as $$ select * from equipe_interna.equipe_listar_convites(); $$;

create function public.equipe_revogar_acesso(p_convite_id uuid)
returns void language sql set search_path = ''
as $$ select equipe_interna.equipe_revogar_acesso(p_convite_id); $$;

create function public.equipe_atualizar_condominios(p_convite_id uuid, p_condominios uuid[])
returns void language sql set search_path = ''
as $$ select equipe_interna.equipe_atualizar_condominios(p_convite_id, p_condominios); $$;

create function public.equipe_status_leitura(p_condominio_id uuid, p_mes text, p_concluido boolean)
returns void language sql set search_path = ''
as $$ select equipe_interna.equipe_status_leitura(p_condominio_id, p_mes, p_concluido); $$;

create function public.equipe_listar_autores()
returns table (id uuid, email text)
language sql stable set search_path = ''
as $$ select * from equipe_interna.equipe_listar_autores(); $$;

revoke all on function public.equipe_meu_papel(), public.equipe_criar_convite(uuid[]), public.equipe_aceitar_convite(text),
  public.equipe_listar_convites(), public.equipe_revogar_acesso(uuid), public.equipe_listar_autores(),
  public.equipe_atualizar_condominios(uuid, uuid[]), public.equipe_status_leitura(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.equipe_meu_papel(), public.equipe_criar_convite(uuid[]), public.equipe_aceitar_convite(text),
  public.equipe_listar_convites(), public.equipe_revogar_acesso(uuid), public.equipe_listar_autores(),
  public.equipe_atualizar_condominios(uuid, uuid[]), public.equipe_status_leitura(uuid, text, boolean) to authenticated;

create policy equipe_condominios_select on public.condominios for select to authenticated
  using (equipe_interna.equipe_pode_acessar(id));
create policy equipe_unidades_select on public.unidades for select to authenticated
  using (equipe_interna.equipe_pode_acessar(condominio_id));
create policy equipe_leituras_select on public.leituras for select to authenticated
  using (equipe_interna.equipe_pode_acessar(condominio_id));
create policy equipe_planilha_anterior_select on public.unidades_leituras for select to authenticated
  using (equipe_interna.equipe_pode_ver_planilha(condominio_nome, leiturista_id));

alter table public.leituras_detalhes add column condominio_id uuid
  references public.condominios(id) on delete cascade;
create index leituras_detalhes_condominio_idx on public.leituras_detalhes (condominio_id, data_leitura);
create index leituras_detalhes_foto_condominio_idx on public.leituras_detalhes (foto_url)
  where condominio_id is not null and foto_url <> '';

drop policy if exists leituras_detalhes_select_policy on public.leituras_detalhes;
drop policy if exists leituras_detalhes_insert_policy on public.leituras_detalhes;
drop policy if exists leituras_detalhes_update_policy on public.leituras_detalhes;
drop policy if exists leituras_detalhes_delete_policy on public.leituras_detalhes;

create policy leituras_detalhes_select_policy on public.leituras_detalhes for select to authenticated
  using (
    (condominio_id is null and leiturista_id = (select auth.uid()))
    or equipe_interna.equipe_pode_acessar(condominio_id, true)
    or (leiturista_id = (select auth.uid()) and equipe_interna.equipe_pode_acessar(condominio_id))
  );
create policy leituras_detalhes_insert_policy on public.leituras_detalhes for insert to authenticated
  with check (leiturista_id = (select auth.uid())
    and (condominio_id is null or equipe_interna.equipe_pode_acessar(condominio_id)));
create policy leituras_detalhes_update_policy on public.leituras_detalhes for update to authenticated
  using (leiturista_id = (select auth.uid())
    and (condominio_id is null or equipe_interna.equipe_pode_acessar(condominio_id)))
  with check (leiturista_id = (select auth.uid())
    and (condominio_id is null or equipe_interna.equipe_pode_acessar(condominio_id)));
create policy leituras_detalhes_delete_policy on public.leituras_detalhes for delete to authenticated
  using (
    (condominio_id is null and leiturista_id = (select auth.uid()))
    or equipe_interna.equipe_pode_acessar(condominio_id, true)
  );

create function equipe_interna.equipe_foto_legada_vinculada(p_url text, p_condominio_id uuid, p_leiturista_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from equipe_interna.fotos_legadas f
    where f.caminho = split_part(p_url, '/storage/v1/object/public/fotos_leituras/', 2)
      and f.condominio_id = p_condominio_id and f.leiturista_id = p_leiturista_id
  );
$$;
revoke all on function equipe_interna.equipe_foto_legada_vinculada(text, uuid, uuid) from public, anon, authenticated;
grant execute on function equipe_interna.equipe_foto_legada_vinculada(text, uuid, uuid) to authenticated;

create function equipe_interna.equipe_validar_leitura()
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
    raise exception using errcode = '42501', message = 'Condomínio indisponível para esta conta.';
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

revoke all on function equipe_interna.equipe_validar_leitura() from public, anon, authenticated;
create trigger equipe_validar_leitura before insert or update on public.leituras_detalhes
  for each row execute function equipe_interna.equipe_validar_leitura();

create function equipe_interna.equipe_condominio_da_foto(p_nome text)
returns uuid
language sql immutable strict set search_path = ''
as $$
  select case when p_nome ~ '^equipe/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[a-zA-Z0-9._-]+$'
    then split_part(p_nome, '/', 2)::uuid end;
$$;
revoke all on function equipe_interna.equipe_condominio_da_foto(text) from public, anon, authenticated;
grant execute on function equipe_interna.equipe_condominio_da_foto(text) to authenticated;

create policy equipe_fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos_leituras' and equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto(name), true));
create policy equipe_fotos_select_guard on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'fotos_leituras' or name not like 'equipe/%'
    or equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto(name), true)
    or (split_part(name, '/', 3) = (select auth.uid())::text
      and equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto(name))));
create policy equipe_fotos_insert_guard on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'fotos_leituras' or name not like 'equipe/%' or (
    split_part(name, '/', 3) = (select auth.uid())::text
    and equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto(name))
  ));
create policy equipe_fotos_update_guard on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'fotos_leituras' or name not like 'equipe/%' or (
    split_part(name, '/', 3) = (select auth.uid())::text
    and equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto(name))
  ))
  with check (bucket_id <> 'fotos_leituras' or name not like 'equipe/%' or (
    split_part(name, '/', 3) = (select auth.uid())::text
    and equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto(name))
  ));
create policy equipe_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos_leituras' and equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto(name), true));
create policy equipe_fotos_delete_guard on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'fotos_leituras' or name not like 'equipe/%'
    or equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto(name), true));

create function equipe_interna.equipe_condominio_da_foto_legada(p_caminho text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select f.condominio_id from equipe_interna.fotos_legadas f where f.caminho = p_caminho;
$$;
revoke all on function equipe_interna.equipe_condominio_da_foto_legada(text) from public, anon, authenticated;
grant execute on function equipe_interna.equipe_condominio_da_foto_legada(text) to authenticated;

create policy equipe_fotos_legadas_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos_leituras' and equipe_interna.equipe_pode_acessar(
    equipe_interna.equipe_condominio_da_foto_legada(name), true
  ));
create policy equipe_fotos_legadas_select_guard on storage.objects as restrictive for select to authenticated
  using (
    bucket_id <> 'fotos_leituras' or equipe_interna.equipe_condominio_da_foto_legada(name) is null
    or equipe_interna.equipe_pode_acessar(equipe_interna.equipe_condominio_da_foto_legada(name))
  );
create policy equipe_fotos_legadas_update_guard on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'fotos_leituras' or equipe_interna.equipe_condominio_da_foto_legada(name) is null)
  with check (bucket_id <> 'fotos_leituras' or equipe_interna.equipe_condominio_da_foto_legada(name) is null);
create policy equipe_fotos_legadas_delete_guard on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'fotos_leituras' or equipe_interna.equipe_condominio_da_foto_legada(name) is null);

commit;
