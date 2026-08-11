import React, { useState } from 'react';
import { DollarSign, X } from 'lucide-react';
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
      <div className="modal-container a-receber-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <div className="modal-icon blue">
              <DollarSign size={20} />
            </div>
            <div>
              <h3>Detalhamento de Valores a Receber</h3>
              <p>Valores por condomínio para o mês vigente</p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="total-destaque">
            <span>Total Geral a Faturar:</span>
            <strong>{formatCurrency(totalValor)}</strong>
          </div>

          <div className="tabela-container">
            <table className="tabela-faturamento">
              <thead>
                <tr>
                  <th>Condomínio</th>
                  <th>Tipo Leitura</th>
                  <th>Dia</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {leituras.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: '#64748b' }}>
                      Nenhum condomínio cadastrado.
                    </td>
                  </tr>
                ) : (
                  leituras.map((item) => (
                    <tr key={item.id}>
                      <td className="col-nome">{item.nome}</td>
                      <td>{item.tipoLeitura || 'Água e Gás'}</td>
                      <td>Dia {item.diaLeitura}</td>
                      <td>
                        <span className={`status-pill ${item.completo ? 'sucesso' : 'pendente'}`}>
                          {item.completo ? 'Concluído' : 'Pendente'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>
                        {formatCurrency(Number(item.valor || 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-fechar" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AReceberModal;
