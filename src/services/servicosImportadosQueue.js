import { adicionarServicoCondominio } from '../utils/servicosCondominio';
import { getCurrentMonthKey } from '../utils/mesLeituras';
import { donoDoItem, exigirContaOffline, gravarFilaPersistida, lerFilaPersistida } from './offlineQueueStorage';

export const FILA_COND_KEY = 'fila_sync_condominios';

export const enfileirarServicoImportado = (condominioId, servico, unidades) => {
  const fila = lerFilaPersistida(FILA_COND_KEY);
  const owner = exigirContaOffline();
  const existente = fila.find(item => item.id === condominioId && item.servicoImportado === servico && donoDoItem(item) === owner);
  const importacao = {
    id: condominioId, servicoImportado: servico, _offline_user_id: owner,
    mes_referencia: getCurrentMonthKey(),
    unidadesImportadas: [...new Set([...(existente?.unidadesImportadas || []), ...unidades])],
  };
  gravarFilaPersistida(FILA_COND_KEY, [...fila.filter(item => item !== existente), importacao]);
};

export const aplicarServicosImportadosPendentes = (condominios, userId) => {
  const fila = lerFilaPersistida(FILA_COND_KEY).filter(item => item.servicoImportado && donoDoItem(item) === userId);
  if (!fila.length) return condominios;
  return condominios.map(condominio => fila.filter(item => item.id === condominio.id)
    .reduce((atual, item) => ({
      ...atual,
      tipoLeitura: adicionarServicoCondominio(atual, item.servicoImportado),
      apartamentos: Math.max(atual.apartamentos || 0, item.unidadesImportadas.length),
    }), condominio));
};
