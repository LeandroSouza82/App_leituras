const fs = require('fs'); 
let lines = fs.readFileSync('src/components/LeituraFotoModal/LeituraFotoModal.jsx', 'utf8').split('\n'); 

// 1. Remove leituraAnteriorAtiva state
let idx1 = lines.findIndex(l => l.includes('const [leituraAnteriorAtiva, setLeituraAnteriorAtiva] = useState(null);'));
if(idx1 !== -1) lines.splice(idx1, 1);

// 2. Remove setLeituraAnteriorAtiva from useEffect
let idx2 = lines.findIndex(l => l.includes('setLeituraAnteriorAtiva(valueEncontrado);'));
if(idx2 !== -1) lines.splice(idx2, 1);
let idx3 = lines.findIndex(l => l.includes('setLeituraAnteriorAtiva(null);'));
while(idx3 !== -1) {
    lines.splice(idx3, 1);
    idx3 = lines.findIndex(l => l.includes('setLeituraAnteriorAtiva(null);'));
}

// 3. Fix prop drill in PreviewFotoModal
let idx4 = lines.findIndex(l => l.includes('leituraAnterior={leituraAnteriorAtiva}'));
while (idx4 !== -1) {
    lines[idx4] = '        leituras={todasLeiturasAnteriores}\n        unidadeAtiva={activeApto}';
    idx4 = lines.findIndex(l => l.includes('leituraAnterior={leituraAnteriorAtiva}'));
}

// 4. Update UI State and LocalStorage in handleSaveReading
let idx5 = lines.findIndex(l => l.includes('exibirToastSucesso();'));
let idx5_start = idx5;
// ensure we are inside handleSaveReading
while(idx5_start > 0 && !lines[idx5_start].includes('handleSaveReading')) {
    idx5_start--;
}
if(idx5_start > 0) {
    lines.splice(idx5, 0, 
'      // NOVO: Atualiza a Leitura Anterior imediatamente (UI State)',
'      setTodasLeiturasAnteriores(prev => ({',
'        ...prev,',
'        [unidadeId]: valorNumerico',
'      }));',
'',
'      // NOVO: Persiste no LocalStorage (Garantia de Sobrevivência)',
'      try {',
'        const chaveStorage = \leituras_anteriores_\\;',
'        const str = localStorage.getItem(chaveStorage);',
'        if (str) {',
'          const arr = JSON.parse(str);',
'          const idx = arr.findIndex(l => String(l.unidade).trim() === String(unidadeId));',
'          if (idx !== -1) {',
'             const propCorreta = PROP_LEITURA_ANTERIOR[tipoMedicaoAtivo] || "leitura_anterior";',
'             arr[idx][propCorreta] = valorNumerico;',
'             localStorage.setItem(chaveStorage, JSON.stringify(arr));',
'          }',
'        }',
'      } catch(e) {',
'        console.error("Erro ao atualizar localStorage", e);',
'      }'
    );
}

fs.writeFileSync('src/components/LeituraFotoModal/LeituraFotoModal.jsx', lines.join('\n'), 'utf8');
