drop policy if exists "Isolamento_Fotos_User" on storage.objects;
drop policy if exists "Permitir upload de fotos para autenticados" on storage.objects;

create policy fotos_leituras_select_owner
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'fotos_leituras'
    and owner_id = (select auth.uid()::text)
  );

create policy fotos_leituras_insert_owner
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'fotos_leituras'
    and owner_id = (select auth.uid()::text)
  );

create policy fotos_leituras_update_owner
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'fotos_leituras'
    and owner_id = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'fotos_leituras'
    and owner_id = (select auth.uid()::text)
  );

create policy fotos_leituras_delete_owner
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'fotos_leituras'
    and owner_id = (select auth.uid()::text)
  );
