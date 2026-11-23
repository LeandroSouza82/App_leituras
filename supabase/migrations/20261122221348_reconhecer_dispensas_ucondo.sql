-- As leituras excluem as unidades fora da grade; as fotos usam o total do trabalho.
create function automacao_interna.unidades_fora_grade_ucondo(t public.automacoes_fila)
returns text[] language sql immutable set search_path = '' as $fn$
  select array(
    select btrim(u) from unnest(string_to_array(
      (regexp_match(t.resultado_mensagem, 'Unidades sem medidor fora da grade: (.+)\.$'))[1], ','
    )) u
    where btrim(u) <> ''
  );
$fn$;

create or replace function automacao_interna.fotos_confirmadas_ucondo(t public.automacoes_fila)
returns text[] language sql stable set search_path = '' as $fn$
  select coalesce(array_agg(distinct m[4] order by m[4]), '{}'::text[])
  from public.automacoes_atividade a
  cross join lateral regexp_match(a.mensagem,
    '^Leituras conferidas: ([0-9]{1,6})/([0-9]{1,6}) unidades\. Fotos confirmadas: [0-9]+/([0-9]{1,6}) unidades\. [0-9]+ marcadas sem foto\. Fotos: foto da unidade (.+) confirmada no uCondo\.$') m
  where a.trabalho_id = t.id and a.user_id = t.user_id
    and m[1] = m[2] and m[3]::int = t.total_unidades
    and m[2]::int = t.total_unidades - cardinality(automacao_interna.unidades_fora_grade_ucondo(t));
$fn$;

-- Recupera a evidência ainda disponível sem tocar nos trabalhos ou na fila.
insert into automacao_interna.unidades_confirmadas_ucondo as existente (trabalho_id, unidades)
select t.id, f.unidades
from public.automacoes_fila t
cross join lateral (select automacao_interna.fotos_confirmadas_ucondo(t) unidades) f
where t.plataforma = 'ucondo' and automacao_interna.confirmacao_final_ucondo(t)
  and cardinality(automacao_interna.unidades_fora_grade_ucondo(t)) > 0
  and cardinality(f.unidades) > 0
on conflict (trabalho_id) do update set unidades = array(
  select distinct u from unnest(existente.unidades || excluded.unidades) u order by u
);

create function automacao_interna.provas_transferencia_ucondo(p_transferencia_id uuid)
returns table(servico text, total integer, fotos integer, dispensadas integer, propria boolean)
language sql stable set search_path = '' as $fn$
  with pedido as (
    select * from public.transferencias_ucondo where id = p_transferencia_id and user_id = auth.uid()
  ), escopo as (
    select distinct m->>'servico' servico, m->>'unidade' unidade
    from pedido p cross join lateral jsonb_array_elements(p.manifesto) m
    where m->>'servico' = any(p.servicos) and nullif(btrim(m->>'unidade'), '') is not null
  ), trabalhos as (
    select t.id, t.servico, t.total_unidades, t.id = any(p.trabalhos_ids) vinculado,
      automacao_interna.unidades_fora_grade_ucondo(t) fora_grade
    from pedido p join public.automacoes_fila t
      on t.user_id = p.user_id and t.condominio_id = p.condominio_id and t.periodo = p.periodo
    where t.servico = any(p.servicos) and t.plataforma = 'ucondo'
      and (t.id = any(p.trabalhos_ids) or t.finalizado_em >= p.created_at)
      and automacao_interna.confirmacao_final_ucondo(t)
  ), por_unidade as (
    select e.servico,
      exists (
        select 1 from trabalhos t
        join automacao_interna.unidades_confirmadas_ucondo v on v.trabalho_id = t.id
        where not t.vinculado and t.servico = e.servico and e.unidade = any(v.unidades)
      ) tem_foto,
      exists (
        select 1 from trabalhos t cross join pedido p
        join public.unidades u on u.condominio_id = p.condominio_id
        where not t.vinculado and t.servico = e.servico and e.unidade = any(t.fora_grade)
          and u.nome = e.unidade and e.servico = any(u.servicos_sem_medidor)
      ) sem_medidor
    from escopo e
  ), cobertura as (
    select e.servico, count(*)::int total,
      count(*) filter (where e.tem_foto)::int fotos,
      count(*) filter (where not e.tem_foto and e.sem_medidor)::int dispensadas
    from por_unidade e group by e.servico
  )
  select c.servico, c.total, c.fotos, c.dispensadas,
    exists(select 1 from trabalhos t where t.vinculado and t.servico = c.servico and t.total_unidades = c.total)
  from cobertura c;
$fn$;

create or replace function automacao_interna.confirmacoes_transferencia_ucondo(p_transferencia_id uuid)
returns table(servico text, total integer, confirmadas integer, externas integer)
language sql stable set search_path = '' as $fn$
  select p.servico, p.total, case when p.propria then p.total else p.fotos + p.dispensadas end,
    p.fotos + p.dispensadas
  from automacao_interna.provas_transferencia_ucondo(p_transferencia_id) p;
$fn$;

-- Clientes anteriores continuam recebendo apenas a contagem de fotos reais.
create or replace function public.confirmacoes_envios_ucondo(p_transferencia_ids uuid[])
returns table(transferencia_id uuid, servico text, total integer, externas integer)
language sql stable security definer set search_path = '' as $fn$
  select p.id, c.servico, c.total, c.fotos
  from public.transferencias_ucondo p
  cross join lateral automacao_interna.provas_transferencia_ucondo(p.id) c
  where p.user_id = auth.uid() and p.id = any(p_transferencia_ids) and c.fotos > 0;
$fn$;

create function public.confirmacoes_envios_ucondo_v2(p_transferencia_ids uuid[])
returns table(transferencia_id uuid, servico text, total integer, externas integer, dispensadas integer)
language sql stable security definer set search_path = '' as $fn$
  select p.id, c.servico, c.total, c.fotos, c.dispensadas
  from public.transferencias_ucondo p
  cross join lateral automacao_interna.provas_transferencia_ucondo(p.id) c
  where p.user_id = auth.uid() and p.id = any(p_transferencia_ids) and c.fotos + c.dispensadas > 0;
$fn$;

revoke all on function automacao_interna.unidades_fora_grade_ucondo(public.automacoes_fila),
  automacao_interna.provas_transferencia_ucondo(uuid),
  public.confirmacoes_envios_ucondo_v2(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.confirmacoes_envios_ucondo_v2(uuid[]) to authenticated;
