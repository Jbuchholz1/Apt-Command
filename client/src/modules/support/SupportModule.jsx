import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import ModuleSplash from '../../components/ModuleSplash';
import './support.css';

export default function SupportModule() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <ModuleSplash
      text="How can we help?"
      hashtag="#WeGotYou"
      onComplete={() => setShowSplash(false)}
    />;
  }

  return <Outlet />;
}
