import { useState, useEffect } from 'react';

const SPLASH_DURATION = 5000;

export default function ModuleSplash({ text, hashtag, onComplete }) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), SPLASH_DURATION - 600);
    const doneTimer = setTimeout(onComplete, SPLASH_DURATION);
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer); };
  }, [onComplete]);

  return (
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <p className="splash-text">{text}</p>
      <p className="splash-hashtag">{hashtag}</p>
    </div>
  );
}
