# Convites da equipe

O mesmo APK atende as duas funções. A conta administradora tem a área **Equipes** no menu principal. As demais contas usam o aplicativo e veem apenas seus próprios condomínios e os condomínios atribuídos à sua conta.

Em **Menu → Equipes**, selecione os condomínios, toque em **Criar convite** e depois em **Convidar pelo WhatsApp**. A seleção só pode ser compartilhada depois de sincronizar as unidades e as leituras anteriores dos serviços ativos. O convidado abre o link, toca em **Abrir o Fast Leituras**, confere o e-mail da conta Google e aceita dentro do aplicativo. Se precisar do APK, ele baixa, instala e volta ao mesmo link para abrir o app. O convite é de uso único, vale sete dias e pode ser cancelado antes do aceite.

O leiturista recebe os dados do condomínio e as leituras anteriores no card compartilhado. Em **Definir meu valor**, ele pode informar o próprio valor. O campo começa vazio, com `R$ 0,00` como indicação. Cada conta consulta apenas o valor cadastrado para ela.

As leituras sincronizadas ficam ligadas ao identificador do condomínio, com a conta do leiturista registrada separadamente. Em **Equipes → Planilhas e fotos**, o gestor escolhe o leiturista, o condomínio e o mês para consultar as leituras, abrir as fotos com sua sessão e gerar um novo XLSX. Remover o acesso revoga o vínculo do leiturista e preserva os registros. Leituras antigas sem vínculo continuam na conta de origem até a conferência do acervo. Para vinculá-las, preserve a autoria e os IDs das leituras. Confirme as fotos no armazenamento antes de registrar os caminhos legados na tabela privada de fotos da equipe. Um cadastro administrativo separado permite manter as referências dos envios ao uCondo que já foram iniciados pelo leiturista.

## Configuração do ambiente

1. Aplique a migração de equipe no Supabase antes de testar o menu e os convites. O APK mantém o fluxo antigo de sincronização enquanto a migração estiver ausente.
2. Registre somente o ID já verificado da conta administradora na tabela privada equipe_interna.administradores. Guarde a operação no registro de implantação. Contas comuns não podem entrar nessa tabela pelo aplicativo.
3. Publique a rota do convite no mesmo domínio usado para confirmação de e-mail. O Android recebe o convite no aplicativo e autentica pelo Google nativo.
4. Configure `VITE_FAST_LEITURAS_APK_URL` com a URL HTTPS do APK oficial assinado. A página usa `VITE_FAST_LEITURAS_ANDROID_URL` como alternativa para configurações legadas.
5. Gere o APK com a assinatura original para que a instalação funcione como atualização e preserve as filas offline.

Para validar, use uma conta administradora, uma conta Google de leiturista e um condomínio de teste. Confirme o aceite pelo link, a ausência do menu **Equipe** na conta leiturista e que uma segunda conta não consegue usar o mesmo convite. Sincronize uma leitura com foto, confira a foto e exporte o Excel como administrador. Remova o acesso e confirme que a leitura e a foto continuam visíveis para o administrador.

O teste do fluxo de equipe é independente do envio automático de lotes ao uCondo. O envio usa as permissões e as validações próprias do AutoFast.

Antes de aplicar a migração de valores individuais, atualize os dispositivos que usam cards compartilhados. Depois da migração, esses cards são consultados pela nova rota protegida e versões anteriores do APK só conseguem listar os próprios cadastros.
