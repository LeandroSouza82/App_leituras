import React from 'react';
import { Browser } from '@capacitor/browser';
import { ExternalLink, Headset, ShieldCheck, Trash2, X } from 'lucide-react';
import './PrivacyTermsModal.css';
import { PRIVACY_POLICY_URL, ACCOUNT_DELETION_URL, SUPPORT_URL } from '../../config/publicUrls';

const POLICY_SECTIONS = [
  {
    title: '1. Identificação',
    paragraphs: [
      'O Fast Leituras é um aplicativo desenvolvido por Leandro Ditamar de Souza, sob a marca AppViper, para apoiar o registro e a gestão de leituras de água, gás e energia em condomínios.',
      'Ao utilizar o aplicativo, você declara ciência destes Termos de Uso. Os dados pessoais eventualmente tratados são utilizados conforme descrito nesta Política de Privacidade e de acordo com as bases legais aplicáveis.',
      'Para questões relacionadas à privacidade ou para exercer direitos, entre em contato pelo e-mail privacidade@appviper.com.br.',
    ],
  },
  {
    title: '2. Para que o aplicativo serve',
    paragraphs: [
      'O aplicativo permite cadastrar condomínios e unidades, importar planilhas, registrar leituras atuais, fotografar medidores, consultar leituras anteriores, trabalhar sem internet e sincronizar os dados quando a conexão estiver disponível.',
      'Também permite exportar ou compartilhar planilhas e informações do serviço para sistemas e pessoas escolhidos pelo usuário, inclusive por aplicativos de compartilhamento instalados no aparelho.',
    ],
  },
  {
    title: '3. Responsabilidades do usuário',
    paragraphs: ['O usuário deve utilizar o aplicativo de forma ética, lícita e somente para condomínios e dados para os quais possua autorização. É sua responsabilidade:',],
    bullets: [
      'Conferir se o condomínio e a unidade selecionados estão corretos.',
      'Conferir se o serviço selecionado é água, gás ou energia.',
      'Verificar a leitura digitada e a fotografia antes de concluir o registro ou compartilhar uma planilha.',
      'Manter as credenciais de acesso protegidas e não compartilhá-las com pessoas não autorizadas.',
      'Solicitar correção ou exclusão quando identificar dado incorreto ou que não deva permanecer armazenado.',
    ],
  },
  {
    title: '4. Funcionamento offline e armazenamento local',
    paragraphs: [
      'O Fast Leituras foi projetado com funcionamento offline-first. Leituras, fotos, planilhas importadas e informações necessárias ao fluxo podem permanecer temporariamente no armazenamento local do aparelho até que a sincronização seja concluída.',
      'A desinstalação do aplicativo, a limpeza dos dados do Android, a perda ou a avaria do aparelho podem causar a perda de informações que ainda não foram sincronizadas. O usuário deve conferir o status de sincronização e manter os arquivos importantes também nos sistemas oficiais do condomínio.',
    ],
  },
  {
    title: '5. Dados que podem ser tratados',
    paragraphs: ['Conforme os recursos utilizados, podemos tratar:',],
    bullets: [
      'Dados de autenticação e conta, como e-mail, identificador da conta e informações básicas do perfil Google quando o login Google é escolhido.',
      'Dados do condomínio, unidades, endereços e contatos informados pelo usuário ou importados de uma planilha autorizada.',
      'Valores das leituras, serviço medido, datas, status de conclusão e informações necessárias para auditoria do trabalho.',
      'Fotografias dos medidores, usadas como comprovação e conferência da leitura.',
      'Coordenadas de localização, somente quando o usuário aciona a função de GPS e concede a permissão do sistema.',
      'Informações técnicas estritamente necessárias para autenticação, conectividade, sincronização, notificações e prevenção de falhas.',
    ],
  },
  {
    title: '6. Permissões do aparelho',
    paragraphs: [
      'Câmera: utilizada para fotografar os medidores e registrar a evidência da leitura. A câmera não é usada para publicidade ou reconhecimento facial.',
      'Localização (GPS): utilizada quando o usuário solicita a captura da coordenada do condomínio ou da leitura. A função depende da autorização do Android e não é necessária para uso contínuo em segundo plano.',
      'Arquivos e armazenamento: utilizados para guardar fotos e dados offline e para importar ou exportar planilhas escolhidas pelo usuário.',
      'Notificações: utilizadas para lembretes e avisos de leituras pendentes, somente quando a permissão do sistema estiver concedida.',
    ],
  },
  {
    title: '7. Finalidades do tratamento',
    paragraphs: [
      'Os dados são tratados para viabilizar o cadastro de condomínios e unidades, o registro das leituras, a prova fotográfica, a auditoria, a continuidade do trabalho offline, a sincronização, os lembretes, o suporte e a segurança da conta.',
      'Não utilizamos os dados para vender publicidade, criar perfil publicitário ou enviar marketing não solicitado.',
    ],
  },
  {
    title: '8. Serviços de terceiros e compartilhamento',
    paragraphs: [
      'Para operar o aplicativo, utilizamos provedores de infraestrutura. O Supabase é utilizado para autenticação, banco de dados e armazenamento de fotos. O login Google é utilizado somente quando o usuário escolhe essa forma de autenticação. A política de privacidade, o suporte e a exclusão de conta estão disponíveis no portal oficial do Fast Leituras.',
      'Ao compartilhar uma planilha ou arquivo, o envio ocorre por ação expressa do usuário para o aplicativo ou destinatário escolhido. O Fast Leituras não envia arquivos para o WhatsApp ou para outro aplicativo sem essa ação.',
      'Podemos compartilhar dados com prestadores que atuem em nosso nome, com o condomínio autorizado pelo usuário ou quando houver obrigação legal, regulatória ou ordem válida de autoridade competente. Não vendemos dados pessoais.',
    ],
  },
  {
    title: '9. Segurança',
    paragraphs: [
      'Adotamos medidas técnicas e administrativas razoáveis, como autenticação, regras de acesso, armazenamento local protegido pelo sistema e conexões seguras com os serviços de nuvem, compatíveis com a natureza dos dados tratados.',
      'Nenhuma transmissão pela internet ou armazenamento em dispositivo móvel é absolutamente inviolável. O usuário também deve proteger sua senha, o aparelho e os arquivos exportados.',
    ],
  },
  {
    title: '10. Retenção, exclusão e dados não sincronizados',
    paragraphs: [
      'Os dados são mantidos pelo período necessário para cumprir as finalidades do serviço e obrigações legais, fiscais, regulatórias ou contratuais. Dados locais que ainda não foram sincronizados podem ser perdidos se o aplicativo ou seus dados forem removidos do aparelho.',
      'O usuário pode solicitar a exclusão da conta e dos dados associados pelo canal oficial de exclusão. Alguns dados poderão ser mantidos quando a conservação for necessária para cumprir obrigação legal, prevenir fraude, preservar a segurança ou exercer direitos.',
    ],
  },
  {
    title: '11. Direitos do titular (LGPD)',
    paragraphs: ['Nos limites da legislação aplicável, o titular pode solicitar:',],
    bullets: [
      'Confirmação da existência de tratamento e acesso aos dados.',
      'Correção de dados incompletos, inexatos ou desatualizados.',
      'Informações sobre o uso e o compartilhamento dos dados.',
      'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.',
      'Portabilidade, quando aplicável e regulamentada.',
      'Eliminação de dados tratados com base no consentimento, ressalvadas as hipóteses legais de conservação.',
      'Revogação do consentimento quando essa for a base legal do tratamento.',
    ],
  },
  {
    title: '12. Limitação de responsabilidade',
    paragraphs: ['Na máxima extensão permitida pela legislação, o usuário reconhece que podem ocorrer:',],
    bullets: [
      'Indisponibilidade temporária por falha de conexão, aparelho, sistema operacional ou provedor.',
      'Perda de dados locais ainda não sincronizados após desinstalação, limpeza de dados, perda ou avaria do aparelho.',
      'Erros decorrentes de leituras, fotos ou informações incorretas inseridas pelo usuário.',
      'Eventos de força maior fora do controle razoável do serviço.',
    ],
  },
  {
    title: '13. Alterações e contato',
    paragraphs: [
      'Esta política e estes termos podem ser atualizados para refletir mudanças no aplicativo, nos serviços utilizados ou na legislação. Alterações relevantes poderão exigir nova ciência no aplicativo.',
      'A versão completa e atualizada está disponível no portal oficial. Para privacidade, exclusão de conta ou suporte, utilize os links abaixo ou os e-mails indicados nas páginas oficiais.',
    ],
  },
];

const abrirPaginaExterna = async (url) => {
  try {
    await Browser.open({ url });
  } catch {
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
};

const PrivacyTermsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="privacy-terms-overlay" onClick={onClose}>
      <section
        className="privacy-terms-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-terms-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="privacy-terms-header">
          <div className="privacy-terms-heading">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h2 id="privacy-terms-title">Política de Privacidade e Termos de Uso</h2>
              <p>Fast Leituras · última atualização: setembro de 2026</p>
            </div>
          </div>
          <button type="button" className="privacy-terms-close" onClick={onClose} aria-label="Fechar política e termos">
            <X size={22} />
          </button>
        </header>

        <div className="privacy-terms-body">
          <p className="privacy-terms-intro">
            Esta política se aplica ao aplicativo Fast Leituras e explica, em linguagem clara, para que ele serve, quais dados podem ser tratados, por que são necessários e como solicitar ajuda ou exclusão.
          </p>

          {POLICY_SECTIONS.map((section) => (
            <section className="privacy-terms-section" key={section.title}>
              <h3>{section.title}</h3>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets?.length > 0 && (
                <ul>
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </div>

        <footer className="privacy-terms-footer">
          <p>Consulte a versão web oficial para acessar a política completa fora do aplicativo.</p>
          <div className="privacy-terms-links">
            <button type="button" onClick={() => abrirPaginaExterna(PRIVACY_POLICY_URL)}>
              <ExternalLink size={16} /> Política completa
            </button>
            <button type="button" onClick={() => abrirPaginaExterna(ACCOUNT_DELETION_URL)}>
              <Trash2 size={16} /> Excluir conta e dados
            </button>
            <button type="button" onClick={() => abrirPaginaExterna(SUPPORT_URL)}>
              <Headset size={16} /> Suporte
            </button>
          </div>
          <button type="button" className="privacy-terms-done" onClick={onClose}>Fechar</button>
        </footer>
      </section>
    </div>
  );
};

export default PrivacyTermsModal;
