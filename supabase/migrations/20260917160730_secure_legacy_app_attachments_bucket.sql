update storage.buckets
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'app_anexos';

drop policy if exists "Permitir upload de anexos" on storage.objects;
