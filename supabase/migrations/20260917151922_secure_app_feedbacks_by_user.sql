alter table public.app_feedbacks
  add column if not exists user_id uuid
  default auth.uid()
  references auth.users(id) on delete set null;

create index if not exists app_feedbacks_user_id_idx
  on public.app_feedbacks(user_id);

drop policy if exists app_feedbacks_insert_policy on public.app_feedbacks;

create policy app_feedbacks_insert_authenticated
  on public.app_feedbacks
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid()) = user_id
  );

revoke insert on table public.app_feedbacks from anon;
grant insert on table public.app_feedbacks to authenticated;
