  const limparCardUnidadeAposSalvar = async (unidadeId) => {
    const tipoServico = tipoMedicaoAtivo.toUpperCase();
    const servicoKey = tipoMedicaoAtivo.toLowerCase();

    localStorage.removeItem(`valor_${leitura.id}_${unidadeId}_${tipoMedicaoAtivo}`);
    localStorage.removeItem(`valor_${leitura.id}_${unidadeId}_${tipoServico}`);
    localStorage.removeItem(`concluido_${leitura.id}_${unidadeId}_${servicoKey}`);
    localStorage.removeItem(`concluido_${leitura.id}_${unidadeId}_${tipoServico}`);

    try {
      const safeCondName = sanitizeName(leitura.nome);
      const pastaCondominio = `FastLeituras/${safeCondName}`;
      const fileName = `Apto${unidadeId}_${tipoServico}.jpg`;
      await Filesystem.deleteFile({
        path: `${pastaCondominio}/${fileName}`,
        directory: Directory.Cache,
      });
    } catch {
      // Foto de preview pode já ter sido removida
    }

    // Zera URI/base64 da foto e valor do ciclo atual em memória
    setFotosCapturadas((prev) => {
      const novo = { ...prev };
      if (novo[unidadeId]) {
        novo[unidadeId] = { ...novo[unidadeId], [tipoMedicaoAtivo]: null };
        const temFotoRestante = Object.values(novo[unidadeId]).some((v) => v != null && v !== '');
        if (!temFotoRestante) delete novo[unidadeId];
      }
      return novo;
    });

    setConcluidosMemoria((prev) => {
      const novo = { ...prev };
      if (novo[unidadeId]) {
        delete novo[unidadeId][servicoKey];
        delete novo[unidadeId][tipoServico];
        if (Object.keys(novo[unidadeId]).length === 0) delete novo[unidadeId];
      }
      return novo;
    });

    setLeiturasValores((prev) => {
      const novo = { ...prev };
      if (novo[unidadeId]) {
        novo[unidadeId] = { ...novo[unidadeId], [tipoMedicaoAtivo]: null };
        const temValorRestante = Object.values(novo[unidadeId]).some((v) => v != null && v !== '');
        if (!temValorRestante) delete novo[unidadeId];
      }
      return novo;
    });

    setLeituraAnteriorAtiva(null);
    setPreviewSessionKey((k) => k + 1);
  };

      // Obtém usuário autenticado
      let activeUserId = 'cf720ead-721b-4aa5-b505-9a90ce9202d7';
      if (supabase) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) activeUserId = user.id;
        } catch {
          // Mantém fallback seguro
        }
      }

      const payload = {
        condominio_id: condId,
        condominio_nome: leitura.nome,
        unidade_id: unidadeId,
        servico: tipoMedicaoAtivo.toUpperCase(),
        leitura_atual: valorNumerico,
        leiturista_id: activeUserId,
        data_leitura: new Date().toISOString(),
        fileName: localFileName
      };

      // OFFLINE-FIRST: enfileira leitura (foto) para sync sem bloquear a UI
      const enfileirado = await salvarLeituraOffline(payload, null, localFileName);
      if (!enfileirado) {
        throw new Error('Falha ao enfileirar leitura para sincronização offline.');
      }
  // Reset do estado ativo/temporário das unidades do condomínio atual (encerramento do ciclo)
  const resetarEstadoLeiturasAtivas = async (condominioId) => {
    if (!condominioId) return;

      // 1. Limpa o estado ativo dos cards em memória
      setFotosCapturadas({});
      setConcluidosMemoria({});
      setLeiturasValores({});

      // 2. Limpa cache e chaves locais temporárias relacionadas ao ciclo ativo deste condomínio
      // (Preserva o banco de dados Supabase e registros sincronizados intactos)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          if (
            key.startsWith(`valor_${condominioId}_`) ||
            key.startsWith(`concluido_${condominioId}_`) ||
            key.startsWith(`temp_leituras_${condominioId}`) ||
            key.startsWith(`fotos_temp_${condominioId}`)
          ) {
            keysToRemove.push(key);
          }
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      // 3. Remove arquivos temporários de fotos locais do ciclo
      try {
        const safeCondName = sanitizeName(leitura.nome);
        const pastaCondominio = `FastLeituras/${safeCondName}`;
        
        await Filesystem.rmdir({
          path: pastaCondominio,
          directory: Directory.Cache,
          recursive: true
        });
      } catch (fsErr) {

      // 3.5. Limpa cache legado na raiz se existir
      try {
        const filesAntigos = await StorageService.listFiles(`leitura_foto_${condominioId}_`);
        for (const file of filesAntigos) {
          await StorageService.deleteFile(file);
        }
      } catch (fsErr) {}

    }
  };

  const handleExportar = () => {
    // 1. Validação Pré-Envio (Trava de Segurança Crítica)
    for (const apto of listaCompleta) {
      const fotoServicos = fotosCapturadas[apto] || {};
      const concluidoServicos = concluidosMemoria[apto] || {};
      const valorServicos = leiturasValores[apto] || {};

      const servicosComRegistro = new Set([
        ...Object.keys(fotoServicos),
        ...Object.keys(concluidoServicos)
      ]);

      for (const servico of servicosComRegistro) {
        const valor = valorServicos[servico];
        if (valor === undefined || valor === null || String(valor).trim() === '') {
          alert(`Atenção: O apartamento ${apto} possui foto ou registro mas está sem a leitura digitada. Preencha antes de enviar!`);
          return; // Bloqueia o envio
        }
      }
    }

    // 2. Análise Automática de Utilitários (Offline-First UX)
    const tipo = String(leitura?.tipoLeitura || leitura?.tipo_leitura || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (tipo.includes('somente agua') || tipo === 'agua') {
      executeExport('agua');
    } else if (tipo.includes('somente gas') || tipo === 'gas') {
      executeExport('gas');
    } else if (tipo.includes('energia')) {
      executeExport('energia');
    } else {
      // Caso Misto (Água e Gás) ou indefinido, abre o modal de opções
      setIsExportModalOpen(true);
    // Suporta 'agua', 'gas', 'energia', 'todos' ou faz fallback para a aba ativa
    // 1. Confirmação Elegante de Envio
    
    const mensagemConfirmacao = `Confirmar envio de ${nomeAmigavel}? Esta ação enviará os dados para o WhatsApp.`;
    
      mensagemConfirmacao, 
      // 1. Sincronização Cirúrgica de Histórico no Supabase (Unidades Leituras)
      if (condId && supabase) {
          const storageAnterior = localStorage.getItem(`leituras_anteriores_${condId}`);
          let listaDeUnidades = [];
          if (storageAnterior) {
            listaDeUnidades = JSON.parse(storageAnterior);
          } else {
            listaDeUnidades = unidadesCarregadas.map(u => ({
              unidade: String(u.unidade || u.nome || u).trim(),
              leitura_anterior: 0,
              leitura_anterior_gas: 0
            }));
          }
          const payloadLote = [];
          const cacheAtualizado = [];
          listaDeUnidades.forEach(unidade => {
            const apString = String(unidade.unidade).trim();
            const valAtualAgua = leiturasValores[`${apString}_agua`];
            const valAtualGas = leiturasValores[`${apString}_gas`];
            
            // O valor digitado agora vira a base oficial no banco
            const novaLeituraAnterior = (valAtualAgua !== undefined && valAtualAgua !== null && valAtualAgua !== '') 
              ? Number(valAtualAgua) 
              : unidade.leitura_anterior;

            const novaLeituraAnteriorGas = (valAtualGas !== undefined && valAtualGas !== null && valAtualGas !== '') 
              ? Number(valAtualGas) 
              : unidade.leitura_anterior_gas;

            payloadLote.push({
              condominio_id: condId,
              unidade: apString,
              leitura_anterior: novaLeituraAnterior,
              leitura_anterior_gas: novaLeituraAnteriorGas,
              updated_at: new Date().toISOString()
            });
            cacheAtualizado.push({
              ...unidade,
              leitura_anterior: novaLeituraAnterior,
              leitura_anterior_gas: novaLeituraAnteriorGas
            });
          });
          if (payloadLote.length > 0) {
            const { error: upsertErr } = await supabase
              .from('unidades_leituras')
              .upsert(payloadLote, { onConflict: 'condominio_id,unidade' });
              
            if (upsertErr) {
              console.error("Erro ao sincronizar leituras com o Supabase:", upsertErr);
              // Atualização do Cache Local (LocalStorage) imediatamente após o sucesso
              localStorage.setItem(`leituras_anteriores_${condId}`, JSON.stringify(cacheAtualizado));
        } catch (errSyncHist) {
          console.error("Falha ao salvar histórico no Supabase:", errSyncHist);
        leiturasValores
      alert('Ocorreu um erro ao salvar as leituras. Tente novamente.');
        // O cache local recebe as unidadesAtualizadas com o histórico renovado
        // Sincronização Obrigatória (Supabase): Envia payload de UPDATE para a fila do syncOfflineService
        const payloadAgua = unidadesAtualizadas.map(u => ({
          unidade: u.unidade,
          leitura_anterior: u.leitura_anterior
        }));
        const payloadGas = unidadesAtualizadas.map(u => ({
          unidade: u.unidade,
          leitura_anterior: u.leitura_anterior_gas
        }));
        
        enfileirarLeiturasAnteriores(condId, payloadAgua, 'AGUA');
        enfileirarLeiturasAnteriores(condId, payloadGas, 'GAS');
        console.error('Erro ao atualizar histórico de leituras:', e);
      }

      // 2. Remove as chaves de conclusão locais para a tela permanecer limpa no próximo load
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`concluido_${condId}_`)) {
          keysToRemove.push(key);
        }
      keysToRemove.forEach(k => localStorage.removeItem(k));
                      leituraAnterior={todasLeiturasAnteriores[apto]}
        initialValue={leiturasValores[activeApto]?.[tipoMedicaoAtivo] || ''}
        leituraAnterior={leituraAnteriorAtiva}
          initialValue={leiturasValores[activeApto]?.[tipoMedicaoAtivo] || ''}
          leituraAnterior={leituraAnteriorAtiva}