import * as XLSX from 'xlsx';

const normalizeHeader = (header) =>
  String(header || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const parseNumberValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const sanitized = String(value || '')
    .trim()
    .replace(/^R\$\s?/, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseDayValue = (value) => {
  const parsed = Number(String(value).replace(/[^0-9]/g, ''));
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  if (parsed < 1) {
    return 1;
  }
  if (parsed > 31) {
    return 31;
  }
  return parsed;
};

const gerarIdUnico = () => Date.now() + Math.random().toString(36).substr(2, 9);

export const processarPlanilhaExcel = async (file) => {
  if (!file) {
    return [];
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return [];
  }

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (!rows.length) {
    return [];
  }

  const headings = rows[0].map(normalizeHeader);
  const columnMap = {
    nome: headings.indexOf('nome do condomínio'),
    apartamentos: headings.indexOf('quantidade de unidades'),
    valor: headings.indexOf('valor cobrado'),
    diaLeitura: headings.indexOf('data da leitura'),
    tipoLeitura: headings.indexOf('tipo de leitura'),
    endereco: headings.indexOf('endereço'),
    instrucoesAcesso: headings.indexOf('instruções de acesso'),
    contatoSindico: headings.indexOf('contato do síndico'),
  };

  return rows.slice(1).reduce((result, row) => {
    const nome = String(row[columnMap.nome] || '').trim();
    if (!nome) {
      return result;
    }

    const apartamentos = parseNumberValue(row[columnMap.apartamentos]);
    const valor = parseNumberValue(row[columnMap.valor]);
    const diaLeitura = parseDayValue(row[columnMap.diaLeitura]);
    const tipoLeitura = String(row[columnMap.tipoLeitura] || '').trim();
    const endereco = String(row[columnMap.endereco] || '').trim();
    const instrucoesAcesso = String(row[columnMap.instrucoesAcesso] || '').trim();
    const contatoSindico = String(row[columnMap.contatoSindico] || '').trim();

    result.push({
      id: gerarIdUnico(),
      nome,
      apartamentos,
      valor,
      diaLeitura,
      tipoLeitura,
      endereco,
      instrucoesAcesso,
      contatoSindico,
      completo: false,
    });

    return result;
  }, []);
};
