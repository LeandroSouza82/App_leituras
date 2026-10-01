# OCR offline — revisão da etapa 1

O OCR permanece opcional e desligado por padrão. A revisão preserva a máscara,
as validações, o salvamento e a exportação atuais. Não há IA online nesta etapa.

## Correções

- Controle de sessão isolado em `useOcrLeitura`, testado com React real sem DOM.
- Edição, refazer, fechar e salvar invalidam a sugestão sincronamente.
- Condomínio, unidade, serviço, imagem e captura participam do descarte.
- Desativação da preferência notifica o modal e descarta resultados pendentes.
- Preferência que falha ao persistir não aparece como salva no menu.
- Imagem original não é retida para OCR quando a opção está desligada.
- Removidos pontuação de “confiança”, escolha pelo comprimento e testes vazios.
- Arquivo temporário único; utiliza URI retornado na escrita, sem chamada getUri extra.
- A leitura usa `text`, contrato da versão instalada do plugin.

## Limitações de interpretação

O preenchimento é conservador: exige uma única linha numérica com separador
explícito, com unidade opcional m³/m3/kWh. Outros tokens numéricos geram recusa.
Não deduz casas decimais de dígitos sem separador; não junta segmentos do visor.
Pode recusar fotos boas que incluam serial, data ou características técnicas.
Mesmo um resultado aceito pode estar errado: o leiturista sempre confere.
Dígitos mecânicos em transição ainda não são interpretados de forma especializada.
Para ampliar o reconhecimento, precisamos validar fotos reais e identificar o
visor e sua divisão decimal, sem alterar a máscara do aplicativo.

## Dependência Android e peso

A versão 8.2.1 instalada inclui modelos latino, chinês, devanágari, japonês e
coreano no Gradle. A estimativa anterior de apenas 3–5 MB não representa uma
medição desta integração. Não removemos dependências nativas sem build e teste.

## Validação física pendente

- Build Android com SDK/JDK compatíveis e comparação de tamanho do APK.
- Primeiro uso em modo avião, antes de qualquer reconhecimento online.
- OCR desligado: foto, digitação, correção de dígito, salvar e exportar.
- OCR ligado: mesmas etapas, mantendo validações e formato uCondo.
- Fotos reais com visor legível, reflexo, sujeira e transição de dígitos.
- Registrar leitura real, sugestão, recusa e necessidade de correção.
- Refazer/fechar/trocar unidade ou serviço durante OCR; editar antes do resultado.
- Medir primeiro reconhecimento e seguintes, incluindo preparação da imagem.
- Confirmar limpeza dos temporários após sucesso e falha nativa.

Os testes automatizados usam um motor simulado para respostas atrasadas;
não medem a precisão do ML Kit nem comprovam o funcionamento nativo.
# Reconhecimento por cor — validação adicional

Diagnóstico físico D1: em AP-102 o processamento ficou em “Carregando plugin”
de 12 ms até o limite de 5001 ms, antes da preparação da foto. D2 substitui
o import dinâmico pelo proxy importado diretamente no bundle principal e
verifica o registro nativo antes da chamada. O modelo nativo continua sendo
executado somente quando OCR está ativo. Validar no celular se D2 avança para
“Preparando arquivo da foto” e “Aguardando motor ML Kit”. A causa interna de
o import dinâmico não resolver ainda não foi comprovada por logs da WebView.

## Diagnóstico D1 de demora

Para o APK de teste, definir `VITE_OCR_DIAGNOSTICO=true` antes de `npm run build`,
depois executar `npx cap sync android` e `assembleDebug`. No PowerShell:
`$env:VITE_OCR_DIAGNOSTICO="true"`; remover a variável depois do build com
`Remove-Item Env:VITE_OCR_DIAGNOSTICO`.

Após erro ou timeout, abrir “Diagnóstico OCR · D1” no modal e capturar a tela.
Mostra somente marcos de etapas e milissegundos desde o início. Não inclui foto,
texto reconhecido, caminho do arquivo ou identificadores de conta/unidade.
O diagnóstico congela ao atingir 5 segundos e não recebe eventos de outra
captura. A última etapa antes do limite identifica a operação ainda pendente;
não é prova de que o motor nativo foi cancelado. O plugin não oferece cancelamento.
Build normal não exibe o painel. Validar no aparelho antes do merge.

O serviço agora usa as caixas dos elementos retornados pelo ML Kit e amostras
dos pixels da foto original para interpretar linhas numéricas com parte preta
seguida da vermelha, mesmo sem vírgula impressa. A máscara existente recebe
um valor decimal explícito; cálculo e exportação não mudaram.

Não há localização independente do visor: depende de o ML Kit reconhecer uma
linha e separar os grupos preto/vermelho em elementos. Uma caixa única com cores
misturadas, cor indefinida, múltiplos candidatos ou dígitos não reconhecidos é
recusada. Fotos inclinadas, reflexos, pintura, transição mecânica e coordenadas
da imagem nativa precisam de testes reais. Não representa confiança calibrada.

Testes automatizados usam caixas e pixels sintéticos, não comprovam acerto nas
fotos dos medidores. Validar no aparelho foto original versus caixas nativas,
valor sugerido, casas decimais e tempo antes do merge. Não altera a câmera,
não adiciona dependência e não envia fotos para serviços externos.
