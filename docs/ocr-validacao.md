# OCR offline — validação da branch de testes

O OCR permanece opcional e desligado por padrão. Não há IA online nesta etapa.
Máscara numérica, cálculo de consumo, validações, salvamento e exportação usam
os fluxos existentes. O leiturista confere e salva manualmente.

## D12: dígitos individuais e transições com evidência visual

O teste físico D11 do APTO-102 sugeriu `35,8590` em 956 ms e calculou
`0,2920 m³` sobre a anterior `35,5670`. No APTO-101, o recorte juntou `74`
como vermelho, sugeriu `1,7400` em 1051 ms e a comparação com `17,2970`
descartou o resultado. O segundo resultado não comprova leitura correta.

O SDK Android ML Kit já fornece `Text.Symbol`, caixas e escores individuais.
O plugin 8.2.1 omitia esses dados na ponte. Um patch pequeno, aplicado pelo
`postinstall` já existente, acrescenta `symbols` a cada elemento. A versão do
plugin foi fixada em 8.2.1 para preservar esse contrato. Nenhum motor, modelo,
dependência ou chamada ao OCR foi adicionado. Para instalar esse patch após
atualizar a branch, executar `npm ci --legacy-peer-deps` antes do build e do
`cap run android`. O plugin Google Auth existente declara peer de Capacitor 6,
enquanto o projeto usa Capacitor 8. Sem esse parâmetro, a instalação pode falhar
com `ERESOLVE` antes de executar o `postinstall`. O comando mantém as versões
do lockfile; não migra o login nem altera sua implementação. Essa opção não
comprova compatibilidade nativa de plugins: os testes no aparelho continuam.

Só continuar com o build após a instalação concluir e mostrar a aplicação de
`@capacitor-mlkit/text-recognition@8.2.1` pelo `patch-package`. Build Vite e
Gradle bem-sucedidos após um `npm ci` que falhou podem usar dependências antigas,
sem os símbolos individuais, mesmo quando o painel já está identificado como
D12. Se a instalação falhar, interromper os próximos comandos e enviar o erro.

A interpretação usa somente as caixas individuais devolvidas pelo motor;
não divide palavras por uma largura presumida. O grupo `74` pode ter seu `7`
preto e `4` vermelho analisados separadamente. Se um payload que contém símbolos
está incompleto, diverge do texto, não tem caixas válidas ou está fora de ordem,
a linha é recusada. Sem esse contrato (por exemplo, iOS ou APK sem o patch), a
análise anterior por grupos permanece disponível e aparece no diagnóstico.

A regra pedida para transição exige dois dígitos reconhecidos, consecutivos no
ciclo 0–9, em caixas verticalmente separadas da mesma coluna, com larguras e
alturas compatíveis, a mesma cor confirmada e escore nativo de pelo menos 0,85
nos dois símbolos. `3` e `4` nessa condição sugerem `4`; `9` e `0` sugerem `0`.
Um dígito isolado permanece igual. Não acrescenta um ao valor inteiro, não faz
transporte para outro rolete e não usa a leitura anterior para escolher números.
Pares não consecutivos, mais de um parceiro, escore ausente ou cor ambígua
recusam a linha. O escore é um filtro inicial, não probabilidade calibrada de
acerto ou garantia de transição mecânica. Essas condições ainda precisam de
validação física com fotos reais, inclusive inclinação e reflexos.

Se há outros símbolos vermelhos próximos depois da cauda, em outra linha,
a sugestão parcial também é recusada. Não anexa esses números por suposição.
Essa proteção cobre a resposta observada no APTO-101 com caixas sintéticas.
Ela não garante detectar um dígito que o motor omitiu completamente.

As amostras de cor são reutilizadas na mesma interpretação. Continuam duas
chamadas no máximo, limite de cinco segundos, descarte após edição ou mudança
de contexto, limpeza dos temporários e confirmação manual. Máscara, consumo,
regra de leitura igual ou maior que a anterior e exportação permanecem iguais.

Referência do SDK: https://developers.google.com/ml-kit/vision/text-recognition/v2/android
e https://developers.google.com/android/reference/com/google/mlkit/vision/text/Text.Symbol.

Validação local: os testes usam caixas, escores e pixels sintéticos, sem simular
a precisão nativa. O patch foi aplicado e seu conteúdo conferido em uma cópia
isolada do plugin. Build Gradle e reconhecimento físico D12 pendentes: este
ambiente não possui Android SDK. Não considerar o APTO-101 resolvido nem fazer
merge com base somente nos testes de regras e no build web.
Os 129 testes passaram sem falhas, cancelamentos ou testes ignorados; o build
web de diagnóstico passou em 8,69 s, com o aviso de tamanho de chunk já existente.

No celular, verificar no painel D12 `Analisando ... dígitos individuais` e, quando
o motor encontrar um par, `Transição visual: 3 → 4` (ou o par correspondente).
Repetir o APTO-102, testar o APTO-101, um `3` estável, transições reais 3→4 e
9→0, e conferir os valores completos antes de salvar. Ausência de um dos
dígitos ou leitura parcial continua exigindo digitação manual.

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

## Correção D6: localizar a partir de um trecho numérico

D5 físico terminou em 733 ms sem segunda chamada: a linha do visor veio como
`0001 74m` (`0001 | 74m`) e o localizador exigia que a linha inteira fosse
numérica. O resultado foi zero faixas candidatas, antes do contraste.

D6 também examina elementos puramente numéricos de uma linha mista. O trecho
`0001` pode localizar o recorte com sua própria caixa; `74m` não é transformado
em número. Para trechos parciais, a margem usa os intervalos entre os dígitos
para não cortar a cauda do visor. A validação visual preta/vermelha, a recusa de
múltiplos candidatos, o limite de chamadas e o parser da leitura não mudaram.
O trecho inicial nunca preenche o campo; é preciso novo resultado utilizável.

O diagnóstico D6 inclui até oito trechos examinados, suas amostras de cor e
coordenadas, para distinguir ausência de caixa de recusa por cor. A regressão
com `0001 74m` está coberta por testes da ponte simulada. O preparo de D6 também
foi exercitado nos pixels da foto enviada com caixas delimitadas manualmente;
as caixas reais do ML Kit e a precisão no celular continuam pendentes.

## Correção D7: preservar prefixo inteiro com cor indefinida

O novo teste físico D6 terminou em 734 ms. O motor reconheceu `0003 5 85 9`,
mas a interpretação recusou `0003` por cor indefinida. O grupo `5` foi classificado
como preto e os grupos `85` e `9` como vermelhos. O localizador também recusou
a primeira amostra indefinida e não houve segunda chamada.

D7 permite usar a posição de um grupo indefinido antes de um grupo preto
confirmado. Todos os grupos precisam ter caixas válidas, alinhamento vertical,
altura compatível, ordem horizontal e distâncias curtas. O último grupo inteiro
precisa ser preto e todos os grupos decimais precisam ser vermelhos. Não aceita
cor indefinida na fronteira decimal, na cauda ou sem uma âncora preta posterior.
Uma caixa com uma metade preta e outra vermelha continua sendo recusada,
mesmo antes da âncora; não é tratada como simples ausência de cor.
Os limites de comprimento e a recusa de múltiplos visores continuam em vigor.

Na fixture que reproduz o texto e as cores do diagnóstico, com caixas sintéticas
alinhadas, `0003 | 5 | 85 | 9` produz `00035,859`. A máscara existente apresenta
`35,8590`; com leitura anterior `35,5670`, o cálculo existente produz `0,2920`.
O serviço usa uma só chamada ao motor e solicita a limpeza do temporário.
Nenhum dígito é criado ou alterado. O diagnóstico informa quando o prefixo foi
aceito pela posição. É necessário testar as caixas reais e a sugestão no celular.

## Correção D8: unidade separada e sugestão incompatível

No novo teste físico D7, o motor respondeu em 475 ms com `0035 859 m`.
O parser recusou a linha inteira antes de classificar as cores, por conter `m`.
A limpeza terminou em 811 ms. D8 separa somente um elemento final de unidade
(`m`, `m3`, `m³` ou `kWh`) quando ele corresponde ao texto da linha. Os números
continuam completos e sua divisão depende das cores; `74m`, letras internas,
seriais e outros rótulos não são convertidos em números. O recorte usa a mesma
normalização e a união das caixas numéricas, excluindo a caixa da unidade.

Outra captura D7 sugeriu `1,7490` para uma leitura anterior `17,2970`. O bloqueio
manual impediu o salvamento, mas o OCR foi apresentado como concluído. D8 aplica
a mesma comparação de quatro casas antes de preencher: se a sugestão formatada
for inferior à anterior, o campo permanece disponível para digitação e aparece
um aviso específico. A comparação foi extraída da validação existente e é
compartilhada; formato, máscara, consumo e regra de igualdade não mudaram.
Não multiplica o valor por dez nem o ajusta para ficar acima da leitura anterior.

O diagnóstico D8 também pode ser aberto após uma sugestão. Registra o valor,
a leitura anterior e se a divisão veio de separador explícito ou de cor/posição.
Esse registro é necessário para identificar a origem do `1,7490`: a captura
enviada não contém o resultado bruto e as caixas dessa sugestão. O descarte
protege esse caso, mas não comprova que a divisão decimal ou os roletes em
transição foram reconhecidos corretamente. A conferência manual continua.

## Correção D9: localizar caixa com caractere desconhecido

O diagnóstico físico D8 devolveu `0001?4`: texto incompleto com um caractere
desconhecido. A limpeza terminou em 852 ms, sem segunda chamada, porque o
localizador descartou a caixa junto com o texto. D9 permite que uma faixa com
até dois `?` e pelo menos quatro dígitos reconhecidos localize um recorte.
Letras e outros símbolos continuam recusados. A caixa precisa ser válida,
horizontal e apresentar evidência visual preta seguida da vermelha.

Essa permissão é exclusiva da localização. Não transforma `?` em dígito, não
remove a dúvida para preencher e não muda o parser da leitura. A sugestão depende
do resultado utilizável da segunda chamada. Um segundo resultado com dúvida
termina sem preenchimento e sem terceira tentativa. O limite de cinco segundos,
cancelamento, comparação com a anterior e limpeza dos temporários permanecem.
Os testes usam texto observado e caixas/pixels simulados. Precisão e caixas reais
no celular continuam pendentes.

## Diagnóstico D10: testar a foto da galeria

O teste físico D9 localizou uma faixa, executou a segunda chamada e terminou em
924 ms. O recorte devolveu `000 1 74`; o grupo `1` teve cor indefinida e a linha
foi recusada. Isso comprova a execução do recorte nessa sessão, mas o resultado
continua incompleto e não confirma a divisão decimal. O parser não foi relaxado.

A foto enviada para comparação tem 720 × 1280 pixels. A captura usada pelo D9
tem 2304 × 4096, portanto não é possível reproduzir suas caixas nessa foto apenas
mudando a escala. Na imagem enviada, a parte inteira é `00017`, o primeiro
vermelho é `4` e os dois roletes seguintes estão em transição. Não foi estabelecida
uma referência decimal completa para teste automatizado dessa imagem.

D10 acrescenta escolha entre câmera e galeria somente com
`VITE_OCR_DIAGNOSTICO=true` e OCR ativo. A foto da galeria passa pela mesma opção
de qualidade 30, orientação, carimbo, preview e processamento existentes; não é
um teste dos bytes JPEG sem recompressão. Permite testar a imagem enviada sem
fotografar sua exibição numa tela. Com OCR desligado ou build normal, a origem
continua `CameraSource.Camera` e não aparece o seletor. Não há alteração no
reconhecimento, máscara, consumo, validação ou salvamento manual.

O novo seletor precisa de validação Android. Os testes e o build web não executam
o seletor nativo nem medem a precisão do ML Kit nessa foto.
Os 107 testes existentes passaram. Os builds normal e de diagnóstico passaram;
nos assets gerados, o texto do seletor apareceu somente no diagnóstico. O código
Android da versão instalada confirma o suporte a `CameraSource.Prompt` e aos
rótulos usados, mas sua abertura no aparelho ainda precisa ser conferida.

## Correção D11: permitir a tentativa com contraste nos casos D10

Os novos diagnósticos físicos D10 terminaram em 811 ms (APTO-101) e 1011 ms
(APTO-102), sem segunda chamada. O APTO-101 devolveu `0001742i`; a letra final
impediu tanto a interpretação quanto a localização do recorte. O APTO-102
devolveu `003 5 8 5 9`, mas `003` e o primeiro `5` ficaram com cor indefinida.
A amostra inicial do localizador também ficou indefinida, bloqueando o recorte.
A foto de referência do APTO-102 mostra `00035,859`: na máscara existente,
`35,8590`. Isso não comprova a leitura das imagens efetivamente usadas no D10.

D11 muda somente a localização dos pixels para uma tentativa adicional:

- Uma faixa com até duas dúvidas, incluindo no máximo duas letras finais,
  pode localizar sua caixa se tiver pelo menos quatro dígitos reconhecidos.
  Letras internas, rótulos e excesso de caracteres continuam recusados.
  Não troca `i` por número, não remove a letra para preencher e não altera o
  parser da leitura. Uma unidade separada continua usando a normalização D8.
- A amostra inicial indefinida pode localizar uma faixa começando por zero,
  com pelo menos quatro dígitos, caixa válida e evidência vermelha à direita.
  Isso não atribui cor preta ao prefixo nem confirma sua posição decimal.
  Múltiplas faixas, início vermelho ou ausência da região vermelha continuam
  sem recorte. O reconhecimento do recorte precisa produzir uma leitura que
  passe pela interpretação existente.

Continuam no máximo duas chamadas por sessão. Cancelamento, limite de cinco
segundos, comparação com a anterior e limpeza dos temporários não mudaram.
Uma segunda resposta com letra ou divisão indefinida continua sem sugestão.
Máscara, cálculo de consumo, dados e salvamento não foram alterados.

As novas regressões usam os textos e classificações observados, a caixa da
linha do APTO-102 e outras caixas/pixels sintéticos. O Canvas simulado passou a
considerar a origem horizontal do recorte. Os testes verificam a tentativa e
o descarte, não a capacidade real do ML Kit de ler esses roletes.
A precisão da segunda passagem D11 ainda depende do celular.
Os 114 testes passaram, incluindo as regressões D10 e as proteções existentes.
O build web de diagnóstico D11 passou; não foi gerado APK neste ambiente.

## Evidência e limites

No diagnóstico físico D4, o motor respondeu com texto em 605 ms e a limpeza
terminou em 946 ms. A foto do medidor Dépio mostra cinco dígitos pretos (`00017`)
e três roletes vermelhos; o motor devolveu somente a parte preta. Há roletes
vermelhos em transição. D5 tenta melhorar a imagem enviada ao motor; não é
um modelo especializado em transições mecânicas.

O preparo do recorte foi exercitado na foto enviada, com caixas delimitadas
manualmente, usando Canvas real no ambiente de desenvolvimento. Isso comprova
apenas o processamento dos pixels, não as caixas nem a leitura do ML Kit Android.
A precisão continua pendente; o teste D9 acima mediu somente uma sessão.

A interpretação continua conservadora. Usa um único valor decimal explícito ou
uma linha numérica com divisão preta/vermelha confirmada. Um prefixo inteiro
indefinido pode usar a posição nas condições de D7. Caixa única com cores
misturadas, múltiplos candidatos e dígitos não reconhecidos podem
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
“Diagnóstico OCR · D11” e registrar o painel, especialmente a análise das cores e,
se houver segunda chamada, “Recorte — linhas com números”. Anotar tempo total,
correção necessária e resultado ao salvar.
Para a linha `0035 859 m`, a sugestão esperada com divisão confirmada é
`35,8590`. Uma sugestão `1,7490` com anterior `17,2970` deve ser descartada antes
do preenchimento. Igualdade continua permitida. Quando surgir uma sugestão
errada, abrir o diagnóstico também no estado concluído, antes de editar.

No build D11 com OCR ativo, tocar no botão de foto e selecionar
“Escolher foto da galeria”. Usar o arquivo do medidor, não o print do diagnóstico.
Registrar a miniatura e o painel completo, incluindo o texto da foto e do recorte.
Para confirmar o fluxo original, repetir com OCR desligado e em build sem a flag:
o botão deve abrir diretamente a câmera. Cancelar o seletor deve encerrar a
tentativa sem iniciar OCR ou mudar a foto da unidade.

Nos casos D10 acima, conferir se o painel D11 chega a
“Reconhecendo recorte com contraste” e registrar “Recorte — linhas com números”.
A localização não garante uma sugestão: conferir todos os dígitos e decimais
antes de salvar. Não usar a imagem com roletes em transição como referência
decimal completa sem conferência no medidor.

Também verificar digitação antes da resposta, refazer, fechar, trocar unidade ou
serviço, leitura existente e salvamento manual. Com OCR desligado, repetir foto,
digitação, consumo e exportação. Primeira execução em modo avião confirma que o
modelo está disponível desde a instalação.

O painel existe apenas com `VITE_OCR_DIAGNOSTICO=true`. Pode mostrar texto da
foto, placa e serial; permanece na sessão local e não é enviado para um servidor.
Um build normal não exibe o painel. Não houve merge nem release de D11.

## Dependência Android e peso

A versão 8.2.1 instalada inclui modelos latino, chinês, devanágari, japonês e
coreano no Gradle. A estimativa inicial de apenas 3–5 MB não representa uma
medição desta integração. Não removemos dependências nativas sem build e teste.
Tamanho real do APK e validação Android dependem de ambiente com SDK/JDK.
