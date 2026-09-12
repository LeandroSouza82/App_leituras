export const parseLeituraNumerica = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : null;
  }
  let s = String(valor).trim();
  if (s === '') return null;

  if (s.includes('.') && s.includes(',')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }

  const num = Number(s);
  return Number.isFinite(num) ? num : null;
};

export const formatarLeitura4Casas = (valor) => {
  const num = parseLeituraNumerica(valor);
  if (num === null) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(num);
};

/**
 * Formata sequência de dígitos para pt-BR com 4 casas decimais fixas.
 * Ex: "238000" -> "23,8000", "16608100" -> "1.660,8100"
 */
export const formatarDigitosLeitura = (val) => {
  if (val === null || val === undefined) return '';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return '';

  if (/^0+$/.test(digits)) {
    return digits.length === 1 ? '0,0000' : '';
  }

  const cleanDigits = digits.replace(/^0+/, '');
  const padded = cleanDigits.padStart(5, '0');
  const intDigits = padded.slice(0, -4);
  const decDigits = padded.slice(-4);
  const intFormatted = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intFormatted},${decDigits}`;
};

/**
 * Calcula a posição correspondente do cursor após a aplicação da máscara.
 */
export const calcularPosicaoCursor = (formattedText, digitsBeforeCursor, totalDigits) => {
  if (!formattedText || digitsBeforeCursor <= 0) return 0;
  if (totalDigits && digitsBeforeCursor >= totalDigits) return formattedText.length;

  let count = 0;
  for (let i = 0; i < formattedText.length; i++) {
    if (/\d/.test(formattedText[i])) {
      count++;
      if (count === digitsBeforeCursor) {
        return i + 1;
      }
    }
  }
  return formattedText.length;
};

/**
 * Aplica máscara de leitura de forma inteligente, diferenciando digitação pura de valor já formatado/normalizado.
 */
export const aplicarMascaraLeitura = (val) => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') {
    return formatarLeitura4Casas(val);
  }
  const s = String(val).trim();
  if (!s) return '';

  // Se já contém separadores e é um número decimal válido (ex: colado "23.8" ou "1.660,8100")
  if (s.includes(',') || s.includes('.')) {
    const num = parseLeituraNumerica(s);
    if (num !== null) {
      return formatarLeitura4Casas(num);
    }
  }

  // Sequência de dígitos digitada pelo usuário
  return formatarDigitosLeitura(s);
};
