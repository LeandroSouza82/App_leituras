import React, { useState, useRef } from 'react';
import { X, Upload, Hash, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import './ModalGerenciarUnidades.css';

const ModalGerenciarUnidades = ({ isOpen, onClose, condominioId, condominioNome, onUnidadesAtualizadas }) => {
  const [tab, setAba] = useState('importar'); // 'importar' | 'gerar' | 'avulso'
  const [unidadesTemp, setUnidadesTemp] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  // Estados do Gerador por Sequência
  const [prefixo, setPrefixo] = useState('A');
  const [andarInicial, setAndarInicial] = useState(1);
  const [andarFinal, setAndarFinal] = useState(11);
  const [unidadesPorAndar, setUnidadesPorAndar] = useState(10);
  const [quatroDigitos, setQuatroDigitos] = useState(true);

  // Estado para unidade avulsa
  const [avulsa, setAvulsa] = useState('');

  if (!isOpen) return null;

  const storageKey = `unidades_${condominioId}`;

  const handleImportarPlanilha = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (jsonData.length === 0) throw new Error('Planilha vazia');

      // Busca cabeçalho
      const headers = jsonData[0].map(h => String(h).toLowerCase());
      const colIndex = headers.findIndex(h => h.includes('unidade'));

      let extraidas = [];
      if (colIndex !== -1) {
        // Pega da coluna identificada
        extraidas = jsonData.slice(1).map(row => row[colIndex]).filter(Boolean);
      } else {
        // Varre todas as células em busca de padrões
        jsonData.forEach(row => {
          row.forEach(cell => {
            const val = String(cell);
            if (val.match(/^[A-Za-z0-9]+-\d+/)) extraidas.push(val);
          });
        });
      }

      const únicas = Array.from(new Set(extraidas.map(u => String(u).trim())));
      setUnidadesTemp(prev => [...new Set([...prev, ...únicas])]);
      alert(`${únicas.length} unidades identificadas!`);
    } catch (err) {
      alert('Erro ao ler planilha: ' + err.message);
    } finally {
      setIsProcessing(false);
      event.target.value = '';
    }
  };

  const gerarSequencia = () => {
    const novas = [];
    for (let andar = parseInt(andarInicial); andar <= parseInt(andarFinal); andar++) {
      for (let apto = 1; apto <= parseInt(unidadesPorLine); apto++) {
        const andarStr = quatroDigitos ? String(andar).padStart(2, '0') : String(andar);
        const aptoStr = String(apto).padStart(2, '0');
        novas.push(`${prefixo}-${andarStr}${aptoStr}`);
      }
    }
    setUnidadesTemp(prev => [...new Set([...prev, ...novas])]);
  };

  const adicionarAvulsa = () => {
    if (!avulsa.trim()) return;
    setUnidadesTemp(prev => [...new Set([...prev, avulsa.trim().toUpperCase()])]);
    setAvulsa('');
  };

  const salvarLocal = () => {
    if (unidadesTemp.length === 0) {
      alert('Nenhuma unidade para salvar.');
      return;
    }
    localStorage.setItem(storageKey, JSON.stringify(unidadesTemp));
    onUnidadesAtualizadas(unidadesTemp);
    alert('Unidades salvas offline com sucesso!');
    onClose();
  };

  const limparLista = () => {
    if (window.confirm('Deseja limpar a lista temporária?')) {
      setUnidadesTemp([]);
    }
  };

  return (
    <div className="manage-units-overlay" onClick={onClose}>
      <div className="manage-units-container" onClick={(e) => e.stopPropagation()}>
        <header className="manage-units-header">
          <div className="manage-units-title">
            <Settings2 size={20} />
            <h3>Configurar Unidades</h3>
          </div>
          <button className="btn-close" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="manage-units-nav">
          <button className={tab === 'importar' ? 'active' : ''} onClick={() => setAba('importar')}>Importar</button>
          <button className={tab === 'gerar' ? 'active' : ''} onClick={() => setAba('gerar')}>Gerador</button>
          <button className={tab === 'avulso' ? 'active' : ''} onClick={() => setAba('avulso')}>Manual</button>
        </div>

        <div className="manage-units-body">
          {tab === 'importar' && (
            <div className="tab-content">
              <p>Importe as unidades diretamente de uma planilha do uCondo ou similar.</p>
              <input type="file" ref={fileInputRef} hidden accept=".xlsx,.xls,.csv" onChange={handleImportarPlanilha} />
              <button className="btn-action-primary" onClick={() => fileInputRef.current.click()} disabled={isProcessing}>
                <Upload size={18} /> {isProcessing ? 'Processando...' : 'Selecionar Planilha'}
              </button>
            </div>
          )}

          {tab === 'gerar' && (
            <div className="tab-content grid-form">
              <div className="field">
                <label>Torre/Prefixo</label>
                <input type="text" value={prefixo} onChange={e => setPrefixo(e.target.value.toUpperCase())} placeholder="Ex: A" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label>Andar Inicial</label>
                  <input type="number" value={andarInicial} onChange={e => setAndarInicial(e.target.value)} />
                </div>
                <div className="field">
                  <label>Andar Final</label>
                  <input type="number" value={andarFinal} onChange={e => setAndarFinal(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Unidades por Andar</label>
                <input type="number" value={unidadesPorAndar} onChange={e => setAndarFinal(e.target.value)} />
              </div>
              <label className="checkbox-field">
                <input type="checkbox" checked={quatroDigitos} onChange={e => setQuatroDigitos(e.target.checked)} />
                Padronizar 4 dígitos (0101)
              </label>
              <button className="btn-action-primary" onClick={gerarSequencia}>
                <Hash size={18} /> Gerar Sequência
              </button>
            </div>
          )}

          {tab === 'avulso' && (
            <div className="tab-content">
              <div className="field">
                <label>Nova Unidade</label>
                <div className="input-group">
                  <input type="text" value={avulsa} onChange={e => setAvulsa(e.target.value)} placeholder="Ex: A-COB01" />
                  <button className="btn-add" onClick={adicionarAvulsa}><Plus size={20} /></button>
                </div>
              </div>
            </div>
          )}

          <div className="units-preview">
            <div className="preview-header">
              <span>{unidadesTemp.length} unidades na lista</span>
              {unidadesTemp.length > 0 && <button className="btn-clear" onClick={limparLista}><Trash2 size={14} /></button>}
            </div>
            <div className="preview-list">
              {unidadesTemp.map((u, i) => <span key={i} className="unit-tag">{u}</span>)}
            </div>
          </div>
        </div>

        <footer className="manage-units-footer">
          <button className="btn-save" onClick={salvarLocal}>
            <Save size={18} /> Salvar Offline
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ModalGerenciarUnidades;
