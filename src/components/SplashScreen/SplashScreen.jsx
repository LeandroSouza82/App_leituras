import React, { useEffect, useState } from 'react';
import './SplashScreen.css';
import splashEmblem from './splash-emblem.svg';

const SplashScreen = ({ onFinish }) => {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFadeOut(true);
    }, 3200);

    const finishTimer = setTimeout(() => {
      onFinish();
    }, 3500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div className={`fl-splash${fadeOut ? ' fl-splash--leaving' : ''}`} role="status" aria-label="Abrindo Fast Leituras">
      <div className="fl-splash__content">
        <div className="fl-splash__emblem">
          <img src={splashEmblem} alt="Escudo com chama, raio, gota de água e medidor" width="240" height="264" />
        </div>
        <div className="fl-splash__brand" aria-label="Fast Leituras">
          <span className="fl-splash__fast">FAST</span>
          <span className="fl-splash__leituras">LEITURAS</span>
        </div>
        <p className="fl-splash__tagline">
          Agilidade e precisão na medição do seu condomínio
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;
