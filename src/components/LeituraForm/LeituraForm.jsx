import { useRef, useState } from 'react';
import { FileSpreadsheet, Plus } from 'lucide-react';
import { processarPlanilhaExcel } from '../../utils/importExcel';
import Toast, { useToast } from '../Toast/Toast';
import './LeituraForm.css';

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

const LeituraForm = ({ adicionarLeitura, adicionarEmLote, onImportSuccess }) => {
  const [form, setForm] = useState(initialState);
  const fileInputRef = useRef(null);
  const { toast, showToast, dismissToast } = useToast();

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const registros = await processarPlanilhaExcel(file);
    if (!registros.length) {
      showToast('Nenhum condomínio válido encontrado na planilha.', 'error');
      return;
    }

    adicionarEmLote(registros);
    setForm(initialState);
    event.target.value = null;
    if (typeof onImportSuccess === 'function') {
      onImportSuccess(registros.length);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
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
      <section className="form-card">
      <div className="form-heading">
        <h2>Nova leitura</h2>
        <p>Cadastre condomínio, data, apartamentos e valor.</p>
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field field-full">
          <span>Nome do condomínio</span>
          <input name="nome" value={form.nome} onChange={handleChange} placeholder="Ex: Jardim das Flores" />
        </label>

        <label className="field field-full">
          <span>Tipo de Leitura</span>
          <select name="tipoLeitura" value={form.tipoLeitura} onChange={handleChange}>
            <option value="Água e Gás">Água e Gás</option>
            <option value="Somente Água">Somente Água</option>
            <option value="Somente Gás">Somente Gás</option>
            <option value="Energia Elétrica">Energia Elétrica</option>
          </select>
        </label>

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

        <label className="field field-full">
          <span>Dia da Leitura</span>
          <input type="number" name="diaLeitura" min="1" max="31" value={form.diaLeitura} onChange={handleChange} placeholder="ex: 5, 10, 25" />
        </label>

        <label className="field field-full">
          <span>Endereço do Condomínio (Google Maps)</span>
          <input name="endereco" value={form.endereco} onChange={handleChange} placeholder="Rua, Número, Bairro, Cidade" />
        </label>

        <label className="field field-full">
          <span>Instruções de Acesso</span>
          <input name="instrucoesAcesso" value={form.instrucoesAcesso} onChange={handleChange} placeholder="Ex: Senha da portaria: 1234, Interfone 101" />
        </label>

        <label className="field field-full">
          <span>Contato do Síndico / Gestor</span>
          <input name="contatoSindico" value={form.contatoSindico} onChange={handleChange} placeholder="(11) 99999-9999" />
        </label>

        <button type="submit" className="submit-btn">
          <Plus size={18} />
          Adicionar leitura
        </button>

        <div className="import-block">
          <button type="button" className="import-btn" onClick={handleUploadClick}>
            <FileSpreadsheet size={18} />
            Ou importe uma planilha .xlsx
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={handleFileChange}
          />
        </div>
      </form>
      </section>
      <Toast {...toast} onClose={dismissToast} />
    </>
  );
};

export default LeituraForm;
