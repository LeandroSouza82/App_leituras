-- ====================================================================
-- SCRIPT DE LIMPEZA RESIDUAL DE POLÍTICAS RLS ANTIGAS / PERMISSIVAS
-- Projeto Ref: yotzutmarcpuckiqgnpf
-- ====================================================================
-- Este script executa EXCLUSIVAMENTE o DROP das políticas antigas,
-- permissivas ou redundantes que foram identificadas no banco.
-- NENHUMA política nova é recriada por este script.
-- As 20 políticas canônicas (*_select_policy, *_insert_policy, etc.)
-- e a política de app_feedbacks_insert_policy permanecem ativas.
-- As políticas de profiles permanecem intocadas.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. TABELA: condominios
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso Total Condominios" ON public.condominios;
DROP POLICY IF EXISTS "Condominios_Isolamento_User" ON public.condominios;
DROP POLICY IF EXISTS "Permitir tudo para autenticados em condominios" ON public.condominios;
DROP POLICY IF EXISTS "Acesso delecao condominios" ON public.condominios;
DROP POLICY IF EXISTS "Acesso insercao condominios" ON public.condominios;
DROP POLICY IF EXISTS "Acesso leitura condominios" ON public.condominios;
DROP POLICY IF EXISTS "Acesso atualizacao condominios" ON public.condominios;

-- --------------------------------------------------------------------
-- 2. TABELA: leituras
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso Total Leituras" ON public.leituras;
DROP POLICY IF EXISTS "Leituras_Isolamento_User" ON public.leituras;
DROP POLICY IF EXISTS "Permitir tudo para autenticados em leituras" ON public.leituras;
DROP POLICY IF EXISTS "Permitir insert de leituras" ON public.leituras;
DROP POLICY IF EXISTS "Permitir select de leituras" ON public.leituras;
DROP POLICY IF EXISTS "Permitir update de leituras" ON public.leituras;

-- --------------------------------------------------------------------
-- 3. TABELA: unidades
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso Total Unidades" ON public.unidades;
DROP POLICY IF EXISTS "Permitir tudo para autenticados em unidades" ON public.unidades;
DROP POLICY IF EXISTS "Unidades_Isolamento_User" ON public.unidades;

-- --------------------------------------------------------------------
-- 4. TABELA: unidades_leituras
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Permitir inserção e atualização de leituras" ON public.unidades_leituras;
DROP POLICY IF EXISTS "UnidadesLeituras_Isolamento_User" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Permitir leitura de unidades" ON public.unidades_leituras;

-- --------------------------------------------------------------------
-- 5. TABELA: leituras_detalhes
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "LeiturasDetalhes_Isolamento_User" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Permitir leitura e escrita para todos" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Permitir tudo para autenticados em leituras_detalhes" ON public.leituras_detalhes;

-- --------------------------------------------------------------------
-- 6. TABELA: app_feedbacks (elimina duplicidades permissivas residuais)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Permitir inserção de feedbacks" ON public.app_feedbacks;
DROP POLICY IF EXISTS "feedbacks_insert_policy" ON public.app_feedbacks;
DROP POLICY IF EXISTS "feedbacks_select_policy" ON public.app_feedbacks;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.app_feedbacks;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.app_feedbacks;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.app_feedbacks;
