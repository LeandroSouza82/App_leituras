# Guia do leiturista — versão 1.1.1

Novo acesso em **Menu → Suporte → Como usar o aplicativo**. O mesmo menu também oferece **Abrir site do robô**.

O guia é embarcado no aplicativo, funciona sem rede e não solicita acesso ao banco para abrir. As ilustrações são SVG locais: fluxo celular/nuvem/robô/confirmação, registro de medidor e acesso ao site com a mesma conta.

Conteúdo:

- Saudação amigável e motivo da criação do Fast Leituras: permitir a coleta offline diante de falhas e instabilidades do uCondo.
- Preparação com login e dados disponíveis antes da visita; foto, digitação, validação e salvamento de cada unidade.
- Diferença entre salvar no aparelho, sincronizar com o servidor e ter o envio confirmado no uCondo.
- Envio completo de um condomínio pelo app, fila da AWS, acompanhamento e continuidade do próximo condomínio.
- Caminho alternativo pelo site: preparar e sincronizar via Salvar Leituras, entrar com o mesmo e-mail e senha, escolher Servidor AWS, selecionar condomínio/período/serviços, adicionar à fila, iniciar o lote e conferir o histórico.
- Recuperação de senha para quem usava Google sem senha própria Fast Leituras; as credenciais do site não são as do uCondo.
- Status, contagens, exemplo ilustrativo, proteção de dados locais e dúvidas rápidas. Energia é diferenciada dos serviços já suportados pelo robô.

Link centralizado em `src/config/publicUrls.js`: https://autofastleituras.appviper.com.br/.

O guia usa diálogo com foco contido, retorno do foco ao menu, fechamento por Escape e botão Voltar do Android, rolagem interna e seções expansíveis. Abrir ou fechar a ajuda não cancela solicitações de envio.

Verificação: 105 testes existentes passaram; build web aprovado; menu, saudação, SVG, instruções do site, destino do botão e retorno ao menu conferidos em uma prévia de 390 pixels de largura com os componentes reais. Na prévia, acesso de rede, outros modais e abertura externa foram simulados; nenhum dado ou leitura real foi enviado.

Artefato Android: `artifacts/FastLeituras-1.1.1-GUIA-ATUALIZACAO.apk`, versão 1.1.1, código 8, mesmo pacote e assinatura da versão anterior. Build release e verificação do certificado aprovados; pacote conferido sem chaves administrativas ou arquivos privados.

Instalação por USB concluída em 25/10/2026 com `adb install -r`: a versão 1.1.0 (código 7) foi atualizada para 1.1.1 (código 8), sem desinstalação nem limpeza. A data original de instalação, 05/10/2026, e o diretório de dados foram preservados. Não foram executados envios reais de leituras durante esta entrega.
