import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import Toast, { useToast } from '../Toast/Toast';
import { supabase } from '../../services/supabaseClient';
import './EditarCondominioModal.css';

const parseCurrencyToNumber = (value) => {
  if (typeof value !== 'string') {
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
  }

  const normalized = value
    .replace(/\s/g, '')
    .replace(/^R\$\s?/, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');

  if (!normalized) {
    return NaN;
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
};

const buildFormState = (condominio) => ({
  nome: condominio?.nome || '',
  tipoLeitura: condominio?.tipoLeitura || 'Água e Gás',
  diaLeitura: condominio?.diaLeitura ?? '',
  apartamentos: condominio?.apartamentos ?? '',
  valor: condominio?.valor ?? '',
  endereco: condominio?.endereco || '',
  instrucoesAcesso: condominio?.instrucoesAcesso || '',
  contatoSindico: condominio?.contatoSindico || '',
  latitude: condominio?.latitude || null,
  longitude: condominio?.longitude || null,
});

const EditarCondominioModal = ({ isOpen, onClose, condominio, onSave }) => {
  const [form, setForm] = useState(() => buildFormState(condominio));
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setForm(buildFormState(condominio));
      setFeedback(null);
    }
  }, [isOpen, condominio]);

  if (!isOpen || !condominio) {
    return <Toast {...toast} onClose={dismissToast} />;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleCancelar = () => {
    setFeedback(null);
    onClose();
  };

  const handleLimparGps = async () => {
    if (!confirm('Deseja remover a localização GPS salva deste condomínio? O app voltará a usar o endereço digitado.')) {
      return;
    }

    // 1. Limpeza otimista na tela atual
    setForm((prev) => ({ ...prev, latitude: null, longitude: null }));

    // 2. Aciona o fluxo Offline-First do useLeituras (que já grava no cache local e em background)
    if (onSave) {
      await onSave(condominio.id, { latitude: null, longitude: null });
    }

    // 3. Feedback visual elegante
    showToast('GPS removido com sucesso. As alterações foram salvas localmente.');
  };

  const handleSalvar = async (event) => {
    event.preventDefault();

    if (!form.nome?.trim()) {
      setFeedback({ tipo: 'erro', mensagem: 'Informe o nome do condomínio.' });
      return;
    }

    const camposNumericos = [
      { nome: 'apartamentos', rotulo: 'apartamentos', valor: form.apartamentos },
      { nome: 'valor', rotulo: 'valor', valor: form.valor },
      { nome: 'diaLeitura', rotulo: 'dia da leitura', valor: form.diaLeitura },
    ];
    const valorNumerico = parseCurrencyToNumber(form.valor);
    const campoNumericoInvalido = camposNumericos.find(({ nome, valor }) => {
      const valorConvertido = nome === 'valor' ? valorNumerico : Number(valor);

      return (
        valor === '' ||
        valor === null ||
        valor === undefined ||
        Number.isNaN(valorConvertido) ||
        valorConvertido < 0
      );
    });

    if (campoNumericoInvalido) {
      setFeedback({
        tipo: 'erro',
        mensagem: `Informe um ${campoNumericoInvalido.rotulo} válido (maior ou igual a zero).`,
      });
      return;
    }

    const dadosAtualizados = {
      nome: form.nome.trim(),
      tipoLeitura: form.tipoLeitura,
      diaLeitura: String(form.diaLeitura).trim(),
      apartamentos: Number(form.apartamentos),
      valor: valorNumerico,
      endereco: form.endereco.trim(),
      instrucoesAcesso: form.instrucoesAcesso.trim(),
      contatoSindico: form.contatoSindico.trim(),
    };

    setSalvando(true);
    setFeedback(null);

    const sucesso = await onSave(condominio.id, dadosAtualizados);
    setSalvando(false);

    if (sucesso === false) {
      setFeedback({ tipo: 'erro', mensagem: 'Não foi possível salvar o condomínio no Supabase.' });
      return;
    }

    showToast('Condomínio atualizado com sucesso!');
    onClose();
  };

  return (
    <>
      <div className="editar-condominio-overlay" onClick={handleCancelar}>
        <div className="editar-condominio-container" onClick={(event) => event.stopPropagation()}>
        <div className="editar-condominio-header">
          <h2>Editar Condomínio</h2>
          <button type="button" className="close-btn" onClick={handleCancelar} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <form className="editar-condominio-form" onSubmit={handleSalvar}>
          {feedback && (
            <div className={`form-feedback form-feedback-${feedback.tipo}`}>{feedback.mensagem}</div>
          )}

          <label className="field field-full">
            <span>Nome do condomínio</span>
            <input name="nome" value={form.nome} onChange={handleChange} placeholder="Ex: Jardim das Flores" />
          </label>

          <label className="field field-full">
            <span>Tipo de Medição</span>
            <select name="tipoLeitura" value={form.tipoLeitura} onChange={handleChange}>
              <option value="Água e Gás">Água e Gás</option>
              <option value="Somente Água">Somente Água</option>
              <option value="Somente Gás">Somente Gás</option>
              <option value="Energia Elétrica">Energia Elétrica</option>
            </select>
          </label>

          <label className="field">
            <span>Dia da Leitura</span>
            <input type="number" name="diaLeitura" min="1" max="31" value={form.diaLeitura} onChange={handleChange} placeholder="ex: 5" />
          </label>

          <label className="field">
            <span>Apartamentos</span>
            <input type="number" name="apartamentos" min="1" value={form.apartamentos} onChange={handleChange} placeholder="0" />
          </label>

          <label className="field field-full">
            <span>Valor</span>
            <input type="text" name="valor" value={form.valor} onChange={handleChange} placeholder="R$ 0,00" />
          </label>

          <label className="field field-full">
            <span>Endereço Completo (Google Maps)</span>
            <input name="endereco" value={form.endereco} onChange={handleChange} placeholder="Rua, Número, Bairro, Cidade" />
          </label>

          <label className="field field-full">
            <span>Instruções de Acesso / Senha</span>
            <textarea
              name="instrucoesAcesso"
              value={form.instrucoesAcesso}
              onChange={handleChange}
              placeholder="Ex: Senha da portaria: 1234, Interfone 101"
              rows={3}
            />
          </label>

          <label className="field field-full">
            <span>Contato / Telefone do Síndico</span>
            <input name="contatoSindico" value={form.contatoSindico} onChange={handleChange} placeholder="(11) 99999-9999" />
          </label>

          {form.latitude && form.longitude && (
            <button
              type="button"
              onClick={handleLimparGps}
              className="btn-limpar-gps"
            >
              🗑️ Remover GPS Salvo (Voltar para Endereço)
            </button>
          )}

          <div className="editar-condominio-acoes">
            <button type="button" className="btn-cancelar-edicao" onClick={handleCancelar}>
              Cancelar
            </button>
            <button type="submit" className="btn-salvar-edicao" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
        </div>
      </div>
      <Toast {...toast} onClose={dismissToast} />
    </>
  );
};

export default EditarCondominioModal;
