import { useState } from 'react';
import { Plus } from 'lucide-react';
import './LeituraForm.css';

const initialState = {
  nome: '',
  data: '',
  apartamentos: '',
  valor: '',
  diaLeitura: '',
};

const LeituraForm = ({ adicionarLeitura }) => {
  const [form, setForm] = useState(initialState);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((previous) => ({ ...previous, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.nome.trim() || !form.data || !form.apartamentos || !form.valor || !form.diaLeitura) {
      alert('Preencha todos os campos antes de adicionar uma leitura.');
      return;
    }

    adicionarLeitura({
      nome: form.nome.trim(),
      data: form.data,
      apartamentos: form.apartamentos,
      valor: form.valor,
      diaLeitura: form.diaLeitura,
    });

    setForm(initialState);
  };

  return (
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

        <label className="field">
          <span>Data</span>
          <input type="date" name="data" value={form.data} onChange={handleChange} />
        </label>

        <label className="field">
          <span>Apartamentos</span>
          <input type="number" name="apartamentos" min="1" value={form.apartamentos} onChange={handleChange} placeholder="0" />
        </label>

        <label className="field">
          <span>Valor</span>
          <input type="number" step="0.01" name="valor" min="0" value={form.valor} onChange={handleChange} placeholder="0,00" />
        </label>

        <label className="field">
          <span>Dia Fixo do Mês</span>
          <input type="number" name="diaLeitura" min="1" max="31" value={form.diaLeitura} onChange={handleChange} placeholder="ex: 5, 10, 25" />
        </label>

        <button type="submit" className="submit-btn">
          <Plus size={18} />
          Adicionar leitura
        </button>
      </form>
    </section>
  );
};

export default LeituraForm;
