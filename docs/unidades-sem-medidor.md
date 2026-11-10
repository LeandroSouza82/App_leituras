# Nome do uCondo e unidades sem medidor

A importação preserva o nome original do cabeçalho em `nome_ucondo`, incluindo asteriscos. O nome de exibição continua separado. Atualizações por planilha mantêm o nome original pendente no aparelho até a sincronização; o envio ao uCondo aguarda essa confirmação. A associação de cadastros exige nome exato e único, tolerando somente acentos, caixa, espaços e o marcador `*`.

Na tela das unidades, abra **Unidades sem medidor**, escolha o serviço e marque somente as unidades permanentemente zeradas. A configuração exige internet, pertence à conta e é mantida para os próximos meses. Uma leitura zero comum nunca cria essa dispensa automaticamente. Unidades com valores diferentes de zero precisam ser conferidas antes da alteração.

No envio completo, a unidade dispensada permanece na planilha com `0.0000`, sem foto. O progresso distingue fotos confirmadas de fotos dispensadas. Imagens antigas ficam preservadas no armazenamento, mas o worker atualizado ignora as imagens das unidades dispensadas.

A migração `20261110133515_ucondo_nome_automatico_legado.sql` também foi aplicada em 10/11/2026. Ela preenche o nome oficial ausente nos novos cadastros dos aplicativos antigos, preservando nomes oficiais explícitos. Foram corrigidos 14 cadastros vazios da conta atendida, sem alterar o vínculo já existente de Hamburgo. O nome de cadastro continua sujeito à confirmação exata do destino pelo robô.

## Implantação

1. Aplicar `20261110131603_ucondo_nome_e_unidades_sem_medidor.sql`. Aplicada ao projeto Fast Leituras em 10/11/2026; teste transacional com as quatro unidades reais de Hamburgo aprovado e revertido.
2. Atualizar o executor e o painel AutoFast com a alteração correspondente no repositório `Automa-ao-python`. Não ativar dispensas enquanto o executor antigo estiver em uso.
3. Gerar e instalar o aplicativo atualizado, preservando os dados locais e a assinatura do aplicativo instalado.
4. Marcar em Hamburgo, para AGUA, as unidades `01-0001`, `01-0002`, `01-0003` e `01-0004`. Os testes realizados não deixaram essas marcações ativas em produção.
5. Conferir o condomínio ativo no uCondo e validar o primeiro envio completo: 106 leituras conferidas, 102 fotos confirmadas e quatro unidades sem foto. Nenhum envio real foi feito durante a correção.

A migração permite uma nova tentativa explícita de um envio que falhou exclusivamente por nome oficial ausente, antes de qualquer unidade processada. Resultados incertos, parciais ou outros erros continuam preservados para conferência.
