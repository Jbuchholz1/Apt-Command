import { useState, useEffect } from 'react';

const SPLASH_DURATION = 10000; // 10 seconds

export default function SplashScreen({ onComplete }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), SPLASH_DURATION - 600);
    const doneTimer = setTimeout(onComplete, SPLASH_DURATION);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onComplete]);

  return (
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <p className="splash-text">This is to close business and move forward together as quickly as possible</p>
      <p className="splash-hashtag">#BringHomeTheLion</p>
    </div>
  );
}
