import React, { useState, useRef } from 'react';
import { X, Upload, Hash, Plus, Save, Settings2, Trash2, Loader2 } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { FilePickerService } from '../../services/filePickerService';
import { salvarArquivoSeguro } from '../../services/filesystemService';
import * as XLSX from 'xlsx';
import { UCondoImportService } from '../../services/ucondoImportService';
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

  const processarWorkbook = (workbook) => {
    try {
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];
      const unicas = UCondoImportService.extrairUnidades(
        XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      );

      if (unicas.length === 0) {
        throw new Error('Nenhuma coluna de unidades identificada na planilha.');
      }

      setUnidadesTemp(prev => [...new Set([...prev, ...unicas])]);
      alert(`✅ ${unicas.length} unidades identificadas com sucesso!`);
    } catch (err) {
      console.error('Erro no processamento da planilha:', err);
      alert('Erro ao processar planilha: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelecionarPlanilha = async () => {
    try {
      setIsProcessing(true);

      if (Capacitor.isNativePlatform()) {
        const fileData = await FilePickerService.pickAndSaveSpreadsheet();
        if (!fileData) {
          setIsProcessing(false);
          return;
        }

        const fileContents = await Filesystem.readFile({
          path: fileData.path,
          directory: Directory.Data
        });

        const workbook = XLSX.read(fileContents.data, { type: 'base64' });
        processarWorkbook(workbook);
      } else {
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
      }
    } catch (err) {
      console.error('Erro ao selecionar planilha:', err);
      alert('Erro ao selecionar planilha: ' + err.message);
      setIsProcessing(false);
    }
  };

  const handleImportarPlanilhaWeb = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      processarWorkbook(workbook);
    } catch (err) {
      alert('Erro ao ler planilha: ' + err.message);
      setIsProcessing(false);
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  const gerarSequencia = () => {
    const novas = [];
    const ini = parseInt(andarInicial);
    const fim = parseInt(andarFinal);
    const qtd = parseInt(unidadesPorAndar);

    for (let andar = ini; andar <= fim; andar++) {
      for (let apto = 1; apto <= qtd; apto++) {
        const andarStr = quatroDigitos ? String(andar).padStart(2, '0') : String(andar);
        const aptoStr = quatroDigitos ? String(apto).padStart(2, '0') : String(apto);

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

  const salvarLocal = async () => {
    if (unidadesTemp.length === 0) {
      alert('Nenhuma unidade para salvar.');
      return;
    }

    try {
      // 1. Salvar no localStorage (Cache Rápido)
      localStorage.setItem(storageKey, JSON.stringify(unidadesTemp));

      // 2. Persistência Permanente no Filesystem (Directory.Data)
      const fileName = `unidades_${condominioId}.json`;
      await salvarArquivoSeguro(fileName, JSON.stringify(unidadesTemp));

      onUnidadesAtualizadas(unidadesTemp);
      alert('✅ Unidades salvas permanentemente no dispositivo!');
      onClose();
    } catch (error) {
      console.error('Erro ao salvar unidades no filesystem:', error);
      alert('Erro ao persistir dados: ' + error.message);
    }
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
            <h3>Configurar Unidades - {condominioNome || 'Condomínio'}</h3>
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
              <input
                type="file"
                ref={fileInputRef}
                hidden
                accept=".xlsx,.xls,.csv"
                onChange={handleImportarPlanilhaWeb}
              />
              <button
                type="button"
                className="btn-action-primary"
                onClick={handleSelecionarPlanilha}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={18} />}
                {isProcessing ? 'Processando...' : 'Selecionar Planilha'}
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
                <input type="number" value={unidadesPorAndar} onChange={e => setUnidadesPorAndar(e.target.value)} />
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
              {unidadesTemp.slice(0, 100).map((u, i) => <span key={i} className="unit-tag">{u}</span>)}
              {unidadesTemp.length > 100 && (
                <span className="unit-tag" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                  +{unidadesTemp.length - 100} unidades...
                </span>
              )}
            </div>
          </div>
        </div>

        <footer className="manage-units-footer">
          <button className="btn-save" onClick={salvarLocal} disabled={unidadesTemp.length === 0}>
            <Save size={18} /> Salvar Offline ({unidadesTemp.length})
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ModalGerenciarUnidades;
