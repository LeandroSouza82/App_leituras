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

## Evidência e limites

No diagnóstico físico D4, o motor respondeu com texto em 605 ms e a limpeza
terminou em 946 ms. A foto do medidor Dépio mostra cinco dígitos pretos (`00017`)
e três roletes vermelhos; o motor devolveu somente a parte preta. Há roletes
vermelhos em transição. D5 tenta melhorar a imagem enviada ao motor; não é
um modelo especializado em transições mecânicas.

O preparo do recorte foi exercitado na foto enviada, com caixas delimitadas
manualmente, usando Canvas real no ambiente de desenvolvimento. Isso comprova
apenas o processamento dos pixels, não as caixas nem a leitura do ML Kit Android.
A precisão e o tempo total de D8 ainda precisam do teste físico.

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
“Diagnóstico OCR · D8” e registrar o painel, especialmente a análise das cores e,
se houver segunda chamada, “Recorte — linhas com números”. Anotar tempo total,
correção necessária e resultado ao salvar.
Para a linha `0035 859 m`, a sugestão esperada com divisão confirmada é
`35,8590`. Uma sugestão `1,7490` com anterior `17,2970` deve ser descartada antes
do preenchimento. Igualdade continua permitida. Quando surgir uma sugestão
errada, abrir o diagnóstico também no estado concluído, antes de editar.

Também verificar digitação antes da resposta, refazer, fechar, trocar unidade ou
serviço, leitura existente e salvamento manual. Com OCR desligado, repetir foto,
digitação, consumo e exportação. Primeira execução em modo avião confirma que o
modelo está disponível desde a instalação.

O painel existe apenas com `VITE_OCR_DIAGNOSTICO=true`. Pode mostrar texto da
foto, placa e serial; permanece na sessão local e não é enviado para um servidor.
Um build normal não exibe o painel. Não houve merge nem release de D8.

## Dependência Android e peso

A versão 8.2.1 instalada inclui modelos latino, chinês, devanágari, japonês e
coreano no Gradle. A estimativa inicial de apenas 3–5 MB não representa uma
medição desta integração. Não removemos dependências nativas sem build e teste.
Tamanho real do APK e validação Android dependem de ambiente com SDK/JDK.
