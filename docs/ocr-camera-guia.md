# Câmera com guia para o OCR — D16

## Comportamento

Com **OCR + IA desligado**, permanece a câmera original, com qualidade 30 e o mesmo fluxo de foto, leitura e salvamento.

Com **OCR + IA ligado**, abre uma câmera dentro do aplicativo. O leiturista posiciona todos os dígitos, inclusive os decimais, no retângulo. Os controles “Uma linha”, “Visor maior” e largura ajustam o enquadramento. A iluminação fica disponível quando a câmera suporta lanterna. Tocar no visor aciona o foco nativo; a câmera também usa foco contínuo quando disponível.

Ao fotografar:

1. A câmera entrega uma imagem JPEG com qualidade 90, normalizada para a orientação correta, sem salvar essa imagem em arquivo.
2. A foto completa é recomprimida em JPEG com qualidade 30 e entra no carimbo, cache, banco e compartilhamento já existentes. O guia não aparece nessa foto.
3. Apenas a região dentro do guia vira uma cópia JPEG com qualidade 95 para o OCR. Se a proporção da foto e da prévia não puder ser confirmada, conserva a foto comprimida e pede digitação manual.
4. O OCR offline tenta a faixa colorida e, se necessário, uma segunda passagem com contraste. Não há terceira tentativa nem salvamento automático.
5. Os pixels temporários são liberados e os arquivos de cache do OCR têm sua exclusão solicitada ao terminar, cancelar, editar, fechar ou atingir o limite de espera. A exclusão nativa é assíncrona e uma falha nela não bloqueia o leiturista.

O campo, a máscara com quatro casas, o cálculo de consumo, a validação contra a leitura anterior e a confirmação manual continuam existentes. A marcação mensal dos condomínios não foi alterada. Não foi adicionada API de IA nesta etapa.

## Organização

- `OcrCamera`: interface, geometria do guia e ciclo de vida da câmera.
- `ocrCameraService`: uma sessão nativa por vez, transparência isolada, iluminação e encerramento.
- `ocrEnquadramento`: projeção do guia na foto, compressão e recurso descartável.
- `ocrService` e `useOcrLeitura`: reconhecimento, descarte de resultados antigos e limpeza.
- Patch do `camera-preview@8.0.2`: informa as dimensões orientadas da prévia e traduz as coordenadas dos toques para a área real da câmera. `patch-package` aplica esse ajuste no `postinstall`.

O patch também troca `proguard-android.txt` por `proguard-android-optimize.txt` no Gradle do plugin, corrigindo o bloqueio de configuração reportado no Windows com AGP 9. Não altera `minifyEnabled`, a versão do Gradle ou o fluxo de leitura. A aplicação do patch em uma instalação limpa e sua reaplicação foram verificadas; a compilação Android completa continua dependendo do teste no computador com SDK.

O Android usa `@capacitor-community/camera-preview@8.0.2`. Sem tamanho explícito, o plugin escolhe a proporção da prévia e uma foto de até aproximadamente 2 MP. O tamanho efetivo depende do aparelho. O patch e a correspondência entre guia e câmera precisam de teste físico; o build web não compila o código Java.

## Correção da recusa de captura

A superfície nativa agora ocupa as dimensões fixas da janela, atrás da interface. O recorte usa a posição do guia nessa janela no momento do toque. Acrescentar o botão da lanterna ou mudar a altura do rodapé não invalida a foto. Uma mudança real da janela continua recusando a captura para evitar desalinhamento.

Essa recusa foi reproduzida no componente com layout e ponte simulados: antes da correção, a câmera não recebia a chamada de captura; depois, a foto e o recorte foram entregues. Falhas encerram a sessão antes de oferecer nova tentativa. No build com `VITE_OCR_DIAGNOSTICO=true`, a tela informa a etapa e o erro recebido; esses detalhes não aparecem no build normal.

A imagem enviada pelo aparelho contém somente uma mensagem genérica e não comprova qual exceção ocorreu. O alinhamento real e eventuais falhas do driver da câmera precisam do novo teste físico. Não foi possível repetir a verificação em navegador nesta correção: não havia executável instalado e o download não entregou um arquivo válido.

## Verificação nesta entrega

- A classificação de cor usa primeiro as duas metades da caixa original reconhecida pelo motor. A margem ampliada só confirma fundo ausente em números brancos, quando é uniforme e não contradiz uma cor interna. Moldura e roletes vizinhos deixam de definir o separador de um dígito já confirmado. Uma caixa realmente preta/vermelha continua sem sugestão.
- 196 testes automatizados passam: geometria, separação das imagens, limpeza, sessões, cancelamentos e regressões existentes de leituras e consumo. Incluem o componente React real com ponte/layout simulados e seis cenários de bordas e fundo branco. Os testes de borda usam a geometria do diagnóstico, com números e pixels sintéticos; não executam o ML Kit sobre a foto do aparelho. Antes do ajuste, dois deles reproduziram a recusa e a mudança indevida de separador pela moldura.
- A interface original foi verificada com ponte nativa simulada em 320 × 640, 360 × 640 e 412 × 915: botões dentro da tela, ajuste do guia, captura, sugestão, consumo, correção de um dígito, salvamento manual, cancelamento e desativação. Nenhum erro de página.
- `npm run build` passou. Permanece o aviso conhecido de tamanho dos chunks.
- `npx cap sync android` passou e reconheceu 15 plugins, incluindo a nova câmera. Os caminhos gerados foram mantidos relativos ao `node_modules` do projeto.
- A simulação confirma o fluxo e a interface; não mede precisão ou velocidade do ML Kit e não substitui o teste da câmera Android.
- Não houve merge na `main`, instalação física ou geração de APK neste ambiente.

## Teste físico obrigatório antes do merge

1. Desligar OCR e confirmar que a câmera e o salvamento originais continuam funcionando.
2. Ligar OCR, fotografar em modo avião e comparar o retângulo ao recorte realmente reconhecido. Manter uma única linha de dígitos no guia, sem etiquetas, seriais ou ponteiros.
3. Testar água, gás e energia, tamanhos do guia, foco, iluminação e orientação. Confirmar captura após aparecer a lanterna e no build com “Galeria (teste)”. Fotografar com todos os dígitos visíveis; evitar reflexo e movimento. Se falhar, registrar também o “Detalhe do teste” exibido na tela.
4. Confirmar “Diagnóstico OCR · D16”. Conferir se o campo sugerido, seus decimais e o consumo estão corretos, inclusive em visores com moldura vermelha encostada no último inteiro. Editar apenas um dígito e salvar pelo botão existente. A foto enviada confirmou visualmente a divisão do visor; o recorte exato usado pelo motor não foi disponibilizado para repetir o caso nativo neste ambiente.
5. Durante o OCR, digitar, refazer foto, fechar, trocar de unidade e desativar a opção: respostas antigas não podem preencher outra leitura.
6. Conferir a foto completa comprimida no celular e no banco; a faixa de maior qualidade não deve entrar nesses destinos.
7. Medir a primeira execução e as seguintes, e registrar taxa de acertos e correções. Dígitos em transição, sujeira, pintura ou foco ruim ainda podem impedir uma sugestão segura; não há garantia de reconhecimento perfeito.

## Atualização no Windows, após o código estar disponível no checkout

Usar a branch de teste `feat/ocr-camera-guia`. Estes comandos pressupõem que os arquivos desta entrega já estejam no computador; um `git pull` não baixa mudanças ainda não publicadas.

```powershell
cd C:\Src\App_Genciador_Leituras
npm ci --legacy-peer-deps
if ($LASTEXITCODE -ne 0) { throw 'A instalação falhou. Não prossiga.' }
npx patch-package --error-on-fail
if ($LASTEXITCODE -ne 0) { throw 'A aplicação dos patches falhou. Não prossiga.' }

$env:VITE_OCR_DIAGNOSTICO = 'true'
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'O build falhou. Não prossiga.' }
} finally {
    Remove-Item Env:VITE_OCR_DIAGNOSTICO -ErrorAction SilentlyContinue
}

npx cap run android
if ($LASTEXITCODE -ne 0) { throw 'A instalação no aparelho falhou.' }
```

`npm ci --legacy-peer-deps` conserva a resolução do projeto diante do conflito de peer dependency já existente do Google Auth. Confirmar no log a aplicação dos patches e a presença de `camera-preview` e `text-recognition` no sync. O botão “Galeria (teste)” aparece apenas no build de diagnóstico; o enquadramento ao vivo deve ser validado com uma foto nova.

Para gerar somente o APK debug após o build web:

```powershell
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'O sync falhou.' }
cd android
.\gradlew.bat assembleDebug
if ($LASTEXITCODE -ne 0) { throw 'A compilação Android falhou.' }
explorer.exe .\app\build\outputs\apk\debug
```

O APK release e a `main` continuam sendo a referência estável até aprovação do teste no aparelho.
