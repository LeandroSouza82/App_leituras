# OCR offline — validação da branch de testes

O OCR permanece opcional e desligado por padrão. Não há IA online nesta etapa.
Máscara numérica, cálculo de consumo, validações, salvamento e exportação usam
os fluxos existentes. O leiturista confere e salva manualmente.

## Ajuste D5: recorte e contraste

Quando a primeira passagem não produz uma sugestão, o serviço procura uma única
faixa numérica candidata nas caixas retornadas pelo ML Kit. A faixa precisa ter
evidência visual de parte preta seguida da vermelha; placa de apartamento e
serial não são selecionados apenas pelo comprimento do texto. Há margem para
incluir os decimais omitidos pela primeira passagem, sem definir sua quantidade.

O recorte é feito numa cópia em memória. Só essa cópia recebe tons de cinza e
contraste local; a foto armazenada e a câmera não são alteradas. A versão colorida
do recorte mantém as mesmas dimensões e fornece as cores para interpretar as
novas caixas. São no máximo duas chamadas ao motor por sessão: foto e recorte.
Nenhuma dependência foi adicionada.

O hook informa ao serviço se a sessão ainda está ativa. Edição, fechamento,
refazer, troca de contexto, desativação e limite de cinco segundos impedem iniciar
uma nova chamada. O plugin não cancela uma chamada nativa já iniciada; seu
resultado atrasado é descartado. A limpeza dos temporários é solicitada no
finally e também quando uma escrita falha após possivelmente criar parte do
arquivo. A falha da limpeza nativa continua sem bloquear o fluxo manual.

## Evidência e limites

No diagnóstico físico D4, o motor respondeu com texto em 605 ms e a limpeza
terminou em 946 ms. A foto do medidor Dépio mostra cinco dígitos pretos (`00017`)
e três roletes vermelhos; o motor devolveu somente a parte preta. Há roletes
vermelhos em transição. D5 tenta melhorar a imagem enviada ao motor; não é
um modelo especializado em transições mecânicas.

O preparo do recorte foi exercitado na foto enviada, com caixas delimitadas
manualmente, usando Canvas real no ambiente de desenvolvimento. Isso comprova
apenas o processamento dos pixels, não as caixas nem a leitura do ML Kit Android.
A precisão e o tempo total de D5 ainda precisam do teste físico.

A interpretação continua conservadora. Usa um único valor decimal explícito ou
uma linha numérica com grupos pretos seguidos de vermelhos. Caixa única com cores
misturadas, cor indefinida, múltiplos candidatos e dígitos não reconhecidos podem
ser recusados. Não inventa dígitos nem aplica uma regra de somar 1. O recorte
depende de alguma faixa numérica inicialmente reconhecida e atualmente procura
faixas horizontais. Reflexos, inclinação, rotação e transições precisam de testes.

Os testes do serviço usam proxies reais do Capacitor com uma ponte nativa
simulada; as respostas do reconhecimento e os pixels são fixtures sintéticas.
Verificam limite de chamadas, ausência de sugestão incompleta, cancelamento e
limpeza. Não comprovam precisão, velocidade ou funcionamento do APK.

## Teste pelo cabo

Na raiz do projeto, no PowerShell, estando na branch `feat/ocr-offline-seguro`:

```powershell
git pull --ff-only origin feat/ocr-offline-seguro
$env:VITE_OCR_DIAGNOSTICO="true"
npm run build
Remove-Item Env:VITE_OCR_DIAGNOSTICO
npx cap run android
```

OCR ativo: fotografar o visor inteiro com foco, comparar a leitura real com a
sugestão e confirmar que os decimais estão completos. Se recusar, abrir
“Diagnóstico OCR · D5” e registrar o painel, especialmente “Recorte — linhas com
números”. Anotar tempo total, correção necessária e resultado ao salvar.

Também verificar digitação antes da resposta, refazer, fechar, trocar unidade ou
serviço, leitura existente e salvamento manual. Com OCR desligado, repetir foto,
digitação, consumo e exportação. Primeira execução em modo avião confirma que o
modelo está disponível desde a instalação.

O painel existe apenas com `VITE_OCR_DIAGNOSTICO=true`. Pode mostrar texto da
foto, placa e serial; permanece na sessão local e não é enviado para um servidor.
Um build normal não exibe o painel. Não houve merge nem release de D5.

## Dependência Android e peso

A versão 8.2.1 instalada inclui modelos latino, chinês, devanágari, japonês e
coreano no Gradle. A estimativa inicial de apenas 3–5 MB não representa uma
medição desta integração. Não removemos dependências nativas sem build e teste.
Tamanho real do APK e validação Android dependem de ambiente com SDK/JDK.
