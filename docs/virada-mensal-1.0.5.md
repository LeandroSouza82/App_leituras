# Virada mensal automática — Fast Leituras 1.0.5

Ao abrir ou retomar o app em outro mês, o hook do calendário processa todos os condomínios do cache antes de liberar os cards. O processamento funciona offline. A leitura atual de cada unidade/serviço passa a ser a anterior; os valores, fotos e conclusões do ciclo ativo deixam a tela. O status mensal dos condomínios continua usando a regra existente.

O botão “Limpar / Iniciar Próximo Mês” usa o mesmo serviço e permite finalizar antecipadamente. Salvar uma leitura ou exportar uma planilha não promove a anterior.

## Persistência e recuperação

- `ciclo_mensal_<condominio>` registra mês, proprietário e se o ciclo já foi finalizado.
- Um diário persistente conserva o plano até a promoção, as filas e a limpeza estarem confirmadas. Se o processo cair, retoma o mesmo plano.
- Antes da limpeza, copia as fotos para um lote com mês e identificador dentro do menu de backups e grava o relatório completo em `Directory.Data/Ciclos/<conta>/<condominio>/<mes>/<id>.json`.
- Os arquivos originais e as filas de leituras permanecem preservados. A captura existente impede sobrescrever fotos com envio pendente. Não há exclusões no banco nem alterações de esquema ou autenticação.
- As novas anteriores entram na fila oficial com a conta e o mês de destino; o envio segue o mecanismo existente.
- Após a finalização, o carregamento das fotos usa referências ativas e não ressuscita arquivos temporários de ciclos antigos.
- Uma foto pendente de correção, leitura inválida ou menor que a anterior impede a limpeza daquele condomínio. Os demais continuam. O modal informa a pendência; após corrigi-la, o usuário pode finalizar pelo botão ou reabrir o app. Um diário interrompido bloqueia edições até a retomada.

## Atualização da versão antiga

Os valores locais antigos não guardam seu mês de origem. Na primeira abertura desta atualização, o app registra o mês atual e preserva os dados existentes. Não tenta fechar retroativamente um período desconhecido. A automação atua nas viradas seguintes; o fechamento manual continua disponível para dados antigos.

## Verificação executada

- `npm test`: 83 testes aprovados, incluindo calendário, fotos, filas, conta, integração do hook e fechamento real com disco/rede simulados.
- `npm run build`: aprovado; permanece o aviso já existente de tamanho de bundle.
- `git diff --check`: aprovado.

## Validação Android pendente

Não foi gerado nem instalado um APK neste ambiente, que não tem Android SDK configurado. Antes de merge/release, validar em aparelho ou emulador isolado:

1. Atualizar preservando os dados de um ciclo e confirmar que a primeira abertura não os limpa.
2. Registrar água, gás e energia; verificar as anteriores sem mudanças dentro do mesmo mês.
3. Simular a virada num aparelho de teste offline: conferir promoção, cards limpos e fotos anteriores no menu de backups.
4. Reabrir no mesmo mês: não repetir a promoção. Confirmar também a virada de dezembro para janeiro.
5. Simular foto pendente de correção e confirmar que aquele condomínio não é limpo. Corrigir, finalizar e conferir a anterior.
6. Manter um envio pendente do mês anterior: conferir que a fila e a foto continuam intactas e sincronizam no período original quando a rede retorna.
7. Interromper o app durante o fechamento, reabrir e confirmar a retomada. Testar também falta de espaço sem apagar o ciclo.

A branch é de teste. Não houve merge, publicação, acesso ao celular nem mudança no banco de produção.
