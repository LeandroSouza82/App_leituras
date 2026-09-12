import { customAlert, customConfirm, customConfirmDestrutivo } from '../../components/CustomPrompt/CustomPrompt';
import React, { useState, useRef } from 'react';
import { X, Upload, Hash, Plus, Save, Settings2, Trash2, Loader2 } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { FilePickerService } from '../../services/filePickerService';
import * as XLSX from 'xlsx';
import { UCondoImportService } from '../../services/ucondoImportService';
import './ModalGerenciarUnidades.css';

const ModalGerenciarUnidades = ({ isOpen, onClose, condominioId, condominioNome, onUnidadesAtualizadas }) => {
  const [tab, setAba] = useState('importar'); // 'importar' | 'gerar' | 'avulso'
  const [unidadesTemp, setUnidadesTemp] = useState([]);
  const [paresImportados, setParesImportados] = useState([]);
  const [servicoExtraido, setServicoExtraido] = useState(null);
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

  const processarFileData = async (fileData) => {
    try {
      const result = UCondoImportService.analisarPlanilhaCompleta(fileData);
      const pares = result.pares;
      const metadados = result.metadados;

      if (!pares || pares.length === 0) {
        throw new Error('Nenhuma unidade identificada na planilha.');
      }

      setParesImportados(pares);

      const servicoDetectado = metadados?.servico || null;
      setServicoExtraido(servicoDetectado);

      const unicas = pares.map(p => p.unidade);
      setUnidadesTemp(prev => [...new Set([...prev, ...unicas])]);
      const servicoMsg = servicoDetectado ? `\nServiço detectado: ${servicoDetectado}` : '';
      await customAlert(`✅ ${unicas.length} unidades identificadas com sucesso!${servicoMsg}`);
    } catch (err) {
      await customAlert('Não foi possível ler esta planilha. Verifique o formato do arquivo.');
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

        processarFileData(fileContents.data);
      } else {
        if (fileInputRef.current) {
          fileInputRef.current.click();
        }
      }
    } catch (err) {
      await customAlert('Erro ao selecionar planilha: ' + err.message);
      setIsProcessing(false);
    }
  };

  const handleImportarPlanilhaWeb = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const data = await file.arrayBuffer();
      processarFileData(data);
    } catch (err) {
      await customAlert('Não foi possível ler esta planilha. Verifique o formato do arquivo.');
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
      await customAlert('Nenhuma unidade para salvar.');
      return;
    }

    try {
      // Mescla as unidades geradas/manuais com os pares importados (se houver)
      const paresParaSalvar = unidadesTemp.map(nome => {
        const parEncontrado = paresImportados.find(p => p.unidade === nome);
        return {
          unidade: nome,
          leituraAnterior: parEncontrado ? parEncontrado.leituraAnterior : null
        };
      });

      const temLeituraNaPlanilha = paresParaSalvar.some(p => p.leituraAnterior !== null);
      let servicoParaSalvar = servicoExtraido;

      if (temLeituraNaPlanilha && !servicoParaSalvar) {
        await customAlert(
          '⚠️ Não foi possível identificar com segurança se as leituras desta planilha pertencem a Água, Gás ou Energia.\n\nPara importar leituras anteriores, importe uma planilha do uCondo que identifique expressamente o serviço (ex: "Consumo de: Água" ou "Consumo de: Gás").'
        );
        setIsProcessing(false);
        return;
      }

      await UCondoImportService.persistirUnidadesLocal(condominioId, paresParaSalvar, servicoParaSalvar);

      onUnidadesAtualizadas(unidadesTemp);
      await customAlert('✅ Unidades salvas permanentemente no dispositivo!');
      onClose();
    } catch (error) {
      await customAlert('Erro ao persistir dados: ' + error.message);
    }
  };

  const limparLista = async () => {
    if (await customConfirmDestrutivo('Deseja limpar a lista temporária?', 'Limpar Lista', 'Limpar')) {
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
