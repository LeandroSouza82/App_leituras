import { useState } from 'react';
import { CheckCircle2, Loader2, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../services/supabase';
import { FilePickerService } from '../services/filePickerService';
import { Filesystem, Directory } from '@capacitor/filesystem';

const normalizeHeader = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const normalizeText = (value) => String(value ?? '').trim();

const toBoolean = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  return ['sim', 's', '1', 'true', 'yes', 'y'].includes(normalized);
};

const toInteger = (value) => {
  if (value === null || value === undefined || normalizeText(value) === '') {
    return 0;
  }

  const cleaned = String(value).replace(/[^0-9,.-]/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.max(0, Number.parseInt(parsed, 10)) : 0;
};

const parseCondominiosFromRows = (rows) => {
  const normalizedRows = rows
    .map((row) => {
      const normalizedRow = {};
      Object.entries(row || {}).forEach(([key, value]) => {
        normalizedRow[normalizeHeader(key)] = value;
      });
      return normalizedRow;
    })
    .filter((row) => Object.keys(row).length > 0);

  return normalizedRows
    .map((row) => {
      const nome = normalizeText(
        row['nome do condominio'] || row['nome do condominio '] || row['nome'] || ''
      );

      if (!nome) {
        return null;
      }

      const temAgua = toBoolean(
        row['leitura de agua sim nao'] ||
          row['leitura de água sim não'] ||
          row['leitura de agua'] ||
          row['leitura de água'] ||
          row['tem agua'] ||
          row['leitura de água (sim/não)'] ||
          row['leitura de agua (sim/nao)'] ||
          row['agua'] ||
          'Não'
      );

      const temGas = toBoolean(
        row['leitura de gas sim nao'] ||
          row['leitura de gás sim não'] ||
          row['leitura de gas'] ||
          row['leitura de gás'] ||
          row['tem gas'] ||
          row['leitura de gás (sim/não)'] ||
          row['leitura de gas (sim/nao)'] ||
          row['gas'] ||
          'Não'
      );

      const unidades = toInteger(
        row['quantidade de unidades'] ||
          row['qtd unidades'] ||
          row['unidades'] ||
          row['quantidade'] ||
          0
      );

      const valorCobrado = normalizeText(
        row['valor cobrado'] || row['valor'] || row['valor cobrado do condominio'] || '0'
      ) || '0';

      const diaLeitura = normalizeText(
        row['data da leitura'] || row['dia leitura'] || row['dia da leitura'] || row['dia_leitura'] || 'Variado'
      ) || 'Variado';

      const observacoes = normalizeText(
        row['observacoes'] || row['observação'] || row['comentarios'] || row['comentários'] || ''
      );

      const endereco = normalizeText(
        row['endereco'] ||
          row['endereço'] ||
          row['endereco completo'] ||
          row['endereço completo'] ||
          row['logradouro'] ||
          row['rua'] ||
          ''
      );

      return {
        nome,
        tem_agua: temAgua,
        tem_gas: temGas,
        unidades,
        valor_cobrado: valorCobrado,
        dia_leitura: diaLeitura,
        observacoes,
        endereco,
      };
    })
    .filter(Boolean);
};

const syncCondominios = async (listaCondominios) => {
  if (!supabase) {
    throw new Error('Supabase não configurado. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }

  if (!listaCondominios.length) {
    throw new Error('Nenhum condomínio válido foi encontrado na planilha.');
  }

  // Obter todos os condomínios existentes
  const { data: condominiosExistentes, error: fetchError } = await supabase
    .from('condominios')
    .select('id, nome');

  if (fetchError) {
    throw new Error(`Não foi possível verificar condomínios existentes: ${fetchError.message}`);
  }

  // Nomes da nova lista
  const nomesNovos = new Set(listaCondominios.map((c) => c.nome));

  // Encontrar IDs dos condomínios que devem ser deletados
  const idsParaDeletar = (condominiosExistentes || [])
    .filter((c) => !nomesNovos.has(c.nome))
    .map((c) => c.id);

  // Deletar condomínios obsoletos
  if (idsParaDeletar.length > 0) {
    const { error: deleteError } = await supabase
      .from('condominios')
      .delete()
      .in('id', idsParaDeletar);

    if (deleteError) {
      throw new Error(`Não foi possível remover condomínios obsoletos: ${deleteError.message}`);
    }
  }

  // Fazer upsert dos condomínios da planilha
  const { error: upsertError } = await supabase
    .from('condominios')
    .upsert(listaCondominios, { onConflict: 'nome' });

  if (upsertError) {
    throw new Error(`Não foi possível sincronizar os condomínios: ${upsertError.message}`);
  }

  return listaCondominios.length;
};

const ImportadorPlanilha = ({ onImportComplete, onStatusChange }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');

  const emitStatus = (message) => {
    setStatus(message);
    if (onStatusChange) {
      onStatusChange(message);
    }
  };

  const handlePickFile = async () => {
    try {
      setIsProcessing(true);
      emitStatus('Abrindo seletor de arquivos...');

      const fileData = await FilePickerService.pickAndSaveSpreadsheet();

      if (!fileData) {
        setIsProcessing(false);
        emitStatus('');
        return;
      }

      emitStatus(`Processando: ${fileData.name}...`);

      // 1. Ler o arquivo (Base64) que foi salvo localmente
      const fileContents = await Filesystem.readFile({
        path: fileData.path,
        directory: Directory.Data
      });

      // 2. Converter Base64 para Workbook do XLSX
      const workbook = XLSX.read(fileContents.data, { type: 'base64' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      if (!worksheet) {
        throw new Error('A planilha selecionada está vazia ou inválida.');
      }

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
        raw: false,
        blankrows: false,
      });

      const listaCondominios = parseCondominiosFromRows(rows);
      const totalImportado = await syncCondominios(listaCondominios);

      emitStatus(`Sucesso! ${totalImportado} condomínios sincronizados.`);

      if (onImportComplete) {
        onImportComplete(totalImportado);
      }
    } catch (error) {
      console.error('[Importador] Falha:', error);
      emitStatus(error?.message || 'Erro ao importar a planilha. Tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button
        type="button"
        onClick={handlePickFile}
        disabled={isProcessing}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid #dbe4f0',
          background: isProcessing ? '#e5e7eb' : '#1e293b',
          color: '#fff',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          fontWeight: 700,
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          transition: 'all 0.2s'
        }}
      >
        {isProcessing ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <FileSpreadsheet size={18} />}
        {isProcessing ? 'Processando...' : 'Selecionar e Importar Planilha'}
      </button>

      {status && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 10,
            background: status.toLowerCase().includes('sucesso') ? '#ecfdf5' : '#f8fafc',
            color: status.toLowerCase().includes('sucesso') ? '#166534' : '#334155',
            border: `1px solid ${status.toLowerCase().includes('sucesso') ? '#bbf7d0' : '#e2e8f0'}`,
            fontSize: 14,
          }}
        >
          {status.toLowerCase().includes('sucesso') ? <CheckCircle2 size={16} /> : <Upload size={16} />}
          <span>{status}</span>
        </div>
      )}
    </div>
  );
};

export default ImportadorPlanilha;
