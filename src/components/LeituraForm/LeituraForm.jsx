import { customAlert, customConfirm } from '../../components/CustomPrompt/CustomPrompt';
import { useRef, useState } from 'react';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { processarPlanilhaExcel } from '../../utils/importExcel';
import Toast, { useToast } from '../Toast/Toast';
import ImportadorPlanilha from '../ImportadorPlanilha';
import './LeituraForm.css';

import { UCondoImportService } from '../../services/ucondoImportService';
import { supabase } from '../../services/supabase';

const initialState = {
  nome: '',
  apartamentos: '',
  valor: '',
  diaLeitura: '',
  tipoLeitura: 'Água e Gás',
  endereco: '',
  instrucoesAcesso: '',
  contatoSindico: '',
};

const parseCurrencyToNumber = (value) => {
  if (typeof value !== 'string') {
    return 0;
  }

  const normalized = value
    .replace(/\s/g, '')
    .replace(/^R\$\s?/, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');

  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};

const formatCurrencyDisplay = (value) => {
  const amount = typeof value === 'number' ? value : parseCurrencyToNumber(value);
  if (!amount && amount !== 0) {
    return '';
  }

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

const stripCurrencyFormatting = (value) =>
  value
    .replace(/\s/g, '')
    .replace(/^R\$\s?/, '')
    .replace(/\./g, '')
    .replace(/,/g, ',');

const LeituraForm = ({ adicionarLeitura, adicionarEmLote, onImportSuccess, onRecarregarCondominios }) => {
  const [form, setForm] = useState(initialState);
  const fileInputRef = useRef(null);
  const { toast, showToast, dismissToast } = useToast();

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const buffer = await file.arrayBuffer();

      // 1. Obter condomínios existentes no Supabase para verificação de duplicidade
      let condominiosExistentes = [];
      if (supabase) {
        try {
          const { data: dbData } = await supabase.from('condominios').select('id, nome');
          condominiosExistentes = dbData || [];
        } catch (_) {}
      }

      // 2. Processamento inteligente uCondo
      try {
        const resultado = await UCondoImportService.processarPlanilhaCadastro(
          file.name,
          buffer,
          condominiosExistentes
        );

        if (resultado?.cancelado) {
          return;
        }

        if (resultado?.tipo === 'atualizado') {
          await customAlert(`✅ Sucesso! ${resultado.totalUnidades} unidades atualizadas no condomínio "${resultado.condominio.nome}".`);
          showToast(`Unidades do condomínio "${resultado.condominio.nome}" atualizadas com sucesso!`, 'success');
          if (typeof onRecarregarCondominios === 'function') onRecarregarCondominios();
          if (typeof onImportSuccess === 'function') onImportSuccess(1);
          setForm(initialState);
          return;
        }

        if (resultado?.tipo === 'criado') {
          await customAlert(`✅ Sucesso! Condomínio "${resultado.condominio.nome}" criado com ${resultado.totalUnidades} unidades importadas.`);
          showToast(`Condomínio "${resultado.condominio.nome}" criado com sucesso!`, 'success');
          if (typeof onRecarregarCondominios === 'function') onRecarregarCondominios();
          if (typeof onImportSuccess === 'function') onImportSuccess(1);
          setForm(initialState);
          return;
        }
      } catch (uCondoErr) {
      }

      // 3. Fallback: Lista geral de condomínios
      const registros = await processarPlanilhaExcel(file);
      if (!registros.length) {
        await customAlert('Erro na importação: Nenhum condomínio ou unidade válida encontrada na planilha.');
        showToast('Nenhum condomínio válido encontrado na planilha.', 'error');
        return;
      }

      adicionarEmLote(registros);
      setForm(initialState);
      await customAlert(`✅ Sucesso! ${registros.length} condomínios importados da planilha.`);
      if (typeof onImportSuccess === 'function') {
        onImportSuccess(registros.length);
      }
    } catch (err) {
      await customAlert('Erro na importação: ' + (err?.message || 'Arquivo incompatível'));
      showToast('Erro ao importar planilha: ' + (err?.message || 'Arquivo incompatível'), 'error');
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportSuccess = (total) => {
    showToast(`${total} condomínios importados e sincronizados com sucesso!`, 'success');
    if (typeof onRecarregarCondominios === 'function') {
      onRecarregarCondominios();
    }
    if (typeof onImportSuccess === 'function') {
      onImportSuccess(total);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === 'valor') {
      const cleanValue = value.replace(/[^0-9\.,]/g, '');
      setForm((previous) => ({ ...previous, valor: cleanValue }));
      return;
    }

    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleValorBlur = () => {
    if (!form.valor) {
      return;
    }

    setForm((previous) => ({
      ...previous,
      valor: formatCurrencyDisplay(previous.valor),
    }));
  };

  const handleValorFocus = () => {
    setForm((previous) => ({
      ...previous,
      valor: stripCurrencyFormatting(previous.valor),
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.nome.trim() || !form.apartamentos || !form.valor || !form.diaLeitura) {
      showToast('Preencha todos os campos antes de adicionar uma leitura.', 'error');
      return;
    }

    const valorNumerico = parseCurrencyToNumber(form.valor);
    if (!valorNumerico && form.valor.trim() !== '0') {
      showToast('Informe um valor válido para a leitura.', 'error');
      return;
    }

    adicionarLeitura({
      nome: form.nome.trim(),
      apartamentos: form.apartamentos,
      valor: valorNumerico,
      diaLeitura: form.diaLeitura,
      tipoLeitura: form.tipoLeitura,
      endereco: form.endereco.trim(),
      instrucoesAcesso: form.instrucoesAcesso.trim(),
      contatoSindico: form.contatoSindico.trim(),
    });

    setForm(initialState);
  };

  return (
    <>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: 'var(--primary-color)', padding: '24px 16px 16px' }}>
        <h2 style={{ color: '#ffffff', margin: '0 0 4px', fontSize: '1.25rem' }}>Nova leitura</h2>
        <p style={{ color: 'rgba(255, 255, 255, 0.8)', margin: 0, fontSize: '0.9rem' }}>Cadastre condomínio, data, apartamentos e valor.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', paddingBottom: '100px' }}>
        <div style={{ width: 'min(100%, 760px)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* ── CARD PRINCIPAL ── */}
          <section className="form-card">
            <form className="form-grid" onSubmit={handleSubmit}>

              {/* SEÇÃO 1: Dados Básicos */}
              <div className="form-section">
                <p className="form-section-title">Dados básicos</p>

                <label className="field field-full">
                  <span>Nome do condomínio</span>
                  <input name="nome" value={form.nome} onChange={handleChange} placeholder="Ex: Jardim das Flores" />
                </label>

                <label className="field field-full">
                  <span>Tipo de leitura</span>
                  <select name="tipoLeitura" value={form.tipoLeitura} onChange={handleChange}>
                    <option value="Água e Gás">Água e Gás</option>
                    <option value="Somente Água">Somente Água</option>
                    <option value="Somente Gás">Somente Gás</option>
                    <option value="Energia Elétrica">Energia Elétrica</option>
                  </select>
                </label>

                <div className="form-row-half">
                  <label className="field">
                    <span>Apartamentos</span>
                    <input type="number" name="apartamentos" min="1" value={form.apartamentos} onChange={handleChange} placeholder="0" />
                  </label>

                  <label className="field">
                    <span>Valor</span>
                    <input
                      type="text"
                      name="valor"
                      value={form.valor}
                      onChange={handleChange}
                      onFocus={handleValorFocus}
                      onBlur={handleValorBlur}
                      placeholder="R$ 0,00"
                    />
                  </label>
                </div>

                <label className="field field-full">
                  <span>Dia da leitura</span>
                  <input type="number" name="diaLeitura" min="1" max="31" value={form.diaLeitura} onChange={handleChange} placeholder="Ex: 5, 10, 25" />
                </label>
              </div>

              {/* DIVISÓRIA */}
              <div className="form-divider" />

              {/* SEÇÃO 2: Acesso e Contato */}
              <div className="form-section">
                <p className="form-section-title">Acesso e contato</p>

                <label className="field field-full">
                  <span>Endereço (Google Maps)</span>
                  <input name="endereco" value={form.endereco} onChange={handleChange} placeholder="Rua, número, bairro, cidade" />
                </label>

                <label className="field field-full">
                  <span>Instruções de acesso</span>
                  <input name="instrucoesAcesso" value={form.instrucoesAcesso} onChange={handleChange} placeholder="Ex: Senha da portaria: 1234" />
                </label>

                <label className="field field-full">
                  <span>Contato do síndico / gestor</span>
                  <input name="contatoSindico" value={form.contatoSindico} onChange={handleChange} placeholder="(11) 99999-9999" />
                </label>
              </div>

              {/* BOTÃO SUBMIT DENTRO DO CARD */}
              <button type="submit" className="submit-btn">
                <Plus size={18} />
                Adicionar leitura
              </button>

            </form>
          </section>

          {/* ── BOTÃO DE PLANILHA FORA DO CARD ── */}
          <ImportadorPlanilha
            onImportComplete={handleImportSuccess}
            onStatusChange={(message) => {
              if (!message.toLowerCase().includes('processando')) {
                if (message.toLowerCase().includes('sucesso')) {
                  showToast(message, 'success');
                }
              }
            }}
          />

        </div>
      </div>

      <Toast {...toast} onClose={dismissToast} />
    </>
  );
};

export default LeituraForm;
