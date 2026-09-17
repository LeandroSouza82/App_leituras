drop policy if exists "Usuários podem inserir seu próprio perfil" on public.profiles;
drop policy if exists "Usuários podem ver seu próprio perfil" on public.profiles;
drop policy if exists "Usuários podem atualizar seu próprio perfil" on public.profiles;

create policy "Usuários autenticados inserem seu próprio perfil"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Usuários autenticados veem seu próprio perfil"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Usuários autenticados atualizam seu próprio perfil"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke select, insert, update on table public.profiles from anon;
grant select, insert, update on table public.profiles to authenticated;
