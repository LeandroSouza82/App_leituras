import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { BookOpen, Camera, ClipboardCheck, CloudUpload, ExternalLink, Globe, HelpCircle, ShieldCheck, WifiOff, X } from 'lucide-react';
import { ROBOT_DASHBOARD_URL } from '../../config/publicUrls';
import GuiaIlustracao from './GuiaIlustracao';
import './GuiaLeiturista.css';

function Capitulo({ titulo, icone: Icon, children, aberto = false }) {
  return <details className="guia-capitulo" open={aberto || undefined}>
    <summary><span className="guia-capitulo-icone"><Icon size={21} aria-hidden="true" /></span><h3>{titulo}</h3><span className="guia-expandir" aria-hidden="true">+</span></summary>
    <div className="guia-capitulo-conteudo">{children}</div>
  </details>;
}
function Passos({ itens }) {
  return <ol className="guia-passos">{itens.map(([titulo, texto]) => <li key={titulo}><strong>{titulo}</strong><p>{texto}</p></li>)}</ol>;
}

export default function GuiaLeituristaModal({ isOpen, onClose, onOpenRobot }) {
  const dialogRef = useRef(null);
  const fecharRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    const focoAnterior = document.activeElement;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus();
    const teclado = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const focaveis = [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href], summary, [tabindex="0"]')].filter(el => el.offsetParent !== null);
      const primeiro = focaveis[0], ultimo = focaveis.at(-1);
      if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
      else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
    };
    document.addEventListener('keydown', teclado);
    let saiu = false, backListener;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('backButton', () => onClose()).then(listener => {
        if (saiu) listener.remove(); else backListener = listener;
      });
    }
    return () => {
      saiu = true;
      backListener?.remove();
      document.removeEventListener('keydown', teclado);
      document.body.style.overflow = overflowAnterior;
      if (focoAnterior?.isConnected) focoAnterior.focus();
    };
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  const abrirRobo = event => { event.preventDefault(); onOpenRobot(); };
  return createPortal(<div className="guia-overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="guia-dialogo" role="dialog" aria-modal="true" aria-labelledby="guia-titulo" ref={dialogRef}>
      <header className="guia-cabecalho">
        <div><span className="guia-sobretitulo"><BookOpen size={16} aria-hidden="true" /> Guia do leiturista</span><h2 id="guia-titulo">Como usar o aplicativo</h2></div>
        <button type="button" ref={fecharRef} onClick={onClose} className="guia-fechar" aria-label="Fechar guia"><X size={22} /></button>
      </header>
      <div className="guia-corpo">
        <section className="guia-boas-vindas">
          <span className="guia-etiqueta"><WifiOff size={14} aria-hidden="true" /> Este guia também funciona offline</span>
          <h3>Olá! Bem-vindo ao<br /><strong>Fast Leituras</strong> <span role="img" aria-label="Boas-vindas">👋</span></h3>
          <p>Seu trabalho pode continuar, mesmo quando a internet não ajuda. Fotografe o medidor, digite a leitura e salve no celular. Depois, com conexão, envie os dados e acompanhe o resultado.</p>
        </section>
        <GuiaIlustracao />
        <aside className="guia-nota guia-nota-motivo"><strong>Por que o Fast Leituras foi criado?</strong><p>Para que as falhas e instabilidades do uCondo não interrompam o serviço do leiturista. Aqui você registra as leituras e guarda as fotos offline, sem depender do uCondo durante a visita. O envio ao uCondo acontece depois, quando os dados chegam ao servidor com internet.</p></aside>
        <p className="guia-indice">Toque em cada etapa para ver o passo a passo.</p>

        <Capitulo titulo="1. Prepare a visita" icone={ClipboardCheck} aberto>
          <Passos itens={[
            ['Entre antes de sair', 'Com internet, abra sua conta no Fast Leituras e confira se os condomínios e as unidades estão disponíveis no aparelho. O primeiro acesso e a busca de dados novos precisam de conexão.'],
            ['Confira o condomínio e o mês', 'Veja o nome, os apartamentos e os serviços: água, gás ou energia. Se faltar condomínio ou unidade, faça o cadastro ou a importação da planilha conforme a orientação da empresa, antes de começar.'],
            ['Deixe o celular pronto', 'Tenha bateria e espaço para as fotos. Autorize a câmera quando o aplicativo pedir. Abra o condomínio e confira se a lista de apartamentos está correta.'],
          ]} />
        </Capitulo>
        <Capitulo titulo="2. Fotografe, digite e salve" icone={Camera}>
          <GuiaIlustracao tipo="leitura" />
          <Passos itens={[
            ['Abra a tela de fotos do condomínio', 'Selecione o serviço correto e toque no apartamento que será lido. Em condomínios com mais de um serviço, confira se está em água, gás ou energia.'],
            ['Tire uma foto legível do medidor', 'Enquadre o número com boa luz e confira se a imagem ficou nítida. Evite reflexos e fotos de outro apartamento.'],
            ['Digite o número e confira', 'Compare o valor digitado com a foto. Se o aplicativo avisar que o valor está menor que a leitura anterior, confira o medidor e corrija antes de seguir.'],
            ['Salve e vá para a próxima unidade', 'A indicação de unidade concluída mostra que o registro foi salvo no aplicativo. Repita o processo em todas as unidades e em todos os serviços do condomínio.'],
          ]} />
          <aside className="guia-nota"><strong>Está sem internet? Pode continuar.</strong><p>As fotos e leituras ficam no aparelho. Salvar no celular ainda não significa que elas chegaram ao servidor ou ao uCondo.</p></aside>
        </Capitulo>
        <Capitulo titulo="3. Escolha como quer enviar" icone={CloudUpload}>
          <p>Quando todas as leituras e fotos estiverem prontas, você tem duas opções para o mesmo serviço:</p>
          <div className="guia-opcoes">
            <div><CloudUpload size={23} aria-hidden="true" /><strong>Pelo aplicativo</strong><p>Use <b>Enviar para o uCondo</b>. O app sincroniza os dados e solicita o trabalho ao robô da AWS.</p></div>
            <div><Globe size={23} aria-hidden="true" /><strong>Pelo site do robô</strong><p>Use <b>Salvar Leituras</b> para preparar a sincronização e, depois, abra o site para organizar e iniciar a fila.</p></div>
          </div>
          <aside className="guia-nota"><strong>Escolha uma opção para cada envio.</strong><p>Se você já pediu pelo aplicativo, acompanhe esse pedido. Não precisa iniciar o mesmo condomínio outra vez pelo site.</p></aside>
          <p>O envio direto pelo aplicativo é do <strong>condomínio completo no mês</strong>, com todas as unidades e os serviços. Não é o envio isolado de um apartamento. O robô atual atende <strong>água e gás</strong>; para energia, siga o procedimento orientado pela empresa.</p>
        </Capitulo>
        <Capitulo titulo="4. Envie direto pelo aplicativo" icone={CloudUpload}>
          <Passos itens={[
            ['Conclua todas as fotos e leituras', 'Confira o condomínio, o mês, todos os apartamentos e todos os serviços antes de solicitar o envio. O app verifica as pendências antes de aceitar o pedido.'],
            ['Toque em Enviar para o uCondo', 'O botão verde fica no rodapé da tela de fotos, acima de Salvar Leituras. Ele pode habilitar após a primeira leitura, mas só permite enviar quando o condomínio estiver completo.'],
            ['Acompanhe a sincronização', 'Na tela principal, veja Envios para o uCondo. Enquanto aparecer Sincronizando com o servidor, mantenha o app aberto e com internet para terminar a cópia dos dados. Se estiver offline, o pedido fica guardado no aparelho.'],
            ['Deixe o robô trabalhar', 'Depois que o servidor recebe o pedido, a AWS continua a transferência independentemente do celular. Se já houver outro condomínio em execução, o próximo fica na fila.'],
            ['Siga para o próximo condomínio', 'Você pode continuar usando a câmera e digitando novas leituras enquanto o envio é acompanhado. Fechar a tela de acompanhamento não cancela um pedido recebido pelo servidor.'],
          ]} />
        </Capitulo>
        <Capitulo titulo="5. Use o site do robô" icone={Globe}>
          <GuiaIlustracao tipo="site" />
          <aside className="guia-nota guia-nota-login"><strong>É a mesma conta do aplicativo.</strong><p>Entre no site com <b>o mesmo e-mail e a mesma senha que você usa no Fast Leituras</b>. Não precisa criar outra conta. Não são as credenciais do uCondo.</p></aside>
          <a className="guia-botao-site" href={ROBOT_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" onClick={abrirRobo}><ExternalLink size={18} aria-hidden="true" /> Abrir site do robô</a>
          <p className="guia-endereco">{ROBOT_DASHBOARD_URL}</p>
          <p className="guia-legenda">O guia funciona offline. Para abrir o site, é preciso internet.</p>
          <Passos itens={[
            ['Primeiro, envie os dados ao servidor', 'Na tela de fotos do app, toque em Salvar Leituras e confirme os serviços. Esse botão também oferece o compartilhamento de uma planilha; compartilhar o relatório é diferente de transferir para o uCondo.'],
            ['Confira a sincronização no aplicativo', 'Mantenha internet e consulte Menu → Sincronização e Status. Se houver pendências, aguarde ou use Forçar Sincronização. Primeiro salve as leituras: uma foto guardada só no aparelho ainda não está disponível no site.'],
            ['Abra o link e entre na sua conta', 'Toque em Abrir site do robô e informe o mesmo e-mail e a mesma senha do aplicativo. Se o site pedir login novamente, isso não significa que é outra conta.'],
            ['No celular, escolha Servidor AWS', 'Abra o menu lateral do site e, em Executar automação em, selecione Servidor AWS. Confira a indicação Robô da AWS online. Meu PC só funciona quando a instalação do computador está aberta e ativada.'],
            ['Entre em Nova automação', 'Selecione o condomínio, o período correto e os serviços que deseja enviar. Confira os dados encontrados. Se aparecer aviso de leitura, foto ou nome no uCondo, confira com o responsável antes de continuar.'],
            ['Toque em Adicionar à fila', 'Esse passo organiza o trabalho. Adicionar à fila, sozinho, ainda não inicia a execução do robô.'],
            ['Abra Fila de trabalho e inicie', 'Confira os trabalhos que estão aguardando e toque em Iniciar Lote no Worker. Esse é o nome do botão que solicita o início do robô.'],
            ['Acompanhe e confira a conclusão', 'Veja o progresso e as mensagens em Fila de trabalho. Depois, confira o resultado em Histórico. Se você iniciou pelo site, acompanhe o lote por lá. Não repita um envio que já está em execução.'],
          ]} />
          <aside className="guia-nota"><strong>Entrou com Google no aplicativo?</strong><p>Se você ainda não tem uma senha do Fast Leituras, use a recuperação de senha do aplicativo ou peça ajuda ao responsável. O site precisa do e-mail e da senha da sua conta Fast Leituras.</p></aside>
        </Capitulo>
        <Capitulo titulo="6. Entenda as mensagens de status" icone={ClipboardCheck}>
          <p>O progresso mostra o que foi confirmado, não apenas o que o robô tentou fazer.</p>
          <dl className="guia-status">
            <div><dt>Salvo no aparelho</dt><dd>Você já registrou a foto e a leitura no celular. Elas ainda podem estar apenas no armazenamento local.</dd></div>
            <div><dt>Sincronizando com o servidor</dt><dd>O app está copiando as leituras e fotos para a nuvem. Mantenha o app com internet até o recebimento ser confirmado.</dd></div>
            <div><dt>Na fila do servidor</dt><dd>O pedido já chegou e aguarda sua vez. Não é preciso solicitar novamente.</dd></div>
            <div><dt>Enviando e conferindo leituras ou fotos</dt><dd>O robô está trabalhando no uCondo. A tela mostra a porcentagem total, as contagens confirmadas e o último sinal do robô.</dd></div>
            <div><dt>Concluído no uCondo</dt><dd>Todas as etapas daquele envio foram confirmadas. Marcar o condomínio como concluído na agenda do app é uma ação diferente.</dd></div>
            <div><dt>Sem atualização ou precisa de atenção</dt><dd>Confira a conexão e as mensagens do AutoFast. As últimas contagens são mantidas; não considere o envio concluído e não repita várias vezes. Se houver pedido de conferência, procure o responsável.</dd></div>
          </dl>
          <div className="guia-exemplo"><span>Exemplo ilustrativo</span><strong>Enviando e conferindo fotos · Total 80%</strong><progress value="80" max="100" aria-label="Exemplo de progresso total de 80 por cento" /><p>Leituras confirmadas: <b>20 de 20</b><br />Fotos confirmadas: <b>12 de 20</b></p><small>A porcentagem total considera leituras e fotos. A contagem de fotos mostra quantas ficaram confirmadas no uCondo.</small></div>
        </Capitulo>
        <Capitulo titulo="7. Cuide dos registros do seu trabalho" icone={ShieldCheck}>
          <ul className="guia-lista">
            <li><strong>Não desinstale nem limpe os dados do app</strong> enquanto houver registros ou fotos que ainda precisam ser sincronizados.</li>
            <li>Ao voltar a internet, abra o app com a mesma conta e confira as pendências. A sincronização pode pausar se o celular fechar o aplicativo antes de terminar a cópia.</li>
            <li>Confira o mês antes de enviar. O fechamento do ciclo organiza leituras anteriores e backups; não use a limpeza do mês para tentar corrigir uma falha de envio.</li>
            <li>Se precisar trocar de aparelho, sair da conta ou reinstalar, peça orientação antes para preservar os registros locais.</li>
            <li>Proteja sua conta e use o aplicativo somente nos condomínios e serviços autorizados pela empresa.</li>
          </ul>
        </Capitulo>
        <Capitulo titulo="Dúvidas rápidas" icone={HelpCircle}>
          <dl className="guia-perguntas">
            <div><dt>Preciso ficar parado esperando o robô?</dt><dd>Não. Você pode continuar o próximo condomínio enquanto o robô trabalha na AWS. Só mantenha internet no app até os dados serem recebidos pelo servidor.</dd></div>
            <div><dt>Posso fechar o aplicativo?</dt><dd>Depois que o servidor recebe o pedido, o robô continua na AWS. Se as fotos ainda estiverem sincronizando, deixe o app aberto e conectado ou reabra depois para retomar.</dd></div>
            <div><dt>A foto ficou salva. Já está no uCondo?</dt><dd>Ainda não necessariamente. Foto salva, dados sincronizados e envio concluído são confirmações diferentes. Confira o resultado final do pedido.</dd></div>
            <div><dt>Tenho que usar o app e o site ao mesmo tempo?</dt><dd>Não. Escolha uma forma de iniciar cada envio. Use a outra para consultar ou conferir, sem solicitar o mesmo serviço de novo.</dd></div>
            <div><dt>O site mostra robô offline ou um erro. O que faço?</dt><dd>Confira se selecionou Servidor AWS, leia a mensagem e procure o responsável ou Suporte Técnico no menu. Não altere dados nem force reenvios para tentar contornar um aviso.</dd></div>
          </dl>
        </Capitulo>
        <p className="guia-fecho">Bom trabalho! Faça a leitura com calma, confira o registro e deixe o envio seguir com o robô.</p>
      </div>
      <footer className="guia-rodape"><button type="button" onClick={onClose}>Entendi, voltar ao menu</button></footer>
    </section>
  </div>, document.body);
}
