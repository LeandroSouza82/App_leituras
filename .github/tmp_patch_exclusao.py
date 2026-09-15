from pathlib import Path

p = Path('src/components/LeituraFotoModal/LeituraFotoModal.jsx')
text = p.read_text(encoding='utf-8')
old = """          ['fila_sync_auto', 'leituras_pendentes'].forEach((key) => {
            const raw = localStorage.getItem(key);
            if (raw) {
              const filaAtual = JSON.parse(raw);
              if (Array.isArray(filaAtual) && filaAtual.length > 0) {
                const filaFiltrada = filaAtual.filter((item) => {
                  const mesmaUnidade = String(item.unidade_id ?? '') === unidadeId || String(item.unidadeId ?? '') === unidadeId;
                  const mesmoServico = (item.servico ?? item.tipoServico ?? '').toUpperCase() === tipoServico;
                  return !(mesmaUnidade && mesmoServico);
                });
                localStorage.setItem(key, JSON.stringify(filaFiltrada));
              }
            }
          });

          if (supabase) {
            await supabase.from('leituras_detalhes').delete().match({
              unidade_id: unidadeId,
              servico: tipoServico,
            });
          }
"""
new = """          const condominioIdAtual = String(leitura?.id ?? leitura?.condominio_id ?? '').trim();
          const condominioNomeAtual = String(leitura?.nome ?? '').trim().toLowerCase();

          ['fila_sync_auto', 'leituras_pendentes'].forEach((key) => {
            const raw = localStorage.getItem(key);
            if (raw) {
              const filaAtual = JSON.parse(raw);
              if (Array.isArray(filaAtual) && filaAtual.length > 0) {
                const filaFiltrada = filaAtual.filter((item) => {
                  const itemCondominioId = String(item.condominio_id ?? item.condominioId ?? '').trim();
                  const itemCondominioNome = String(item.condominio_nome ?? item.condominioNome ?? '').trim().toLowerCase();
                  const mesmoCondominio =
                    (condominioIdAtual && itemCondominioId === condominioIdAtual) ||
                    (condominioNomeAtual && itemCondominioNome === condominioNomeAtual);
                  const mesmaUnidade = String(item.unidade_id ?? '') === unidadeId || String(item.unidadeId ?? '') === unidadeId;
                  const mesmoServico = (item.servico ?? item.tipoServico ?? '').toUpperCase() === tipoServico;
                  return !(mesmoCondominio && mesmaUnidade && mesmoServico);
                });
                localStorage.setItem(key, JSON.stringify(filaFiltrada));
              }
            }
          });

          if (supabase && leitura?.nome) {
            const { data: authData } = await supabase.auth.getUser();
            const userId = authData?.user?.id;
            if (userId) {
              await supabase
                .from('leituras_detalhes')
                .delete()
                .eq('condominio_nome', leitura.nome)
                .eq('leiturista_id', userId)
                .eq('unidade_id', unidadeId)
                .eq('servico', tipoServico);
            }
          }
"""
if text.count(old) != 1:
    raise SystemExit(f'Esperava 1 bloco de exclusao, encontrei {text.count(old)}')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
