import { useState } from 'react';
import './org-flow.css';
import ModuleSplash from '../../components/ModuleSplash';
import OrgFlowDashboard from './components/OrgFlowDashboard';
import OrgChart from './components/OrgChart';

export default function OrgFlowModule() {
  const [showSplash, setShowSplash] = useState(true);
  const [view, setView] = useState('dashboard');
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [dashboardKey, setDashboardKey] = useState(0);

  if (showSplash) {
    return (
      <ModuleSplash
        text="Who else can I be helping?"
        hashtag="#GiveRespectGetRespect"
        onComplete={() => setShowSplash(false)}
      />
    );
  }

  const handleBackToDashboard = () => {
    setView('dashboard');
    setSelectedClientId(null);
    setDashboardKey(prev => prev + 1);
  };

  return (
    <div className="of-module">
      {view === 'dashboard' && (
        <OrgFlowDashboard
          key={dashboardKey}
          onSelectClient={(clientId) => {
            setView('orgchart');
            setSelectedClientId(clientId);
          }}
        />
      )}
      {view === 'orgchart' && selectedClientId && (
        <OrgChart
          clientId={selectedClientId}
          onBack={handleBackToDashboard}
        />
      )}
    </div>
  );
}
