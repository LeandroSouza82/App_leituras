import { CameraPreview } from '@capacitor-community/camera-preview';

// Serializa abertura/fechamento, inclusive a montagem dupla do StrictMode.
// Uma sessão antiga nunca para a câmera de outra captura.
let fila = Promise.resolve();
let dona = null;
const enfileirar = acao => {
  const chamada = fila.then(acao);
  fila = chamada.catch(() => {});
  return chamada;
};

const abrirFundo = () => {
  if (!globalThis.document) return () => {};
  const elementos = [document.documentElement, document.body];
  const classes = elementos.flatMap(el => ['camera-active', 'ocr-camera-active'].map(nome => ({
    el, nome, existente: el.classList.contains(nome),
  })));
  classes.forEach(({ el, nome }) => el.classList.add(nome));
  return () => classes.forEach(({ el, nome, existente }) => { if (!existente) el.classList.remove(nome); });
};

export const criarSessaoCameraOcr = (plugin = CameraPreview) => {
  const identidade = {};
  let cancelada = false;
  let pronta = false;
  let capturando = false;
  let liberarFundo = null;
  const parar = async () => {
    if (dona !== identidade) return;
    pronta = false;
    try { await plugin.stop(); }
    finally { dona = null; liberarFundo?.(); liberarFundo = null; }
  };
  const valida = () => !cancelada && pronta && dona === identidade;

  return {
    abrir: viewport => enfileirar(async () => {
      if (cancelada) return false;
      if (dona) throw new Error('Uma captura ainda está sendo encerrada. Tente novamente.');
      dona = identidade;
      liberarFundo = abrirFundo();
      try {
        await plugin.start({
          position: 'rear', x: Math.round(viewport.left), y: Math.round(viewport.top),
          width: Math.round(viewport.width), height: Math.round(viewport.height),
          parent: 'ocr-camera-preview', className: 'ocr-camera-video',
          toBack: true, storeToFile: false, disableExifHeaderStripping: false,
          lockAndroidOrientation: true, disableAudio: true, enableZoom: true,
        });
        if (cancelada) { await parar(); return false; }
        pronta = true;
        return true;
      } catch (erro) { await parar().catch(() => {}); throw erro; }
    }),
    capturar: () => {
      if (capturando) return Promise.resolve(null);
      capturando = true;
      return enfileirar(async () => {
        try {
          if (!valida()) return null;
          // O tamanho padrão escolhe a proporção da prévia, até 2 MP no Android.
          const foto = await plugin.capture({ quality: 90 });
          return valida() ? foto : null;
        } catch (erro) {
          if (cancelada) return null;
          throw erro;
        } finally { capturando = false; }
      });
    },
    modosFlash: () => enfileirar(async () => valida() ? (await plugin.getSupportedFlashModes()).result : []),
    luz: ligada => enfileirar(async () => {
      if (valida()) await plugin.setFlashMode({ flashMode: ligada ? 'torch' : 'off' });
    }),
    fechar: () => {
      cancelada = true;
      // stop() aborta a captura nativa pendente. Não fica atrás dela na fila.
      if (dona === identidade && pronta) {
        const parada = parar().then(() => ({}), erro => ({ erro }));
        return enfileirar(async () => { const r = await parada; if (r.erro) throw r.erro; });
      }
      return enfileirar(parar);
    },
  };
};
