import React, { useEffect, useState } from 'react';
import './SplashScreen.css';

const SplashScreen = ({ onFinish }) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Inicia o fade out próximo do final dos 7 segundos (aos 6.3s)
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 6300);

    // Finaliza a splash screen exatamente aos 7 segundos
    const finishTimer = setTimeout(() => {
      onFinish();
    }, 7000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <div className="splash-content">
        <div className="splash-logo-container">
          <div className="splash-logo-badge">FL</div>
          <div className="splash-title-container">
            <span className="splash-title-fast">Fast</span>
            <span className="splash-title-leitura">Leitura</span>
          </div>
        </div>
        <p className="splash-slogan">
          Agilidade e precisão na medição do seu condomínio
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;
