import React, { useEffect, useState } from 'react';
import './SplashScreen.css';
import iconImg from '../../assets/icon.png';

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
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <div className="splash-content">
        <img
          src={iconImg}
          alt="Fast Leitura Icon"
          className="splash-logo-img"
        />
        <div className="splash-title-container">
          <span className="title-fast">Fast</span>
          <span className="title-leitura">Leitura</span>
        </div>
        <p className="slogan">
          Agilidade e precisão na medição do seu condomínio
        </p>
      </div>
    </div>
  );
};

export default SplashScreen;
