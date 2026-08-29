const fs = require('fs');
let lines = fs.readFileSync('src/components/LeituraFotoModal/LeituraFotoModal.jsx', 'utf8').split('\n');

// 1. Inject id into UnidadeCard button
let btnIndex = lines.findIndex(l => l.includes('<button') && l.includes('btn-apto-simples') || (l.includes('<button') && lines.slice(lines.indexOf(l), lines.indexOf(l)+5).some(x => x.includes('btn-apto-simples'))));
// Let's just find the exact line
let classIndex = lines.findIndex(l => l.includes('className={\tn-apto-simples'));
if (classIndex !== -1) {
    lines.splice(classIndex, 0, '      id={\card-unidade-\\}');
}

// 2. Inject Validation function above executeExport
let executeExportIndex = lines.findIndex(l => l.includes('const executeExport ='));

const validationFunc = \
  // FUNÇÃO MODULAR DE VALIDAÇÃO RIGOROSA
  const validarLeiturasLote = (scope, tipoCondominioOrig, unidadesList, leiturasVal) => {
    const tipo = String(tipoCondominioOrig || '').toLowerCase();
    const isMisto = !tipo.includes('somente') && !tipo.includes('energia');
    
    let servicosParaValidar = [];
    if (scope === 'todos') {
      if (isMisto) servicosParaValidar = ['agua', 'gas'];
      else if (tipo.includes('agua')) servicosParaValidar = ['agua'];
      else if (tipo.includes('gas')) servicosParaValidar = ['gas'];
      else if (tipo.includes('energia')) servicosParaValidar = ['energia'];
    } else {
      servicosParaValidar = [scope];
    }

    for (const uni of unidadesList) {
      const apStr = String(uni.unidade || uni.nome || uni).trim();
      for (const srv of servicosParaValidar) {
        const val = leiturasVal[\\_\\];
        const numVal = Number(val);
        if (val === undefined || val === null || val === '' || numVal === 0 || isNaN(numVal)) {
          return { isValid: false, unidade: apStr, servico: srv };
        }
      }
    }
    return { isValid: true };
  };
\;

if (executeExportIndex !== -1) {
    lines.splice(executeExportIndex, 0, validationFunc);
    
    // Now inject the validation inside executeExport
    let newExecuteExportIndex = lines.findIndex(l => l.includes('const executeExport ='));
    let confirmIndex = lines.findIndex((l, i) => i > newExecuteExportIndex && l.includes('const nomeAmigavel ='));
    
    if (confirmIndex !== -1) {
        const validationCall = \
    // Validação Rigorosa
    const validacao = validarLeiturasLote(servico, leitura?.tipoLeitura || leitura?.tipo_leitura, unidadesCarregadas, leiturasValores);
    if (!validacao.isValid) {
      const msg = \\\A leitura de \\\ da unidade \\\ não foi preenchida ou está zerada.\\\;
      window.alert(msg);
      setTimeout(() => {
        const card = document.getElementById(\\\card-unidade-\\\\\\);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      return;
    }
\;
        lines.splice(confirmIndex, 0, validationCall);
    }
}

fs.writeFileSync('src/components/LeituraFotoModal/LeituraFotoModal.jsx', lines.join('\n'), 'utf8');
