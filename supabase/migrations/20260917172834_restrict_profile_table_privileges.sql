revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.profiles from authenticated;

grant select, insert, update on table public.profiles to authenticated;
