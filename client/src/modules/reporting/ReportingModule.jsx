import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import './reporting.css';
import ModuleSplash from '../../components/ModuleSplash';

export default function ReportingModule() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <ModuleSplash
      text="Do I have a full understanding of my business and what is going on?"
      hashtag="#WhoseCarAreWeTaking"
      onComplete={() => setShowSplash(false)}
    />;
  }

  return <Outlet />;
}
