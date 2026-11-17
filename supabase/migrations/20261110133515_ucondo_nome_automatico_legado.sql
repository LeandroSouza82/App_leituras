-- Compatibility for installed clients that imported the name but omitted nome_ucondo.
-- Explicit names from the uCondo sheet or previous manual links remain authoritative.
create function public.preencher_nome_ucondo_do_cadastro()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
  if nullif(btrim(new.nome_ucondo),'') is null then
    new.nome_ucondo:=nullif(btrim(new.nome),'');
  end if;
  return new;
end $fn$;
revoke all on function public.preencher_nome_ucondo_do_cadastro() from public,anon,authenticated;
create trigger condominios_nome_ucondo_automatico
  before insert or update of nome,nome_ucondo on public.condominios
  for each row execute function public.preencher_nome_ucondo_do_cadastro();
