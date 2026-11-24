# Convites da equipe

O mesmo APK atende as duas funções. A conta administradora tem a área **Equipe** no menu principal. As demais contas usam o aplicativo e veem apenas seus próprios condomínios e os condomínios atribuídos à sua conta.

Na área **Equipe**, selecione os condomínios e toque em **Convidar pelo WhatsApp**. O leiturista entra com uma conta Google pessoal na página do convite. Depois do aceite, ele abre ou instala o Fast Leituras e entra com a mesma conta Google. O convite é de uso único, vale sete dias e pode ser cancelado antes do aceite.

As leituras sincronizadas ficam ligadas ao identificador do condomínio, com a conta do leiturista registrada separadamente. As fotos ficam no armazenamento privado. O administrador consulta as fotos em **Gerenciar fotos e backups** e exporta as leituras sincronizadas pelo menu **Equipe**. Remover o acesso revoga o vínculo do leiturista e preserva os registros. Leituras antigas sem vínculo continuam na conta de origem até a conferência do acervo. Para vinculá-las, preserve a autoria e os IDs das leituras. Confirme as fotos no armazenamento antes de registrar os caminhos legados na tabela privada de fotos da equipe. Um cadastro administrativo separado permite manter as referências dos envios ao uCondo que já foram iniciados pelo leiturista.

## Configuração do ambiente

1. Aplique a migração de equipe no Supabase antes de testar o menu e os convites. O APK mantém o fluxo antigo de sincronização enquanto a migração estiver ausente.
2. Registre somente o ID já verificado da conta administradora na tabela privada equipe_interna.administradores. Guarde a operação no registro de implantação. Contas comuns não podem entrar nessa tabela pelo aplicativo.
3. Autorize https://fastleitura.appviper.com.br/convite na lista de redirecionamento do Supabase Auth. Publique a rota no mesmo domínio usado para confirmação de e-mail.
4. Configure VITE_FAST_LEITURAS_ANDROID_URL com a URL HTTPS oficial do APK atualizado ou da ficha do aplicativo na Google Play. A rota continua permitindo abrir o aplicativo quando já instalado.
5. Gere o APK com a assinatura original para que a instalação funcione como atualização e preserve as filas offline.

Para validar, use uma conta administradora, uma conta Google de leiturista e um condomínio de teste. Confirme o aceite pelo link, a ausência do menu **Equipe** na conta leiturista e que uma segunda conta não consegue usar o mesmo convite. Sincronize uma leitura com foto, confira a foto e exporte o Excel como administrador. Remova o acesso e confirme que a leitura e a foto continuam visíveis para o administrador.

O teste do fluxo de equipe é independente do envio automático de lotes ao uCondo. O envio usa as permissões e as validações próprias do AutoFast.
