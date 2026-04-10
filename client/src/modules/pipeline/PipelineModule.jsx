import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import './pipeline.css';
import ModuleSplash from '../../components/ModuleSplash';

export default function PipelineModule() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return <ModuleSplash
      text="What are we building for tomorrow?"
      hashtag="#FillThePipeline"
      onComplete={() => setShowSplash(false)}
    />;
  }

  return <Outlet />;
}
