# Envio ao uCondo pelo aplicativo

Ao concluir todas as unidades e serviços de um condomínio, o leiturista toca em **Enviar para o uCondo** no rodapé da tela de fotos. O pedido e as referências das fotos ficam guardados no aparelho antes de qualquer chamada de rede.

O aplicativo confirma a sincronização de todas as leituras e fotos com o Supabase e solicita a transferência. Depois que o servidor confirma o recebimento, a execução continua na AWS mesmo que o leiturista feche a tela ou perca a conexão. Antes desse recebimento, as pendências permanecem no aparelho e serão retomadas ao reabrir o app com a mesma conta e ter rede.

O leiturista pode fotografar e preencher o próximo condomínio durante todo o processo. Não há tela de espera global nem bloqueio da câmera pelo estado do robô. Novos pedidos podem aguardar na fila do servidor enquanto outro condomínio é processado.

## Acompanhamento

O painel compacto **Envios para o uCondo** mostra a etapa, a porcentagem, as leituras confirmadas, as fotos confirmadas e o último sinal do robô. A lista pode ser expandida; envios concluídos ficam no histórico.

Contagens de sincronização com o servidor são separadas das confirmações no uCondo. O progresso do uCondo usa as evidências duráveis já publicadas pelo executor (`Leituras conferidas: x/y`, `Fotos confirmadas: x/y`). Cem por cento exige que todos os serviços tenham confirmação de leituras e fotos e que o lote tenha terminado com sucesso. Perda de rede ou heartbeat mantém as últimas contagens, sem inventar conclusão.

O executor atual suporta **água e gás**. O envio pelo botão recusa energia com orientação explícita. Erros ou necessidade de decisão sobre substituição continuam sujeitos às verificações do AutoFast; não há reenvio automático de uma ação incerta.

## Backend

Migração `20261025183849_app_ucondo_transfer_queue.sql`, aplicada ao projeto Fast Leituras. Depende da infraestrutura de automações já implantada, inclusive `solicitacoes_lote.destino_execucao`.

- `transferencias_ucondo`: fila durável por conta, condomínio, mês e assinatura dos dados. RLS e permissões por coluna permitem ao cliente consultar/criar seus próprios pedidos; o cliente não altera status nem IDs do executor.
- `solicitar_transferencia_ucondo`: RPC com `SECURITY INVOKER`; valida dono, mês, unidades, leituras, fotos e IDs sincronizados, e reutiliza um pedido idêntico.
- `despachar_transferencias_ucondo`: RPC exclusiva de `service_role`; confere novamente a origem e cria atomicamente os trabalhos e um lote destinado à AWS. Pedidos aguardam sem modificar a proteção existente de um lote ativo por usuário.
- Objetos de fotos novos têm SHA-256 do conteúdo no caminho. Uma nova captura não sobrescreve a foto que um envio anterior está usando.

No worker AWS, chamar `cliente.rpc('despachar_transferencias_ucondo', {}).execute()` antes de procurar o próximo lote, somente com `AUTOFAST_TRANSFERENCIAS_APP=1` e `AUTOFAST_EXECUTOR_DESTINO=aws`. O desktop não chama esse dispatcher.

## Verificação e distribuição

- Testes de estado e integração simulada: `npm test`.
- Teste transacional do banco: `tests/ucondo-transfer-rollback.sql`, com fixtures revertidas e recusa de execução se já houver pedidos reais. Não executa navegador nem envia dados ao uCondo.
- Prévia visual isolada: `node scripts/build-ucondo-preview.mjs`; servir `.qa/` em localhost. Usa o componente real com serviço simulado, rotulado como dados fictícios; não incluído no build de produção.
- Build web: `npm run build`. Android: `npx cap sync android` e `android/gradlew assembleRelease`, com a assinatura original configurada localmente.
- Versão Android 1.1.0, código 7. Instalar como atualização assinada pela mesma chave; não desinstalar o aplicativo para atualizar, preservando fotos e leituras locais.

Não colocar `.env`, `key.properties`, keystores ou chaves administrativas no Git, APK público ou documentação. A configuração embarcada usa apenas a URL e chave pública do projeto.

## Estado desta entrega

- Fonte baseada em `6c36b16`, mantendo as correções de cadastro e confirmação de e-mail junto à integração de envio. A implementação correspondente do worker e a migração de destino PC/AWS ficam no repositório `Automa-ao-python`, em `deploy/aws/README.md` e `supabase/migrations/`.
- 105 testes do aplicativo aprovados, incluindo perda de rede, espera pela confirmação da foto atual, isolamento entre contas, fila de outro condomínio e progresso baseado em confirmações.
- 13 testes do servidor aprovados. RPC testada com a identidade real do serviço AWS e fila vazia, sem criação de trabalhos.
- Teste SQL com rollback aprovou isolamento RLS, idempotência, restrição de escrita do cliente, fila sequencial e recusa de dados alterados antes do despacho.
- Migração aplicada e worker AWS atualizado com `AUTOFAST_TRANSFERENCIAS_APP=1`. Painel e robô ativos; HTTPS saudável. Nenhum novo aviso na auditoria de segurança além dos quatro SECURITY DEFINER e proteção de senha já existentes.
- Prévia conferida no navegador com dados fictícios: campo de leitura e botão de foto de teste funcionaram enquanto as contagens avançavam. Não substitui teste da câmera em Android físico.
- APK release assinado com o mesmo certificado do APK anterior, pacote `com.fastleituras.app`, versão `1.1.0`, código `7`, em `artifacts/`.
- Nenhum envio real ao uCondo foi executado durante a validação. O primeiro teste com condomínio real no celular ainda precisa ser realizado após instalar a atualização.
