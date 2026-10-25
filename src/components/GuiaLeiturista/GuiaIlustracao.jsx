import { useId } from 'react';

// Local SVG illustrations: available without internet, with no remote images.
export default function GuiaIlustracao({ tipo = 'fluxo' }) {
  const tituloId = useId();
  if (tipo === 'leitura') return <svg className="guia-ilustracao" viewBox="0 0 360 190" role="img" aria-labelledby={tituloId}>
    <title id={tituloId}>Fotografe o medidor, confira o número e salve a leitura no celular, mesmo sem internet.</title>
    <rect x="5" y="8" width="350" height="174" rx="24" fill="#edf7f3" />
    <rect x="32" y="39" width="145" height="115" rx="19" fill="white" stroke="#185347" strokeWidth="3" />
    <circle cx="104" cy="70" r="12" fill="#d5eee4" />
    <path d="M104 60v11l7 5" fill="none" stroke="#185347" strokeWidth="3" strokeLinecap="round" />
    <rect x="49" y="99" width="111" height="29" rx="7" fill="#163b42" />
    <text x="104" y="119" textAnchor="middle" fontFamily="monospace" fontSize="17" fill="white">123,4567</text>
    <path d="M185 96h23m-7-7 9 7-9 7" fill="none" stroke="#1b8062" strokeWidth="3" strokeLinecap="round" />
    <rect x="225" y="25" width="101" height="146" rx="17" fill="white" stroke="#185347" strokeWidth="3" />
    <path d="M258 35h35" stroke="#a9c8bc" strokeWidth="4" strokeLinecap="round" />
    <rect x="239" y="51" width="73" height="46" rx="7" fill="#e4eff7" />
    <rect x="258" y="65" width="35" height="21" rx="5" fill="#426e89" />
    <circle cx="275" cy="75" r="6" fill="white" />
    <rect x="238" y="106" width="75" height="22" rx="6" fill="#f5f8fa" stroke="#c4d5df" />
    <text x="275" y="122" textAnchor="middle" fontFamily="sans-serif" fontSize="12" fill="#16324f">123,4567</text>
    <rect x="239" y="137" width="73" height="22" rx="7" fill="#127659" />
    <text x="275" y="152" textAnchor="middle" fontFamily="sans-serif" fontSize="11" fill="white">Salvar</text>
    <circle cx="174" cy="35" r="17" fill="#fff0c9" />
    <path d="m165 28 18 15m-16-14c5-3 10-3 15 0m-11 5c2-1 4-1 6 0" stroke="#8a5708" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </svg>;
  if (tipo === 'site') return <svg className="guia-ilustracao" viewBox="0 0 360 190" role="img" aria-labelledby={tituloId}>
    <title id={tituloId}>O site AutoFast usa o mesmo e-mail e a mesma senha do Fast Leituras. Escolha Servidor AWS no celular.</title>
    <rect x="6" y="8" width="348" height="174" rx="23" fill="#edf4fc" />
    <rect x="34" y="26" width="292" height="137" rx="13" fill="white" stroke="#31577a" strokeWidth="2" />
    <path d="M35 53h290" stroke="#d5e1ed" strokeWidth="2" />
    <circle cx="49" cy="40" r="3" fill="#edb7b0" /><circle cx="60" cy="40" r="3" fill="#ebd495" /><circle cx="71" cy="40" r="3" fill="#90c7ae" />
    <rect x="88" y="33" width="209" height="15" rx="5" fill="#edf3f9" />
    <text x="99" y="44" fontSize="8" fontFamily="sans-serif" fill="#31577a">autofastleituras.appviper.com.br</text>
    <rect x="48" y="67" width="103" height="80" rx="8" fill="#edf7f3" />
    <text x="99" y="87" textAnchor="middle" fontFamily="sans-serif" fontWeight="bold" fontSize="11" fill="#185347">Seu mesmo login</text>
    <rect x="59" y="99" width="82" height="13" rx="4" fill="white" /><rect x="59" y="121" width="82" height="13" rx="4" fill="white" />
    <text x="66" y="109" fontFamily="sans-serif" fontSize="8" fill="#526579">seu e-mail</text>
    <text x="66" y="131" fontFamily="sans-serif" fontSize="8" fill="#526579">••••••••</text>
    <text x="168" y="85" fontFamily="sans-serif" fontWeight="bold" fontSize="11" fill="#16324f">Executar automação em</text>
    <circle cx="175" cy="105" r="6" fill="white" stroke="#a3b7ca" /><text x="189" y="109" fontFamily="sans-serif" fontSize="10" fill="#526579">Meu PC</text>
    <circle cx="175" cy="128" r="6" fill="#16765a" /><circle cx="175" cy="128" r="2" fill="white" />
    <text x="189" y="132" fontFamily="sans-serif" fontWeight="bold" fontSize="10" fill="#185347">Servidor AWS</text>
  </svg>;
  return <svg className="guia-ilustracao guia-ilustracao-fluxo" viewBox="0 0 360 130" role="img" aria-labelledby={tituloId}>
    <title id={tituloId}>O celular registra offline. Com internet, os dados chegam ao servidor. O robô transfere e o uCondo confirma.</title>
    <rect x="4" y="5" width="352" height="120" rx="20" fill="#f1f7fb" />
    {[48,136,224,312].map((x,i)=><g key={x}>
      <circle cx={x} cy="45" r="28" fill={['#dceee6','#e0edf9','#e9e6fa','#dceee6'][i]} />
      {i<3 && <path d={`M${x+33} 45h18m-5-5 5 5-5 5`} stroke="#9aafbd" strokeWidth="2" fill="none" strokeLinecap="round" />}
    </g>)}
    <rect x="37" y="26" width="22" height="37" rx="5" fill="none" stroke="#185347" strokeWidth="2.5" />
    <path d="M45 57h6" stroke="#185347" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M122 53c-13-1-12-18 0-19 5-14 27-9 26 4 13-1 13 17 1 17h-27" fill="white" stroke="#31577a" strokeWidth="2.5" />
    <path d="M136 49V37m-5 5 5-5 5 5" stroke="#31577a" strokeWidth="2" fill="none" strokeLinecap="round" />
    <rect x="207" y="33" width="34" height="27" rx="8" fill="white" stroke="#635197" strokeWidth="2.5" />
    <path d="M224 26v7m-21 10h4m34 0h4" stroke="#635197" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="217" cy="45" r="3" fill="#635197" /><circle cx="231" cy="45" r="3" fill="#635197" />
    <path d="m300 45 8 8 15-17" stroke="#16765a" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    {['Registre','Sincronize','Robô envia','Confira'].map((text,i)=><text key={text} x={48+i*88} y="91" textAnchor="middle" fontFamily="sans-serif" fontSize="11" fontWeight="bold" fill="#16324f">{text}</text>)}
    {['Sem internet','Com internet','Na AWS','No uCondo'].map((text,i)=><text key={text} x={48+i*88} y="108" textAnchor="middle" fontFamily="sans-serif" fontSize="9" fill="#526579">{text}</text>)}
  </svg>;
}
