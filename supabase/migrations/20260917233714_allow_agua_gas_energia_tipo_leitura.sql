alter table public.condominios
  drop constraint if exists condominios_tipo_leitura_check;

alter table public.condominios
  add constraint condominios_tipo_leitura_check
  check (
    tipo_leitura in (
      'Água e Gás',
      'Água, Gás e Energia',
      'Somente Água',
      'Somente Gás',
      'Energia Elétrica'
    )
  );
