import { useEffect, useRef, useState } from 'react';
import registrar from './illustrations/registrar.svg';
import offline from './illustrations/offline.svg';
import organizar from './illustrations/organizar.svg';
import './OnboardingApresentacao.css';

const STORAGE_KEY = 'fastleituras:onboarding:v1';
const slides = [
  {
    image: registrar,
    title: 'Fotografe e registre',
    description: 'Registre leituras de água, gás e energia com rapidez e segurança.',
  },
  {
    image: offline,
    title: 'Trabalhe mesmo offline',
    description: 'Continue suas leituras sem internet e sincronize tudo quando a conexão voltar.',
  },
  {
    image: organizar,
    title: 'Organize e exporte',
    description: 'Acompanhe pendências, proteja suas fotos e prepare as planilhas de consumo.',
  },
];

export default function OnboardingApresentacao({ children }) {
  const [completed, setCompleted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'completed';
    } catch {
      return false;
    }
  });
  const [index, setIndex] = useState(0);
  const headingRef = useRef(null);
  const touchRef = useRef(null);
  const slide = slides[index];

  useEffect(() => {
    if (!completed) headingRef.current?.focus({ preventScroll: true });
  }, [index, completed]);

  const finish = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'completed');
    } catch {
      // Armazenamento indisponível não deve bloquear o acesso ao login.
    }
    setCompleted(true);
  };

  const move = (direction) => {
    setIndex((current) => Math.max(0, Math.min(slides.length - 1, current + direction)));
  };

  if (completed) return children;

  return (
    <main className="fl-onboarding" aria-label="Apresentação do Fast Leituras"
      aria-roledescription="carrossel"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          event.preventDefault();
          move(event.key === 'ArrowRight' ? 1 : -1);
        }
      }}>
      <div className="fl-onboarding__shell">
        <div className="fl-onboarding__brand" aria-label="Fast Leituras">
          <strong>FAST</strong><span>LEITURAS</span>
        </div>
        <section className="fl-onboarding__slide" aria-label={`${index + 1} de ${slides.length}`}
          aria-roledescription="slide"
          onTouchStart={(event) => {
            const touch = event.touches[0];
            touchRef.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchCancel={() => { touchRef.current = null; }}
          onTouchEnd={(event) => {
            const start = touchRef.current;
            touchRef.current = null;
            if (!start) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
          }}>
          <img key={slide.image} className="fl-onboarding__illustration" src={slide.image} alt="" draggable="false" />
          <h1 ref={headingRef} tabIndex={-1}>{slide.title}</h1>
          <p>{slide.description}</p>
        </section>
        <nav className="fl-onboarding__navigation" aria-label="Navegação da apresentação">
          <button type="button" className="fl-onboarding__secondary"
            onClick={index === 0 ? finish : () => move(-1)}>{index === 0 ? 'Pular' : 'Voltar'}</button>
          <div className="fl-onboarding__dots">
            {slides.map((item, position) => (
              <button key={item.title} type="button" aria-label={`Ir para tela ${position + 1}: ${item.title}`}
                aria-current={position === index ? 'step' : undefined}
                onClick={() => setIndex(position)}><span /></button>
            ))}
          </div>
          <button type="button" className="fl-onboarding__primary"
            onClick={index === slides.length - 1 ? finish : () => move(1)}>
            {index === slides.length - 1 ? 'Começar' : 'Próximo'}
          </button>
        </nav>
      </div>
    </main>
  );
}
