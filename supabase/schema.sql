create extension if not exists "pgcrypto";

create table if not exists public.condominios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  tipo_leitura text not null default 'Água e Gás' check (
    tipo_leitura in ('Água e Gás', 'Somente Água', 'Somente Gás', 'Energia Elétrica')
  ),
  dia_leitura integer not null check (dia_leitura between 1 and 31),
  apartamentos integer not null check (apartamentos >= 0),
  valor numeric(12, 2) not null default 0 check (valor >= 0),
  endereco text,
  instrucoes_acesso text,
  telefone_sindico text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.leituras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  condominio_id uuid not null references public.condominios(id) on delete cascade,
  mes_referencia text not null check (mes_referencia ~ '^\\d{4}-\\d{2}$'),
  concluido boolean not null default false,
  data_conclusao timestamptz,
  unique (condominio_id, mes_referencia)
);

create index if not exists condominios_user_id_dia_leitura_idx
  on public.condominios(user_id, dia_leitura);

create index if not exists leituras_user_id_mes_referencia_idx
  on public.leituras(user_id, mes_referencia);

alter table public.condominios enable row level security;
alter table public.leituras enable row level security;

drop policy if exists "Usuários leem seus condomínios" on public.condominios;
create policy "Usuários leem seus condomínios"
  on public.condominios for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Usuários inserem seus condomínios" on public.condominios;
create policy "Usuários inserem seus condomínios"
  on public.condominios for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Usuários editam seus condomínios" on public.condominios;
create policy "Usuários editam seus condomínios"
  on public.condominios for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuários removem seus condomínios" on public.condominios;
create policy "Usuários removem seus condomínios"
  on public.condominios for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Usuários leem suas leituras" on public.leituras;
create policy "Usuários leem suas leituras"
  on public.leituras for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Usuários inserem suas leituras" on public.leituras;
create policy "Usuários inserem suas leituras"
  on public.leituras for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.condominios
      where condominios.id = leituras.condominio_id
        and condominios.user_id = auth.uid()
    )
  );

drop policy if exists "Usuários editam suas leituras" on public.leituras;
create policy "Usuários editam suas leituras"
  on public.leituras for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.condominios
      where condominios.id = leituras.condominio_id
        and condominios.user_id = auth.uid()
    )
  );

drop policy if exists "Usuários removem suas leituras" on public.leituras;
create policy "Usuários removem suas leituras"
  on public.leituras for delete
  to authenticated
  using (auth.uid() = user_id);
