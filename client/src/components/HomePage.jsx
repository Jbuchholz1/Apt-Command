import { useMsal } from '@azure/msal-react';

export default function HomePage() {
  const { accounts } = useMsal();
  const firstName = (accounts[0]?.name || '').split(' ')[0] || 'there';

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="home-page">
      <h1 className="home-greeting">Welcome back, {firstName}</h1>
      <p className="home-date">{today}</p>
      <p className="home-tagline">Make a Difference. No, But Really.</p>
      <p className="home-subtitle">Select a module from the sidebar to get started.</p>
    </div>
  );
}
