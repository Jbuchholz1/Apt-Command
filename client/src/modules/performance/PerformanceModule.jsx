import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import './performance.css';
import ModuleSplash from '../../components/ModuleSplash';

export default function PerformanceModule() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <ModuleSplash
      text="Am I doing everything I can to be the best version of myself?"
      hashtag='#MakeADifference...No, But Really"'
      onComplete={() => setShowSplash(false)}
    />;
  }

  return <Outlet />;
}
