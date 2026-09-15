from pathlib import Path

p = Path('src/components/BackupFotosMenu/BackupFotosMenu.jsx')
text = p.read_text(encoding='utf-8')
old = """      await sincronizarFilaEmBackground();
      
      if (activeTab === 'offline') {
        await carregarPastas();
      } else {
        await handleSearchOnline();
      }

      await customAlert('Sincronização concluída com sucesso!');
"""
new = """      await sincronizarFilaEmBackground();

      const filaRestante = readFilaSync();
      
      if (activeTab === 'offline') {
        await carregarPastas();
      } else {
        await handleSearchOnline();
      }

      if (filaRestante.length > 0) {
        await customAlert(`Sincronização parcial: ${filaRestante.length} item(ns) ainda pendente(s). Eles serão mantidos com segurança para uma nova tentativa.`);
      } else {
        await customAlert('Sincronização concluída com sucesso!');
      }
"""
if text.count(old) != 1:
    raise SystemExit(f'Esperava 1 bloco de sincronizacao manual, encontrei {text.count(old)}')
p.write_text(text.replace(old, new, 1), encoding='utf-8')
