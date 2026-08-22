import React from 'react';
import { DollarSign } from 'lucide-react';
import './AReceberModal.css';

const formatCurrency = (value) =>
  value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const AReceberModal = ({ isOpen, onClose, leituras, totalValor }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-lista-container" onClick={(e) => e.stopPropagation()}>
        
        {/* CABEÇALHO PADRÃO ESCURO */}
        <div className="modal-lista-header">
          <div>
            <h2>
              <DollarSign size={18} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 6 }}/> 
              Detalhamento de Valores a Receber
            </h2>
            <span className="subtitulo-contador">Valores por condomínio para o mês vigente</span>
          </div>
          <button type="button" className="btn-fechar" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* CARD DE TOTAL GERAL */}
        <div className="total-destaque" style={{ margin: '16px' }}>
          <span>Total Geral a Faturar:</span>
          <strong>{formatCurrency(totalValor)}</strong>
        </div>

        {/* CORPO DO MODAL - LISTA DE CARDS */}
        <div className="modal-lista-body">
          {leituras.length === 0 ? (
            <p className="lista-vazia">Nenhum condomínio cadastrado.</p>
          ) : (
            <ul className="lista-condominios-ul">
              {leituras.map((item, index) => (
                <li key={item.id || index} className="item-condominio a-receber-item">
                  
                  <div className="a-receber-left">
                    <span className="numero-item">{index + 1}</span>
                    <div className="a-receber-info">
                      <span className="nome-condominio">{item.nome}</span>
                      <div className="a-receber-detalhes">
                        <span className="detalhe-tipo">{item.tipoLeitura || 'Água e Gás'}</span>
                        <span className="detalhe-ponto">•</span>
                        <span className="detalhe-dia">Dia {item.diaLeitura}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="a-receber-right">
                    <span className={`status-pill ${item.completo ? 'sucesso' : 'pendente'}`}>
                      {item.completo ? 'Concluído' : 'Pendente'}
                    </span>
                    <span className="valor-receber">{formatCurrency(Number(item.valor || 0))}</span>
                  </div>

                </li>
              ))}
            </ul>
          )}
        </div>

      </div>
    </div>
  );
};

export default AReceberModal;
