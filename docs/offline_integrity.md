# Integridade das filas offline — candidata 1.0.4

Base: main `8b0577883dd5e7ec5b025375d418eae4e8ec06e0`, versão 1.0.3 aprovada
no aparelho em 05/10/2026. Esta alteração prepara 1.0.4 / versionCode 5, sem
alterar applicationId, assinatura, câmera/OCR ou validação numérica.

## Comportamento

- Gravação de fila só confirma sucesso após `setItem` e leitura de conferência.
  Falta de espaço, JSON ilegível ou formato diferente de array não são tratados
  como fila vazia e não autorizam sobrescrever a pendência antiga.
- Logout revoga a sessão e interrompe novos envios, preservando filas, índices,
  números e referências das fotos. Não executa `localStorage.clear` nem remove arquivos.
- Novas pendências registram o proprietário e mês antes da reconexão. A fila
  não adota itens sem dono como pertencentes à conta que estiver conectada.
- Enquanto houver estado offline de uma conta, outra conta fica bloqueada antes
  de abrir a interface. Reentrar na mesma conta restaura o acesso sem apagar dados.
  A troca com dados preservados requer reconciliação; esta versão não implementa
  migração automática de arquivos físicos entre contas.
- O envio usa a mesma biblioteca/configuração Supabase com token fixado ao ciclo,
  identidade verificada por `getUser(token)` e trava antes de novas requisições.
  Logout/troca durante uma resposta não passa a usar credenciais da conta seguinte.
- Deduplicação considera conta, condomínio, unidade, serviço e mês. O UUID de
  setembro não é reutilizado em outubro. A remoção após envio consome somente
  a revisão confirmada, preservando alterações/entradas concorrentes.
- IDs antigos sem conta no mapa de leituras não geram outro UUID para um envio
  já possivelmente executado. A interface exige conferência do registro anterior.
- Novos cadastros manuais offline reutilizam a fila oficial de condomínios.
  A antiga `leituras_pendentes`, que misturava DTOs incompatíveis sem dono, fica
  intacta para recuperação. O formulário não limpa os campos se a gravação falhar.
- Lotes de leituras anteriores conservam o mês enfileirado; consultas de
  substituição ficam restritas ao mesmo mês. Unidade sem correspondência impede
  envio parcial/descarte do lote. A fila de condomínio cria a leitura mensal do
  mês original, sem recalcular o mês da reconexão.
- Pendências sem identidade completa/ilegíveis geram aviso na interface. A
  contagem utiliza somente arrays legíveis; não estima itens de JSON corrompido.

## Evidências locais em 12/10/2026

`npm test`: **58 testes aprovados**, incluindo os 26 testes existentes de fotos,
números, serviços e virada de mês. Novos testes exercitam os serviços oficiais
com rede/disco simulados e a configuração real do SDK Supabase com fetch simulado.
Sem conexão com contas ou dados de produção.

Dois testes de regressão executados contra o código da base falharam de modo
esperado: a gravação sob quota retornava `true`, e outubro sobrescrevia setembro.
Os mesmos cenários passam após a correção. `npm run build` e `git diff --check`
aprovados. A workflow de integridade executa testes/build em PR, sem publicar APK.

## Validação física e limites

Preparar o APK release a partir do head revisado, comparar os assets com dist,
validar certificado original e metadados 1.0.4/código 5. Atualizar por `install -r`,
sem desinstalar, limpar armazenamento ou contornar assinatura.

Conferir foto/leitura pendente após fechamento, reinício e logout/reentrada na
mesma conta; testar bloqueio da troca de conta com estado preservado. Exercitar
falta de espaço e dois meses em ambiente de teste controlado. Não reenvie as
14 fotos já validadas de Arcedino Santos para demonstrar a correção.

Testes simulados/build não demonstram envio/persistência no Supabase real nem
instalação Android. Nenhum APK novo foi gerado/instalado neste ambiente. Filas
antigas sem dono/mês exigem inventário e recuperação por item; não foram migradas.
Associação de backups por nome e exclusões no menu de backups são uma revisão
separada. O diretório físico legado continua compartilhado pelo aplicativo.

Para o Auto Fast Leituras/uCondo, atualizar dashboard/worker e aplicar migração
da decisão de timeout é outra implantação: esta alteração móvel não a substitui.
