-- ====================================================================
-- SCRIPT DE HARDENING DE POLÍTICAS RLS - FAST LEITURAS
-- Projeto Ref: yotzutmarcpuckiqgnpf
-- Data: 2026-09-03
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. TABELA: condominios
-- --------------------------------------------------------------------
ALTER TABLE public.condominios ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas existentes e permissivas
DROP POLICY IF EXISTS "Usuários leem seus condomínios" ON public.condominios;
DROP POLICY IF EXISTS "Usuários inserem seus condomínios" ON public.condominios;
DROP POLICY IF EXISTS "Usuários editam seus condomínios" ON public.condominios;
DROP POLICY IF EXISTS "Usuários removem seus condomínios" ON public.condominios;
DROP POLICY IF EXISTS "condominios_select_policy" ON public.condominios;
DROP POLICY IF EXISTS "condominios_insert_policy" ON public.condominios;
DROP POLICY IF EXISTS "condominios_update_policy" ON public.condominios;
DROP POLICY IF EXISTS "condominios_delete_policy" ON public.condominios;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.condominios;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.condominios;
DROP POLICY IF EXISTS "Enable update for all users" ON public.condominios;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.condominios;
DROP POLICY IF EXISTS "Permitir tudo para authenticated" ON public.condominios;
DROP POLICY IF EXISTS "Permitir tudo para public" ON public.condominios;
DROP POLICY IF EXISTS "Public access" ON public.condominios;

-- Políticas Seguras: condominios (restrito a auth.uid() = user_id)
CREATE POLICY "condominios_select_policy"
  ON public.condominios FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "condominios_insert_policy"
  ON public.condominios FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "condominios_update_policy"
  ON public.condominios FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "condominios_delete_policy"
  ON public.condominios FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- --------------------------------------------------------------------
-- 2. TABELA: leituras
-- --------------------------------------------------------------------
ALTER TABLE public.leituras ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas existentes e permissivas
DROP POLICY IF EXISTS "Usuários leem suas leituras" ON public.leituras;
DROP POLICY IF EXISTS "Usuários inserem suas leituras" ON public.leituras;
DROP POLICY IF EXISTS "Usuários editam suas leituras" ON public.leituras;
DROP POLICY IF EXISTS "Usuários removem suas leituras" ON public.leituras;
DROP POLICY IF EXISTS "leituras_select_policy" ON public.leituras;
DROP POLICY IF EXISTS "leituras_insert_policy" ON public.leituras;
DROP POLICY IF EXISTS "leituras_update_policy" ON public.leituras;
DROP POLICY IF EXISTS "leituras_delete_policy" ON public.leituras;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.leituras;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.leituras;
DROP POLICY IF EXISTS "Enable update for all users" ON public.leituras;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.leituras;
DROP POLICY IF EXISTS "Permitir tudo para authenticated" ON public.leituras;
DROP POLICY IF EXISTS "Permitir tudo para public" ON public.leituras;
DROP POLICY IF EXISTS "Public access" ON public.leituras;

-- Políticas Seguras: leituras (auth.uid() = user_id e condomínio do usuário)
CREATE POLICY "leituras_select_policy"
  ON public.leituras FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "leituras_insert_policy"
  ON public.leituras FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id = leituras.condominio_id
        AND condominios.user_id = auth.uid()
    )
  );

CREATE POLICY "leituras_update_policy"
  ON public.leituras FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id = leituras.condominio_id
        AND condominios.user_id = auth.uid()
    )
  );

CREATE POLICY "leituras_delete_policy"
  ON public.leituras FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- --------------------------------------------------------------------
-- 3. TABELA: unidades
-- --------------------------------------------------------------------
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas existentes e permissivas
DROP POLICY IF EXISTS "Usuários leem suas unidades" ON public.unidades;
DROP POLICY IF EXISTS "Usuários inserem suas unidades" ON public.unidades;
DROP POLICY IF EXISTS "Usuários editam suas unidades" ON public.unidades;
DROP POLICY IF EXISTS "Usuários removem suas unidades" ON public.unidades;
DROP POLICY IF EXISTS "unidades_select_policy" ON public.unidades;
DROP POLICY IF EXISTS "unidades_insert_policy" ON public.unidades;
DROP POLICY IF EXISTS "unidades_update_policy" ON public.unidades;
DROP POLICY IF EXISTS "unidades_delete_policy" ON public.unidades;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.unidades;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.unidades;
DROP POLICY IF EXISTS "Enable update for all users" ON public.unidades;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.unidades;
DROP POLICY IF EXISTS "Permitir tudo para authenticated" ON public.unidades;
DROP POLICY IF EXISTS "Permitir tudo para public" ON public.unidades;
DROP POLICY IF EXISTS "Public access" ON public.unidades;

-- Políticas Seguras: unidades (isolamento via condomínio de auth.uid())
CREATE POLICY "unidades_select_policy"
  ON public.unidades FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id = unidades.condominio_id
        AND condominios.user_id = auth.uid()
    )
  );

CREATE POLICY "unidades_insert_policy"
  ON public.unidades FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id = unidades.condominio_id
        AND condominios.user_id = auth.uid()
    )
  );

CREATE POLICY "unidades_update_policy"
  ON public.unidades FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id = unidades.condominio_id
        AND condominios.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id = unidades.condominio_id
        AND condominios.user_id = auth.uid()
    )
  );

CREATE POLICY "unidades_delete_policy"
  ON public.unidades FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id = unidades.condominio_id
        AND condominios.user_id = auth.uid()
    )
  );


-- --------------------------------------------------------------------
-- 4. TABELA: unidades_leituras (COM EXIGÊNCIA ESTRITA "AND")
-- --------------------------------------------------------------------
ALTER TABLE public.unidades_leituras ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas existentes e permissivas
DROP POLICY IF EXISTS "Usuários leem suas unidades_leituras" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Usuários inserem suas unidades_leituras" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Usuários editam suas unidades_leituras" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Usuários removem suas unidades_leituras" ON public.unidades_leituras;
DROP POLICY IF EXISTS "unidades_leituras_select_policy" ON public.unidades_leituras;
DROP POLICY IF EXISTS "unidades_leituras_insert_policy" ON public.unidades_leituras;
DROP POLICY IF EXISTS "unidades_leituras_update_policy" ON public.unidades_leituras;
DROP POLICY IF EXISTS "unidades_leituras_delete_policy" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Enable update for all users" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Permitir tudo para authenticated" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Permitir tudo para public" ON public.unidades_leituras;
DROP POLICY IF EXISTS "Public access" ON public.unidades_leituras;

-- Políticas Seguras: unidades_leituras
-- Exige simultaneamente leiturista_id = auth.uid() E condominios.user_id = auth.uid()
CREATE POLICY "unidades_leituras_select_policy"
  ON public.unidades_leituras FOR SELECT
  TO authenticated
  USING (
    leiturista_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id::text = unidades_leituras.condominio_nome
        AND condominios.user_id = auth.uid()
    )
  );

CREATE POLICY "unidades_leituras_insert_policy"
  ON public.unidades_leituras FOR INSERT
  TO authenticated
  WITH CHECK (
    leiturista_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id::text = unidades_leituras.condominio_nome
        AND condominios.user_id = auth.uid()
    )
  );

CREATE POLICY "unidades_leituras_update_policy"
  ON public.unidades_leituras FOR UPDATE
  TO authenticated
  USING (
    leiturista_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id::text = unidades_leituras.condominio_nome
        AND condominios.user_id = auth.uid()
    )
  )
  WITH CHECK (
    leiturista_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id::text = unidades_leituras.condominio_nome
        AND condominios.user_id = auth.uid()
    )
  );

CREATE POLICY "unidades_leituras_delete_policy"
  ON public.unidades_leituras FOR DELETE
  TO authenticated
  USING (
    leiturista_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.condominios
      WHERE condominios.id::text = unidades_leituras.condominio_nome
        AND condominios.user_id = auth.uid()
    )
  );


-- --------------------------------------------------------------------
-- 5. TABELA: leituras_detalhes
-- --------------------------------------------------------------------
ALTER TABLE public.leituras_detalhes ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas existentes e permissivas
DROP POLICY IF EXISTS "Usuários leem suas leituras_detalhes" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Usuários inserem suas leituras_detalhes" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Usuários editam suas leituras_detalhes" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Usuários removem suas leituras_detalhes" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "leituras_detalhes_select_policy" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "leituras_detalhes_insert_policy" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "leituras_detalhes_update_policy" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "leituras_detalhes_delete_policy" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Enable update for all users" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Enable delete for all users" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Permitir tudo para authenticated" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Permitir tudo para public" ON public.leituras_detalhes;
DROP POLICY IF EXISTS "Public access" ON public.leituras_detalhes;

-- Políticas Seguras: leituras_detalhes (isoladas por leiturista_id = auth.uid())
CREATE POLICY "leituras_detalhes_select_policy"
  ON public.leituras_detalhes FOR SELECT
  TO authenticated
  USING (leiturista_id = auth.uid());

CREATE POLICY "leituras_detalhes_insert_policy"
  ON public.leituras_detalhes FOR INSERT
  TO authenticated
  WITH CHECK (leiturista_id = auth.uid());

CREATE POLICY "leituras_detalhes_update_policy"
  ON public.leituras_detalhes FOR UPDATE
  TO authenticated
  USING (leiturista_id = auth.uid())
  WITH CHECK (leiturista_id = auth.uid());

CREATE POLICY "leituras_detalhes_delete_policy"
  ON public.leituras_detalhes FOR DELETE
  TO authenticated
  USING (leiturista_id = auth.uid());


-- --------------------------------------------------------------------
-- 6. TABELA: profiles (Permanecem inalteradas as políticas existentes)
-- --------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------
-- 7. TABELA: app_feedbacks
-- --------------------------------------------------------------------
ALTER TABLE public.app_feedbacks ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas existentes
DROP POLICY IF EXISTS "Enable read access for all users" ON public.app_feedbacks;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.app_feedbacks;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.app_feedbacks;
DROP POLICY IF EXISTS "feedbacks_insert_policy" ON public.app_feedbacks;
DROP POLICY IF EXISTS "feedbacks_select_policy" ON public.app_feedbacks;
DROP POLICY IF EXISTS "app_feedbacks_insert_policy" ON public.app_feedbacks;

-- Política Segura: Permite apenas INSERT para usuários (anon e authenticated)
-- Nenhum SELECT / UPDATE / DELETE é permitido a usuários comuns.
CREATE POLICY "app_feedbacks_insert_policy"
  ON public.app_feedbacks FOR INSERT
  TO public
  WITH CHECK (true);
