import { useIsAuthenticated } from '@azure/msal-react';
import { hasExternalSession } from '../lib/externalAuth';
import LoginPage from './LoginPage';

// Replaces MSAL's <AuthenticatedTemplate> as the app-wide auth gate. Renders
// children if EITHER an MSAL (Azure) session is active OR an external-user
// JWT is present in localStorage and not expired. Otherwise renders the
// login page. The check runs on every render so a fresh localStorage write
// from the LoginPage form (followed by a window.location reload) flips the
// gate without any extra wiring.
export default function RequireAuth({ children }) {
  const azureAuthed = useIsAuthenticated();
  if (azureAuthed || hasExternalSession()) return children;
  return <LoginPage />;
}
